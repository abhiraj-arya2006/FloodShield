"""STG-Mamba: shared Mamba encoder per gauge, river-graph layers, per-gauge head.

Weather-driven: forward() takes only weather and static features. Observed
streamflow is never an argument, so it cannot reach the predictions.

Sequence per gauge (L past + H future steps), channels = dynamic features plus
is_future. On future steps the rain channel holds x_future, the other weather
channels are 0 (their standardised mean) and is_future = 1. Static features are
projected to d_model and ADDED to every step's projected input.

Decoders (STGMambaConfig.decoder):
    last_step  the hidden state at the last step is the gauge embedding; one head
               maps it to all H leads, so every lead sees rain up to t+H.
    per_lead   the hidden state at future step t+k decodes lead k through a shared
               head, so lead k sees rain only up to t+k. Graph layers run
               separately on each lead's states.
"""

from collections.abc import Sequence
from dataclasses import dataclass

import pandas as pd
import torch
from torch import nn

from floodshield.models.layers import RiverGraphLayer, build_edge_tensors
from floodshield.models.mamba_block import MambaEncoder

DECODERS = ("last_step", "per_lead")


@dataclass(frozen=True)
class STGMambaConfig:
    n_features: int
    n_static: int
    n_nodes: int
    horizon: int
    rain_channel: int
    d_model: int
    d_state: int
    expand: int
    d_conv: int
    num_layers: int
    dropout: float
    head_hidden: int
    graph_enabled: bool
    graph_layers: int
    graph_direction: str
    distance_scale_km: float
    dt_min: float = 0.001
    dt_max: float = 0.1
    decoder: str = "last_step"


def config_from_yaml(model_cfg: dict, feature_list: Sequence[str], n_static: int, n_nodes: int,
                     **overrides) -> STGMambaConfig:
    m, g, inp = model_cfg["model"], model_cfg["graph"], model_cfg["input"]
    values = {
        "n_features": len(feature_list), "n_static": n_static, "n_nodes": n_nodes,
        "horizon": int(model_cfg["output"]["horizon_days"]),
        "rain_channel": list(feature_list).index(inp["future_features"][0]),
        "d_model": m["d_model"], "d_state": m["d_state"], "expand": m["expand"], "d_conv": m["d_conv"],
        "num_layers": m["num_layers"], "dropout": m["dropout"], "head_hidden": m["head_hidden"],
        "graph_enabled": g["enabled"], "graph_layers": g["layers"], "graph_direction": g["direction"],
        "distance_scale_km": g["distance_scale_km"], "dt_min": m["dt_min"], "dt_max": m["dt_max"],
        "decoder": m.get("decoder", "last_step"),   # checkpoints older than this option are last_step
    }
    values.update(overrides)
    return STGMambaConfig(**values)


def build_sequence(x_past: torch.Tensor, x_future: torch.Tensor, rain_channel: int) -> torch.Tensor:
    """[B, L, N, F] + [B, H, N, 1] -> [B, L+H, N, F+1] with is_future as the last channel."""
    b, h, n, _ = x_future.shape
    future = x_past.new_zeros(b, h, n, x_past.shape[-1])
    future[..., rain_channel] = x_future[..., 0]
    seq = torch.cat([x_past, future], dim=1)
    flag = x_past.new_zeros(b, seq.shape[1], n, 1)
    flag[:, x_past.shape[1]:] = 1.0
    return torch.cat([seq, flag], dim=-1)


class STGMamba(nn.Module):
    def __init__(self, cfg: STGMambaConfig, edges: pd.DataFrame, node_ids: Sequence[str]):
        super().__init__()
        if cfg.decoder not in DECODERS:
            raise ValueError(f"decoder must be one of {DECODERS}, got {cfg.decoder!r}")
        self.cfg = cfg
        d = cfg.d_model
        self.input_proj = nn.Linear(cfg.n_features + 1, d)   # weather channels + is_future
        self.static_proj = nn.Linear(cfg.n_static, d)
        self.encoder = MambaEncoder(d, cfg.d_state, cfg.expand, cfg.d_conv, cfg.num_layers, cfg.dropout,
                                    cfg.dt_min, cfg.dt_max)
        self.graph_layers = nn.ModuleList()
        if cfg.graph_enabled:
            edge_index, edge_attr = build_edge_tensors(edges, node_ids, cfg.graph_direction,
                                                       cfg.distance_scale_km)
            self.graph_layers.extend(
                RiverGraphLayer(d, cfg.n_nodes, edge_index, edge_attr, cfg.dropout)
                for _ in range(cfg.graph_layers))
        self.head = nn.Sequential(nn.Linear(d, cfg.head_hidden), nn.SiLU(), nn.Dropout(cfg.dropout),
                                  nn.Linear(cfg.head_hidden, 1 if cfg.decoder == "per_lead" else cfg.horizon))

    def forward(self, x_past: torch.Tensor, x_future: torch.Tensor, static: torch.Tensor) -> torch.Tensor:
        """x_past [B, L, N, F], x_future [B, H, N, 1], static [B, N, S] -> [B, H, N]
        in standardised log1p flow space."""
        b, _, n, _ = x_past.shape
        seq = build_sequence(x_past, x_future, self.cfg.rain_channel)            # [B, T, N, F+1]
        z = self.input_proj(seq) + self.static_proj(static)[:, None]             # [B, T, N, d]
        z = z.permute(0, 2, 1, 3).reshape(b * n, seq.shape[1], -1)               # [B*N, T, d]
        hidden = self.encoder(z)                                                 # [B*N, T, d]
        if self.cfg.decoder == "per_lead":
            H = self.cfg.horizon
            h = hidden[:, -H:].reshape(b, n, H, -1).permute(0, 2, 1, 3)          # [B, H, N, d]
            h = h.reshape(b * H, n, -1)                                          # [B*H, N, d]
            for layer in self.graph_layers:
                h = layer(h)
            return self.head(h).reshape(b, H, n)                                 # [B, H, N]
        h = hidden[:, -1].reshape(b, n, -1)                                      # [B, N, d]
        for layer in self.graph_layers:
            h = layer(h)
        return self.head(h).permute(0, 2, 1)                                     # [B, H, N]

    def num_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
