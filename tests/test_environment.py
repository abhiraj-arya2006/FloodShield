"""Environment smoke test: imports, package install, MPS availability, tiny tensor op.

This is the only real test in the scaffold. It must pass on CPU too, but a
missing MPS backend is reported loudly because MPS is the primary device.
"""

import importlib
import warnings

import pytest

REQUIRED_PACKAGES = [
    "numpy",
    "pandas",
    "torch",
    "networkx",
    "geopandas",
    "shapely",
    "fastapi",
    "yaml",
]


@pytest.mark.parametrize("name", REQUIRED_PACKAGES)
def test_required_package_imports(name):
    importlib.import_module(name)


def test_floodshield_package_imports():
    import floodshield

    assert floodshield.__name__ == "floodshield"


def _select_device():
    import torch

    mps_built = torch.backends.mps.is_built()
    mps_available = torch.backends.mps.is_available()
    device = torch.device("mps") if (mps_built and mps_available) else torch.device("cpu")
    return device, mps_built, mps_available


def test_mps_status_and_tiny_tensor_op(capsys):
    import torch

    device, mps_built, mps_available = _select_device()

    with capsys.disabled():
        print("\n" + "=" * 64)
        print(f"  torch {torch.__version__}")
        print(f"  MPS built: {mps_built}   MPS available: {mps_available}")
        print(f"  Selected device: {device}")
        if device.type != "mps":
            print("  !!! WARNING: MPS NOT AVAILABLE. Falling back to CPU.")
            print("  !!! Training will be SLOW. MPS is the primary device.")
        print("=" * 64)

    if device.type != "mps":
        warnings.warn(
            "MPS is not available; running on CPU. Training will be slow.",
            RuntimeWarning,
            stacklevel=1,
        )

    a = torch.arange(6, dtype=torch.float32, device=device).reshape(2, 3)
    b = torch.ones(3, 2, dtype=torch.float32, device=device)
    c = a @ b

    assert c.device.type == device.type
    assert c.dtype == torch.float32
    expected = torch.tensor([[3.0, 3.0], [12.0, 12.0]])
    assert torch.allclose(c.cpu(), expected)
