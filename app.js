(() => {
  const stage = document.getElementById("graphStage");
  const graphCanvas = document.getElementById("graphCanvas");
  const focusInfo = document.getElementById("focusInfo");
  const resetBtn = document.getElementById("resetBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  const versionBadge = document.getElementById("versionBadge");

  const APP_VERSION = "v2026.03.07-09";

  if (versionBadge) {
    versionBadge.textContent = `版本 ${APP_VERSION}`;
  }
  document.title = `林氏忠孝堂族譜 ${APP_VERSION}`;
  console.info(`[Linfamily] ${APP_VERSION}`);

  if (!stage || !graphCanvas) {
    return;
  }

  if (typeof window.cytoscape !== "function") {
    if (focusInfo) {
      focusInfo.textContent = "目前：圖形引擎載入失敗（請確認網路可連到 Cytoscape CDN）";
    }
    return;
  }

  const NODE_TONES = [
    { fill: "#16273b", ring: "#7ce8ca" },
    { fill: "#1d2a40", ring: "#81baff" },
    { fill: "#242947", ring: "#b9a4ff" },
    { fill: "#1f3640", ring: "#83e8ff" },
    { fill: "#253145", ring: "#a2e8c8" },
  ];

  const MIN_ZOOM = 0.08;
  const MAX_ZOOM = 2.8;

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

  const tableRows = rawRows
    .map((row) => {
      const cells = Array.isArray(row) ? row : [];
      return columns.map((_, index) => cleanCell(cells[index]));
    })
    .filter((row) => row.some((value) => Boolean(value)));

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
        size: 70,
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
  const maxGenerationCol = Math.max(1, ...nodes.map((node) => node.col));

  if (nodes.length === 0) {
    if (focusInfo) {
      focusInfo.textContent = "目前：找不到可顯示的族譜資料";
    }
    return;
  }

  function toneForCol(col) {
    return NODE_TONES[Math.abs(col) % NODE_TONES.length];
  }

  function edgeToneForGeneration(col) {
    const ratio = Math.max(0, Math.min(1, col / maxGenerationCol));
    const hue = Math.round(28 + ratio * 198);
    const sat = Math.round(76 - ratio * 34);
    const light = Math.round(40 + ratio * 36);
    const baseAlpha = 0.86 - ratio * 0.3;

    return {
      line: `hsla(${hue}, ${sat}%, ${light}%, ${baseAlpha.toFixed(3)})`,
      arrow: `hsla(${hue}, ${Math.max(30, sat - 6)}%, ${Math.min(88, light + 6)}%, ${(baseAlpha + 0.06).toFixed(3)})`,
      activeLine: `hsla(${hue}, ${Math.max(24, sat - 10)}%, ${Math.min(92, light + 20)}%, 0.98)`,
      activeArrow: `hsla(${hue}, ${Math.max(22, sat - 12)}%, ${Math.min(94, light + 24)}%, 0.99)`,
    };
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
    const labelSizeBonus = Math.min(22, Math.ceil(node.label.length * 2.2));
    const degreeBonus = Math.min(26, degree * 2);
    const noteBonus = node.note ? 10 : 0;
    node.size = Math.max(62, Math.min(112, 52 + labelSizeBonus + degreeBonus + noteBonus));
  }

  const neighborMap = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const edge of edges) {
    neighborMap.get(edge.source)?.add(edge.target);
    neighborMap.get(edge.target)?.add(edge.source);
  }

  function generationLabel(colIndex) {
    const column = columns[colIndex];
    if (!column) return "";
    return `${column.generation}${column.marker ? ` ${column.marker}` : ""}`.trim();
  }

  const cyElements = [];

  for (const node of nodes) {
    const tone = toneForCol(node.col);
    cyElements.push({
      group: "nodes",
      data: {
        id: node.id,
        label: node.label,
        note: node.note,
        displayLabel: node.note ? `${node.label}\n${node.note}` : node.label,
        col: node.col,
        order: node.order,
        size: node.size,
        fill: tone.fill,
        ring: tone.ring,
      },
    });
  }

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    const generationCol = sourceNode && targetNode ? Math.min(sourceNode.col, targetNode.col) : 0;
    const edgeTone = edgeToneForGeneration(generationCol);

    cyElements.push({
      group: "edges",
      data: {
        id: `${edge.source}->${edge.target}`,
        source: edge.source,
        target: edge.target,
        col: generationCol,
        lineColor: edgeTone.line,
        arrowColor: edgeTone.arrow,
        lineColorActive: edgeTone.activeLine,
        arrowColorActive: edgeTone.activeArrow,
      },
    });
  }

  const cy = window.cytoscape({
    container: graphCanvas,
    elements: cyElements,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    wheelSensitivity: 0.2,
    selectionType: "single",
    style: [
      {
        selector: "node",
        style: {
          label: "data(displayLabel)",
          shape: "ellipse",
          width: "data(size)",
          height: "data(size)",
          "background-color": "data(fill)",
          "border-color": "data(ring)",
          "border-width": 2,
          color: "#f4fffb",
          "font-size": 13,
          "font-weight": 650,
          "text-wrap": "wrap",
          "text-max-width": 96,
          "text-valign": "center",
          "text-halign": "center",
          "text-outline-width": 0,
          "overlay-opacity": 0,
          "transition-property": "opacity, border-width, border-color, background-color",
          "transition-duration": "180ms",
        },
      },
      {
        selector: "edge",
        style: {
          width: 2,
          "curve-style": "bezier",
          "line-color": "data(lineColor)",
          "target-arrow-color": "data(arrowColor)",
          "target-arrow-shape": "vee",
          "arrow-scale": 0.95,
          opacity: 0.93,
          "overlay-opacity": 0,
          "transition-property": "opacity, line-color, target-arrow-color",
          "transition-duration": "180ms",
        },
      },
      {
        selector: "node.lineage",
        style: {
          "border-width": 3,
          "border-color": "#d6fff0",
        },
      },
      {
        selector: "node.focused",
        style: {
          "border-width": 4,
          "border-color": "#ffffff",
          "background-color": "#214463",
        },
      },
      {
        selector: "node.inactive",
        style: {
          opacity: 0.2,
        },
      },
      {
        selector: "edge.active",
        style: {
          "line-color": "data(lineColorActive)",
          "target-arrow-color": "data(arrowColorActive)",
          opacity: 1,
          width: 2.4,
        },
      },
      {
        selector: "edge.inactive",
        style: {
          opacity: 0.12,
        },
      },
    ],
  });

  let focusedId = null;

  function collectionFromIds(ids) {
    let collection = cy.collection();
    for (const id of ids) {
      const ele = cy.getElementById(id);
      if (ele && ele.length > 0) {
        collection = collection.union(ele);
      }
    }
    return collection;
  }

  function computeLineageSet(nodeId) {
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

  function connectedComponentIds(startId) {
    const visited = new Set([startId]);
    const queue = [startId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      const neighbors = neighborMap.get(currentId);
      if (!neighbors) continue;

      for (const nextId of neighbors) {
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        queue.push(nextId);
      }
    }

    return visited;
  }

  function topRootsInComponent(componentIds) {
    const roots = [];

    for (const nodeId of componentIds) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const hasParentInComponent = node.parents.some((parentId) => componentIds.has(parentId));
      if (!hasParentInComponent) {
        roots.push(nodeId);
      }
    }

    if (roots.length > 0) {
      roots.sort((a, b) => {
        const na = nodeMap.get(a);
        const nb = nodeMap.get(b);
        return na.col - nb.col || na.order - nb.order;
      });
      return roots;
    }

    const fallback = [...componentIds].sort((a, b) => {
      const na = nodeMap.get(a);
      const nb = nodeMap.get(b);
      return na.col - nb.col || na.order - nb.order;
    });
    return fallback.slice(0, 1);
  }

  function placeDetachedNodes(componentIds, duration = 0) {
    const detachedNodes = nodes
      .filter((node) => !componentIds.has(node.id))
      .sort((a, b) => a.col - b.col || a.order - b.order);

    if (detachedNodes.length === 0) return;

    const componentCollection = collectionFromIds(componentIds);
    const bb = componentCollection.length > 0
      ? componentCollection.boundingBox({ includeLabels: true })
      : { x1: -320, x2: 320, y1: -180 };

    const sideBaseX = Math.max(440, (bb.x2 - bb.x1) / 2 + 280);
    const sideStepX = 92;
    const rowGap = 116;

    for (let i = 0; i < detachedNodes.length; i += 1) {
      const node = detachedNodes[i];
      const ele = cy.getElementById(node.id);
      if (!ele || ele.length === 0) continue;

      const lane = Math.floor(i / 2);
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (sideBaseX + lane * sideStepX);
      const y = (node.col - 1) * rowGap + ((lane % 3) - 1) * 24;

      if (duration > 0) {
        ele.animate({ position: { x, y } }, { duration, easing: "ease-out-cubic" });
      } else {
        ele.position({ x, y });
      }
    }
  }

  function updateFocusInfo(lineageSize = 0) {
    if (!focusInfo) return;

    if (!focusedId) {
      focusInfo.textContent = "目前：顯示全部族譜";
      return;
    }

    const node = nodeMap.get(focusedId);
    if (!node) {
      focusInfo.textContent = "目前：顯示全部族譜";
      return;
    }

    focusInfo.textContent = `目前：已選取 ${node.label}（直系 ${Math.max(0, lineageSize - 1)} 人）`;
  }

  function clearFocusVisualOnly() {
    focusedId = null;
    cy.nodes().removeClass("focused lineage inactive");
    cy.edges().removeClass("active inactive");
    updateFocusInfo();
  }

  function runGlobalLayout(animate) {
    const rootIds = nodes
      .filter((node) => node.parents.length === 0)
      .sort((a, b) => a.col - b.col || a.order - b.order)
      .map((node) => node.id);

    const roots = collectionFromIds(rootIds.length > 0 ? rootIds : [nodes[0].id]);

    const layout = cy.layout({
      name: "breadthfirst",
      directed: true,
      roots,
      padding: 80,
      spacingFactor: 1.12,
      avoidOverlap: true,
      animate,
      animationDuration: animate ? 560 : 0,
      sort: (a, b) => {
        const colDelta = a.data("col") - b.data("col");
        if (colDelta !== 0) return colDelta;
        return a.data("order") - b.data("order");
      },
    });

    layout.on("layoutstop", () => {
      if (animate) {
        cy.animate(
          { fit: { eles: cy.elements(), padding: 90 } },
          { duration: 460, easing: "ease-out-cubic" },
        );
      } else {
        cy.fit(cy.elements(), 90);
      }
    });

    layout.run();
  }

  function runFocusLayout(nodeId) {
    const componentIds = connectedComponentIds(nodeId);
    const componentNodes = collectionFromIds(componentIds);
    const roots = collectionFromIds(topRootsInComponent(componentIds));

    const layout = componentNodes.layout({
      name: "breadthfirst",
      directed: true,
      roots,
      padding: 70,
      spacingFactor: 1.1,
      avoidOverlap: true,
      animate: true,
      animationDuration: 540,
      sort: (a, b) => {
        const colDelta = a.data("col") - b.data("col");
        if (colDelta !== 0) return colDelta;
        return a.data("order") - b.data("order");
      },
    });

    layout.on("layoutstop", () => {
      placeDetachedNodes(componentIds, 420);
      cy.animate(
        { fit: { eles: componentNodes, padding: 96 } },
        { duration: 480, easing: "ease-out-cubic" },
      );
    });

    layout.run();
  }

  function applyFocus(nodeId, relayout = true) {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    focusedId = nodeId;
    const lineageSet = computeLineageSet(nodeId);

    cy.nodes().forEach((n) => {
      const id = n.id();
      if (lineageSet.has(id)) {
        n.removeClass("inactive");
        n.addClass("lineage");
      } else {
        n.removeClass("lineage");
        n.addClass("inactive");
      }
    });

    cy.edges().forEach((edge) => {
      const active = lineageSet.has(edge.data("source")) && lineageSet.has(edge.data("target"));
      edge.toggleClass("active", active);
      edge.toggleClass("inactive", !active);
    });

    const focusedNodeEle = cy.getElementById(nodeId);
    cy.nodes().removeClass("focused");
    focusedNodeEle.addClass("focused");

    updateFocusInfo(lineageSet.size);

    if (relayout) {
      runFocusLayout(nodeId);
    } else {
      cy.animate(
        { fit: { eles: focusedNodeEle, padding: 160 } },
        { duration: 280, easing: "ease-out-cubic" },
      );
    }
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
      const parentLabel = node.parents.length > 0 ? nodeMap.get(node.parents[0])?.label || "" : "";
      info.textContent = parentLabel
        ? `${generationLabel(node.col)} ｜上代：${parentLabel}`
        : generationLabel(node.col);

      item.appendChild(title);
      item.appendChild(info);

      item.addEventListener("click", () => {
        applyFocus(node.id, true);
      });

      searchResults.appendChild(item);
    }
  }

  function animateZoomBy(factor) {
    const rect = stage.getBoundingClientRect();
    const center = { x: rect.width / 2, y: rect.height / 2 };

    const oldZoom = cy.zoom();
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));
    const pan = cy.pan();

    const worldX = (center.x - pan.x) / oldZoom;
    const worldY = (center.y - pan.y) / oldZoom;

    const nextPan = {
      x: center.x - worldX * nextZoom,
      y: center.y - worldY * nextZoom,
    };

    cy.animate(
      { zoom: nextZoom, pan: nextPan },
      { duration: 220, easing: "ease-out-cubic" },
    );
  }

  cy.on("tap", "node", (event) => {
    const nodeId = event.target.id();
    applyFocus(nodeId, true);
  });

  cy.on("tap", (event) => {
    if (event.target !== cy) return;
    clearFocusVisualOnly();
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      clearFocusVisualOnly();
      runGlobalLayout(true);
    });
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      animateZoomBy(1.14);
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      animateZoomBy(0.88);
    });
  }

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

  runGlobalLayout(false);
  renderSearchResults("");
})();
