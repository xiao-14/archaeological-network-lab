"""
Ordos Archaeological Network Research Platform
Production-oriented FastAPI backend for public scholarly use.

Core design:
- Transparent, reproducible network construction
- Archaeological interpretation warnings embedded in results
- Artifact, quantity-weighted, temporal, spatial, and attribute layers
- Stability analysis for threshold sensitivity
"""
from __future__ import annotations

import io
import math
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional, Tuple

import networkx as nx
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sklearn.metrics import pairwise_distances

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyArrowPatch
try:
    from scipy.spatial import ConvexHull
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

try:
    import community as community_louvain  # python-louvain
except Exception:  # pragma: no cover
    community_louvain = None

APP_NAME = "Archaeological Network Lab"
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "25"))
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app = FastAPI(
    title=APP_NAME,
    version="0.3.0",
    description=(
        "A public-facing research API for human-in-the-loop reconstruction "
        "of archaeological interaction and mobility networks."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

Layer = Literal["artifact", "quantity", "time", "space", "attribute", "multiplex"]
Method = Literal["jaccard", "overlap", "cosine"]

CANONICAL_COLUMNS = {
    "site": ["墓葬", "墓号", "遗址", "site", "Site", "id", "ID"],
    "artifact": ["器物", "器类", "器型", "artifact", "Artifact", "type", "Type"],
    "quantity": ["数量", "件数", "count", "Count", "quantity", "Quantity"],
    "period": ["时期", "年代", "period", "Period", "phase", "Phase"],
    "lat": ["纬度", "lat", "Lat", "latitude", "Latitude"],
    "lon": ["经度", "lon", "Lon", "lng", "longitude", "Longitude"],
}

@dataclass
class PreparedData:
    matrix: pd.DataFrame
    attrs: Dict[str, Dict[str, Any]]
    id_col: str
    artifact_col: Optional[str]
    quality_notes: List[str]

class HealthResponse(BaseModel):
    status: str
    app: str
    version: str


def _find_col(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    for c in candidates:
        if c in df.columns:
            return c
    lower_map = {str(c).lower(): c for c in df.columns}
    for c in candidates:
        if c.lower() in lower_map:
            return lower_map[c.lower()]
    return None


def read_table(upload: UploadFile, content: bytes) -> pd.DataFrame:
    """
    读取上传文件。

    兼容两种格式：
    1. 原来的单 sheet 表格
    2. 新的多 sheet Excel：
       - burials：墓葬元数据
       - artifacts：器物记录
    """
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_UPLOAD_MB} MB.")

    filename = (upload.filename or "").lower()

    try:
        if filename.endswith(".csv"):
            return pd.read_csv(io.BytesIO(content))

        if filename.endswith((".xlsx", ".xls")):
            xls = pd.ExcelFile(io.BytesIO(content))
            sheet_names = xls.sheet_names

            # 情况 A：多 sheet 格式，包含 burials 和 artifacts
            if "burials" in sheet_names and "artifacts" in sheet_names:
                burials = pd.read_excel(xls, sheet_name="burials")
                artifacts = pd.read_excel(xls, sheet_name="artifacts")

                burials.columns = [str(c).strip() for c in burials.columns]
                artifacts.columns = [str(c).strip() for c in artifacts.columns]

                # 自动识别 ID 列
                burial_id_col = _find_col(burials, CANONICAL_COLUMNS["site"]) or burials.columns[0]
                artifact_id_col = _find_col(artifacts, CANONICAL_COLUMNS["site"]) or artifacts.columns[0]

                burials = burials.rename(columns={burial_id_col: "墓葬"})
                artifacts = artifacts.rename(columns={artifact_id_col: "墓葬"})

                # 合并：每一条器物记录带上墓葬属性
                merged = artifacts.merge(burials, on="墓葬", how="left")

                return merged

            # 情况 B：旧格式，默认读第一个 sheet
            return pd.read_excel(io.BytesIO(content))

    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot read table: {exc}")

    raise HTTPException(status_code=400, detail="Only .csv, .xlsx, .xls files are supported.")


def prepare_data(df: pd.DataFrame) -> PreparedData:
    if df.empty:
        raise HTTPException(status_code=400, detail="The uploaded table is empty.")

    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    df = df.dropna(how="all")

    id_col = _find_col(df, CANONICAL_COLUMNS["site"]) or df.columns[0]
    artifact_col = _find_col(df, CANONICAL_COLUMNS["artifact"])
    qty_col = _find_col(df, CANONICAL_COLUMNS["quantity"])

    quality_notes: List[str] = []
    if id_col == df.columns[0] and _find_col(df, CANONICAL_COLUMNS["site"]) is None:
        quality_notes.append("未识别标准墓葬/遗址编号列，已默认使用第一列作为节点 ID。")

    df[id_col] = df[id_col].astype(str).str.strip()
    df = df[df[id_col].notna() & (df[id_col] != "")]

    if artifact_col:
        df[artifact_col] = df[artifact_col].astype(str).str.strip()
        if qty_col:
            df[qty_col] = pd.to_numeric(df[qty_col], errors="coerce").fillna(1).clip(lower=0)
        else:
            qty_col = "__count__"
            df[qty_col] = 1
            quality_notes.append("未识别数量列，已按每条记录 1 件处理。")
        matrix = df.pivot_table(index=id_col, columns=artifact_col, values=qty_col, aggfunc="sum", fill_value=0)
    else:
        numeric_cols = [c for c in df.select_dtypes(include="number").columns if c != id_col]
        if not numeric_cols:
            raise HTTPException(status_code=400, detail="未找到器物列或数值型器物矩阵。请包含‘器物/数量’长表，或墓葬×器物矩阵。")
        matrix = df.groupby(id_col)[numeric_cols].sum().fillna(0)
        quality_notes.append("未识别器物类型列，已将数值列作为墓葬×器物矩阵。")

    attr_cols = [c for c in df.columns if c not in {artifact_col, qty_col}]
    attrs_df = df[attr_cols].drop_duplicates(subset=[id_col]).set_index(id_col)
    attrs = attrs_df.where(pd.notnull(attrs_df), None).to_dict(orient="index")

    if matrix.shape[0] < 2:
        raise HTTPException(status_code=400, detail="至少需要两个墓葬/遗址节点。")
    if matrix.shape[1] < 1:
        raise HTTPException(status_code=400, detail="至少需要一个器物类型或数值属性。")

    return PreparedData(matrix=matrix.astype(float), attrs=attrs, id_col=id_col, artifact_col=artifact_col, quality_notes=quality_notes)


def artifact_similarity(a: np.ndarray, b: np.ndarray, method: Method) -> float:
    if method == "jaccard":
        aa, bb = a > 0, b > 0
        union = np.logical_or(aa, bb).sum()
        return float(np.logical_and(aa, bb).sum() / union) if union else 0.0
    if method == "overlap":
        aa, bb = a > 0, b > 0
        denom = min(aa.sum(), bb.sum())
        return float(np.logical_and(aa, bb).sum() / denom) if denom else 0.0
    if method == "cosine":
        denom = np.linalg.norm(a) * np.linalg.norm(b)
        return float(np.dot(a, b) / denom) if denom else 0.0
    return 0.0


def add_topk_threshold_edges(G: nx.Graph, nodes: List[str], sim: np.ndarray, threshold: float, top_k: int) -> None:
    n = len(nodes)
    for i in range(n):
        candidates = [(j, sim[i, j]) for j in range(n) if i != j and sim[i, j] >= threshold]
        for j, w in sorted(candidates, key=lambda x: x[1], reverse=True)[:top_k]:
            if w > 0:
                G.add_edge(nodes[i], nodes[j], weight=float(w), evidence="artifact_similarity")


def build_artifact_network(matrix: pd.DataFrame, method: Method, threshold: float, top_k: int, binary: bool) -> nx.Graph:
    nodes = [str(x) for x in matrix.index]
    values = (matrix > 0).astype(int).values if binary else matrix.values
    n = len(nodes)
    sim = np.zeros((n, n), dtype=float)
    for i in range(n):
        for j in range(i + 1, n):
            sim[i, j] = sim[j, i] = artifact_similarity(values[i], values[j], method)
    G = nx.Graph()
    G.add_nodes_from(nodes)
    add_topk_threshold_edges(G, nodes, sim, threshold, top_k)
    return G


def build_time_network(attrs: Dict[str, Dict[str, Any]], node_list: List[str], time_col: str = "时期") -> nx.Graph:
    G = nx.Graph()
    G.add_nodes_from(node_list)
    groups: Dict[str, List[str]] = {}
    for node in node_list:
        val = attrs.get(node, {}).get(time_col)
        if val not in [None, "", np.nan]:
            groups.setdefault(str(val), []).append(node)
    for period, members in groups.items():
        for i, u in enumerate(members):
            for v in members[i + 1:]:
                G.add_edge(u, v, weight=1.0, evidence=f"same_period:{period}")
    return G


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_space_network(attrs: Dict[str, Dict[str, Any]], node_list: List[str], k: int = 4) -> nx.Graph:
    lat_col = next((c for c in CANONICAL_COLUMNS["lat"] if any(c in attrs.get(n, {}) for n in node_list)), "纬度")
    lon_col = next((c for c in CANONICAL_COLUMNS["lon"] if any(c in attrs.get(n, {}) for n in node_list)), "经度")
    valid: List[Tuple[str, float, float]] = []
    for node in node_list:
        try:
            lat = float(attrs.get(node, {}).get(lat_col))
            lon = float(attrs.get(node, {}).get(lon_col))
            valid.append((node, lat, lon))
        except Exception:
            continue
    G = nx.Graph()
    G.add_nodes_from(node_list)
    if len(valid) < 2:
        return G
    k = max(1, min(k, len(valid) - 1))
    for i, (u, lat1, lon1) in enumerate(valid):
        distances = []
        for j, (v, lat2, lon2) in enumerate(valid):
            if i != j:
                distances.append((v, haversine_km(lat1, lon1, lat2, lon2)))
        for v, d in sorted(distances, key=lambda x: x[1])[:k]:
            # inverse distance weight, bounded for visualization and centrality
            G.add_edge(u, v, weight=float(1 / (1 + d)), distance_km=round(d, 3), evidence="spatial_knn_haversine")
    return G


def build_attribute_network(attrs: Dict[str, Dict[str, Any]], node_list: List[str], attr_name: str) -> nx.Graph:
    G = nx.Graph()
    G.add_nodes_from(node_list)
    groups: Dict[str, List[str]] = {}
    for node in node_list:
        val = attrs.get(node, {}).get(attr_name)
        if val not in [None, ""]:
            groups.setdefault(str(val), []).append(node)
    for val, members in groups.items():
        for i, u in enumerate(members):
            for v in members[i + 1:]:
                G.add_edge(u, v, weight=1.0, evidence=f"same_attribute:{attr_name}={val}")
    return G


def merge_graphs(graphs: List[nx.Graph], node_list: List[str]) -> nx.Graph:
    G = nx.Graph()
    G.add_nodes_from(node_list)
    for g in graphs:
        for u, v, d in g.edges(data=True):
            if G.has_edge(u, v):
                G[u][v]["weight"] += float(d.get("weight", 1.0))
                G[u][v]["evidence"] += f";{d.get('evidence', 'unknown')}"
            else:
                G.add_edge(u, v, weight=float(d.get("weight", 1.0)), evidence=str(d.get("evidence", "unknown")))
    max_w = max((d["weight"] for _, _, d in G.edges(data=True)), default=1.0)
    for _, _, d in G.edges(data=True):
        d["weight"] = d["weight"] / max_w
    return G


def build_network(data: PreparedData, layer: Layer, method: Method, threshold: float, top_k: int, attr_name: str, time_col: str, spatial_k: int) -> nx.Graph:
    node_list = [str(x) for x in data.matrix.index]
    if layer == "artifact":
        return build_artifact_network(data.matrix, method, threshold, top_k, binary=True)
    if layer == "quantity":
        return build_artifact_network(data.matrix, "cosine", threshold, top_k, binary=False)
    if layer == "time":
        return build_time_network(data.attrs, node_list, time_col=time_col)
    if layer == "space":
        return build_space_network(data.attrs, node_list, k=spatial_k)
    if layer == "attribute":
        return build_attribute_network(data.attrs, node_list, attr_name=attr_name)
    if layer == "multiplex":
        return merge_graphs([
            build_artifact_network(data.matrix, method, threshold, top_k, binary=True),
            build_space_network(data.attrs, node_list, k=spatial_k),
            build_time_network(data.attrs, node_list, time_col=time_col),
        ], node_list)
    return build_artifact_network(data.matrix, method, threshold, top_k, binary=True)

def clean_for_json(obj):
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_for_json(v) for v in obj]
    return obj

def graph_to_payload(G: nx.Graph, attrs: Dict[str, Dict[str, Any]], layer: str, quality_notes: List[str]) -> Dict[str, Any]:
    if G.number_of_edges() == 0:
        raise HTTPException(status_code=422, detail=f"当前层 '{layer}' 无连接边。请降低阈值、检查列名，或切换网络层。")

    degree = nx.degree_centrality(G)
    # For weighted betweenness, networkx interprets weight as distance. We invert similarity into distance.
    H = G.copy()
    for u, v, d in H.edges(data=True):
        d["distance"] = 1 / max(float(d.get("weight", 1e-9)), 1e-9)
    betweenness = nx.betweenness_centrality(H, weight="distance", normalized=True)

    if community_louvain:
        try:
            communities = community_louvain.best_partition(G, weight="weight")
        except Exception:
            communities = {n: 0 for n in G.nodes()}
    else:
        communities = {n: 0 for n in G.nodes()}

    nodes = []
    for n in G.nodes():
        node_attrs = attrs.get(str(n), {})
        nodes.append({
            "id": str(n),
            "label": str(n),
            "group": int(communities.get(n, 0)),
            "value": round(degree.get(n, 0) * 30 + 8, 4),
            "degree_centrality": round(degree.get(n, 0), 6),
            "betweenness_centrality": round(betweenness.get(n, 0), 6),
            "title": (
    f"墓号：{n}\n"
    f"性别：{node_attrs.get('性别', '不详')}\n"
    f"年龄：{node_attrs.get('年龄', '不详')}\n"
    f"时期：{node_attrs.get('时期', node_attrs.get('年代', '不详'))}\n"
    f"度中心性：{degree.get(n,0):.3f}\n"
    f"中介中心性：{betweenness.get(n,0):.3f}"
),
            "attrs": node_attrs,
        })
    edges = []
    for u, v, d in G.edges(data=True):
        edges.append({
            "from": str(u),
            "to": str(v),
            "value": round(float(d.get("weight", 1.0)) * 5, 4),
            "weight": round(float(d.get("weight", 1.0)), 6),
            "evidence": d.get("evidence", "unknown"),
            "distance_km": d.get("distance_km"),
            "title": f"权重: {float(d.get('weight',1.0)):.3f}\n证据: {d.get('evidence','unknown')}",
        })

    metrics = {
        "density": round(nx.density(G), 6),
        "avg_clustering": round(nx.average_clustering(G, weight="weight"), 6),
        "num_nodes": G.number_of_nodes(),
        "num_edges": G.number_of_edges(),
        "components": nx.number_connected_components(G),
        "communities": len(set(communities.values())) if communities else 0,
    }
    interpretation = {
        "research_use": "该网络适合用于探索器物组合、空间邻近、年代同属与多层证据之间的潜在互动结构。",
        "caution": "中心性和社群结果不能直接等同于政治中心、族群边界或真实道路；它们是需要结合类型学、年代学、地貌与文献证据解释的计算指标。",
        "human_in_the_loop": "建议由研究者检查异常边、修正器物类型、记录参数，并在多阈值稳定性结果中寻找反复出现的连接结构。",
    }

    payload = {
        "vis_data": {
            "nodes": nodes,
            "edges": edges
        },
        "metrics": metrics,
        "interpretation": interpretation,
        "quality_notes": quality_notes
    }

    return clean_for_json(payload)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", app=APP_NAME, version="0.3.0")


@app.post("/api/analyze")
async def analyze(
    file: UploadFile = File(...),
    method: Method = Form("jaccard"),
    threshold: float = Form(0.3),
    top_k: int = Form(5),
    layer: Layer = Form("artifact"),
    attr_name: str = Form("性别"),
    time_col: str = Form("时期"),
    spatial_k: int = Form(4),
):
    content = await file.read()
    df = read_table(file, content)
    data = prepare_data(df)
    threshold = float(min(max(threshold, 0.0), 1.0))
    top_k = int(min(max(top_k, 1), max(1, data.matrix.shape[0] - 1)))
    spatial_k = int(min(max(spatial_k, 1), max(1, data.matrix.shape[0] - 1)))
    G = build_network(data, layer, method, threshold, top_k, attr_name, time_col, spatial_k)
    return graph_to_payload(G, data.attrs, layer, data.quality_notes)


# Okabe-Ito color palette — color-blind safe, print-friendly
OKABE_ITO = [
    "#E69F00", "#56B4E9", "#009E73", "#F0E442",
    "#0072B2", "#D55E00", "#CC79A7", "#999999",
    "#000000", "#44AA99",
]

@app.post("/api/export/svg")
async def export_svg(
    file: UploadFile = File(...),
    method: Method = Form("jaccard"),
    threshold: float = Form(0.3),
    top_k: int = Form(5),
    layer: Layer = Form("artifact"),
    attr_name: str = Form("性别"),
    time_col: str = Form("时期"),
    spatial_k: int = Form(4),
    color_attr: str = Form("性别"),
    figure_number: int = Form(1),
    site_name: str = Form("Ordos"),
):
    """
    生成适合学术发表的矢量网络图（SVG），包含：
    - Okabe-Ito 色盲友好配色
    - Louvain 社群凸包轮廓
    - 完整 Figure Caption（含孤立节点说明）
    - 节点大小 / 边粗细图例
    """
    content = await file.read()
    df = read_table(file, content)
    data = prepare_data(df)
    threshold = float(min(max(threshold, 0.0), 1.0))
    top_k = int(min(max(top_k, 1), max(1, data.matrix.shape[0] - 1)))
    spatial_k = int(min(max(spatial_k, 1), max(1, data.matrix.shape[0] - 1)))
    G = build_network(data, layer, method, threshold, top_k, attr_name, time_col, spatial_k)

    if G.number_of_edges() == 0:
        raise HTTPException(status_code=422, detail="当前参数无连接边，无法导出图。")

    # --- 布局 ---
    pos = nx.spring_layout(G, seed=42, k=1.8 / max(G.number_of_nodes() ** 0.5, 1))

    # --- 社群 ---
    if community_louvain:
        try:
            communities = community_louvain.best_partition(G, weight="weight")
        except Exception:
            communities = {n: 0 for n in G.nodes()}
    else:
        communities = {n: 0 for n in G.nodes()}
    comm_groups: Dict[int, List[str]] = {}
    for node, comm in communities.items():
        comm_groups.setdefault(comm, []).append(node)

    # --- 属性着色 ---
    attr_vals = sorted(set(
        str(data.attrs.get(n, {}).get(color_attr, "unknown"))
        for n in G.nodes()
    ))
    attr_color_map = {v: OKABE_ITO[i % len(OKABE_ITO)] for i, v in enumerate(attr_vals)}
    node_colors = [
        attr_color_map.get(str(data.attrs.get(n, {}).get(color_attr, "unknown")), "#999999")
        for n in G.nodes()
    ]

    # --- 节点大小（度中心性） ---
    degree = nx.degree_centrality(G)
    node_sizes = [max(degree.get(n, 0) * 1800 + 60, 60) for n in G.nodes()]

    # --- 边权重 ---
    edge_weights = [G[u][v].get("weight", 1.0) for u, v in G.edges()]
    max_w = max(edge_weights) if edge_weights else 1.0
    edge_widths = [0.4 + (w / max_w) * 2.5 for w in edge_weights]
    edge_alphas = [0.25 + (w / max_w) * 0.5 for w in edge_weights]

    # --- 孤立节点统计 ---
    all_nodes = set(str(x) for x in data.matrix.index)
    connected_nodes = set(G.nodes())
    isolated_count = len(all_nodes - connected_nodes)

    # --- 绘图 ---
    fig, ax = plt.subplots(figsize=(14, 11), dpi=150)
    ax.set_facecolor("#ffffff")
    fig.patch.set_facecolor("#ffffff")

    # 社群凸包
    if HAS_SCIPY:
        for comm_id, members in comm_groups.items():
            pts = np.array([pos[n] for n in members if n in pos])
            if len(pts) < 3:
                continue
            try:
                hull = ConvexHull(pts)
                hull_pts = pts[hull.vertices]
                # 向外扩张一点
                centroid = hull_pts.mean(axis=0)
                expanded = centroid + (hull_pts - centroid) * 1.18
                polygon = plt.Polygon(
                    np.vstack([expanded, expanded[0]]),
                    closed=True,
                    fill=True,
                    facecolor=OKABE_ITO[comm_id % len(OKABE_ITO)],
                    alpha=0.08,
                    edgecolor=OKABE_ITO[comm_id % len(OKABE_ITO)],
                    linewidth=1.2,
                    linestyle="--",
                )
                ax.add_patch(polygon)
                ax.text(
                    centroid[0], centroid[1],
                    f"C{comm_id + 1}",
                    fontsize=7, color=OKABE_ITO[comm_id % len(OKABE_ITO)],
                    alpha=0.6, ha="center", va="center",
                    fontweight="bold",
                )
            except Exception:
                pass

    # 画边
    node_list = list(G.nodes())
    xs = {n: pos[n][0] for n in node_list}
    ys = {n: pos[n][1] for n in node_list}
    for (u, v), w, alpha in zip(G.edges(), edge_widths, edge_alphas):
        ax.plot(
            [xs[u], xs[v]], [ys[u], ys[v]],
            color="#666666", linewidth=w, alpha=alpha, zorder=1,
        )

    # 画节点
    sc = ax.scatter(
        [xs[n] for n in node_list],
        [ys[n] for n in node_list],
        s=node_sizes,
        c=node_colors,
        zorder=2,
        edgecolors="white",
        linewidths=0.6,
    )

    ax.set_axis_off()

    # --- 属性图例 ---
    attr_handles = [
        mpatches.Patch(color=col, label=val)
        for val, col in attr_color_map.items()
    ]
    legend1 = ax.legend(
        handles=attr_handles,
        title=color_attr,
        loc="upper left",
        fontsize=8,
        title_fontsize=8,
        framealpha=0.9,
        edgecolor="#cccccc",
    )
    ax.add_artist(legend1)

    # --- 节点大小图例 ---
    size_handles = [
        ax.scatter([], [], s=60, color="#aaaaaa", edgecolors="white", linewidths=0.5, label="Low centrality"),
        ax.scatter([], [], s=400, color="#aaaaaa", edgecolors="white", linewidths=0.5, label="High centrality"),
    ]
    legend2 = ax.legend(
        handles=size_handles,
        title="Node size\n(Degree centrality)",
        loc="upper right",
        fontsize=8,
        title_fontsize=8,
        framealpha=0.9,
        edgecolor="#cccccc",
    )
    ax.add_artist(legend2)

    # --- 边粗细图例 ---
    from matplotlib.lines import Line2D
    edge_handles = [
        Line2D([0], [0], color="#666666", linewidth=0.5, alpha=0.4, label="Low similarity"),
        Line2D([0], [0], color="#666666", linewidth=3.0, alpha=0.75, label="High similarity"),
    ]
    legend3 = ax.legend(
        handles=edge_handles,
        title="Edge width\n(Similarity weight)",
        loc="lower right",
        fontsize=8,
        title_fontsize=8,
        framealpha=0.9,
        edgecolor="#cccccc",
    )
    ax.add_artist(legend3)

    # --- Figure Caption ---
    layer_label = {
        "artifact": "artifact assemblage", "quantity": "quantity-weighted",
        "time": "temporal", "space": "spatial KNN",
        "attribute": "attribute", "multiplex": "multiplex evidence",
    }.get(layer, layer)
    method_label = method.capitalize()
    isolated_note = (
        f" {isolated_count} node(s) with no edges above threshold are excluded from the network."
        if isolated_count > 0 else ""
    )
    caption = (
        f"Figure {figure_number}. {layer_label.capitalize()} network of {site_name} burials "
        f"(N\u202f=\u202f{G.number_of_nodes()}, {method_label} similarity, "
        f"threshold\u202f=\u202f{threshold:.2f}, Top-K\u202f=\u202f{top_k}). "
        f"Node size reflects degree centrality; node color indicates {color_attr}; "
        f"edge width and opacity reflect similarity weight. "
        f"Dashed polygons denote Louvain communities (n\u202f=\u202f{len(comm_groups)})."
        f"{isolated_note}"
    )
    fig.text(
        0.5, 0.01, caption,
        ha="center", va="bottom",
        fontsize=8, color="#333333",
        wrap=True,
        style="italic",
        bbox=dict(facecolor="white", edgecolor="none", alpha=0.0),
    )
    fig.subplots_adjust(bottom=0.10)

    # --- 输出 SVG ---
    buf = io.BytesIO()
    fig.savefig(buf, format="svg", bbox_inches="tight", dpi=300)
    plt.close(fig)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="image/svg+xml",
        headers={"Content-Disposition": 'attachment; filename="network_figure.svg"'},
    )


@app.post("/api/stability")
async def stability(
    file: UploadFile = File(...),
    method: Method = Form("jaccard"),
    top_k: int = Form(5),
):
    content = await file.read()
    df = read_table(file, content)
    data = prepare_data(df)
    thresholds = [round(x, 2) for x in np.linspace(0.05, 0.9, 18)]
    rows = []
    for thr in thresholds:
        G = build_artifact_network(data.matrix, method, thr, top_k, binary=True)
        if G.number_of_edges() == 0:
            rows.append({"threshold": thr, "density": 0, "communities": 0, "edges": 0, "components": G.number_of_nodes()})
            continue
        if community_louvain:
            try:
                comm = community_louvain.best_partition(G, weight="weight")
                cnum = len(set(comm.values()))
            except Exception:
                cnum = 0
        else:
            cnum = 0
        rows.append({
            "threshold": thr,
            "density": round(nx.density(G), 6),
            "communities": cnum,
            "edges": G.number_of_edges(),
            "components": nx.number_connected_components(G),
        })
    return {"results": rows, "note": "用于判断阈值选择是否过度影响网络结构；稳定出现的边和社群更适合作为解释对象。"}
