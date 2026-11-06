"""Tests for the Mamba block, river-graph layer, STG-Mamba model, masked loss and split guard."""

import inspect
import math

import numpy as np
import pandas as pd
import pytest
import torch

from floodshield.data.sequence_dataset import TestSplitLockedError, load_split
from floodshield.evaluation.evaluator import (
    calendar_bin,
    fit_climatology,
    persistence_forecast,
    target_matrix,
)
from floodshield.evaluation.metrics import flood_contingency, kge, nse
from floodshield.models.layers import build_edge_tensors
from floodshield.models.mamba_block import MambaBlock, SelectiveSSM, selective_scan
from floodshield.models.stg_mamba import STGMamba, STGMambaConfig, build_sequence, config_from_yaml
from floodshield.training.losses import high_flow_weights, masked_loss
from floodshield.training.trainer import LossConfig, batch_loss

IDS = ["A", "B", "C", "D", "E"]
# A -> B -> C, D -> C, E isolated.
EDGES = pd.DataFrame({"source": ["A", "B", "D"], "target": ["B", "C", "C"],
                      "river_km": [100.0, 50.0, 25.0], "same_reach": [False] * 3})
L, H, F, S = 12, 4, 4, 3


def make_model(**overrides):
    values = {"n_features": F, "n_static": S, "n_nodes": len(IDS), "horizon": H, "rain_channel": 0,
              "d_model": 8, "d_state": 4, "expand": 2, "d_conv": 3, "num_layers": 2, "dropout": 0.0,
              "head_hidden": 16, "graph_enabled": True, "graph_layers": 1, "graph_direction": "downstream",
              "distance_scale_km": 100.0}
    values.update(overrides)
    torch.manual_seed(0)
    return STGMamba(STGMambaConfig(**values), EDGES, IDS).eval()


def make_batch(b=2, seed=1):
    g = torch.Generator().manual_seed(seed)
    n = len(IDS)
    return (torch.randn(b, L, n, F, generator=g), torch.randn(b, H, n, 1, generator=g),
            torch.randn(b, n, S, generator=g))


# --- 1. shapes -----------------------------------------------------------------

def test_output_shape():
    out = make_model()(*make_batch(b=3))
    assert out.shape == (3, H, len(IDS)) and out.dtype == torch.float32


def test_build_sequence_future_channels():
    x_past, x_future, _ = make_batch()
    seq = build_sequence(x_past, x_future, rain_channel=0)
    assert seq.shape == (2, L + H, len(IDS), F + 1)
    assert torch.equal(seq[:, L:, :, 0], x_future[..., 0])            # future rain
    assert (seq[:, L:, :, 1:F] == 0).all()                             # other weather = standardised mean
    assert (seq[:, L:, :, F] == 1).all() and (seq[:, :L, :, F] == 0).all()   # is_future flag
    assert torch.equal(seq[:, :L, :, :F], x_past)


# --- 2. no access to observed flow -----------------------------------------------

def test_forward_takes_no_flow_argument():
    params = set(inspect.signature(STGMamba.forward).parameters)
    assert params == {"self", "x_past", "x_future", "static"}


def test_changing_y_does_not_change_predictions():
    model = make_model()
    x_past, x_future, static = make_batch()
    y = torch.randn(2, H, len(IDS))
    batch = {"x_past": x_past, "x_future": x_future, "static": static, "y": y}
    before = model(batch["x_past"], batch["x_future"], batch["static"])
    batch["y"] = y + 1000.0
    after = model(batch["x_past"], batch["x_future"], batch["static"])
    assert torch.equal(before, after)


# --- 3. graph respects adjacency -------------------------------------------------

def affected(model, gauge: str) -> set[str]:
    x_past, x_future, static = make_batch()
    base = model(x_past, x_future, static)
    x2 = x_past.clone()
    x2[:, :, IDS.index(gauge)] += 5.0
    # Exact: a gauge with no path from the perturbed one is bitwise unchanged.
    changed = (model(x2, x_future, static) - base).abs().amax(dim=(0, 1)) > 0
    return {g for g, c in zip(IDS, changed.tolist()) if c}


def test_downstream_one_layer_reaches_next_gauge_only():
    m = make_model(graph_layers=1)
    assert affected(m, "A") == {"A", "B"}
    assert affected(m, "B") == {"B", "C"}
    assert affected(m, "D") == {"D", "C"}
    assert affected(m, "C") == {"C"}       # outlet: nothing downstream
    assert affected(m, "E") == {"E"}       # isolated


def test_downstream_two_layers_reach_two_edges_but_never_upstream():
    m = make_model(graph_layers=2)
    assert affected(m, "A") == {"A", "B", "C"}
    assert affected(m, "C") == {"C"}


def test_both_directions_also_reach_upstream():
    assert affected(make_model(graph_layers=1, graph_direction="both"), "B") == {"A", "B", "C"}


def test_graph_off_means_no_cross_gauge_effect():
    m = make_model(graph_enabled=False)
    for g in IDS:
        assert affected(m, g) == {g}
    assert len(m.graph_layers) == 0


def test_edge_attributes_use_river_distance():
    idx, attr = build_edge_tensors(EDGES, IDS, "downstream", 100.0)
    assert idx.tolist() == [[0, 1, 3], [1, 2, 2]]
    assert attr[:, 0].tolist() == [1.0, 0.5, 0.25] and (attr[:, 1] == 0).all()
    idx2, attr2 = build_edge_tensors(EDGES, IDS, "both", 100.0)
    assert idx2.shape[1] == 6 and attr2[3:, 1].tolist() == [1.0, 1.0, 1.0]
    with pytest.raises(ValueError):
        build_edge_tensors(EDGES, IDS, "sideways", 100.0)


# --- 3b. per-lead decoder ---------------------------------------------------------

def test_per_lead_output_shape_and_graph_adjacency():
    m = make_model(decoder="per_lead", graph_layers=1)
    assert m(*make_batch(b=3)).shape == (3, H, len(IDS))
    assert affected(m, "A") == {"A", "B"}
    assert affected(m, "C") == {"C"}
    assert affected(m, "E") == {"E"}


def test_per_lead_rain_reaches_only_this_gauge_from_that_lead_on():
    # Also pins the reshapes: a mix-up of lead and gauge axes would move these effects.
    m = make_model(decoder="per_lead", graph_enabled=False)
    x_past, x_future, static = make_batch()
    base = m(x_past, x_future, static)
    x2 = x_future.clone()
    x2[:, 1, IDS.index("B")] += 5.0        # rain on future day 2 (index 1) at gauge B
    changed = (m(x_past, x2, static) - base).abs().amax(dim=0) > 0   # [H, N]
    expected = torch.zeros(H, len(IDS), dtype=torch.bool)
    expected[1:, IDS.index("B")] = True
    assert torch.equal(changed, expected)


def test_per_lead_graph_stays_within_the_lead():
    m = make_model(decoder="per_lead", graph_layers=1)
    x_past, x_future, static = make_batch()
    base = m(x_past, x_future, static)
    x2 = x_future.clone()
    x2[:, 1, IDS.index("A")] += 5.0
    changed = (m(x_past, x2, static) - base).abs().amax(dim=0) > 0
    assert not changed[0].any()            # lead 1 cannot see day-2 rain at any gauge
    assert changed[1, IDS.index("B")]      # lead 2 at the downstream gauge can


def test_last_step_lead_one_sees_later_rain():
    m = make_model(graph_enabled=False)
    x_past, x_future, static = make_batch()
    x2 = x_future.clone()
    x2[:, 3] += 5.0                        # rain on future day 4
    assert not torch.equal(m(x_past, x_future, static)[:, 0], m(x_past, x2, static)[:, 0])


def test_unknown_decoder_rejected():
    with pytest.raises(ValueError):
        make_model(decoder="sideways")


def test_config_without_decoder_defaults_to_last_step():
    yaml_cfg = {"model": {"d_model": 8, "d_state": 4, "expand": 2, "d_conv": 3, "num_layers": 1, "dropout": 0.0,
                          "head_hidden": 16, "dt_min": 0.001, "dt_max": 0.1},
                "graph": {"enabled": False, "layers": 1, "direction": "downstream", "distance_scale_km": 100.0},
                "input": {"future_features": ["prcp"]}, "output": {"horizon_days": H}}
    assert config_from_yaml(yaml_cfg, ["prcp"], S, len(IDS)).decoder == "last_step"


# --- 4. masked loss ---------------------------------------------------------------

@pytest.mark.parametrize("kind", ["huber", "mse"])
def test_masked_entries_do_not_change_loss(kind):
    pred, y = torch.randn(2, H, 5), torch.randn(2, H, 5)
    mask = (torch.rand(2, H, 5) > 0.5).float()
    mask[0, 0, 0] = 1.0
    a = masked_loss(pred, y, mask, kind)
    y2 = torch.where(mask == 0, y + 1e6, y)
    assert a == masked_loss(pred, y2, mask, kind)
    # An observed entry does change it.
    y3 = y.clone()
    y3[0, 0, 0] += 10.0
    assert a != masked_loss(pred, y3, mask, kind)


def test_masked_loss_is_mean_over_observed_entries_and_all_masked_is_zero():
    pred = torch.zeros(1, 1, 2)
    y = torch.tensor([[[1.0, 3.0]]])
    assert masked_loss(pred, y, torch.tensor([[[1.0, 0.0]]]), "mse").item() == 1.0
    empty = masked_loss(pred.requires_grad_(), y, torch.zeros(1, 1, 2), "mse")
    assert empty.item() == 0.0
    empty.backward()                       # still differentiable


def test_high_flow_weights_only_above_threshold():
    y = torch.tensor([[0.5, 2.5]])
    assert high_flow_weights(y, torch.tensor([1.0, 2.0]), 5.0).tolist() == [[1.0, 5.0]]


def test_batch_loss_applies_high_flow_weight_and_needs_a_threshold():
    class Zero(torch.nn.Module):
        def forward(self, x_past, x_future, static):
            return torch.zeros(1, 1, 2)
    batch = {"x_past": None, "x_future": None, "static": None, "y": torch.tensor([[[1.0, 0.5]]]),
             "mask": torch.ones(1, 1, 2)}
    cfg = LossConfig("mse", 1.0, True, 3.0)
    # Gauge 0 is above its threshold (weight 3), gauge 1 below: (3*1 + 1*0.25) / 4.
    assert batch_loss(Zero(), batch, cfg, torch.tensor([0.0, 2.0])).item() == pytest.approx(3.25 / 4)
    with pytest.raises(ValueError):
        batch_loss(Zero(), batch, cfg, None)


# --- 5. MPS vs CPU ----------------------------------------------------------------

MPS_CPU_TOLERANCE = 1e-4


@pytest.mark.skipif(not torch.backends.mps.is_available(), reason="MPS not available")
@pytest.mark.parametrize("decoder", ["last_step", "per_lead"])
def test_mps_and_cpu_forward_agree(decoder):
    model = make_model(graph_layers=2, decoder=decoder)
    batch = make_batch()
    cpu = model(*batch)
    mps = model.to("mps")(*[t.to("mps") for t in batch]).cpu()
    assert torch.allclose(cpu, mps, atol=MPS_CPU_TOLERANCE, rtol=0.0)


# --- 6. test-split guard ----------------------------------------------------------

@pytest.fixture
def tiny_arrays(tmp_path):
    T, N = 40, 2
    dates = pd.date_range("2000-01-01", periods=T, freq="D").strftime("%Y-%m-%d").to_numpy().astype("U10")
    np.savez(tmp_path / "arrays.npz", x=np.zeros((T, N, 1), np.float32), rain=np.zeros((T, N), np.float32),
             y=np.arange(T * N, dtype=np.float32).reshape(T, N), mask=np.ones((T, N), np.float32),
             q_m3s=np.arange(T * N, dtype=np.float64).reshape(T, N), static=np.zeros((N, 1), np.float32),
             dates=dates, gauge_ids=np.array(["03001", "08001"], dtype="U5"), window_days=np.int64(5),
             horizon_days=np.int64(2), t_index_train=np.arange(4, 15), t_index_validation=np.arange(17, 25),
             t_index_test=np.arange(27, 37))
    return tmp_path


def test_test_split_locked_without_flag(tiny_arrays):
    with pytest.raises(TestSplitLockedError, match="--final-test"):
        load_split(tiny_arrays, "test")


def test_test_split_opens_with_flag_and_warns(tiny_arrays, capsys):
    assert len(load_split(tiny_arrays, "test", final_test=True)["dataset"]) == 10
    assert "LOADING THE TEST SPLIT" in capsys.readouterr().out


def test_validation_arrays_hold_no_test_period_values(tiny_arrays):
    d = load_split(tiny_arrays, "validation")
    last = 24 + 2                          # last validation target index
    assert len(d["dates"]) == last + 1 and d["q_m3s"].shape[0] == last + 1
    assert d["dataset"].y.shape[0] == last + 1 and d["dataset"].x.shape[0] == last + 1


def test_evaluate_script_refuses_test_without_flag(monkeypatch):
    import importlib.util
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location("evaluate_script", root / "scripts" / "evaluate.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr("sys.argv", ["evaluate.py", "--split", "test"])
    with pytest.raises(TestSplitLockedError):
        mod.main()


# --- 7. Mamba block ---------------------------------------------------------------

def test_selective_scan_hand_checked_case():
    # One channel, one state: h1 = e^(d*A)*0 + d*B*u1; h2 = e^(d*A)*h1 + d*B*u2; y = C*h + D*u.
    d, A, B, C, D = 0.5, -2.0, 3.0, 2.0, 0.25
    u1, u2 = 1.0, -1.0
    u = torch.tensor([[[u1], [u2]]])
    delta = torch.full((1, 2, 1), d)
    y = selective_scan(u, delta, torch.tensor([[A]]), torch.full((1, 2, 1), B), torch.full((1, 2, 1), C),
                       torch.tensor([D]))
    h1 = d * B * u1
    h2 = math.exp(d * A) * h1 + d * B * u2
    expected = [C * h1 + D * u1, C * h2 + D * u2]
    assert y.squeeze().tolist() == pytest.approx(expected, rel=1e-6)


def test_selective_scan_matches_naive_reference_loop():
    g = torch.Generator().manual_seed(3)
    b, l, d, n = 2, 6, 3, 4
    u, delta = torch.randn(b, l, d, generator=g), torch.rand(b, l, d, generator=g)
    A = -torch.rand(d, n, generator=g) - 0.1
    B, C = torch.randn(b, l, n, generator=g), torch.randn(b, l, n, generator=g)
    D = torch.randn(d, generator=g)
    y = selective_scan(u, delta, A, B, C, D)
    for bi in range(b):
        for di in range(d):
            h = [0.0] * n
            for t in range(l):
                dt, ut = float(delta[bi, t, di]), float(u[bi, t, di])
                h = [math.exp(dt * float(A[di, k])) * h[k] + dt * float(B[bi, t, k]) * ut for k in range(n)]
                ref = sum(h[k] * float(C[bi, t, k]) for k in range(n)) + ut * float(D[di])
                assert float(y[bi, t, di]) == pytest.approx(ref, rel=1e-4, abs=1e-5)


def impulse_memory_ratio(ssm: SelectiveSSM) -> float:
    """Effect of an impulse at step 10 on step 89, relative to its effect on step 11."""
    u = torch.randn(4, 90, 16)
    u2 = u.clone()
    u2[:, 10] += 3.0
    with torch.no_grad():
        d = (ssm(u2) - ssm(u)).abs()
    return float(d[:, 89].mean() / d[:, 11].mean())


def test_ssm_memory_spans_the_input_window():
    """With the original Mamba delta init, a 90-step window is not forgotten."""
    torch.manual_seed(0)
    assert impulse_memory_ratio(SelectiveSSM(16, 8)) > 0.05
    # A short-memory init (delta around 1) loses the same impulse almost completely.
    assert impulse_memory_ratio(SelectiveSSM(16, 8, dt_min=1.0, dt_max=1.0)) < 1e-6


def test_mamba_block_is_causal():
    torch.manual_seed(0)
    block = MambaBlock(d_model=8, d_state=4, expand=2, d_conv=3).eval()
    x = torch.randn(1, 10, 8)
    x2 = x.clone()
    x2[0, 7] += 3.0                        # change step 7
    a, b = block(x), block(x2)
    assert torch.equal(a[0, :7], b[0, :7])  # earlier steps cannot see it
    assert not torch.equal(a[0, 7:], b[0, 7:])


# --- metrics and baselines ---------------------------------------------------------

def test_nse_and_kge_known_values():
    o = np.array([1.0, 2.0, 3.0, np.nan])
    assert nse(o, o) == 1.0 and kge(o, o) == 1.0
    assert nse(np.full(4, 2.0), o) == 0.0   # predicting the observed mean scores 0
    assert math.isnan(nse(np.array([1.0, 1.0]), np.array([np.nan, np.nan])))
    assert kge(np.array([2.0, 4.0, 6.0]), np.array([1.0, 2.0, 3.0])) == pytest.approx(1 - math.sqrt(1 + 1))


def test_flood_contingency_counts():
    obs = np.array([10, 10, 1, 1, np.nan])
    pred = np.array([10, 1, 10, 1, 10])
    c = flood_contingency(pred, obs, 5.0)
    assert (c["hits"], c["misses"], c["false_alarms"], c["flood_days"], c["scored_days"]) == (1, 1, 1, 2, 4)
    assert c["hit_rate"] == 0.5 and c["false_alarm_ratio"] == 0.5
    assert math.isnan(flood_contingency(np.ones(3), np.ones(3), 5.0)["hit_rate"])


def test_persistence_and_targets_align_on_sample_date():
    q = np.arange(10.0).reshape(10, 1)
    t = np.array([3, 5])
    assert target_matrix(q, t, 2)[:, :, 0].tolist() == [[4.0, 5.0], [6.0, 7.0]]
    assert persistence_forecast(q, t, 2)[:, :, 0].tolist() == [[3.0, 3.0], [5.0, 5.0]]


def test_climatology_uses_only_the_given_period_and_same_calendar_bin():
    dates = pd.date_range("2000-01-01", "2003-12-31", freq="D")
    assert calendar_bin(pd.DatetimeIndex(["2000-03-01"]))[0] == calendar_bin(pd.DatetimeIndex(["2001-03-01"]))[0]
    q = np.ones((len(dates), 1))
    q[dates > "2001-12-31"] = 1e6
    clim = fit_climatology(q, dates, "2000-01-01", "2001-12-31", 15)
    assert np.nanmax(clim) == 1.0 and clim.shape == (366, 1)
    with pytest.raises(ValueError):
        fit_climatology(q, dates, "2000-01-01", "2001-12-31", 14)
