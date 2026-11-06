"""Training loop on MPS (CPU fallback) with early stopping on validation loss.

Only the train and validation splits are used here; the test split is locked in
floodshield.data.sequence_dataset.load_split.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, default_collate

from floodshield.training.losses import high_flow_weights, masked_loss

TENSOR_KEYS = ("x_past", "x_future", "static", "y", "mask")


@dataclass(frozen=True)
class LossConfig:
    kind: str
    huber_delta: float
    high_flow_enabled: bool = False
    high_flow_weight: float | None = None

    @classmethod
    def from_yaml(cls, cfg: dict) -> "LossConfig":
        hf = cfg.get("high_flow", {})
        return cls(cfg["type"], float(cfg["huber_delta"]), bool(hf.get("enabled", False)), hf.get("weight"))


def make_loader(dataset, batch_size: int, shuffle: bool, seed: int | None = None) -> DataLoader:
    generator = torch.Generator().manual_seed(seed) if seed is not None else None
    return DataLoader(dataset, batch_size=batch_size, shuffle=shuffle, generator=generator,
                      collate_fn=default_collate, num_workers=0)


def to_device(batch: dict, device: torch.device) -> dict:
    return {k: batch[k].to(device) for k in TENSOR_KEYS}


def batch_loss(model, batch: dict, loss_cfg: LossConfig, z_threshold: torch.Tensor | None) -> torch.Tensor:
    pred = model(batch["x_past"], batch["x_future"], batch["static"])
    weights = None
    if loss_cfg.high_flow_enabled:
        if z_threshold is None or loss_cfg.high_flow_weight is None:
            raise ValueError("high-flow weighting needs a threshold and a weight")
        weights = high_flow_weights(batch["y"], z_threshold, loss_cfg.high_flow_weight)
    return masked_loss(pred, batch["y"], batch["mask"], loss_cfg.kind, loss_cfg.huber_delta, weights)


def train_one_epoch(model, loader, optimizer, device, loss_cfg: LossConfig, clip_norm: float | None,
                    z_threshold=None) -> float:
    model.train()
    total, n = 0.0, 0
    for raw in loader:
        batch = to_device(raw, device)
        optimizer.zero_grad(set_to_none=True)
        loss = batch_loss(model, batch, loss_cfg, z_threshold)
        loss.backward()
        if clip_norm:
            torch.nn.utils.clip_grad_norm_(model.parameters(), clip_norm)
        optimizer.step()
        size = batch["y"].shape[0]
        total, n = total + float(loss.item()) * size, n + size
    return total / n


@torch.no_grad()
def evaluate_loss(model, loader, device, loss_cfg: LossConfig, z_threshold=None) -> float:
    model.eval()
    total, n = 0.0, 0
    for raw in loader:
        batch = to_device(raw, device)
        size = batch["y"].shape[0]
        total += float(batch_loss(model, batch, loss_cfg, z_threshold).item()) * size
        n += size
    return total / n


@torch.no_grad()
def predict(model, loader, device) -> np.ndarray:
    """Predictions [n_samples, H, N] in standardised log1p space, in dataset order."""
    model.eval()
    out = []
    for raw in loader:
        batch = to_device(raw, device)
        out.append(model(batch["x_past"], batch["x_future"], batch["static"]).cpu().numpy())
    return np.concatenate(out, axis=0)


def fit(model, train_loader, val_loader, optimizer, device, loss_cfg: LossConfig, max_epochs: int,
        patience: int, clip_norm: float | None, checkpoint_path: Path, extra_state: dict,
        z_threshold=None, on_epoch: Callable[[dict], None] | None = None) -> dict:
    """Train with early stopping on validation loss; the best weights go to ``checkpoint_path``."""
    history, best_val, best_epoch, stale = [], float("inf"), 0, 0
    for epoch in range(1, max_epochs + 1):
        start = time.perf_counter()
        train_loss = train_one_epoch(model, train_loader, optimizer, device, loss_cfg, clip_norm, z_threshold)
        train_seconds = time.perf_counter() - start
        val_loss = evaluate_loss(model, val_loader, device, loss_cfg, z_threshold)
        if not (np.isfinite(train_loss) and np.isfinite(val_loss)):
            raise RuntimeError(f"non-finite loss at epoch {epoch}: train {train_loss}, val {val_loss}")
        row = {"epoch": epoch, "train_loss": train_loss, "val_loss": val_loss,
               "train_seconds": train_seconds, "epoch_seconds": time.perf_counter() - start}
        improved = val_loss < best_val
        if improved:
            best_val, best_epoch, stale = val_loss, epoch, 0
            torch.save({"model_state": model.state_dict(), "epoch": epoch, "val_loss": val_loss,
                        **extra_state}, checkpoint_path)
        else:
            stale += 1
        row["best"] = improved
        history.append(row)
        if on_epoch:
            on_epoch(row)
        if stale >= patience:
            break
    return {"history": history, "best_epoch": best_epoch, "best_val_loss": best_val,
            "epochs_trained": len(history), "stopped_early": stale >= patience}
