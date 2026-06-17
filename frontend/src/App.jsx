import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { Network } from 'vis-network/standalone';
import html2canvas from 'html2canvas';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import './style.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const API_BASE = import.meta.env.VITE_API_BASE || 'http://43.129.231.252:8000';

function ResearchBadge({ children }) { return <span className="badge">{children}</span>; }

// Okabe-Ito palette — color-blind safe & print-friendly (grayscale distinguishable)
const ATTRIBUTE_COLORS = [
  "#E69F00", "#56B4E9", "#009E73", "#F0E442",
  "#0072B2", "#D55E00", "#CC79A7", "#999999",
  "#000000", "#44AA99",
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

    exportSvg: "导出矢量图（SVG）",
    exportSvgTitle: "图编号",
    exportSvgSite: "遗址名称",
    figCaptionTitle: "图注（Figure Caption）",
    isolatedNote: (n) => n > 0 ? `注：${n} 个节点因低于相似度阈值无连接边，未显示在网络中。` : "",
    nodeSizeLegend: "节点大小 = 度中心性",
    edgeWidthLegend: "边粗细 = 相似度权重",
    stabilityTitle: "阈值稳定性",
    densityAxis: "密度",
    edgeCommunityAxis: "边/社群",
    edgeCount: "边数",
    communityCount: "社群数量",
    attrAnalysisTab: "属性分析",
    attrAnalysisRun: "运行属性分析",
    attrAnalysisRunning: "分析中…",
    attrAnalysisCol: "分析属性列",
    assortTitle: "网络同质性检验（Assortativity）",
    assortR: "同质性系数 r",
    assortCoverage: "属性覆盖率",
    assortType: "属性类型",
    assortInterp: "解读",
    centralityTitle: "按属性分组的网络中心性",
    centralityGroup: "属性值",
    centralityN: "节点数",
    centralityDeg: "度中心性（均值）",
    centralityBet: "中介中心性（均值）",
    centralityClust: "聚类系数（均值）",
    bipartiteTitle: "二模网络（墓葬 × 器物）",
    bipartiteInfo: (b, a) => `${b} 个墓葬节点，${a} 种器物类型，共 ${b+a} 个节点`,
    bipartiteNote: "圆形 = 墓葬（按属性着色）；方形 = 器物类型（按出现频率定大小）",
    bipartiteFilterLabel: "筛选属性值",
    bipartiteFilterAll: "全部显示",
    downloadImg: "下载图片",
    downloadCsv: "下载表格（CSV）",
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

    exportSvg: "Export Vector Figure (SVG)",
    exportSvgTitle: "Figure Number",
    exportSvgSite: "Site Name",
    figCaptionTitle: "Figure Caption",
    isolatedNote: (n) => n > 0 ? `Note: ${n} node(s) with no edges above the similarity threshold are excluded from the network.` : "",
    nodeSizeLegend: "Node size = Degree centrality",
    edgeWidthLegend: "Edge width = Similarity weight",
    communityLegend: "Dashed outline = Louvain community",
    stabilityTitle: "Threshold Stability",
    densityAxis: "Density",
    edgeCommunityAxis: "Edges / Communities",
    edgeCount: "Edges",
    communityCount: "Communities",
    attrAnalysisTab: "Attribute Analysis",
    attrAnalysisRun: "Run Attribute Analysis",
    attrAnalysisRunning: "Analyzing…",
    attrAnalysisCol: "Attribute Column",
    assortTitle: "Network Assortativity Test",
    assortR: "Assortativity coefficient r",
    assortCoverage: "Attribute coverage",
    assortType: "Attribute type",
    assortInterp: "Interpretation",
    centralityTitle: "Centrality by Attribute Group",
    centralityGroup: "Attribute value",
    centralityN: "N",
    centralityDeg: "Degree centrality (mean)",
    centralityBet: "Betweenness centrality (mean)",
    centralityClust: "Clustering coefficient (mean)",
    bipartiteTitle: "Bipartite Network (Burials × Artifacts)",
    bipartiteInfo: (b, a) => `${b} burial nodes, ${a} artifact types, ${b+a} total nodes`,
    bipartiteNote: "Circle = burial (colored by attribute); Square = artifact type (sized by frequency)",
    bipartiteFilterLabel: "Filter by attribute value",
    bipartiteFilterAll: "Show all",
    downloadImg: "Download Image",
    downloadCsv: "Download Table (CSV)",
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
  const [figureNumber, setFigureNumber] = useState(1);
  const [siteName, setSiteName] = useState('Ordos');
  const [attrAnalysis, setAttrAnalysis] = useState(null);
  const [attrAnalysisCol, setAttrAnalysisCol] = useState('性别');
  const [attrAnalysisLoading, setAttrAnalysisLoading] = useState(false);
  const [bipartiteFilterValue, setBipartiteFilterValue] = useState('');

  const containerRef = useRef(null);
  const exportRef = useRef(null);
  const networkRef = useRef(null);
  const bipartiteRef = useRef(null);
  const bipartiteNetRef = useRef(null);
  const bipartiteWrapRef = useRef(null);

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

  async function runAttrAnalysis() {
    if (!file) return alert(t.chooseFileAlert);
    setAttrAnalysisLoading(true); setError('');
    try {
      const fd = formData();
      fd.append('attr_col', attrAnalysisCol);
      const res = await axios.post(`${API_BASE}/api/attribute_analysis`, fd);
      setAttrAnalysis(res.data);
      setBipartiteFilterValue('');
    } catch (err) {
      setError(err?.response?.data?.detail || t.analyzeError);
    } finally { setAttrAnalysisLoading(false); }
  }

  // 二模网络中可供筛选的属性值列表（来自墓葬节点的 attr_val）
  const bipartiteAttrValues = useMemo(() => {
    if (!attrAnalysis?.bipartite) return [];
    const vals = attrAnalysis.bipartite.nodes
      .filter(n => n.type === 'burial')
      .map(n => n.attr_val);
    return Array.from(new Set(vals));
  }, [attrAnalysis]);

  useEffect(() => {
    if (!attrAnalysis?.bipartite || !bipartiteRef.current) return;
    const { nodes: bnodes, edges: bedges } = attrAnalysis.bipartite;
    const attrVals = [...new Set(bnodes.filter(n => n.type === 'burial').map(n => n.attr_val))];
    const OKABE = ["#E69F00","#56B4E9","#009E73","#F0E442","#0072B2","#D55E00","#CC79A7","#999999","#000000","#44AA99"];
    const colorMap = Object.fromEntries(attrVals.map((v, i) => [v, OKABE[i % OKABE.length]]));
    const maxArtSize = Math.max(...bnodes.filter(n => n.type === 'artifact').map(n => n.size || 1));

    // 按筛选值过滤：选中某个属性值时，只保留该属性值的墓葬节点 + 它们连接到的器物节点
    let visibleBurialIds = new Set(bnodes.filter(n => n.type === 'burial').map(n => n.id));
    if (bipartiteFilterValue) {
      visibleBurialIds = new Set(
        bnodes.filter(n => n.type === 'burial' && n.attr_val === bipartiteFilterValue).map(n => n.id)
      );
    }
    const visibleEdges = bedges.filter(e => visibleBurialIds.has(e.from));
    const connectedArtifactIds = new Set(visibleEdges.map(e => e.to));
    const visibleNodes = bnodes.filter(n =>
      n.type === 'burial' ? visibleBurialIds.has(n.id) : connectedArtifactIds.has(n.id)
    );

    const visNodes = visibleNodes.map(n => n.type === 'burial'
      ? { id: n.id, label: n.label, shape: 'dot', size: 8, color: { background: colorMap[n.attr_val] || '#aaa', border: '#fff' }, font: { size: 0 }, title: `${n.label}\n${attrAnalysis.attr_col}: ${n.attr_val}` }
      : { id: n.id, label: n.label, shape: 'square', size: 6 + Math.round((n.size / maxArtSize) * 18), color: { background: '#e8e0d0', border: '#b0a080' }, font: { size: 9, color: '#555' }, title: `器物: ${n.label}\n出现次数: ${n.size}` }
    );
    const visEdges = visibleEdges.map(e => ({ from: e.from, to: e.to, color: { color: '#cccccc', opacity: 0.5 }, width: 0.5 }));
    if (bipartiteNetRef.current) bipartiteNetRef.current.destroy();
    bipartiteNetRef.current = new Network(bipartiteRef.current,
      { nodes: visNodes, edges: visEdges },
      { physics: { solver: 'forceAtlas2Based', forceAtlas2Based: { gravitationalConstant: -30, springLength: 80 }, stabilization: { iterations: 150 } }, interaction: { tooltipDelay: 100 }, edges: { smooth: false } }
    );
    return () => { bipartiteNetRef.current?.destroy(); };
  }, [attrAnalysis, bipartiteFilterValue]);

  async function exportBipartiteImage() {
    if (!bipartiteWrapRef.current) return;
    const canvas = await html2canvas(bipartiteWrapRef.current, { backgroundColor: '#ffffff', scale: 2 });
    const a = document.createElement('a');
    a.href = canvas.toDataURL();
    a.download = `bipartite_network_${attrAnalysis?.attr_col || 'export'}.png`;
    a.click();
  }

  function downloadAttrAnalysisCsv() {
    if (!attrAnalysis) return;
    const rows = [];
    rows.push(['Section', 'Key', 'Value']);
    rows.push(['Assortativity', 'attribute_column', attrAnalysis.attr_col]);
    rows.push(['Assortativity', 'r', attrAnalysis.assortativity.r ?? '']);
    rows.push(['Assortativity', 'coverage', attrAnalysis.assortativity.coverage]);
    rows.push(['Assortativity', 'type', attrAnalysis.assortativity.type]);
    rows.push(['Assortativity', 'interpretation', attrAnalysis.assortativity.interpretation]);
    rows.push([]);
    rows.push(['Group', 'Node Count', 'Degree Mean', 'Degree Std', 'Betweenness Mean', 'Betweenness Std', 'Clustering Mean', 'Clustering Std']);
    Object.entries(attrAnalysis.centrality_by_group).forEach(([grp, vals]) => {
      rows.push([
        grp, vals.node_count,
        vals.degree.mean, vals.degree.std,
        vals.betweenness.mean, vals.betweenness.std,
        vals.clustering.mean, vals.clustering.std,
      ]);
    });
    const csv = rows.map(r => r.map(cell => {
      const s = String(cell ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `attribute_analysis_${attrAnalysis.attr_col}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportImage() {
    if (!exportRef.current) return;
    const canvas = await html2canvas(exportRef.current, { backgroundColor: '#ffffff', scale: 2 });
    const a = document.createElement('a'); a.href = canvas.toDataURL(); a.download = 'ordos_network_graph.png'; a.click();
  }

  async function exportSvg() {
    if (!file) return alert(t.chooseFileAlert);
    setLoading(true);
    try {
      const fd = formData();
      fd.append('color_attr', selectedAttr || '性别');
      fd.append('figure_number', figureNumber);
      fd.append('site_name', siteName);
      const res = await axios.post(`${API_BASE}/api/export/svg`, fd, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `figure_${figureNumber}_network.svg`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('SVG export failed. Please check backend.');
    } finally { setLoading(false); }
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
        {visData && <button onClick={exportSvg} disabled={loading} style={{background:'#1a3a5c'}}>{t.exportSvg}</button>}
      </div>
      {visData && <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:10}}>
        <label style={{flexDirection:'row',alignItems:'center',gap:6,fontWeight:400}}>
          {t.exportSvgTitle}
          <input type="number" min="1" max="99" value={figureNumber} onChange={e=>setFigureNumber(Number(e.target.value))} style={{width:54}}/>
        </label>
        <label style={{flexDirection:'row',alignItems:'center',gap:6,fontWeight:400}}>
          {t.exportSvgSite}
          <input value={siteName} onChange={e=>setSiteName(e.target.value)} style={{width:120}}/>
        </label>
      </div>}
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

  <div style={{ padding: "16px 18px 8px", background: "#ffffff" }}>
    <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: 6 }}>
      Archaeological Network Analysis
    </div>

    {/* 完整图例行 */}
    <div style={{ display:"flex", gap:18, flexWrap:"wrap", alignItems:"center", fontSize:12, color:"#444", marginBottom:4 }}>
      {/* 属性颜色图例 */}
      {selectedAttr && attrValues.length > 0 && <>
        <b style={{fontSize:12}}>{selectedAttr}:</b>
        {attrValues.map(v => (
          <span key={v} style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
            <span style={{ width:11, height:11, borderRadius:"50%", background:attrColorMap.get(v), display:"inline-block", border:"1px solid #ccc" }}></span>
            {v}
          </span>
        ))}
        <span style={{borderLeft:"1px solid #ddd", height:14}}/>
      </>}
      {/* 节点大小 */}
      <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
        <svg width="32" height="18" style={{overflow:"visible"}}>
          <circle cx="6" cy="9" r="4" fill="#999" opacity="0.7"/>
          <circle cx="22" cy="9" r="8" fill="#999" opacity="0.7"/>
        </svg>
        {t.nodeSizeLegend}
      </span>
      {/* 边粗细 */}
      <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
        <svg width="36" height="18">
          <line x1="0" y1="14" x2="16" y2="14" stroke="#666" strokeWidth="1" opacity="0.4"/>
          <line x1="20" y1="14" x2="36" y2="14" stroke="#666" strokeWidth="3.5" opacity="0.75"/>
        </svg>
        {t.edgeWidthLegend}
      </span>
      {/* 社群轮廓 */}
      <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
        <svg width="20" height="18">
          <rect x="2" y="3" width="16" height="12" rx="4" fill="none" stroke="#E69F00" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.7"/>
        </svg>
        {t.communityLegend}
      </span>
    </div>
  </div>

  <div style={{ position: "relative" }}>
    <div ref={containerRef} className="network"></div>
    <div style={{ position:"absolute", right:18, bottom:18, background:"rgba(255,255,255,0.92)", border:"1px solid #d9d9d9", borderRadius:10, padding:"10px 14px", fontSize:12, lineHeight:1.7, boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>
      <div><b>N</b> = {metrics?.num_nodes ?? "-"}</div>
      <div><b>Edges</b> = {metrics?.num_edges ?? "-"}</div>
      <div><b>Threshold</b> = {threshold}</div>
      <div><b>Method</b> = {method.toUpperCase()}</div>
      <div><b>Communities</b> = {metrics?.communities ?? "-"}</div>
    </div>
  </div>

  {/* Figure Caption */}
  {metrics && <div style={{ padding:"10px 18px 14px", fontSize:12, color:"#555", fontStyle:"italic", lineHeight:1.65, borderTop:"1px solid #eee", background:"#fafafa", borderBottomLeftRadius:22, borderBottomRightRadius:22 }}>
    <b style={{fontStyle:"normal"}}>{t.figCaptionTitle}:</b>{" "}
    Figure {figureNumber}. {
      {artifact:"Artifact assemblage",quantity:"Quantity-weighted",time:"Temporal",space:"Spatial KNN",attribute:"Attribute",multiplex:"Multiplex evidence"}[layer]
    } network of {siteName} burials (N = {metrics.num_nodes}, {method.charAt(0).toUpperCase()+method.slice(1)} similarity, threshold = {threshold}, Top-K = {topK}).{" "}
    Node size reflects degree centrality; node color indicates {selectedAttr || "attribute"}; edge width and opacity reflect similarity weight.{" "}
    Dashed polygons indicate Louvain communities (n = {metrics.communities}).{" "}
    {t.isolatedNote(Math.max(0, (visData?.nodes?.length ?? 0) - metrics.num_nodes))}
  </div>}

</section>
    {stabilityChart && <section className="panel"><h2>{t.stabilityTitle}</h2><p>{stability.note}</p><Line data={stabilityChart} options={{ responsive: true, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, title: { display: true, text: t.densityAxis } }, y1: { beginAtZero: true, position: 'right', title: { display: true, text: t.edgeCommunityAxis }, grid: { drawOnChartArea: false } } } }} /></section>}

    {/* ── 属性分析模块 ── */}
    <section className="panel" style={{marginTop:18}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10}}>
        <h2 style={{margin:'0 0 14px', fontSize:18}}>{t.attrAnalysisTab}</h2>
        {attrAnalysis && <button onClick={downloadAttrAnalysisCsv} style={{background:'#76552d'}}>{t.downloadCsv}</button>}
      </div>
      <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end'}}>
        <label style={{minWidth:160}}>{t.attrAnalysisCol}
          <input value={attrAnalysisCol} onChange={e => setAttrAnalysisCol(e.target.value)} />
        </label>
        <button onClick={runAttrAnalysis} disabled={attrAnalysisLoading} style={{background:'#1a3a5c', marginTop:6}}>
          {attrAnalysisLoading ? t.attrAnalysisRunning : t.attrAnalysisRun}
        </button>
      </div>

      {attrAnalysis && <>
        {/* 1. 同质性检验 */}
        <div style={{marginTop:20, padding:16, background:'#f8f6f2', borderRadius:14, border:'1px solid #e0d8cc'}}>
          <h3 style={{margin:'0 0 10px', fontSize:15}}>{t.assortTitle}</h3>
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:12}}>
            <div>
              <div style={{fontSize:11, color:'#888', textTransform:'uppercase', letterSpacing:'.08em'}}>{t.assortR}</div>
              <div style={{fontSize:28, fontWeight:800, color: attrAnalysis.assortativity.r > 0.1 ? '#27462f' : attrAnalysis.assortativity.r < -0.1 ? '#7a2020' : '#555'}}>
                {attrAnalysis.assortativity.r !== null ? attrAnalysis.assortativity.r.toFixed(3) : 'N/A'}
              </div>
            </div>
            <div>
              <div style={{fontSize:11, color:'#888', textTransform:'uppercase', letterSpacing:'.08em'}}>{t.assortCoverage}</div>
              <div style={{fontSize:22, fontWeight:700}}>{(attrAnalysis.assortativity.coverage * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div style={{fontSize:11, color:'#888', textTransform:'uppercase', letterSpacing:'.08em'}}>{t.assortType}</div>
              <div style={{fontSize:14, fontWeight:600, marginTop:4}}>{attrAnalysis.assortativity.type}</div>
            </div>
          </div>
          <div style={{fontSize:13, color:'#333', lineHeight:1.6, padding:'10px 12px', background:'white', borderRadius:8, border:'1px solid #e8e0d0'}}>
            <b>{t.assortInterp}：</b>{attrAnalysis.assortativity.interpretation}
          </div>
          <div style={{fontSize:11, color:'#888', marginTop:8}}>{attrAnalysis.note}</div>
        </div>

        {/* 2. 分组中心性表格 */}
        <div style={{marginTop:16, padding:16, background:'#f8f6f2', borderRadius:14, border:'1px solid #e0d8cc'}}>
          <h3 style={{margin:'0 0 10px', fontSize:15}}>{t.centralityTitle}</h3>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
              <thead>
                <tr style={{background:'#ede8e0'}}>
                  {[t.centralityGroup, t.centralityN, t.centralityDeg, t.centralityBet, t.centralityClust].map(h =>
                    <th key={h} style={{padding:'7px 10px', textAlign:'left', fontWeight:700, borderBottom:'2px solid #d0c8bc'}}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {Object.entries(attrAnalysis.centrality_by_group)
                  .sort((a,b) => b[1].node_count - a[1].node_count)
                  .map(([grp, vals], i) => (
                  <tr key={grp} style={{background: i%2===0 ? 'white' : '#faf8f5'}}>
                    <td style={{padding:'6px 10px', fontWeight:600}}>{grp}</td>
                    <td style={{padding:'6px 10px'}}>{vals.node_count}</td>
                    <td style={{padding:'6px 10px'}}>{vals.degree.mean} <span style={{color:'#aaa', fontSize:10}}>±{vals.degree.std}</span></td>
                    <td style={{padding:'6px 10px'}}>{vals.betweenness.mean} <span style={{color:'#aaa', fontSize:10}}>±{vals.betweenness.std}</span></td>
                    <td style={{padding:'6px 10px'}}>{vals.clustering.mean} <span style={{color:'#aaa', fontSize:10}}>±{vals.clustering.std}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. 二模网络 */}
        <div style={{marginTop:16, padding:16, background:'#f8f6f2', borderRadius:14, border:'1px solid #e0d8cc'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10}}>
            <h3 style={{margin:'0 0 6px', fontSize:15}}>{t.bipartiteTitle}</h3>
            <button onClick={exportBipartiteImage} style={{background:'#76552d'}}>{t.downloadImg}</button>
          </div>
          <div style={{fontSize:12, color:'#666', marginBottom:8}}>
            {t.bipartiteInfo(attrAnalysis.bipartite.burial_count, attrAnalysis.bipartite.artifact_count)}
            {' — '}{t.bipartiteNote}
          </div>
          <div style={{marginBottom:10}}>
            <label style={{display:'inline-flex', flexDirection:'row', alignItems:'center', gap:8, fontWeight:600, fontSize:13}}>
              {t.bipartiteFilterLabel}
              <select value={bipartiteFilterValue} onChange={e => setBipartiteFilterValue(e.target.value)}>
                <option value="">{t.bipartiteFilterAll}</option>
                {bipartiteAttrValues.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>
          <div ref={bipartiteWrapRef} style={{background:'white', borderRadius:10}}>
            <div ref={bipartiteRef} style={{height:500, border:'1px solid #dedede', borderRadius:10}}></div>
          </div>
        </div>
      </>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);