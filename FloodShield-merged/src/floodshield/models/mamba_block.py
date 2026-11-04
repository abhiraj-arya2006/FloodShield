"""Pure-PyTorch Mamba (selective state-space) block; no CUDA kernels, runs on MPS.

Follows Gu & Dao (2023), "Mamba: Linear-Time Sequence Modeling with Selective
State Spaces". For each channel d and state dimension n, with input u_t and
input-dependent delta_t, B_t, C_t:

    h_t = exp(delta_t * A) * h_(t-1) + delta_t * B_t * u_t
    y_t = sum_n(C_t * h_t) + D * u_t

with A = -exp(A_log) < 0, so exp(delta_t * A) is in (0, 1) and the state decays.
The scan is sequential over time; it is causal (y_t only sees u_1..u_t).
"""

import math

import torch
import torch.nn.functional as F
from torch import nn


def selective_scan(u: torch.Tensor, delta: torch.Tensor, A: torch.Tensor, B: torch.Tensor,
                   C: torch.Tensor, D: torch.Tensor) -> torch.Tensor:
    """Sequential scan. Shapes: u, delta [b, l, d]; A [d, n]; B, C [b, l, n]; D [d].
    Returns y [b, l, d]. The initial state is zero."""
    b, l, d = u.shape
    h = u.new_zeros(b, d, A.shape[1])
    ys = []
    for t in range(l):
        dt = delta[:, t, :, None]                          # [b, d, 1]
        h = torch.exp(dt * A) * h + dt * B[:, t, None, :] * u[:, t, :, None]
        ys.append((h * C[:, t, None, :]).sum(-1) + u[:, t] * D)
    return torch.stack(ys, dim=1)


class SelectiveSSM(nn.Module):
    """Learned input-dependent SSM.

    delta uses the initialisation of the original Mamba code: bias = inverse
    softplus of a log-uniform draw in [dt_min, dt_max], small weights. The slowest
    state's decay per step is about exp(-delta), so the time constants at start
    span roughly 1/dt_max to 1/dt_min steps. Without it delta starts near 0.7 and
    the block forgets a long input window within a few steps.
    """

    def __init__(self, d_in: int, d_state: int, dt_min: float = 0.001, dt_max: float = 0.1):
        super().__init__()
        self.d_state = d_state
        # Log-spaced decay rates per state dimension, as in the reference implementations.
        init = torch.log(torch.arange(1, d_state + 1, dtype=torch.float32)).repeat(d_in, 1)
        self.A_log = nn.Parameter(init)
        self.D = nn.Parameter(torch.ones(d_in))
        self.delta_proj = nn.Linear(d_in, d_in)
        self.bc_proj = nn.Linear(d_in, 2 * d_state, bias=False)
        with torch.no_grad():
            bound = math.sqrt(1.0 / d_in)
            self.delta_proj.weight.uniform_(-bound, bound)
            dt = torch.exp(torch.rand(d_in) * (math.log(dt_max) - math.log(dt_min)) + math.log(dt_min))
            self.delta_proj.bias.copy_(dt + torch.log(-torch.expm1(-dt)))   # inverse softplus

    def forward(self, u: torch.Tensor) -> torch.Tensor:
        delta = F.softplus(self.delta_proj(u))
        B, C = self.bc_proj(u).split(self.d_state, dim=-1)
        return selective_scan(u, delta, -torch.exp(self.A_log), B, C, self.D)


class MambaBlock(nn.Module):
    """Pre-norm residual block: x + project(SSM(conv(x)) * gate(x)). Input [b, l, d_model]."""

    def __init__(self, d_model: int, d_state: int, expand: int, d_conv: int, dropout: float = 0.0,
                 dt_min: float = 0.001, dt_max: float = 0.1):
        super().__init__()
        d_in = expand * d_model
        self.norm = nn.LayerNorm(d_model)
        self.in_proj = nn.Linear(d_model, 2 * d_in)
        # Causal depthwise conv: pad both sides, then trim the right side in forward().
        self.conv = nn.Conv1d(d_in, d_in, kernel_size=d_conv, groups=d_in, padding=d_conv - 1)
        self.ssm = SelectiveSSM(d_in, d_state, dt_min, dt_max)
        self.out_proj = nn.Linear(d_in, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        length = x.shape[1]
        u, gate = self.in_proj(self.norm(x)).chunk(2, dim=-1)
        u = self.conv(u.transpose(1, 2))[:, :, :length].transpose(1, 2)
        y = self.ssm(F.silu(u)) * F.silu(gate)
        return x + self.dropout(self.out_proj(y))


class MambaEncoder(nn.Module):
    """Stack of Mamba blocks. Weights are shared by every sequence in the batch."""

    def __init__(self, d_model: int, d_state: int, expand: int, d_conv: int, num_layers: int,
                 dropout: float = 0.0, dt_min: float = 0.001, dt_max: float = 0.1):
        super().__init__()
        self.blocks = nn.ModuleList(MambaBlock(d_model, d_state, expand, d_conv, dropout, dt_min, dt_max)
                                    for _ in range(num_layers))
        self.norm = nn.LayerNorm(d_model)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        for block in self.blocks:
            x = block(x)
        return self.norm(x)
