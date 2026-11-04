"""Dense directed adjacency between gauges (plain numpy/torch, no torch-geometric).

A[i, j] = 1 when there is an edge from gauge i (upstream) to gauge j
(downstream). Node order is the order of the gauge list passed in.
"""

from collections.abc import Sequence

import numpy as np
import pandas as pd


def dense_adjacency(node_ids: Sequence[str], edges: pd.DataFrame) -> np.ndarray:
    index = {g: i for i, g in enumerate(node_ids)}
    a = np.zeros((len(node_ids), len(node_ids)), dtype=np.float32)
    for s, t in zip(edges["source"], edges["target"]):
        a[index[s], index[t]] = 1.0
    return a


def reachable_downstream(adjacency: np.ndarray) -> np.ndarray:
    """R[i, j] = True if j can be reached from i by following edges (i != j)."""
    n = adjacency.shape[0]
    reach = adjacency.astype(bool)
    for k in range(n):  # Floyd-Warshall style transitive closure
        reach = reach | (reach[:, [k]] & reach[[k], :])
    np.fill_diagonal(reach, False)
    return reach
