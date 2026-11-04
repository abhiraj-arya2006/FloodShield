"""Compute-device selection.

Policy: the Apple GPU via PyTorch MPS is the PRIMARY device for all training
and inference. CPU is only a fallback.

- Select ``torch.device("mps")`` if ``torch.backends.mps.is_available()`` and
  ``torch.backends.mps.is_built()``.
- Fall back to CPU only if MPS is unavailable, and in that case log a clear
  WARNING stating that training will be slow.
- Never fall back silently.
- Use float32 only on MPS: no float64; avoid float16/bfloat16.
- ``PYTORCH_ENABLE_MPS_FALLBACK=1`` (see .env.example) lets individual
  unsupported ops run on CPU instead of crashing. Code should log when ops fall
  back, because heavy fallback defeats the purpose of using the GPU.
"""

import logging

import torch

log = logging.getLogger(__name__)


def get_device(preferred: str = "mps", fallback: str = "cpu") -> torch.device:
    if preferred != "mps":
        return torch.device(preferred)
    if torch.backends.mps.is_built() and torch.backends.mps.is_available():
        return torch.device("mps")
    message = f"WARNING: MPS is not available; running on {fallback}. Training will be slow."
    log.warning(message)
    print(message, flush=True)
    return torch.device(fallback)
