"""PyTorch dataset producing (input window, target horizon, mask) samples over all gauges."""

# TODO: Yield all gauge nodes together per sample so the graph step sees the whole network.
# TODO: Return a mask marking missing target streamflow for the masked loss.
