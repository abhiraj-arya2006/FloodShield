"""Train STG-Mamba on the train split with early stopping on the validation split.

Only train and validation are loaded; the test split stays locked.

Modes:
    python scripts/train.py --overfit-batch   # S2: overfit one small batch
    python scripts/train.py --benchmark       # S3: seconds per epoch and memory
    python scripts/train.py                   # S4: full training
Options:
    --graph {on,off}  override configs/model.yaml graph.enabled (ablation)
    --decoder {last_step,per_lead}  override configs/model.yaml model.decoder
    --high-flow-weight W  loss weight on days above the gauge's warning threshold,
                      overriding configs/training.yaml loss.high_flow. Validation
                      loss is weighted too, so it is not comparable across weights.
    --seed N          override configs/training.yaml seed
    --run-name NAME   checkpoint and log name (default stg_mamba)
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import yaml

from floodshield.data.preprocessing import Normaliser
from floodshield.data.sequence_dataset import announce_future_rain_mode, load_split
from floodshield.models.stg_mamba import DECODERS, STGMamba, config_from_yaml
from floodshield.training.losses import masked_loss
from floodshield.training.trainer import (
    LossConfig,
    batch_loss,
    evaluate_loss,
    fit,
    make_loader,
    to_device,
)
from floodshield.utils.device import get_device
from floodshield.utils.reproducibility import set_seed

REPO_ROOT = Path(__file__).resolve().parents[1]


def load_cfg(name: str) -> dict:
    return yaml.safe_load((REPO_ROOT / "configs" / name).read_text())


def rp(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else REPO_ROOT / path


def build_model(model_cfg: dict, node_ids: list[str], n_static: int, **overrides) -> STGMamba:
    edges = pd.read_csv(rp(model_cfg["graph"]["edges_file"]), dtype={"source": str, "target": str})
    cfg = config_from_yaml(model_cfg, model_cfg["input"]["feature_list"], n_static, len(node_ids), **overrides)
    return STGMamba(cfg, edges, node_ids)


def high_flow_z_thresholds(train_cfg: dict, processed: Path, gauge_ids: list[str], device) -> torch.Tensor:
    """The warning threshold of each gauge, in the standardised log1p space of the targets."""
    norm = json.loads((processed / "normalisers.json").read_text())["target"]
    if norm["gauge_ids"] != gauge_ids:
        raise ValueError("normaliser gauge order differs from the data")
    thr = pd.read_csv(REPO_ROOT / "configs" / "flow_thresholds.csv", dtype={"gauge_id": str}).set_index("gauge_id")
    column = f"q{round(train_cfg['warning']['threshold_quantile'] * 100):d}"
    z = Normaliser.from_dict(norm).transform(thr.loc[gauge_ids, column].to_numpy())
    return torch.tensor(z, dtype=torch.float32, device=device)


def mps_memory_mb() -> dict:
    if not torch.backends.mps.is_available():
        return {}
    return {"current_allocated_mb": torch.mps.current_allocated_memory() / 1e6,
            "driver_allocated_mb": torch.mps.driver_allocated_memory() / 1e6}


def overfit_batch(model_cfg: dict, train_cfg: dict, train, device, metrics_dir: Path, out_name: str) -> int:
    s = train_cfg["sanity_overfit"]
    ds = train["dataset"]
    picks = np.linspace(0, len(ds) - 1, s["batch_size"]).astype(int).tolist()
    raw = torch.utils.data.default_collate([ds[i] for i in picks])
    batch = to_device(raw, device)
    model = build_model(model_cfg, train["gauge_ids"], ds.static.shape[1], dropout=0.0).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=s["learning_rate"], weight_decay=0.0)
    every = max(1, s["steps"] // 12)
    curve = []
    for step in range(1, s["steps"] + 1):
        model.train()
        optimizer.zero_grad(set_to_none=True)
        pred = model(batch["x_past"], batch["x_future"], batch["static"])
        loss = masked_loss(pred, batch["y"], batch["mask"], train_cfg["loss"]["type"],
                           train_cfg["loss"]["huber_delta"])
        loss.backward()
        optimizer.step()
        if step == 1 or step % every == 0:
            curve.append({"step": step, "loss": float(loss.item())})
            print(f"step {step:4d}  loss {loss.item():.5f}", flush=True)
    passed = curve[-1]["loss"] <= s["pass_loss"]
    print(f"Overfit sanity: first {curve[0]['loss']:.4f}, last {curve[-1]['loss']:.5f}, "
          f"pass_loss {s['pass_loss']} -> {'PASS' if passed else 'FAIL'}")
    (metrics_dir / out_name).write_text(json.dumps(
        {"batch_size": s["batch_size"], "sample_dates": [ds[i]["t"] for i in picks],
         "curve": curve, "passed": passed, "device": str(device)}, indent=1))
    return 0 if passed else 1


def timed_batches(model, loader, device, loss_cfg, optimizer, n: int, warmup: int) -> list[float]:
    times = []
    model.train()
    for i, raw in enumerate(loader):
        if i >= n + warmup:
            break
        start = time.perf_counter()
        batch = to_device(raw, device)
        optimizer.zero_grad(set_to_none=True)
        loss = batch_loss(model, batch, loss_cfg, None)
        loss.backward()
        optimizer.step()
        loss.item()   # forces MPS to finish the step
        if i >= warmup:
            times.append(time.perf_counter() - start)
    return times


def benchmark(model_cfg: dict, train_cfg: dict, train, val, device, metrics_dir: Path) -> int:
    b = train_cfg["benchmark"]
    loss_cfg = LossConfig.from_yaml(train_cfg["loss"])
    ds = train["dataset"]
    bs = train_cfg["batch_size"]
    loader = make_loader(ds, bs, shuffle=True, seed=train_cfg["seed"])
    model = build_model(model_cfg, train["gauge_ids"], ds.static.shape[1]).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=train_cfg["optimizer"]["learning_rate"])
    times = timed_batches(model, loader, device, loss_cfg, opt, b["batches"], b["warmup_batches"])
    per_batch = float(np.median(times))
    n_batches = len(loader)
    start = time.perf_counter()
    val_loss = evaluate_loss(model, make_loader(val["dataset"], train_cfg["eval_batch_size"], shuffle=False),
                             device, loss_cfg)
    val_seconds = time.perf_counter() - start
    memory = mps_memory_mb() if device.type == "mps" else {}

    cpu_model = build_model(model_cfg, train["gauge_ids"], ds.static.shape[1])
    cpu_opt = torch.optim.AdamW(cpu_model.parameters(), lr=train_cfg["optimizer"]["learning_rate"])
    cpu_times = timed_batches(cpu_model, make_loader(ds, bs, shuffle=True, seed=train_cfg["seed"]),
                              torch.device("cpu"), loss_cfg, cpu_opt, b["cpu_batches"], 1)
    result = {
        "device": str(device), "parameters": model.num_parameters(), "batch_size": bs,
        "batches_per_epoch": n_batches, "seconds_per_batch_median": per_batch,
        "seconds_per_train_epoch_estimate": per_batch * n_batches,
        "validation_pass_seconds": val_seconds, "untrained_val_loss": val_loss, **memory,
        "cpu_seconds_per_batch_median": float(np.median(cpu_times)),
        "cpu_seconds_per_train_epoch_estimate": float(np.median(cpu_times)) * n_batches,
    }
    (metrics_dir / "step2_benchmark.json").write_text(json.dumps(result, indent=1))
    print(json.dumps(result, indent=1))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--overfit-batch", action="store_true")
    parser.add_argument("--benchmark", action="store_true")
    parser.add_argument("--graph", choices=["on", "off"], default=None)
    parser.add_argument("--decoder", choices=list(DECODERS), default=None)
    parser.add_argument("--high-flow-weight", type=float, default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--run-name", default="stg_mamba")
    args = parser.parse_args()

    model_cfg, train_cfg = load_cfg("model.yaml"), load_cfg("training.yaml")
    if args.graph is not None:
        model_cfg["graph"]["enabled"] = args.graph == "on"
    if args.decoder is not None:
        model_cfg["model"]["decoder"] = args.decoder
    decoder = model_cfg["model"]["decoder"]
    if args.high_flow_weight is not None:
        train_cfg["loss"]["high_flow"] = {"enabled": True, "weight": args.high_flow_weight}
    high_flow = train_cfg["loss"]["high_flow"]
    if args.seed is not None:
        train_cfg["seed"] = args.seed
    set_seed(train_cfg["seed"])
    announce_future_rain_mode(train_cfg["future_rain"]["mode"], train_cfg["future_rain"].get("noisy"))
    device = get_device(train_cfg["device"], train_cfg["fallback_device"])
    print(f"Device: {device} | graph enabled: {model_cfg['graph']['enabled']} | decoder: {decoder} | high_flow: {high_flow} | seed: {train_cfg['seed']}", flush=True)

    processed = rp(train_cfg["processed_dir"])
    train, val = load_split(processed, "train"), load_split(processed, "validation")
    metrics_dir = rp(train_cfg["metrics_dir"])
    metrics_dir.mkdir(parents=True, exist_ok=True)

    if args.overfit_batch:
        out_name = "step2_overfit.json" if args.run_name == "stg_mamba" else f"{args.run_name}_overfit.json"
        return overfit_batch(model_cfg, train_cfg, train, device, metrics_dir, out_name)
    if args.benchmark:
        return benchmark(model_cfg, train_cfg, train, val, device, metrics_dir)

    ds = train["dataset"]
    model = build_model(model_cfg, train["gauge_ids"], ds.static.shape[1]).to(device)
    print(f"Parameters: {model.num_parameters()}", flush=True)
    opt_cfg = train_cfg["optimizer"]
    optimizer = torch.optim.AdamW(model.parameters(), lr=opt_cfg["learning_rate"],
                                  weight_decay=opt_cfg["weight_decay"])
    ckpt_dir = rp(train_cfg["checkpoint_dir"])
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    ckpt = ckpt_dir / f"{args.run_name}_best.pt"
    extra = {"model_cfg": model_cfg, "gauge_ids": train["gauge_ids"], "n_static": ds.static.shape[1]}

    log_path = REPO_ROOT / "outputs" / f"{args.run_name}_train_log.csv"
    log_path.parent.mkdir(exist_ok=True)
    rows = []

    def on_epoch(row: dict) -> None:
        rows.append(row)
        pd.DataFrame(rows).to_csv(log_path, index=False)
        print(f"epoch {row['epoch']:3d}  train {row['train_loss']:.5f}  val {row['val_loss']:.5f}  "
              f"{row['epoch_seconds']:.1f}s{'  *best*' if row['best'] else ''}", flush=True)

    z_threshold = high_flow_z_thresholds(train_cfg, processed, train["gauge_ids"], device) \
        if high_flow["enabled"] else None
    result = fit(model, make_loader(ds, train_cfg["batch_size"], shuffle=True, seed=train_cfg["seed"]),
                 make_loader(val["dataset"], train_cfg["eval_batch_size"], shuffle=False),
                 optimizer, device, LossConfig.from_yaml(train_cfg["loss"]), train_cfg["epochs"],
                 train_cfg["early_stopping"]["patience"], train_cfg["gradient_clip_norm"], ckpt, extra,
                 z_threshold=z_threshold, on_epoch=on_epoch)
    summary = {**{k: v for k, v in result.items() if k != "history"}, "parameters": model.num_parameters(),
               "device": str(device), "graph_enabled": model_cfg["graph"]["enabled"], "decoder": decoder,
               "high_flow": high_flow,
               "future_rain_mode": train_cfg["future_rain"]["mode"], "seed": train_cfg["seed"],
               "seconds_per_epoch_median": float(np.median([r["epoch_seconds"] for r in result["history"]])),
               "history": result["history"]}
    (metrics_dir / f"{args.run_name}_training.json").write_text(json.dumps(summary, indent=1))
    print(f"Best epoch {result['best_epoch']} val {result['best_val_loss']:.5f} | "
          f"epochs trained {result['epochs_trained']} | checkpoint {ckpt.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
