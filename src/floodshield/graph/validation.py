"""Sanity checks for the gauge graph: structure and agreement with catchment polygons."""

from collections.abc import Sequence

import geopandas as gpd
import networkx as nx
import numpy as np
import pandas as pd

from floodshield.graph.adjacency import reachable_downstream


def graph_summary(node_ids: Sequence[str], edges: pd.DataFrame, basin: pd.Series) -> dict:
    g = nx.DiGraph()
    g.add_nodes_from(node_ids)
    g.add_edges_from(zip(edges["source"], edges["target"]))
    comps = list(nx.weakly_connected_components(g))
    return {
        "nodes": g.number_of_nodes(),
        "edges": g.number_of_edges(),
        "is_dag": nx.is_directed_acyclic_graph(g),
        "edges_per_basin": edges["source"].map(basin).value_counts().to_dict(),
        "cross_basin_edges": int((edges["source"].map(basin) != edges["target"].map(basin)).sum()),
        "components": len(comps),
        "component_sizes": sorted((len(c) for c in comps), reverse=True),
        "isolated": sorted(n for n in g.nodes if g.degree(n) == 0),
        "max_in_degree": max(dict(g.in_degree()).values(), default=0),
        "max_out_degree": max(dict(g.out_degree()).values(), default=0),
    }


def nesting_fractions(polys: gpd.GeoDataFrame, node_ids: Sequence[str], metric_crs: str) -> pd.DataFrame:
    """frac[a, b] = area(A ∩ B) / area(A) for every ordered pair of catchments."""
    p = polys.set_index("gauge_id").loc[list(node_ids)].to_crs(metric_crs).geometry
    areas = p.area.to_numpy()
    n = len(node_ids)
    frac = np.zeros((n, n))
    sidx = p.sindex
    for i, geom in enumerate(p):
        for j in sidx.query(geom, predicate="intersects"):
            if i != j:
                frac[i, j] = geom.intersection(p.iloc[j]).area / areas[i]
    return pd.DataFrame(frac, index=list(node_ids), columns=list(node_ids))


def polygon_disagreements(frac: pd.DataFrame, adjacency: np.ndarray, nested_min: float) -> pd.DataFrame:
    """Compare polygon nesting with graph reachability.

    "nested_not_upstream": A lies (>= nested_min) inside B but B is not
    downstream of A in the graph. "upstream_not_nested": the graph says B is
    downstream of A but A is not (>= nested_min) inside B.
    """
    ids = list(frac.index)
    reach = reachable_downstream(adjacency)
    rows = []
    for i, a in enumerate(ids):
        for j, b in enumerate(ids):
            if i == j:
                continue
            nested = frac.iat[i, j] >= nested_min
            if nested and not reach[i, j]:
                rows.append({"a": a, "b": b, "kind": "nested_not_upstream", "frac_a_in_b": frac.iat[i, j]})
            elif reach[i, j] and not nested:
                rows.append({"a": a, "b": b, "kind": "upstream_not_nested", "frac_a_in_b": frac.iat[i, j]})
    return pd.DataFrame(rows, columns=["a", "b", "kind", "frac_a_in_b"])
