(() => {
  const stage = document.getElementById("graphStage");
  const svg = document.getElementById("graphSvg");
  const worldLayer = document.getElementById("worldLayer");
  const columnLayer = document.getElementById("columnLayer");
  const edgeLayer = document.getElementById("edgeLayer");
  const nodeLayer = document.getElementById("nodeLayer");
  const generationOverlay = document.getElementById("generationOverlay");

  const focusInfo = document.getElementById("focusInfo");
  const resetBtn = document.getElementById("resetBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");

  if (
    !stage ||
    !svg ||
    !worldLayer ||
    !columnLayer ||
    !edgeLayer ||
    !nodeLayer ||
    !generationOverlay
  ) {
    return;
  }

  const HEADER_HEIGHT = 0;
  const COL_GAP = 250;
  const ROW_GAP = 90;
  const MIN_SCALE = 0.08;
  const MAX_SCALE = 2.4;

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
        x: 0,
        y: null,
        w: 100,
        h: 44,
        order: nodeOrder,
        parents: [],
        children: [],
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
  }

  function sortChildIds(aId, bId) {
    const a = nodeMap.get(aId);
    const b = nodeMap.get(bId);
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    if (a.col !== b.col) return a.col - b.col;
    return a.order - b.order;
  }

  let leafIndex = 0;

  function placeFrom(nodeId, visiting = new Set()) {
    const node = nodeMap.get(nodeId);
    if (!node) return 0;
    if (typeof node.y === "number") return node.y;
    if (visiting.has(nodeId)) return 0;

    visiting.add(nodeId);

    if (node.children.length === 0) {
      node.y = leafIndex * ROW_GAP;
      leafIndex += 1;
      visiting.delete(nodeId);
      return node.y;
    }

    const childYs = node.children
      .slice()
      .sort(sortChildIds)
      .map((childId) => placeFrom(childId, visiting));

    node.y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
    visiting.delete(nodeId);
    return node.y;
  }

  const roots = nodes
    .filter((node) => node.parents.length === 0)
    .sort((a, b) => a.order - b.order);

  for (const root of roots) {
    placeFrom(root.id, new Set());
  }

  for (const node of nodes) {
    if (typeof node.y !== "number") {
      node.y = leafIndex * ROW_GAP;
      leafIndex += 1;
    }
    node.x = node.col * COL_GAP;
  }

  if (nodes.length > 0) {
    const ys = nodes.map((node) => node.y);
    const middleY = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const node of nodes) {
      node.y -= middleY;
    }
  }

  function estimateCharacterWidth(text) {
    let total = 0;
    for (const char of text) {
      const code = char.codePointAt(0) || 0;
      if (code <= 0x007f) total += 0.56;
      else if (code <= 0x02ff) total += 0.65;
      else total += 1.0;
    }
    return total;
  }

  function estimateTextWidth(text, fontSize) {
    return Math.ceil(estimateCharacterWidth(text) * fontSize);
  }

  for (const node of nodes) {
    const nameWidth = estimateTextWidth(node.label, 16) + 34;
    const noteWidth = node.note ? estimateTextWidth(node.note, 11) + 26 : 0;
    node.w = Math.max(94, Math.min(220, Math.max(nameWidth, noteWidth)));
    node.h = node.note ? 64 : 44;
  }

  function createSvgElement(tagName, attrs = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === undefined || value === null) continue;
      element.setAttribute(name, String(value));
    }
    return element;
  }

  function buildEdgePath(sourceNode, targetNode) {
    const sx = sourceNode.x + sourceNode.w / 2;
    const sy = sourceNode.y;
    const tx = targetNode.x - targetNode.w / 2;
    const ty = targetNode.y;

    const curve = Math.max(56, Math.min(180, (tx - sx) * 0.45));
    return `M ${sx} ${sy} C ${sx + curve} ${sy}, ${tx - curve} ${ty}, ${tx} ${ty}`;
  }

  const nodeElements = new Map();
  const edgeElements = [];
  const columnLineElements = [];
  const generationLabels = [];

  for (let col = 0; col < columns.length; col += 1) {
    const line = createSvgElement("line", {
      class: "column-guide",
      x1: col * COL_GAP,
      x2: col * COL_GAP,
      y1: -100,
      y2: 100,
    });
    columnLayer.appendChild(line);
    columnLineElements.push(line);

    const label = document.createElement("div");
    label.className = "generation-label";

    const generationSpan = document.createElement("span");
    generationSpan.className = "generation-index";
    generationSpan.textContent = columns[col].generation || `第${col}世`;
    label.appendChild(generationSpan);

    if (columns[col].marker) {
      const markerSpan = document.createElement("span");
      markerSpan.className = "generation-marker";
      markerSpan.textContent = columns[col].marker;
      label.appendChild(markerSpan);
    }

    generationOverlay.appendChild(label);
    generationLabels.push(label);
  }

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const path = createSvgElement("path", {
      class: "graph-edge",
      d: buildEdgePath(sourceNode, targetNode),
      "data-source": edge.source,
      "data-target": edge.target,
    });

    edgeLayer.appendChild(path);
    edgeElements.push(path);
  }

  for (const node of nodes) {
    const group = createSvgElement("g", {
      class: "graph-node",
      "data-id": node.id,
      transform: `translate(${node.x} ${node.y})`,
    });

    const rect = createSvgElement("rect", {
      x: -node.w / 2,
      y: -node.h / 2,
      width: node.w,
      height: node.h,
      rx: 12,
      ry: 12,
    });

    const nameText = createSvgElement("text", {
      class: "name",
      x: 0,
      y: node.note ? -8 : 5,
    });
    nameText.textContent = node.label;

    group.appendChild(rect);
    group.appendChild(nameText);

    if (node.note) {
      const noteText = createSvgElement("text", {
        class: "note",
        x: 0,
        y: 15,
      });
      noteText.textContent = node.note;
      group.appendChild(noteText);
    }

    nodeLayer.appendChild(group);
    nodeElements.set(node.id, group);
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

    const minX = Math.min(...nodes.map((node) => node.x - node.w / 2)) - 120;
    const maxX = Math.max(...nodes.map((node) => node.x + node.w / 2)) + 140;
    const minY = Math.min(...nodes.map((node) => node.y - node.h / 2)) - 120;
    const maxY = Math.max(...nodes.map((node) => node.y + node.h / 2)) + 120;

    return {
      minX,
      maxX,
      minY,
      maxY,
      w: maxX - minX,
      h: maxY - minY,
    };
  }

  const viewport = {
    x: 0,
    y: 0,
    scale: 1,
  };

  let focusedId = null;
  let viewportAnimFrame = null;

  function clampScale(scale) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
  }

  function applyViewportTransform() {
    worldLayer.setAttribute("transform", `translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`);
  }

  function updateColumnAndHeaderPositions() {
    const topWorld = (HEADER_HEIGHT - viewport.y) / viewport.scale;
    const bottomWorld = topWorld + stage.clientHeight / viewport.scale + 120;

    for (let col = 0; col < columnLineElements.length; col += 1) {
      const x = col * COL_GAP;
      const line = columnLineElements[col];
      line.setAttribute("x1", String(x));
      line.setAttribute("x2", String(x));
      line.setAttribute("y1", String(topWorld));
      line.setAttribute("y2", String(bottomWorld));
    }

    const width = stage.clientWidth;
    for (let col = 0; col < generationLabels.length; col += 1) {
      const screenX = col * COL_GAP * viewport.scale + viewport.x;
      const label = generationLabels[col];

      if (screenX < -130 || screenX > width + 130) {
        label.style.display = "none";
        continue;
      }

      label.style.display = "flex";
      label.style.left = `${screenX}px`;
    }
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

    for (const edgePath of edgeElements) {
      const sourceId = edgePath.getAttribute("data-source") || "";
      const targetId = edgePath.getAttribute("data-target") || "";
      const active = !focusSet || (focusSet.has(sourceId) && focusSet.has(targetId));
      edgePath.classList.toggle("inactive", !active);
    }
  }

  function render() {
    applyViewportTransform();
    updateColumnAndHeaderPositions();
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
    const drawableWidth = Math.max(40, stageWidth - 72);
    const drawableHeight = Math.max(40, stageHeight - HEADER_HEIGHT - 36);

    const scaleX = drawableWidth / bounds.w;
    const scaleY = drawableHeight / bounds.h;

    viewport.scale = clampScale(Math.min(scaleX, scaleY));

    const worldCenterX = (bounds.minX + bounds.maxX) / 2;
    const worldCenterY = (bounds.minY + bounds.maxY) / 2;

    const screenCenterX = stageWidth / 2;
    const screenCenterY = HEADER_HEIGHT + drawableHeight / 2;

    viewport.x = screenCenterX - worldCenterX * viewport.scale;
    viewport.y = screenCenterY - worldCenterY * viewport.scale;

    focusedId = null;
    updateFocusInfo();
    render();
  }

  function focusNodeById(nodeId, options = {}) {
    const { recenter = false, zoomOnCenter = false } = options;
    const node = nodeMap.get(nodeId);
    if (!node) return;

    focusedId = nodeId;

    if (recenter) {
      const targetScale = zoomOnCenter ? Math.max(viewport.scale, 0.62) : viewport.scale;
      const targetX = stage.clientWidth / 2 - node.x * targetScale;
      const targetY = stage.clientHeight / 2 - node.y * targetScale;
      updateFocusInfo();
      animateViewportTo(targetX, targetY, targetScale);
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

  function pointerDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
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

    pressedNodeId = null;
    pressedBlank = false;
    isPanning = false;
    panAnchor = null;
    svg.classList.remove("is-panning");
  }

  svg.addEventListener("pointerdown", (event) => {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    svg.setPointerCapture(event.pointerId);

    pointerStart = { x: event.clientX, y: event.clientY };
    startPinchIfReady();
    if (pinchState) return;

    const nodeElement = event.target.closest(".graph-node");

    if (nodeElement) {
      pressedNodeId = nodeElement.getAttribute("data-id");
      pressedBlank = false;
      isPanning = false;
      panAnchor = null;
      return;
    }

    pressedNodeId = null;
    pressedBlank = true;
    isPanning = true;

    const local = clientToLocal(event.clientX, event.clientY);
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

    if (isPanning && panAnchor) {
      const local = clientToLocal(event.clientX, event.clientY);
      viewport.x = local.x - panAnchor.x;
      viewport.y = local.y - panAnchor.y;
      render();
    }
  });

  function clearPointerInteraction() {
    pointerStart = null;
    pressedNodeId = null;
    pressedBlank = false;
    isPanning = false;
    panAnchor = null;
    svg.classList.remove("is-panning");
  }

  svg.addEventListener("pointerup", (event) => {
    activePointers.delete(event.pointerId);

    if (pinchState && activePointers.size < 2) {
      pinchState = null;
      clearPointerInteraction();
      return;
    }

    const moved =
      pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6;

    if (!moved && pressedNodeId) {
      focusNodeById(pressedNodeId, { recenter: true, zoomOnCenter: false });
    } else if (!moved && pressedBlank) {
      focusedId = null;
      updateFocusInfo();
      render();
    }

    clearPointerInteraction();
  });

  svg.addEventListener("pointercancel", (event) => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) pinchState = null;
    clearPointerInteraction();
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


