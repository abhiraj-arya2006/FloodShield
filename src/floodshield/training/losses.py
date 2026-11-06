"""Masked regression loss on standardised log1p flow.

Entries with mask 0 (missing observed streamflow) contribute nothing: they are
neither filled nor counted. The loss is a weighted mean over observed entries.
"""

import torch
import torch.nn.functional as F

LOSS_KINDS = ("huber", "mse")


def masked_loss(pred: torch.Tensor, y: torch.Tensor, mask: torch.Tensor, kind: str = "huber",
                huber_delta: float = 1.0, weights: torch.Tensor | None = None) -> torch.Tensor:
    if kind == "huber":
        per_entry = F.huber_loss(pred, y, reduction="none", delta=huber_delta)
    elif kind == "mse":
        per_entry = (pred - y) ** 2
    else:
        raise ValueError(f"loss kind must be one of {LOSS_KINDS}, got {kind!r}")
    w = mask if weights is None else mask * weights
    denom = w.sum()
    if denom == 0:
        return (pred * 0.0).sum()   # keeps the graph; no observed entry in this batch
    return (per_entry * w).sum() / denom


def high_flow_weights(y: torch.Tensor, z_threshold: torch.Tensor, weight: float) -> torch.Tensor:
    """1 for normal days, ``weight`` where the target exceeds the gauge's threshold.
    ``z_threshold`` [N] is in the same standardised log1p space as ``y`` [..., N]."""
    return torch.where(y > z_threshold, torch.full_like(y, float(weight)), torch.ones_like(y))
