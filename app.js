const canvas = document.getElementById("graphCanvas");
const ctx = canvas.getContext("2d");
const focusInfo = document.getElementById("focusInfo");
const resetBtn = document.getElementById("resetBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const controlPanel = document.getElementById("controlPanel");
const panelToggleBtn = document.getElementById("panelToggleBtn");

const mobilePanelQuery = window.matchMedia("(max-width: 980px)");

const columns = Array.isArray(window.FAMILY_COLUMNS)
  ? window.FAMILY_COLUMNS.map((c) => ({
      generation: (c?.generation || "").toString().trim(),
      marker: (c?.marker || "").toString().trim(),
    }))
  : [];

const rawRows = Array.isArray(window.FAMILY_ROWS) ? window.FAMILY_ROWS : [];

function cleanCell(value) {
  if (value === null || value === undefined) return null;
  const t = String(value).trim();
  return t ? t : null;
}

const tableRows = rawRows
  .map((row) => {
    const cells = Array.isArray(row) ? row : [];
    return columns.map((_, i) => cleanCell(cells[i]));
  })
  .filter((row) => row.some((v) => v));

function detectRootName(rows) {
  const counts = new Map();
  for (const row of rows) {
    const v = row[0];
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let root = null;
  let max = -1;
  for (const [name, count] of counts.entries()) {
    if (count > max) {
      max = count;
      root = name;
    }
  }
  return root;
}

const rootName = detectRootName(tableRows);

const nodeMap = new Map();
const edgeMap = new Map();
let nodeOrder = 0;

function getNode(id, col, label) {
  if (!nodeMap.has(id)) {
    nodeMap.set(id, {
      id,
      col,
      label,
      notes: new Set(),
      note: "",
      x: 0,
      y: 0,
      w: 92,
      h: 40,
      parents: [],
      children: [],
      order: nodeOrder,
    });
    nodeOrder += 1;
  }
  return nodeMap.get(id);
}

function link(parentId, childId) {
  const edgeKey = `${parentId}->${childId}`;
  if (edgeMap.has(edgeKey)) return;
  edgeMap.set(edgeKey, { source: parentId, target: childId });
  const p = nodeMap.get(parentId);
  const c = nodeMap.get(childId);
  if (!p.children.includes(childId)) p.children.push(childId);
  if (!c.parents.includes(parentId)) c.parents.push(parentId);
}

const lastPathNodeByCol = Array.from({ length: columns.length }, () => null);


for (const row of tableRows) {
  const pathValues = rootName && row[0] === rootName ? [...row] : null;

  if (pathValues) {
    for (let i = 0; i < lastPathNodeByCol.length; i += 1) {
      lastPathNodeByCol[i] = null;
    }

    let prevNodeId = null;
    const prefix = [];

    for (let col = 0; col < columns.length; col += 1) {
      const label = pathValues[col];
      if (!label) continue;

      prefix.push(label);
      const id = `${col}:${prefix.join(">")}`;
      getNode(id, col, label);
      lastPathNodeByCol[col] = id;

      if (prevNodeId) {
        link(prevNodeId, id);
      }
      prevNodeId = id;
    }
  } else {
    for (let col = 0; col < columns.length; col += 1) {
      const note = row[col];
      const nodeId = lastPathNodeByCol[col];
      if (!note || !nodeId) continue;
      nodeMap.get(nodeId).notes.add(note);
    }
  }
}

const nodes = [...nodeMap.values()];
const edges = [...edgeMap.values()];

for (const node of nodes) {
  const notes = [...node.notes].filter((v) => v && v !== node.label);
  if (notes.length <= 2) {
    node.note = notes.join("、");
  } else {
    node.note = `${notes[0]} 等${notes.length}人`;
  }
}

const colGap = 210;
const rowGap = 72;
let leafIndex = 0;

function sortChildIds(aId, bId) {
  const a = nodeMap.get(aId);
  const b = nodeMap.get(bId);
  if (a.col !== b.col) return a.col - b.col;
  return a.order - b.order;
}

function placeFrom(nodeId, visiting = new Set()) {
  const node = nodeMap.get(nodeId);
  if (!node) return 0;
  if (typeof node.y === "number" && node.y !== 0) return node.y;
  if (visiting.has(nodeId)) return node.y;

  visiting.add(nodeId);
  node.x = node.col * colGap;

  if (node.children.length === 0) {
    node.y = leafIndex * rowGap;
    leafIndex += 1;
    visiting.delete(nodeId);
    return node.y;
  }

  const ys = node.children.sort(sortChildIds).map((childId) => placeFrom(childId, visiting));
  node.y = (Math.min(...ys) + Math.max(...ys)) / 2;
  visiting.delete(nodeId);
  return node.y;
}

const roots = nodes.filter((node) => node.parents.length === 0).sort((a, b) => a.order - b.order);
for (const root of roots) {
  placeFrom(root.id);
}

if (nodes.length > 0) {
  const nodeYs = nodes.map((n) => n.y);
  const yMid = (Math.min(...nodeYs) + Math.max(...nodeYs)) / 2;
  for (const node of nodes) {
    node.y -= yMid;
  }
}

function measureNodeSizes() {
  ctx.font = "17px 'Noto Serif TC', 'Microsoft JhengHei', serif";
  for (const node of nodes) {
    const baseWidth = Math.max(72, Math.ceil(ctx.measureText(node.label).width + 26));
    if (node.note) {
      ctx.font = "12px 'Noto Serif TC', 'Microsoft JhengHei', serif";
      const noteWidth = Math.ceil(ctx.measureText(node.note).width + 20);
      node.w = Math.max(baseWidth, noteWidth);
      node.h = 56;
      ctx.font = "17px 'Noto Serif TC', 'Microsoft JhengHei', serif";
    } else {
      node.w = baseWidth;
      node.h = 40;
    }
  }
}

const viewport = { x: 0, y: 0, scale: 1 };
const minScale = 0.02;
const maxScale = 2.5;
const headerOverlayHeight = 42;
let pressedNodeId = null;
let pressedBlank = false;
let isPanning = false;
let panAnchor = null;
let pointerStart = null;
let focusedId = null;
const activePointers = new Map();
let pinchState = null;

function generationLabel(colIndex) {
  const column = columns[colIndex];
  if (!column) return "";
  return `${column.generation}${column.marker ? ` ${column.marker}` : ""}`.trim();
}

function setPanelCollapsed(collapsed) {
  if (!controlPanel || !panelToggleBtn) return;
  controlPanel.classList.toggle("is-collapsed", collapsed);
  panelToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  panelToggleBtn.textContent = collapsed ? "展開" : "收合";
}

function syncPanelStateByViewport() {
  setPanelCollapsed(mobilePanelQuery.matches);
}

function resetViewLayout() {
  resizeCanvas();
  fitView();
}

function getParentLabel(node) {
  if (!node.parents.length) return "";
  const parent = nodeMap.get(node.parents[0]);
  return parent ? parent.label : "";
}

function getBounds() {
  if (nodes.length === 0) {
    return { minX: -100, maxX: 100, minY: -100, maxY: 100, w: 200, h: 200 };
  }
  const minX = Math.min(...nodes.map((n) => n.x - n.w / 2)) - 80;
  const maxX = Math.max(...nodes.map((n) => n.x + n.w / 2)) + 80;
  const minY = Math.min(...nodes.map((n) => n.y - n.h / 2)) - 130;
  const maxY = Math.max(...nodes.map((n) => n.y + n.h / 2)) + 80;
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function toWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return {
    x: (x - viewport.x) / viewport.scale,
    y: (y - viewport.y) / viewport.scale,
  };
}

function clampScale(value) {
  return Math.max(minScale, Math.min(maxScale, value));
}

function zoomAtClientPoint(clientX, clientY, targetScale) {
  const rect = canvas.getBoundingClientRect();
  const world = toWorld(clientX, clientY);
  const nextScale = clampScale(targetScale);
  viewport.scale = nextScale;
  viewport.x = clientX - rect.left - world.x * nextScale;
  viewport.y = clientY - rect.top - world.y * nextScale;
  draw();
}

function zoomAtCenter(factor) {
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  zoomAtClientPoint(cx, cy, viewport.scale * factor);
}

function roundedRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function findNodeAt(clientX, clientY) {
  const p = toWorld(clientX, clientY);
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const n = nodes[i];
    if (
      p.x >= n.x - n.w / 2 &&
      p.x <= n.x + n.w / 2 &&
      p.y >= n.y - n.h / 2 &&
      p.y <= n.y + n.h / 2
    ) {
      return n;
    }
  }
  return null;
}

function computeFocusSet(nodeId) {
  const lineage = new Set([nodeId]);

  const parentStack = [nodeId];
  while (parentStack.length > 0) {
    const currentId = parentStack.pop();
    const current = nodeMap.get(currentId);
    for (const parentId of current.parents) {
      if (lineage.has(parentId)) continue;
      lineage.add(parentId);
      parentStack.push(parentId);
    }
  }

  const childStack = [nodeId];
  while (childStack.length > 0) {
    const currentId = childStack.pop();
    const current = nodeMap.get(currentId);
    for (const childId of current.children) {
      if (lineage.has(childId)) continue;
      lineage.add(childId);
      childStack.push(childId);
    }
  }

  return lineage;
}

function drawGenerationHeader(column, screenX, y) {
  const generation = column.generation;
  const marker = column.marker;

  if (!marker) {
    ctx.textAlign = "center";
    ctx.font = "600 16px 'Noto Serif TC', 'Microsoft JhengHei', serif";
    ctx.fillStyle = "#6b5b3d";
    ctx.fillText(generation, screenX, y);
    return;
  }

  ctx.textAlign = "left";
  ctx.font = "500 15px 'Noto Serif TC', 'Microsoft JhengHei', serif";
  const generationWidth = ctx.measureText(generation).width;

  ctx.font = "700 17px 'Noto Serif TC', 'Microsoft JhengHei', serif";
  const markerWidth = ctx.measureText(marker).width;

  const gap = 6;
  const totalWidth = generationWidth + gap + markerWidth;
  const startX = screenX - totalWidth / 2;

  ctx.font = "500 15px 'Noto Serif TC', 'Microsoft JhengHei', serif";
  ctx.fillStyle = "#6b5b3d";
  ctx.fillText(generation, startX, y);

  ctx.font = "700 17px 'Noto Serif TC', 'Microsoft JhengHei', serif";
  ctx.fillStyle = "#9f2f1f";
  ctx.fillText(marker, startX + generationWidth + gap, y);
}

function drawColumnHeaderOverlay(width) {
  ctx.fillStyle = "rgba(255, 252, 245, 0.95)";
  ctx.fillRect(0, 0, width, headerOverlayHeight);

  ctx.strokeStyle = "rgba(138, 119, 81, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headerOverlayHeight - 0.5);
  ctx.lineTo(width, headerOverlayHeight - 0.5);
  ctx.stroke();

  ctx.textBaseline = "middle";

  for (let i = 0; i < columns.length; i += 1) {
    const worldX = i * colGap;
    const screenX = worldX * viewport.scale + viewport.x;
    if (screenX < -120 || screenX > width + 120) continue;
    drawGenerationHeader(columns[i], screenX, headerOverlayHeight / 2);
  }
}

function getEdgeLaneX(sourceCol, targetCol) {
  if (sourceCol === targetCol) {
    return sourceCol * colGap;
  }
  const minCol = Math.min(sourceCol, targetCol);
  const maxCol = Math.max(sourceCol, targetCol);
  return ((minCol + maxCol) * colGap) / 2;
}

function addAxisInterval(buckets, axisValue, from, to, active) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (end - start <= 0.01) return;

  const key = axisValue.toFixed(3);
  if (!buckets.has(key)) {
    buckets.set(key, { axisValue, intervals: [] });
  }
  buckets.get(key).intervals.push({ start, end, active });
}

function mergeIntervalsWithPriority(intervals) {
  if (intervals.length === 0) return [];

  const points = new Set();
  for (const interval of intervals) {
    points.add(interval.start);
    points.add(interval.end);
  }

  const sorted = [...points].sort((a, b) => a - b);
  const merged = [];

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    if (segEnd - segStart <= 0.01) continue;

    let covered = false;
    let hasActive = false;
    for (const interval of intervals) {
      if (interval.start < segEnd - 1e-6 && interval.end > segStart + 1e-6) {
        covered = true;
        if (interval.active) hasActive = true;
      }
    }

    if (!covered) continue;

    const last = merged[merged.length - 1];
    if (last && last.active === hasActive && Math.abs(last.end - segStart) <= 0.01) {
      last.end = segEnd;
    } else {
      merged.push({ start: segStart, end: segEnd, active: hasActive });
    }
  }

  return merged;
}

function buildEdgeSegments(focusSet) {
  const verticalBuckets = new Map();
  const horizontalBuckets = new Map();

  for (const edge of edges) {
    const s = nodeMap.get(edge.source);
    const t = nodeMap.get(edge.target);
    const active = !focusSet || (focusSet.has(s.id) && focusSet.has(t.id));
    const fromX = s.x + s.w / 2;
    const fromY = s.y;
    const toX = t.x - t.w / 2;
    const toY = t.y;
    const laneX = getEdgeLaneX(s.col, t.col);

    if (Math.abs(fromX - laneX) > 0.4) {
      addAxisInterval(horizontalBuckets, fromY, fromX, laneX, active);
    }
    addAxisInterval(verticalBuckets, laneX, fromY, toY, active);
    if (Math.abs(toX - laneX) > 0.4) {
      addAxisInterval(horizontalBuckets, toY, laneX, toX, active);
    }
  }

  const segments = [];

  for (const bucket of verticalBuckets.values()) {
    const merged = mergeIntervalsWithPriority(bucket.intervals);
    for (const interval of merged) {
      segments.push({
        x1: bucket.axisValue,
        y1: interval.start,
        x2: bucket.axisValue,
        y2: interval.end,
        active: interval.active,
      });
    }
  }

  for (const bucket of horizontalBuckets.values()) {
    const merged = mergeIntervalsWithPriority(bucket.intervals);
    for (const interval of merged) {
      segments.push({
        x1: interval.start,
        y1: bucket.axisValue,
        x2: interval.end,
        y2: bucket.axisValue,
        active: interval.active,
      });
    }
  }

  return segments;
}

function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  ctx.scale(viewport.scale, viewport.scale);

  const lineStartY = (headerOverlayHeight - viewport.y) / viewport.scale;

  for (let i = 0; i < columns.length; i += 1) {
    const x = i * colGap;
    ctx.strokeStyle = "rgba(138, 119, 81, 0.26)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, lineStartY);
    ctx.lineTo(x, h / viewport.scale + 220);
    ctx.stroke();
  }

  const focusSet = focusedId ? computeFocusSet(focusedId) : null;

  const edgeSegments = buildEdgeSegments(focusSet);
  for (const segment of edgeSegments) {
    ctx.beginPath();
    ctx.moveTo(segment.x1, segment.y1);
    ctx.lineTo(segment.x2, segment.y2);
    ctx.lineWidth = segment.active ? 2.2 : 1;
    ctx.strokeStyle = segment.active ? "rgba(93, 59, 19, 0.82)" : "rgba(93, 59, 19, 0.2)";
    ctx.stroke();
  }

  for (const node of nodes) {
    const active = !focusSet || focusSet.has(node.id);
    const isFocused = focusedId === node.id;
    const alpha = active ? 1 : 0.25;

    ctx.globalAlpha = alpha;
    roundedRect(node.x - node.w / 2, node.y - node.h / 2, node.w, node.h, 11);
    ctx.fillStyle = isFocused ? "#9f2f1f" : "#2f3f53";
    ctx.fill();

    if (isFocused) {
      roundedRect(node.x - node.w / 2 - 4, node.y - node.h / 2 - 4, node.w + 8, node.h + 8, 14);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#dca85f";
      ctx.stroke();
    }

    ctx.fillStyle = "#fffaf0";
    ctx.font = "600 17px 'Noto Serif TC', 'Microsoft JhengHei', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = node.note ? "bottom" : "middle";
    ctx.fillText(node.label, node.x, node.note ? node.y - 2 : node.y + 1);

    if (node.note) {
      ctx.font = "12px 'Noto Serif TC', 'Microsoft JhengHei', serif";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(255, 250, 240, 0.86)";
      ctx.fillText(node.note, node.x, node.y + 3);
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
  drawColumnHeaderOverlay(w);
}

function fitView() {
  const bounds = getBounds();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const isMobileViewport = mobilePanelQuery.matches;
  const mobileTopNode =
    nodes.length > 0
      ? nodes.reduce((topNode, node) =>
          node.y - node.h / 2 < topNode.y - topNode.h / 2 ? node : topNode
        )
      : null;

  if (isMobileViewport && mobileTopNode) {
    const horizontalPadding = 32;
    const leftPadding = 18;
    const topPadding = headerOverlayHeight + 12;
    const widthFitScale = (w - horizontalPadding) / bounds.w;
    viewport.scale = Math.max(minScale, Math.min(maxScale, widthFitScale));
    viewport.x = leftPadding - bounds.minX * viewport.scale;
    viewport.y = topPadding - (mobileTopNode.y - mobileTopNode.h / 2) * viewport.scale;
  } else {
    const horizontalPadding = 64;
    const verticalPadding = 48;
    const sx = (w - horizontalPadding) / bounds.w;
    const sy = (h - verticalPadding) / bounds.h;
    viewport.scale = Math.max(minScale, Math.min(maxScale, Math.min(sx, sy)));
    viewport.x = w / 2 - ((bounds.minX + bounds.maxX) / 2) * viewport.scale;
    viewport.y = h / 2 - ((bounds.minY + bounds.maxY) / 2) * viewport.scale;
  }
  focusedId = null;
  focusInfo.textContent = "目前：顯示全部族譜";
  draw();
}

function updateFocusInfo() {
  if (!focusedId) {
    focusInfo.textContent = "目前：顯示全部族譜";
    return;
  }
  const node = nodeMap.get(focusedId);
  const focusSet = computeFocusSet(focusedId);
  focusInfo.textContent = `目前聚焦：${node.label}（直系高亮 ${focusSet.size - 1} 人）`;
}

function focusNodeById(nodeId, recenter = false) {
  const node = nodeMap.get(nodeId);
  if (!node) return;

  focusedId = nodeId;
  updateFocusInfo();

  if (recenter) {
    const targetScale = Math.max(viewport.scale, 0.62);
    viewport.scale = targetScale;
    viewport.x = canvas.clientWidth / 2 - node.x * targetScale;
    viewport.y = canvas.clientHeight / 2 - node.y * targetScale;
  }

  draw();
}

function renderSearchResults(keyword) {
  if (!searchResults) return;
  searchResults.innerHTML = "";

  if (!keyword) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = "輸入姓名關鍵字後顯示結果";
    searchResults.appendChild(empty);
    return;
  }

  const normalized = keyword.toLowerCase();
  const matched = nodes
    .filter((n) => n.label.toLowerCase().includes(normalized))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-Hant") || a.col - b.col || a.order - b.order)
    .slice(0, 80);

  if (matched.length === 0) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = "找不到符合的姓名";
    searchResults.appendChild(empty);
    return;
  }

  for (const node of matched) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "search-item";

    const title = document.createElement("strong");
    title.textContent = node.label;

    const info = document.createElement("small");
    const parent = getParentLabel(node);
    info.textContent = parent
      ? `${generationLabel(node.col)} · 上代：${parent}`
      : generationLabel(node.col);

    item.appendChild(title);
    item.appendChild(info);
    item.addEventListener("click", () => {
      focusNodeById(node.id, true);
    });

    searchResults.appendChild(item);
  }
}

canvas.addEventListener("pointerdown", (e) => {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  pointerStart = { x: e.clientX, y: e.clientY };

  if (activePointers.size >= 2) {
    const points = [...activePointers.values()];
    const a = points[0];
    const b = points[1];
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;
    const startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const startWorld = toWorld(centerX, centerY);
    pinchState = {
      startDist,
      startScale: viewport.scale,
      startWorld,
    };
    pressedNodeId = null;
    pressedBlank = false;
    isPanning = false;
    panAnchor = null;
    return;
  }

  const hit = findNodeAt(e.clientX, e.clientY);
  if (hit) {
    pressedNodeId = hit.id;
    pressedBlank = false;
  } else {
    pressedBlank = true;
    isPanning = true;
    panAnchor = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  if (pinchState && activePointers.size >= 2) {
    const points = [...activePointers.values()];
    const a = points[0];
    const b = points[1];
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;
    const currentDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const nextScale = clampScale(pinchState.startScale * (currentDist / pinchState.startDist));
    const rect = canvas.getBoundingClientRect();
    viewport.scale = nextScale;
    viewport.x = centerX - rect.left - pinchState.startWorld.x * nextScale;
    viewport.y = centerY - rect.top - pinchState.startWorld.y * nextScale;
    draw();
    return;
  }

  if (isPanning) {
    viewport.x = e.clientX - panAnchor.x;
    viewport.y = e.clientY - panAnchor.y;
    draw();
  }
});

canvas.addEventListener("pointerup", (e) => {
  activePointers.delete(e.pointerId);

  if (pinchState && activePointers.size < 2) {
    pinchState = null;
    pressedNodeId = null;
    pressedBlank = false;
    isPanning = false;
    panAnchor = null;
    pointerStart = null;
    return;
  }

  const moved =
    pointerStart &&
    Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 5;

  if (!moved && pressedNodeId) {
    focusNodeById(pressedNodeId, false);
  } else if (!moved && pressedBlank) {
    focusedId = null;
    updateFocusInfo();
    draw();
  }

  pressedNodeId = null;
  pressedBlank = false;
  isPanning = false;
  panAnchor = null;
  pointerStart = null;
});

canvas.addEventListener("pointercancel", (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) {
    pinchState = null;
  }
  pressedNodeId = null;
  pressedBlank = false;
  isPanning = false;
  panAnchor = null;
  pointerStart = null;
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.08 : 0.92;
  zoomAtClientPoint(e.clientX, e.clientY, viewport.scale * factor);
});

if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderSearchResults(searchInput.value.trim());
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const firstItem = searchResults?.querySelector(".search-item");
    if (firstItem) {
      firstItem.click();
      e.preventDefault();
    }
  });
}

if (panelToggleBtn) {
  panelToggleBtn.addEventListener("click", () => {
    const collapsed = controlPanel?.classList.contains("is-collapsed");
    setPanelCollapsed(!collapsed);
    requestAnimationFrame(resetViewLayout);
  });
}

resetBtn.addEventListener("click", fitView);
if (zoomInBtn) {
  zoomInBtn.addEventListener("click", () => zoomAtCenter(1.12));
}
if (zoomOutBtn) {
  zoomOutBtn.addEventListener("click", () => zoomAtCenter(0.88));
}

window.addEventListener("resize", () => {
  resizeCanvas();
  draw();
});

if (typeof mobilePanelQuery.addEventListener === "function") {
  mobilePanelQuery.addEventListener("change", () => {
    syncPanelStateByViewport();
    requestAnimationFrame(resetViewLayout);
  });
} else if (typeof mobilePanelQuery.addListener === "function") {
  mobilePanelQuery.addListener(() => {
    syncPanelStateByViewport();
    requestAnimationFrame(resetViewLayout);
  });
}

resizeCanvas();
measureNodeSizes();
syncPanelStateByViewport();
requestAnimationFrame(resetViewLayout);
renderSearchResults("");
