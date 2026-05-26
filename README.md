# Ordos Mobility Network Lab

一个面向博士申请研究计划的正式科研网站雏形：从器物流通到人群移动，支持墓葬/遗址数据上传、器物组合网络、数量权重网络、时间层、空间层、属性层、多层证据网络，以及阈值稳定性分析。

## 本次升级重点

- 后端 API 从 `/upload` 改为 `/api/analyze`，更接近正式科研服务结构。
- 增加 `/health`，便于部署平台健康检查。
- 支持 Jaccard、Overlap、Cosine 三种相似度。
- 空间层改用 Haversine 球面距离，而不是直接用经纬度欧氏距离。
- 增加数量权重层，避免所有问题都被二值化。
- 增加 multiplex 多层证据网络，将器物、空间、时间证据合并。
- 增加数据质量提示和考古解释边界，避免把中心性直接等同于政治中心。
- 前端修复 `network` 变量重置问题，使用 `useRef` 管理 vis-network 实例。
- 前端界面改为正式科研平台风格，可用于展示申博研究计划中的 digital component。

## 本地运行

### 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173

## 推荐数据格式

长表格式：

| 墓葬 | 器物 | 数量 | 时期 | 经度 | 纬度 | 性别 | 等级 |
|---|---|---:|---|---:|---:|---|---|
| M1 | 铜刀 | 1 | 春秋早期 | 110.1 | 40.2 | 男 | 高 |
| M1 | 牌饰 | 2 | 春秋早期 | 110.1 | 40.2 | 男 | 高 |
| M2 | 铜刀 | 1 | 春秋中期 | 110.4 | 40.1 | 女 | 中 |

也支持墓葬×器物矩阵，但长表更适合保留时期、坐标和属性。

## 公开部署建议

### 前端

可部署到 Vercel、Netlify 或 GitHub Pages。构建命令：

```bash
npm run build
```

环境变量：

```bash
VITE_API_BASE=https://你的后端域名
```

### 后端

可部署到 Render、Railway、Fly.io、Google Cloud Run 或 VPS。需要设置：

```bash
ALLOWED_ORIGINS=https://你的前端域名
MAX_UPLOAD_MB=25
```

Docker 已包含在 `backend/Dockerfile`。

## 博士申请中的表述建议

This platform will serve as the digital research component of my doctoral project. It operationalises artifact co-occurrence, spatial proximity, chronological association, and multi-layer network evidence into a transparent and reproducible web-based workflow. Rather than claiming to identify fixed ancient roads, the platform reconstructs probable mobility corridors and interaction structures through iterative comparison between computational outputs and archaeological expertise.
