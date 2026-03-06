(() => {
  const stage = document.getElementById("graphStage");
  const svg = document.getElementById("graphSvg");
  const worldLayer = document.getElementById("worldLayer");
  const edgeLayer = document.getElementById("edgeLayer");
  const nodeLayer = document.getElementById("nodeLayer");

  const focusInfo = document.getElementById("focusInfo");
  const resetBtn = document.getElementById("resetBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  const versionBadge = document.getElementById("versionBadge");

  const APP_VERSION = "v2026.03.06-06";

  if (versionBadge) {
    versionBadge.textContent = `版本 ${APP_VERSION}`;
  }
  document.title = `林氏忠孝堂族譜 ${APP_VERSION}`;
  console.info(`[Linfamily] ${APP_VERSION}`);

  if (!stage || !svg || !worldLayer || !edgeLayer || !nodeLayer) {
    return;
  }

  const MIN_SCALE = 0.08;
  const MAX_SCALE = 2.7;

  const NODE_TONES = [
    { fill: "#1a2a3f", ring: "#74eac7", halo: "rgba(116,234,199,0.26)" },
    { fill: "#222f47", ring: "#7bb4ff", halo: "rgba(123,180,255,0.24)" },
    { fill: "#2a2d4c", ring: "#b89dff", halo: "rgba(184,157,255,0.24)" },
    { fill: "#2a3f47", ring: "#7de4ff", halo: "rgba(125,228,255,0.24)" },
    { fill: "#283044", ring: "#9ee8c7", halo: "rgba(158,232,199,0.24)" },
  ];

  const columns = Array.isArray(window.FAMILY_COLUMNS)
    ? window.FAMILY_COLUMNS.map((column) => ({
        generation: String(column?.generation || "").trim(),
        marker: String(column?.marker || "").trim(),
      }))
    : [];

  const rawRows = Array.isArray(window.FAMILY_ROWS) ? window.FAMILY_ROWS : [];

  function cleanCell(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  const tableRows = rawRows
    .map((row) => {
      const cells = Array.isArray(row) ? row : [];
      return columns.map((_, index) => cleanCell(cells[index]));
    })
    .filter((row) => row.some((value) => Boolean(value)));

  function detectRootName(rows) {
    const counts = new Map();
    for (const row of rows) {
      const firstCell = row[0];
      if (!firstCell) continue;
      counts.set(firstCell, (counts.get(firstCell) || 0) + 1);
    }

    let selectedRoot = null;
    let maxCount = -1;
    for (const [name, count] of counts.entries()) {
      if (count > maxCount) {
        selectedRoot = name;
        maxCount = count;
      }
    }
    return selectedRoot;
  }

  const rootName = detectRootName(tableRows);

  const nodeMap = new Map();
  const edgeMap = new Map();
  let nodeOrder = 0;

  function getNode(nodeId, col, label) {
    if (!nodeMap.has(nodeId)) {
      nodeMap.set(nodeId, {
        id: nodeId,
        col,
        label,
        notes: new Set(),
        note: "",
        order: nodeOrder,
        parents: [],
        children: [],
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 34,
      });
      nodeOrder += 1;
    }
    return nodeMap.get(nodeId);
  }

  function link(parentId, childId) {
    if (!parentId || !childId || parentId === childId) return;

    const edgeKey = `${parentId}->${childId}`;
    if (edgeMap.has(edgeKey)) return;

    edgeMap.set(edgeKey, { source: parentId, target: childId });

    const parentNode = nodeMap.get(parentId);
    const childNode = nodeMap.get(childId);

    if (parentNode && !parentNode.children.includes(childId)) {
      parentNode.children.push(childId);
    }
    if (childNode && !childNode.parents.includes(parentId)) {
      childNode.parents.push(parentId);
    }
  }

  const lastPathNodeByCol = Array.from({ length: columns.length }, () => null);

  for (const row of tableRows) {
    const isPathRow = row[0] && (!rootName || row[0] === rootName);

    if (isPathRow) {
      for (let i = 0; i < lastPathNodeByCol.length; i += 1) {
        lastPathNodeByCol[i] = null;
      }

      const prefix = [];
      let previousNodeId = null;

      for (let col = 0; col < columns.length; col += 1) {
        const label = row[col];
        if (!label) continue;

        prefix.push(label);
        const nodeId = `${col}:${prefix.join(">")}`;
        getNode(nodeId, col, label);
        lastPathNodeByCol[col] = nodeId;

        if (previousNodeId) {
          link(previousNodeId, nodeId);
        }

        previousNodeId = nodeId;
      }
    } else {
      for (let col = 0; col < columns.length; col += 1) {
        const note = row[col];
        const nodeId = lastPathNodeByCol[col];
        if (!note || !nodeId) continue;
        nodeMap.get(nodeId)?.notes.add(note);
      }
    }
  }

  const nodes = [...nodeMap.values()];
  const edges = [...edgeMap.values()];
  const neighborMap = new Map(nodes.map((node) => [node.id, new Set()]));

  for (const edge of edges) {
    if (neighborMap.has(edge.source)) {
      neighborMap.get(edge.source).add(edge.target);
    }
    if (neighborMap.has(edge.target)) {
      neighborMap.get(edge.target).add(edge.source);
    }
  }

  for (const node of nodes) {
    const filteredNotes = [...node.notes]
      .map((note) => cleanCell(note))
      .filter((note) => note && note !== "*" && note !== node.label);

    if (filteredNotes.length === 0) {
      node.note = "";
    } else if (filteredNotes.length <= 2) {
      node.note = filteredNotes.join("、");
    } else {
      node.note = `${filteredNotes[0]} 等${filteredNotes.length}位`;
    }

    const degree = node.parents.length + node.children.length;
    node.r = Math.max(28, Math.min(46, 22 + Math.ceil(node.label.length * 2.2 + degree * 1.4)));
  }

  function hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  function toneForCol(col) {
    return NODE_TONES[Math.abs(col) % NODE_TONES.length];
  }

  function initializeForceLayout() {
    const count = Math.max(nodes.length, 1);
    const radius = Math.max(240, Math.sqrt(count) * 74);

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const angle = (i / count) * Math.PI * 2;
      const noise = (hashText(node.id) % 1000) / 1000 - 0.5;
      node.x = Math.cos(angle) * radius + noise * 100;
      node.y = Math.sin(angle) * radius + noise * 100;
      node.vx = 0;
      node.vy = 0;
    }

    const repulsion = 26500;
    const spring = 0.014;
    const idealLength = 158;
    const centerPull = 0.0021;
    const damping = 0.87;
    const iterations = 190;

    for (let iter = 0; iter < iterations; iter += 1) {
      for (const node of nodes) {
        node.fx = 0;
        node.fy = 0;
      }

      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist2 = dx * dx + dy * dy + 0.01;
          const dist = Math.sqrt(dist2);
          const force = repulsion / dist2;
          const fx = (force * dx) / dist;
          const fy = (force * dy) / dist;

          a.fx -= fx;
          a.fy -= fy;
          b.fx += fx;
          b.fy += fy;
        }
      }

      for (const edge of edges) {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);
        if (!sourceNode || !targetNode) continue;

        const dx = targetNode.x - sourceNode.x;
        const dy = targetNode.y - sourceNode.y;
        const dist = Math.hypot(dx, dy) || 1;
        const delta = dist - idealLength;
        const force = spring * delta;
        const fx = (force * dx) / dist;
        const fy = (force * dy) / dist;

        sourceNode.fx += fx;
        sourceNode.fy += fy;
        targetNode.fx -= fx;
        targetNode.fy -= fy;
      }

      for (const node of nodes) {
        node.fx += -node.x * centerPull;
        node.fy += -node.y * centerPull;

        node.vx = (node.vx + node.fx) * damping;
        node.vy = (node.vy + node.fy) * damping;

        node.x += node.vx;
        node.y += node.vy;
      }
    }
  }

  initializeForceLayout();

  function createSvgElement(tagName, attrs = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === undefined || value === null) continue;
      element.setAttribute(name, String(value));
    }
    return element;
  }

  const edgeVisuals = [];
  const nodeElements = new Map();

  for (const edge of edges) {
    const group = createSvgElement("g", { class: "graph-edge" });
    const line = createSvgElement("path", { class: "graph-edge-line" });
    const arrow = createSvgElement("path", {
      class: "graph-edge-arrow",
      d: "M -10 -5.5 L 0 0 L -10 5.5",
    });

    group.appendChild(line);
    group.appendChild(arrow);
    edgeLayer.appendChild(group);

    edgeVisuals.push({
      source: edge.source,
      target: edge.target,
      group,
      line,
      arrow,
      curveSign: hashText(`${edge.source}|${edge.target}`) % 2 === 0 ? 1 : -1,
    });
  }

  for (const node of nodes) {
    const group = createSvgElement("g", {
      class: "graph-node",
      "data-id": node.id,
      transform: `translate(${node.x} ${node.y})`,
    });

    const tone = toneForCol(node.col);
    group.style.setProperty("--node-fill", tone.fill);
    group.style.setProperty("--node-ring", tone.ring);
    group.style.setProperty("--node-halo", tone.halo);

    const halo = createSvgElement("circle", {
      class: "node-halo",
      cx: 0,
      cy: 0,
      r: node.r + 8,
    });

    const ring = createSvgElement("circle", {
      class: "node-ring",
      cx: 0,
      cy: 0,
      r: node.r + 1.5,
    });

    const core = createSvgElement("circle", {
      class: "node-core",
      cx: 0,
      cy: 0,
      r: node.r,
    });

    const nameText = createSvgElement("text", {
      class: "name",
      x: 0,
      y: 1,
    });
    nameText.textContent = node.label;

    group.appendChild(halo);
    group.appendChild(ring);
    group.appendChild(core);
    group.appendChild(nameText);

    if (node.note) {
      const noteText = createSvgElement("text", {
        class: "note",
        x: 0,
        y: node.r + 15,
      });
      noteText.textContent = node.note;
      group.appendChild(noteText);
    }

    nodeLayer.appendChild(group);
    nodeElements.set(node.id, group);
  }

  let focusedId = null;
  let viewportAnimFrame = null;
  let layoutAnimFrame = null;
  let edgeGeometryDirty = true;

  const viewport = {
    x: 0,
    y: 0,
    scale: 1,
  };

  function clampScale(scale) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
  }

  function cancelAllAnimations() {
    if (viewportAnimFrame) {
      cancelAnimationFrame(viewportAnimFrame);
      viewportAnimFrame = null;
    }
    if (layoutAnimFrame) {
      cancelAnimationFrame(layoutAnimFrame);
      layoutAnimFrame = null;
    }
  }

  function fitScaleForBounds(bounds) {
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    const drawableWidth = Math.max(40, stageWidth - 70);
    const drawableHeight = Math.max(40, stageHeight - 30);
    const scaleX = drawableWidth / Math.max(1, bounds.w);
    const scaleY = drawableHeight / Math.max(1, bounds.h);
    return clampScale(Math.min(scaleX, scaleY));
  }

  function getBoundsForTargets(targets) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const node of nodes) {
      const target = targets.get(node.id) || { x: node.x, y: node.y };
      minX = Math.min(minX, target.x - node.r - 10);
      maxX = Math.max(maxX, target.x + node.r + 10);
      minY = Math.min(minY, target.y - node.r - 10);
      maxY = Math.max(maxY, target.y + node.r + (node.note ? 18 : 0) + 10);
    }

    if (!Number.isFinite(minX)) {
      return { minX: -120, maxX: 120, minY: -120, maxY: 120, w: 240, h: 240 };
    }

    minX -= 90;
    maxX += 90;
    minY -= 90;
    maxY += 90;

    return {
      minX,
      maxX,
      minY,
      maxY,
      w: maxX - minX,
      h: maxY - minY,
    };
  }

  function buildOrderedTargetsFrom(centerId) {
    const centerNode = nodeMap.get(centerId);
    if (!centerNode) return null;

    const distMap = new Map([[centerId, 0]]);
    const queue = [centerId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      const currentDist = distMap.get(currentId) || 0;
      const neighbors = neighborMap.get(currentId);
      if (!neighbors) continue;

      for (const nextId of neighbors) {
        if (distMap.has(nextId)) continue;
        distMap.set(nextId, currentDist + 1);
        queue.push(nextId);
      }
    }

    let maxDist = 0;
    for (const dist of distMap.values()) {
      if (dist > maxDist) maxDist = dist;
    }

    const detachedLevel = maxDist + 1;
    const groups = new Map();

    for (const node of nodes) {
      const level = distMap.has(node.id) ? distMap.get(node.id) : detachedLevel;
      if (!groups.has(level)) groups.set(level, []);
      groups.get(level).push(node);
    }

    const targets = new Map();
    targets.set(centerId, { x: 0, y: 0 });

    const ringGap = Math.max(150, 96 + Math.sqrt(nodes.length) * 8.5);
    const seedBase = hashText(centerId);
    const levels = [...groups.keys()].sort((a, b) => a - b);

    for (const level of levels) {
      if (level === 0) continue;

      const bucket = groups
        .get(level)
        .slice()
        .sort(
          (a, b) =>
            a.col - b.col ||
            a.order - b.order ||
            a.label.localeCompare(b.label, "zh-Hant"),
        );

      const count = bucket.length;
      if (count === 0) continue;

      const radius = level === detachedLevel ? ringGap * (maxDist + 1.45) : ringGap * level;
      const startAngle = (((seedBase + level * 89) % 360) / 180) * Math.PI;

      for (let i = 0; i < count; i += 1) {
        const angle = startAngle + (i / count) * Math.PI * 2;
        const node = bucket[i];
        targets.set(node.id, {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        });
      }
    }

    return { targets, centerId };
  }

  function animateLayoutTo(targets, duration = 440) {
    if (layoutAnimFrame) {
      cancelAnimationFrame(layoutAnimFrame);
      layoutAnimFrame = null;
    }

    const starts = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);

      for (const node of nodes) {
        const start = starts.get(node.id);
        const target = targets.get(node.id) || start;
        node.x = start.x + (target.x - start.x) * eased;
        node.y = start.y + (target.y - start.y) * eased;
        node.vx = 0;
        node.vy = 0;
      }

      edgeGeometryDirty = true;
      render();

      if (t < 1) {
        layoutAnimFrame = requestAnimationFrame(step);
      } else {
        layoutAnimFrame = null;
      }
    }

    layoutAnimFrame = requestAnimationFrame(step);
  }

  function getPrimaryParentLabel(node) {
    if (!node.parents.length) return "";
    const parent = nodeMap.get(node.parents[0]);
    return parent ? parent.label : "";
  }

  function generationLabel(colIndex) {
    const column = columns[colIndex];
    if (!column) return "";
    return `${column.generation}${column.marker ? ` ${column.marker}` : ""}`.trim();
  }

  function computeFocusSet(nodeId) {
    const lineage = new Set([nodeId]);

    const upStack = [nodeId];
    while (upStack.length > 0) {
      const currentId = upStack.pop();
      const currentNode = nodeMap.get(currentId);
      if (!currentNode) continue;
      for (const parentId of currentNode.parents) {
        if (lineage.has(parentId)) continue;
        lineage.add(parentId);
        upStack.push(parentId);
      }
    }

    const downStack = [nodeId];
    while (downStack.length > 0) {
      const currentId = downStack.pop();
      const currentNode = nodeMap.get(currentId);
      if (!currentNode) continue;
      for (const childId of currentNode.children) {
        if (lineage.has(childId)) continue;
        lineage.add(childId);
        downStack.push(childId);
      }
    }

    return lineage;
  }

  function getGraphBounds() {
    if (nodes.length === 0) {
      return { minX: -120, maxX: 120, minY: -120, maxY: 120, w: 240, h: 240 };
    }

    const minX = Math.min(...nodes.map((node) => node.x - node.r - 10)) - 90;
    const maxX = Math.max(...nodes.map((node) => node.x + node.r + 10)) + 90;
    const minY = Math.min(...nodes.map((node) => node.y - node.r - 10)) - 90;
    const maxY = Math.max(...nodes.map((node) => node.y + node.r + (node.note ? 18 : 0) + 10)) + 90;

    return {
      minX,
      maxX,
      minY,
      maxY,
      w: maxX - minX,
      h: maxY - minY,
    };
  }

  function applyViewportTransform() {
    worldLayer.setAttribute("transform", `translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`);
  }

  function updateFocusInfo() {
    if (!focusInfo) return;
    if (!focusedId) {
      focusInfo.textContent = "目前：顯示全部族譜";
      return;
    }

    const focusedNode = nodeMap.get(focusedId);
    if (!focusedNode) {
      focusInfo.textContent = "目前：顯示全部族譜";
      return;
    }

    const focusSet = computeFocusSet(focusedId);
    focusInfo.textContent = `目前：已選取 ${focusedNode.label}（直系 ${Math.max(0, focusSet.size - 1)} 人）`;
  }

  function updateFocusClasses() {
    const focusSet = focusedId ? computeFocusSet(focusedId) : null;

    for (const node of nodes) {
      const element = nodeElements.get(node.id);
      if (!element) continue;
      const active = !focusSet || focusSet.has(node.id);
      const isFocused = focusedId === node.id;
      element.classList.toggle("inactive", !active);
      element.classList.toggle("focused", isFocused);
    }

    for (const edgeVisual of edgeVisuals) {
      if (!focusSet) {
        edgeVisual.group.classList.remove("inactive");
        edgeVisual.group.classList.remove("active");
        continue;
      }

      const active = focusSet.has(edgeVisual.source) && focusSet.has(edgeVisual.target);
      edgeVisual.group.classList.toggle("active", active);
      edgeVisual.group.classList.toggle("inactive", !active);
    }
  }

  function edgeEndpoints(sourceNode, targetNode) {
    const dx = targetNode.x - sourceNode.x;
    const dy = targetNode.y - sourceNode.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;

    const startX = sourceNode.x + ux * (sourceNode.r + 2);
    const startY = sourceNode.y + uy * (sourceNode.r + 2);
    const endX = targetNode.x - ux * (targetNode.r + 13);
    const endY = targetNode.y - uy * (targetNode.r + 13);

    return { startX, startY, endX, endY, dist, ux, uy };
  }

  function updateEdgeGeometry(edgeVisual) {
    const sourceNode = nodeMap.get(edgeVisual.source);
    const targetNode = nodeMap.get(edgeVisual.target);
    if (!sourceNode || !targetNode) return;

    const points = edgeEndpoints(sourceNode, targetNode);
    const perpX = -points.uy;
    const perpY = points.ux;
    const curveAmount = Math.max(10, Math.min(34, points.dist * 0.12)) * edgeVisual.curveSign;

    const ctrlX = (points.startX + points.endX) / 2 + perpX * curveAmount;
    const ctrlY = (points.startY + points.endY) / 2 + perpY * curveAmount;

    edgeVisual.line.setAttribute(
      "d",
      `M ${points.startX} ${points.startY} Q ${ctrlX} ${ctrlY} ${points.endX} ${points.endY}`,
    );

    const tanX = points.endX - ctrlX;
    const tanY = points.endY - ctrlY;
    const angleDeg = (Math.atan2(tanY, tanX) * 180) / Math.PI;
    edgeVisual.arrow.setAttribute("transform", `translate(${points.endX} ${points.endY}) rotate(${angleDeg})`);
  }

  function refreshGeometry() {
    for (const node of nodes) {
      const element = nodeElements.get(node.id);
      if (!element) continue;
      element.setAttribute("transform", `translate(${node.x} ${node.y})`);
    }

    for (const edgeVisual of edgeVisuals) {
      updateEdgeGeometry(edgeVisual);
    }

    edgeGeometryDirty = false;
  }

  function render() {
    if (edgeGeometryDirty) {
      refreshGeometry();
    }

    applyViewportTransform();
    updateFocusClasses();
  }

  function animateViewportTo(targetX, targetY, targetScale, duration = 260) {
    if (viewportAnimFrame) {
      cancelAnimationFrame(viewportAnimFrame);
      viewportAnimFrame = null;
    }

    const startX = viewport.x;
    const startY = viewport.y;
    const startScale = viewport.scale;
    const endScale = clampScale(targetScale);
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);

      viewport.x = startX + (targetX - startX) * eased;
      viewport.y = startY + (targetY - startY) * eased;
      viewport.scale = startScale + (endScale - startScale) * eased;
      render();

      if (t < 1) {
        viewportAnimFrame = requestAnimationFrame(step);
      } else {
        viewportAnimFrame = null;
      }
    }

    viewportAnimFrame = requestAnimationFrame(step);
  }

  function fitView() {
    const bounds = getGraphBounds();
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;

    viewport.scale = fitScaleForBounds(bounds);

    const worldCenterX = (bounds.minX + bounds.maxX) / 2;
    const worldCenterY = (bounds.minY + bounds.maxY) / 2;

    viewport.x = stageWidth / 2 - worldCenterX * viewport.scale;
    viewport.y = stageHeight / 2 - worldCenterY * viewport.scale;

    focusedId = null;
    updateFocusInfo();
    render();
  }

  function focusNodeById(nodeId, options = {}) {
    const { recenter = false, zoomOnCenter = false, relayoutOnFocus = true } = options;
    const node = nodeMap.get(nodeId);
    if (!node) return;

    focusedId = nodeId;

    if (recenter) {
      let focusTarget = { x: node.x, y: node.y };
      let targetScale = zoomOnCenter ? Math.max(viewport.scale, 0.72) : viewport.scale;

      if (relayoutOnFocus) {
        const layout = buildOrderedTargetsFrom(nodeId);
        if (layout) {
          const bounds = getBoundsForTargets(layout.targets);
          const fitScale = fitScaleForBounds(bounds);
          targetScale = zoomOnCenter
            ? Math.max(fitScale, Math.min(1.02, viewport.scale))
            : fitScale;
          focusTarget = layout.targets.get(nodeId) || focusTarget;
          animateLayoutTo(layout.targets, 460);
        }
      }

      const targetX = stage.clientWidth / 2 - focusTarget.x * targetScale;
      const targetY = stage.clientHeight / 2 - focusTarget.y * targetScale;
      updateFocusInfo();
      animateViewportTo(targetX, targetY, targetScale, 460);
      return;
    }

    updateFocusInfo();
    render();
  }

  function localToWorld(localX, localY) {
    return {
      x: (localX - viewport.x) / viewport.scale,
      y: (localY - viewport.y) / viewport.scale,
    };
  }

  function clientToLocal(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function zoomAtLocal(localX, localY, targetScale) {
    const world = localToWorld(localX, localY);
    viewport.scale = clampScale(targetScale);
    viewport.x = localX - world.x * viewport.scale;
    viewport.y = localY - world.y * viewport.scale;
    render();
  }

  function zoomAtCenter(factor) {
    zoomAtLocal(stage.clientWidth / 2, stage.clientHeight / 2, viewport.scale * factor);
  }

  function zoomAtClient(clientX, clientY, targetScale) {
    const local = clientToLocal(clientX, clientY);
    zoomAtLocal(local.x, local.y, targetScale);
  }

  function renderSearchResults(keyword) {
    if (!searchResults) return;
    searchResults.innerHTML = "";

    if (!keyword) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "請輸入姓名關鍵字。";
      searchResults.appendChild(empty);
      return;
    }

    const normalized = keyword.toLocaleLowerCase();
    const matchedNodes = nodes
      .filter((node) => node.label.toLocaleLowerCase().includes(normalized))
      .sort(
        (a, b) =>
          a.label.localeCompare(b.label, "zh-Hant") ||
          a.col - b.col ||
          a.order - b.order,
      )
      .slice(0, 120);

    if (matchedNodes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "找不到符合的姓名。";
      searchResults.appendChild(empty);
      return;
    }

    for (const node of matchedNodes) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "search-item";

      const title = document.createElement("strong");
      title.textContent = node.label;

      const info = document.createElement("small");
      const parentLabel = getPrimaryParentLabel(node);
      info.textContent = parentLabel
        ? `${generationLabel(node.col)} ｜上代：${parentLabel}`
        : generationLabel(node.col);

      item.appendChild(title);
      item.appendChild(info);

      item.addEventListener("click", () => {
        focusNodeById(node.id, { recenter: true, zoomOnCenter: true });
      });

      searchResults.appendChild(item);
    }
  }

  const activePointers = new Map();
  let pointerStart = null;
  let pressedNodeId = null;
  let pressedBlank = false;
  let isPanning = false;
  let panAnchor = null;
  let pinchState = null;
  let dragNodeId = null;
  let dragOffsetWorld = { x: 0, y: 0 };
  let movedSinceDown = false;

  function pointerDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clearInteractionFlags() {
    pointerStart = null;
    pressedNodeId = null;
    pressedBlank = false;
    isPanning = false;
    panAnchor = null;
    dragNodeId = null;
    movedSinceDown = false;
    svg.classList.remove("is-panning");
  }

  function startPinchIfReady() {
    if (activePointers.size < 2) return;

    const points = [...activePointers.values()];
    const pointA = points[0];
    const pointB = points[1];

    const centerClientX = (pointA.x + pointB.x) / 2;
    const centerClientY = (pointA.y + pointB.y) / 2;
    const centerLocal = clientToLocal(centerClientX, centerClientY);

    pinchState = {
      startDist: Math.max(1, pointerDistance(pointA, pointB)),
      startScale: viewport.scale,
      startWorld: localToWorld(centerLocal.x, centerLocal.y),
    };

    clearInteractionFlags();
  }

  svg.addEventListener("pointerdown", (event) => {
    cancelAllAnimations();
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    svg.setPointerCapture(event.pointerId);

    pointerStart = { x: event.clientX, y: event.clientY };
    movedSinceDown = false;

    startPinchIfReady();
    if (pinchState) return;

    const nodeElement = event.target.closest(".graph-node");
    const local = clientToLocal(event.clientX, event.clientY);

    if (nodeElement) {
      const nodeId = nodeElement.getAttribute("data-id") || "";
      const node = nodeMap.get(nodeId);
      if (!node) return;

      pressedNodeId = nodeId;
      dragNodeId = nodeId;
      pressedBlank = false;
      isPanning = false;
      panAnchor = null;

      const worldPoint = localToWorld(local.x, local.y);
      dragOffsetWorld = {
        x: worldPoint.x - node.x,
        y: worldPoint.y - node.y,
      };

      return;
    }

    pressedNodeId = null;
    dragNodeId = null;
    pressedBlank = true;
    isPanning = true;
    panAnchor = {
      x: local.x - viewport.x,
      y: local.y - viewport.y,
    };
    svg.classList.add("is-panning");
  });

  svg.addEventListener("pointermove", (event) => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pinchState && activePointers.size >= 2) {
      const points = [...activePointers.values()];
      const pointA = points[0];
      const pointB = points[1];

      const centerClientX = (pointA.x + pointB.x) / 2;
      const centerClientY = (pointA.y + pointB.y) / 2;
      const centerLocal = clientToLocal(centerClientX, centerClientY);
      const currentDist = Math.max(1, pointerDistance(pointA, pointB));

      viewport.scale = clampScale(pinchState.startScale * (currentDist / pinchState.startDist));
      viewport.x = centerLocal.x - pinchState.startWorld.x * viewport.scale;
      viewport.y = centerLocal.y - pinchState.startWorld.y * viewport.scale;

      render();
      return;
    }

    if (dragNodeId) {
      const movedDistance = pointerStart
        ? Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
        : 0;
      if (movedDistance > 4) {
        movedSinceDown = true;
      }

      if (movedSinceDown) {
        const node = nodeMap.get(dragNodeId);
        if (!node) return;

        const local = clientToLocal(event.clientX, event.clientY);
        const worldPoint = localToWorld(local.x, local.y);

        node.x = worldPoint.x - dragOffsetWorld.x;
        node.y = worldPoint.y - dragOffsetWorld.y;

        edgeGeometryDirty = true;
        render();
      }
      return;
    }

    if (isPanning && panAnchor) {
      const local = clientToLocal(event.clientX, event.clientY);
      viewport.x = local.x - panAnchor.x;
      viewport.y = local.y - panAnchor.y;
      render();
    }
  });

  svg.addEventListener("pointerup", (event) => {
    activePointers.delete(event.pointerId);

    if (pinchState && activePointers.size < 2) {
      pinchState = null;
      clearInteractionFlags();
      return;
    }

    const movedDistance = pointerStart
      ? Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
      : 0;
    const moved = movedSinceDown || movedDistance > 6;

    if (!moved && pressedNodeId) {
      focusNodeById(pressedNodeId, { recenter: true, zoomOnCenter: false });
    } else if (!moved && pressedBlank) {
      focusedId = null;
      updateFocusInfo();
      render();
    }

    clearInteractionFlags();
  });

  svg.addEventListener("pointercancel", (event) => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) {
      pinchState = null;
    }
    clearInteractionFlags();
  });

  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      zoomAtClient(event.clientX, event.clientY, viewport.scale * factor);
    },
    { passive: false },
  );

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderSearchResults(searchInput.value.trim());
    });

    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const firstResult = searchResults?.querySelector(".search-item");
      if (!firstResult) return;
      firstResult.click();
      event.preventDefault();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      fitView();
    });
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      zoomAtCenter(1.12);
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      zoomAtCenter(0.88);
    });
  }

  window.addEventListener("resize", () => {
    render();
  });

  fitView();
  renderSearchResults("");
})();

