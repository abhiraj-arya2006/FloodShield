"""River-graph message passing in plain PyTorch (no torch-geometric).

Edges come from configs/graph_edges.csv (upstream -> downstream, river_km). A
message goes along each directed edge; a node averages the messages it receives
and updates itself. With direction "downstream" and k layers, a gauge influences
only itself and gauges up to k edges downstream of it.
"""

from collections.abc import Sequence

import pandas as pd
import torch
from torch import nn

GRAPH_DIRECTIONS = ("downstream", "both")


def build_edge_tensors(edges: pd.DataFrame, node_ids: Sequence[str], direction: str,
                       distance_scale_km: float) -> tuple[torch.Tensor, torch.Tensor]:
    """Returns edge_index [2, E] (source, target) and edge_attr [E, 2].

    edge_attr holds (river_km / distance_scale_km, is_reverse); is_reverse is 1
    for the upstream-going copies added when direction is "both".
    """
    if direction not in GRAPH_DIRECTIONS:
        raise ValueError(f"graph direction must be one of {GRAPH_DIRECTIONS}, got {direction!r}")
    index = {g: i for i, g in enumerate(node_ids)}
    src = [index[g] for g in edges["source"]]
    dst = [index[g] for g in edges["target"]]
    km = [float(v) / distance_scale_km for v in edges["river_km"]]
    rev = [0.0] * len(src)
    if direction == "both":
        src, dst = src + dst, dst + src
        km, rev = km + km, rev + [1.0] * len(rev)
    edge_index = torch.tensor([src, dst], dtype=torch.long).reshape(2, -1)
    edge_attr = torch.tensor(list(zip(km, rev)), dtype=torch.float32).reshape(-1, 2)
    return edge_index, edge_attr


class RiverGraphLayer(nn.Module):
    """One round of message passing over node states [B, N, d]."""

    def __init__(self, d: int, num_nodes: int, edge_index: torch.Tensor, edge_attr: torch.Tensor,
                 dropout: float = 0.0):
        super().__init__()
        self.register_buffer("src", edge_index[0])
        self.register_buffer("dst", edge_index[1])
        self.register_buffer("edge_attr", edge_attr)
        counts = torch.zeros(num_nodes, dtype=torch.float32)
        counts.index_add_(0, edge_index[1], torch.ones(edge_index.shape[1]))
        self.register_buffer("in_count", counts.clamp(min=1.0)[None, :, None])
        self.message = nn.Sequential(nn.Linear(2 * d + edge_attr.shape[1], d), nn.SiLU(), nn.Linear(d, d))
        self.update = nn.Sequential(nn.Linear(2 * d, d), nn.SiLU(), nn.Linear(d, d))
        self.norm = nn.LayerNorm(d)
        self.dropout = nn.Dropout(dropout)

    def forward(self, h: torch.Tensor) -> torch.Tensor:
        b = h.shape[0]
        attr = self.edge_attr[None].expand(b, -1, -1)
        msg = self.message(torch.cat([h[:, self.src], h[:, self.dst], attr], dim=-1))
        total = torch.zeros_like(h).index_add_(1, self.dst, msg)
        delta = self.update(torch.cat([h, total / self.in_count], dim=-1))
        return self.norm(h + self.dropout(delta))
