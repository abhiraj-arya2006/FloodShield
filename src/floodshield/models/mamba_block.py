"""Future pure-PyTorch Mamba (selective state space) block. No CUDA kernels."""

# TODO: Implement the selective scan as a parallel/associative or chunked scan, not a per-step loop.
# TODO: Keep everything float32 and MPS-compatible.
