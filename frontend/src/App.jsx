import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { Network } from 'vis-network/standalone';
import html2canvas from 'html2canvas';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import './style.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const API_BASE = "https://archaeological-network-lab.onrender.com";

function ResearchBadge({ children }) { return <span className="badge">{children}</span>; }

const ATTRIBUTE_COLORS = [
  "#ff6b6b", "#4dabf7", "#51cf66", "#ffd43b", "#9775fa",
  "#f06595", "#ffa94d", "#20c997", "#748ffc", "#adb5bd"
];

const LANG = {
  zh: {
    zh: "中文",
    en: "English",
    eyebrow: "Human-in-the-Loop Archaeological Network Platform",
    title: "Archaeological Network Lab",
    badges: ["器物共现", "空间邻近", "时间层", "多层网络", "阈值稳定性"],

    dataFile: "数据文件",
    networkLayer: "网络层",
    similarity: "相似度方法",
    thresholdLabel: "阈值",
    topk: "Top-K",
    spatialK: "空间 K",
    timeColumn: "时间列",
    attributeColumn: "属性列",

    layerArtifact: "器物组合层（二值 Jaccard/Overlap）",
    layerQuantity: "数量权重层（Cosine）",
    layerSpace: "空间 KNN 层（Haversine）",
    layerTime: "时间层",
    layerAttribute: "属性层",
    layerMultiplex: "多层证据网络",

    run: "运行网络分析",
    analyzing: "分析中…",
    stability: "阈值稳定性分析",
    export: "导出网络图",

    chooseFileAlert: "请先选择 CSV 或 Excel 文件",
    analyzeError: "分析失败：请检查后端、文件格式或参数。",
    stabilityError: "稳定性分析失败。",

    reportTitle: "科研报告摘要",
    cautionTitle: "解释边界",
    qualityTitle: "数据提示",

    nodes: "节点数",
    edges: "边数",
    density: "密度",
    avgClustering: "平均聚类系数",
    components: "连通分量",
    communities: "社群数量",

    colorByAttribute: "按属性着色",
    filterValue: "筛选值",
    all: "全部",
    displayMode: "显示模式",
    showAll: "全部显示",
    onlySelected: "仅显示筛选值",
    highlightSelected: "突出筛选值",
    legend: "图例",

    stabilityTitle: "阈值稳定性",
    densityAxis: "密度",
    edgeCommunityAxis: "边/社群",
    edgeCount: "边数",
    communityCount: "社群数量"
  },

  en: {
    zh: "中文",
    en: "English",
    eyebrow: "Human-in-the-Loop Archaeological Network Platform",
    title: "Archaeological Network Lab",
    badges: ["Artifact Co-occurrence", "Spatial Proximity", "Temporal Layer", "Multiplex Network", "Threshold Stability"],

    dataFile: "Data File",
    networkLayer: "Network Layer",
    similarity: "Similarity Method",
    thresholdLabel: "Threshold",
    topk: "Top-K",
    spatialK: "Spatial K",
    timeColumn: "Time Column",
    attributeColumn: "Attribute Column",

    layerArtifact: "Artifact Assemblage Layer (Binary Jaccard/Overlap)",
    layerQuantity: "Quantity-weighted Layer (Cosine)",
    layerSpace: "Spatial KNN Layer (Haversine)",
    layerTime: "Temporal Layer",
    layerAttribute: "Attribute Layer",
    layerMultiplex: "Multiplex Evidence Network",

    run: "Run Network Analysis",
    analyzing: "Analyzing…",
    stability: "Threshold Stability Analysis",
    export: "Export Network Graph",

    chooseFileAlert: "Please select a CSV or Excel file first.",
    analyzeError: "Analysis failed: please check the backend, file format, or parameters.",
    stabilityError: "Stability analysis failed.",

    reportTitle: "Research Report Summary",
    cautionTitle: "Interpretive Caution",
    qualityTitle: "Data Notes",

    nodes: "Nodes",
    edges: "Edges",
    density: "Density",
    avgClustering: "Average Clustering",
    components: "Components",
    communities: "Communities",

    colorByAttribute: "Color by Attribute",
    filterValue: "Filter Value",
    all: "All",
    displayMode: "Display Mode",
    showAll: "Show All",
    onlySelected: "Only Selected Value",
    highlightSelected: "Highlight Selected Value",
    legend: "Legend",

    stabilityTitle: "Threshold Stability",
    densityAxis: "Density",
    edgeCommunityAxis: "Edges / Communities",
    edgeCount: "Edges",
    communityCount: "Communities"
  }
};

function App() {
  const [lang, setLang] = useState("zh");
  const t = LANG[lang];

  const [file, setFile] = useState(null);
  const [method, setMethod] = useState('jaccard');
  const [threshold, setThreshold] = useState(0.3);
  const [topK, setTopK] = useState(5);
  const [layer, setLayer] = useState('artifact');
  const [attrName, setAttrName] = useState('性别');
  const [timeCol, setTimeCol] = useState('时期');
  const [spatialK, setSpatialK] = useState(4);
  const [loading, setLoading] = useState(false);
  const [visData, setVisData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [interpretation, setInterpretation] = useState(null);
  const [qualityNotes, setQualityNotes] = useState([]);
  const [error, setError] = useState('');
  const [selectedAttr, setSelectedAttr] = useState('');
  const [filterValues, setFilterValues] = useState([]);
  const [filterMode, setFilterMode] = useState("all");
  const [stability, setStability] = useState(null);

  const containerRef = useRef(null);
  const exportRef = useRef(null);
  const networkRef = useRef(null);

  const attrList = useMemo(() => {
    const s = new Set();
    visData?.nodes?.forEach(n => Object.keys(n.attrs || {}).forEach(k => s.add(k)));
    return Array.from(s);
  }, [visData]);

  const attrValues = useMemo(() => {
    if (!visData || !selectedAttr) return [];
    return Array.from(new Set(visData.nodes.map(n => n.attrs?.[selectedAttr]).filter(v => v !== undefined && v !== null))).map(String);
  }, [visData, selectedAttr]);

  const attrColorMap = useMemo(() => {
    const map = new Map();
    attrValues.forEach((v, i) => {
      map.set(v, ATTRIBUTE_COLORS[i % ATTRIBUTE_COLORS.length]);
    });
    return map;
  }, [attrValues]);

  const filteredData = useMemo(() => {
    if (!visData) return null;
    let nodes = visData.nodes.map(n => ({ ...n }));

    if (selectedAttr) {
      const valueMap = new Map();
      nodes.forEach(n => {
        const val = n.attrs?.[selectedAttr];
        if (val !== undefined && val !== null && !valueMap.has(val)) valueMap.set(val, valueMap.size);
      });

      nodes = nodes.map(n => {
        const val = n.attrs?.[selectedAttr];
        const valText = val !== undefined && val !== null ? String(val) : "";
        const baseColor = attrColorMap.get(valText);
        return {
          ...n,
          group: valueMap.has(val) ? valueMap.get(val) : n.group,
          color: baseColor
            ? {
                background: baseColor,
                border: baseColor,
                highlight: { background: baseColor, border: baseColor }
              }
            : n.color
        };
      });
    }

    if (filterMode === "only" && selectedAttr && filterValues.length > 0) {
      nodes = nodes.filter(n =>
        filterValues.includes(String(n.attrs?.[selectedAttr]))
      );
    }

    if (filterMode === "highlight" && selectedAttr && filterValues.length > 0) {
      nodes = nodes.map(n => {
        const matched = filterValues.includes(
          String(n.attrs?.[selectedAttr])
        );

        if (matched) {
          return n;
        }

        return {
          ...n,
          color: {
            background: "#d0d0d0",
            border: "#999999",
            highlight: {
              background: "#d0d0d0",
              border: "#999999"
            }
          },
          font: {
            color: "#999999"
          }
        };
      });
    }

    const ids = new Set(nodes.map(n => n.id));
    const edges = visData.edges.filter(e => ids.has(e.from) && ids.has(e.to));
    return { nodes, edges };
  }, [visData, selectedAttr, filterValues, filterMode, attrColorMap]);

  useEffect(() => {
    if (!filteredData || !containerRef.current) return;
    if (networkRef.current) networkRef.current.destroy();
    networkRef.current = new Network(containerRef.current, filteredData, {
      nodes: { shape: 'dot', scaling: { label: true }, font: { size: 13, face: 'Inter, Arial' } },
      edges: { width: 1, color: { opacity: 0.45 }, smooth: { type: 'dynamic' } },
      physics: { enabled: true, solver: 'forceAtlas2Based', forceAtlas2Based: { gravitationalConstant: -55, centralGravity: 0.015, springLength: 110, springConstant: 0.08, damping: 0.42 }, stabilization: { iterations: 260 } },
      interaction: { hover: true, tooltipDelay: 100, navigationButtons: false }
    });
    return () => { if (networkRef.current) networkRef.current.destroy(); };
  }, [filteredData]);

  const formData = () => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('method', method);
    fd.append('threshold', threshold);
    fd.append('top_k', topK);
    fd.append('layer', layer);
    fd.append('attr_name', attrName);
    fd.append('time_col', timeCol);
    fd.append('spatial_k', spatialK);
    return fd;
  };

  async function analyze() {
    if (!file) return alert(t.chooseFileAlert);
    setLoading(true); setError(''); setStability(null);
    try {
      const res = await axios.post(`${API_BASE}/api/analyze`, formData());
      setVisData(res.data.vis_data); setMetrics(res.data.metrics); setInterpretation(res.data.interpretation); setQualityNotes(res.data.quality_notes || []);
      const firstAttr = Object.keys(res.data.vis_data.nodes?.[0]?.attrs || {})[0] || '';
      setSelectedAttr(firstAttr);
    } catch (err) {
      setError(err?.response?.data?.detail || t.analyzeError);
    } finally { setLoading(false); }
  }

  async function runStability() {
    if (!file) return alert(t.chooseFileAlert);
    setLoading(true); setError('');
    try { const res = await axios.post(`${API_BASE}/api/stability`, formData()); setStability(res.data); }
    catch (err) { setError(err?.response?.data?.detail || t.stabilityError); }
    finally { setLoading(false); }
  }

  async function exportImage() {
    if (!exportRef.current) return;
    const canvas = await html2canvas(exportRef.current, { backgroundColor: '#ffffff', scale: 2 });
    const a = document.createElement('a'); a.href = canvas.toDataURL(); a.download = 'ordos_network_graph.png'; a.click();
  }

  const stabilityChart = stability ? {
    labels: stability.results.map(r => r.threshold),
    datasets: [
      { label: t.density, data: stability.results.map(r => r.density), yAxisID: 'y' },
      { label: t.edgeCount, data: stability.results.map(r => r.edges), yAxisID: 'y1' },
      { label: t.communityCount, data: stability.results.map(r => r.communities), yAxisID: 'y1' }
    ]
  } : null;

  const report = metrics
    ? `${t.nodes} ${metrics.num_nodes}；${t.edges} ${metrics.num_edges}；${t.density} ${metrics.density}；${t.avgClustering} ${metrics.avg_clustering}；${t.components} ${metrics.components}；${t.communities} ${metrics.communities}。`
    : '';

  return <main>
    <div style={{ marginBottom: 20 }}>
      <button onClick={() => setLang("zh")}>{t.zh}</button>
      <button onClick={() => setLang("en")} style={{ marginLeft: 10 }}>{t.en}</button>
    </div>

    <header className="hero">
      <div>
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <div className="badges">
          {t.badges.map(b => <ResearchBadge key={b}>{b}</ResearchBadge>)}
        </div>
      </div>
    </header>

    <section className="panel">
      <div className="grid controls">
        <label>{t.dataFile}<input type="file" accept=".csv,.xlsx,.xls" onChange={e => setFile(e.target.files[0])} /></label>
        <label>{t.networkLayer}<select value={layer} onChange={e => setLayer(e.target.value)}><option value="artifact">{t.layerArtifact}</option><option value="quantity">{t.layerQuantity}</option><option value="space">{t.layerSpace}</option><option value="time">{t.layerTime}</option><option value="attribute">{t.layerAttribute}</option><option value="multiplex">{t.layerMultiplex}</option></select></label>
        <label>{t.similarity}<select value={method} onChange={e => setMethod(e.target.value)}><option value="jaccard">Jaccard</option><option value="overlap">Overlap / 包含度</option><option value="cosine">Cosine</option></select></label>
        <label>{t.thresholdLabel} {threshold}<input type="range" min="0" max="1" step="0.05" value={threshold} onChange={e => setThreshold(Number(e.target.value))} /></label>
        <label>{t.topk}<input type="number" min="1" max="30" value={topK} onChange={e => setTopK(Number(e.target.value))} /></label>
        <label>{t.spatialK}<input type="number" min="1" max="30" value={spatialK} onChange={e => setSpatialK(Number(e.target.value))} /></label>
        <label>{t.timeColumn}<input value={timeCol} onChange={e => setTimeCol(e.target.value)} /></label>
        <label>{t.attributeColumn}<input value={attrName} onChange={e => setAttrName(e.target.value)} /></label>
      </div>
      <div className="actions">
        <button onClick={analyze} disabled={loading}>{loading ? t.analyzing : t.run}</button>
        <button onClick={runStability} disabled={loading}>{t.stability}</button>
        {visData && <button onClick={exportImage}>{t.export}</button>}
      </div>
      {error && <div className="error">{error}</div>}
    </section>

    {metrics && <section className="stats"><div><b>{t.reportTitle}</b><p>{report}</p></div><div><b>{t.cautionTitle}</b><p>{interpretation?.caution}</p></div>{qualityNotes.length > 0 && <div><b>{t.qualityTitle}</b><p>{qualityNotes.join('；')}</p></div>}</section>}

    {attrList.length > 0 && <section className="panel filters">
      <label>{t.colorByAttribute}<select value={selectedAttr} onChange={e => setSelectedAttr(e.target.value)}>{attrList.map(a => <option key={a}>{a}</option>)}</select></label>

      <div>
        <div>{t.filterValue}</div>

        <div style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginTop: "6px"
        }}>
          {attrValues.map(v => (
            <label key={v} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={filterValues.includes(v)}
                onChange={e => {
                  if (e.target.checked) {
                    setFilterValues([...filterValues, v]);
                  } else {
                    setFilterValues(filterValues.filter(x => x !== v));
                  }
                }}
              />
              {v}
            </label>
          ))}
        </div>
      </div>

      <label>{t.displayMode}<select value={filterMode} onChange={e => setFilterMode(e.target.value)}><option value="all">{t.showAll}</option><option value="only">{t.onlySelected}</option><option value="highlight">{t.highlightSelected}</option></select></label>

      {selectedAttr && attrValues.length > 0 && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <b>{t.legend}</b>
        {attrValues.map(v => (
          <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: attrColorMap.get(v), display: "inline-block" }}></span>
            {v}
          </span>
        ))}
      </div>}
    </section>}

    <section ref={exportRef} className="networkWrap">

  <div
    style={{
      padding: "16px 18px 8px",
      background: "#ffffff"
    }}
  >
    <div
      style={{
        fontSize: "24px",
        fontWeight: 700,
        marginBottom: 4
      }}
    >
      Archaeological Network Analysis
    </div>

    
  </div>

  {selectedAttr && attrValues.length > 0 && (
    <div
      style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "center",
        padding: "10px 16px",
        fontSize: "14px",
        borderBottom: "1px solid #ddd",
        background: "#fafafa"
      }}
    >
      <b>{t.legend}</b>

      {attrValues.map(v => (
        <span
          key={v}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: attrColorMap.get(v),
              display: "inline-block"
            }}
          ></span>

          {v}
        </span>
      ))}
    </div>
  )}

  <div style={{ position: "relative" }}>

    <div ref={containerRef} className="network"></div>

    <div
      style={{
        position: "absolute",
        right: 18,
        bottom: 18,
        background: "rgba(255,255,255,0.92)",
        border: "1px solid #d9d9d9",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 12,
        lineHeight: 1.7,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
      }}
    >
      <div><b>N</b> = {metrics?.num_nodes ?? "-"}</div>
      <div><b>Edges</b> = {metrics?.num_edges ?? "-"}</div>
      <div><b>Threshold</b> = {threshold}</div>
      <div><b>Method</b> = {method.toUpperCase()}</div>
    </div>

  </div>

</section>
    {stabilityChart && <section className="panel"><h2>{t.stabilityTitle}</h2><p>{stability.note}</p><Line data={stabilityChart} options={{ responsive: true, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, title: { display: true, text: t.densityAxis } }, y1: { beginAtZero: true, position: 'right', title: { display: true, text: t.edgeCommunityAxis }, grid: { drawOnChartArea: false } } } }} /></section>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
