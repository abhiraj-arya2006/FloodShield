"""Compute-device selection (scaffold; not implemented).

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

# TODO: get_device(preferred="mps", fallback="cpu") -> torch.device, following the policy above.
# TODO: get_dtype() -> torch.float32.
# TODO: helper to log/count per-op CPU fallbacks when PYTORCH_ENABLE_MPS_FALLBACK is set.
