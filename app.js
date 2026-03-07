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
  const familyModeBtn = document.getElementById("familyModeBtn");
  const fullModeBtn = document.getElementById("fullModeBtn");
  const sideBranchToggle = document.getElementById("sideBranchToggle");
  const familyTreeBtn = document.getElementById("familyTreeBtn");
  const familyRadialBtn = document.getElementById("familyRadialBtn");
  const autoZoomToggle = document.getElementById("autoZoomToggle");
  const fullCollapseToggle = document.getElementById("fullCollapseToggle");

  const APP_VERSION = "v2026.03.07-31";

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

  const dagreReady = typeof window.cytoscapeDagre === "function" && typeof window.dagre !== "undefined";
  if (dagreReady) {
    window.cytoscape.use(window.cytoscapeDagre);
  }


  const NODE_TONES = [
    { fill: "#16273b", ring: "#7ce8ca" },
    { fill: "#1d2a40", ring: "#81baff" },
    { fill: "#242947", ring: "#b9a4ff" },
    { fill: "#1f3640", ring: "#83e8ff" },
    { fill: "#253145", ring: "#a2e8c8" },
  ];

  const FAMILY_UP_DEPTH = 3;
  const FAMILY_DOWN_DEPTH = 3;
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

  function buildEdgeRouteMap() {
    const sourceChildIndexMap = new Map();
    for (const node of nodes) {
      const sortedChildren = node.children
        .map((childId) => nodeById(childId))
        .filter((child) => Boolean(child))
        .sort((a, b) => a.col - b.col || a.order - b.order);
      const indexByChild = new Map();
      sortedChildren.forEach((childNode, idx) => {
        indexByChild.set(childNode.id, idx);
      });
      sourceChildIndexMap.set(node.id, {
        count: sortedChildren.length,
        indexByChild,
      });
    }
    const targetParentIndexMap = new Map();
    for (const node of nodes) {
      const sortedParents = node.parents
        .map((parentId) => nodeById(parentId))
        .filter((parent) => Boolean(parent))
        .sort((a, b) => a.col - b.col || a.order - b.order);
      const indexByParent = new Map();
      sortedParents.forEach((parentNode, idx) => {
        indexByParent.set(parentNode.id, idx);
      });
      targetParentIndexMap.set(node.id, {
        count: sortedParents.length,
        indexByParent,
      });
    }
    const edgeLaneMap = new Map();
    for (const edge of edges) {
      const srcRoute = sourceChildIndexMap.get(edge.source);
      const srcCount = srcRoute ? srcRoute.count : 1;
      const srcIdx = srcRoute ? (srcRoute.indexByChild.get(edge.target) ?? 0) : 0;
      const srcCenter = (srcCount - 1) / 2;
      const srcLane = srcIdx - srcCenter;
      const tgtRoute = targetParentIndexMap.get(edge.target);
      const tgtCount = tgtRoute ? tgtRoute.count : 1;
      const tgtIdx = tgtRoute ? (tgtRoute.indexByParent.get(edge.source) ?? 0) : 0;
      const tgtCenter = (tgtCount - 1) / 2;
      const tgtLane = tgtIdx - tgtCenter;
      let lane = srcLane + tgtLane * 0.65;
      if (Math.abs(lane) < 0.05 && (srcCount > 1 || tgtCount > 1)) {
        lane = srcLane !== 0 ? srcLane : tgtLane;
      }
      edgeLaneMap.set(`${edge.source}->${edge.target}`, lane);
    }
    return { sourceChildIndexMap, targetParentIndexMap, edgeLaneMap };
  }
  const edgeRouteMap = buildEdgeRouteMap();

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

    const baseLane = edgeRouteMap.edgeLaneMap.get(`${edge.source}->${edge.target}`) || 0;
    let routeOffset = Math.round(baseLane * 24);
    routeOffset = Math.max(-180, Math.min(180, routeOffset));

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
        cpDistances: `${routeOffset} ${routeOffset}`,
        cpWeights: "0.28 0.72",
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
    boxSelectionEnabled: false,
    autounselectify: true,
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
        selector: "node:selected",
        style: {
          "border-width": 2,
          "border-color": "data(ring)",
          "overlay-opacity": 0,
          "underlay-opacity": 0,
        },
      },
      {
        selector: "edge:selected",
        style: {
          "overlay-opacity": 0,
          "underlay-opacity": 0,
        },
      },
      {
        selector: "edge",
        style: {
          width: 2,
          "curve-style": "straight",
          "control-point-distances": "data(cpDistances)",
          "control-point-weights": "data(cpWeights)",
          "source-endpoint": "outside-to-node",
          "target-endpoint": "outside-to-node",
          "line-color": "data(lineColor)",
          "target-arrow-color": "data(arrowColor)",
          "target-arrow-shape": "vee",
          "arrow-scale": 0.95,
          opacity: 0.92,
          "overlay-opacity": 0,
          "transition-property": "opacity, line-color, target-arrow-color",
          "transition-duration": "180ms",
        },
      },
      {
        selector: "node.mode-hidden, edge.mode-hidden",
        style: {
          display: "none",
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
          opacity: 0.3,
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
          opacity: 0.16,
        },
      },
    ],
  });

  let viewMode = "family";
  let includeSideBranches = false;
  let autoZoomOnFocus = true;
  let collapseMinorInFull = true;
  let focusedId = null;
  let familyCenterId = null;
  let dragCascadeState = null;

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

  function edgeCollectionFromIds(ids) {
    let collection = cy.collection();
    for (const id of ids) {
      const ele = cy.getElementById(id);
      if (ele && ele.length > 0) {
        collection = collection.union(ele);
      }
    }
    return collection;
  }

  function buildFocusCollection(centerId, nodeIdSet, lineageSet) {
    if (!centerId) return cy.collection();

    const focusIds = new Set();
    const addNode = (id) => {
      if (!id) return;
      if (nodeIdSet && !nodeIdSet.has(id)) return;
      focusIds.add(id);
    };

    addNode(centerId);
    const centerNode = nodeById(centerId);
    if (centerNode) {
      for (const parentId of centerNode.parents) addNode(parentId);
      for (const childId of centerNode.children) addNode(childId);
    }

    if (lineageSet && lineageSet.size > 0) {
      for (const lineageId of lineageSet) {
        addNode(lineageId);
        if (focusIds.size >= 28) break;
      }
    }

    return collectionFromIds(focusIds);
  }

  function applyFocusViewport(centerId, nodeIdSet, lineageSet, fitPadding, animate, fallbackEles) {
    if (!centerId) return;

    const centerEle = cy.getElementById(centerId);
    if (!centerEle || centerEle.length === 0) return;

    const focusCollection = buildFocusCollection(centerId, nodeIdSet, lineageSet);
    const targetEles = focusCollection.length > 0
      ? focusCollection
      : (fallbackEles && fallbackEles.length > 0 ? fallbackEles : centerEle);
    const focusPadding = Math.max(56, fitPadding - 14);
    const zoomFloor = viewMode === "family" ? 0.82 : 0.62;

    if (animate) {
      cy.animate(
        { fit: { eles: targetEles, padding: focusPadding } },
        {
          duration: 320,
          easing: "ease-out-cubic",
          complete: () => {
            const targetZoom = Math.min(MAX_ZOOM, Math.max(cy.zoom(), zoomFloor));
            cy.animate(
              { center: { eles: centerEle }, zoom: targetZoom },
              { duration: 220, easing: "ease-out-cubic" },
            );
          },
        },
      );
      return;
    }

    cy.fit(targetEles, focusPadding);
    cy.center(centerEle);
    if (cy.zoom() < zoomFloor) {
      cy.zoom({
        level: zoomFloor,
        renderedPosition: centerEle.renderedPosition(),
      });
    }
  }

  function nodeById(id) {
    return id ? nodeMap.get(id) : null;
  }

  function getDefaultCenterId() {
    const ordered = nodes
      .slice()
      .sort((a, b) => a.col - b.col || a.order - b.order);
    return ordered.length > 0 ? ordered[0].id : null;
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

  function collectFamilyView(centerId, upDepth, downDepth, withSideBranches) {
    const centerNode = nodeMap.get(centerId);
    if (!centerNode) {
      return { visibleNodes: new Set(), visibleEdges: new Set(), coreLineageNodes: new Set() };
    }

    const coreSet = new Set([centerId]);

    const upQueue = [{ id: centerId, d: 0 }];
    while (upQueue.length > 0) {
      const current = upQueue.shift();
      if (current.d >= upDepth) continue;

      const node = nodeMap.get(current.id);
      if (!node) continue;

      for (const parentId of node.parents) {
        if (!coreSet.has(parentId)) {
          coreSet.add(parentId);
        }
        upQueue.push({ id: parentId, d: current.d + 1 });
      }
    }

    const downQueue = [{ id: centerId, d: 0 }];
    while (downQueue.length > 0) {
      const current = downQueue.shift();
      if (current.d >= downDepth) continue;

      const node = nodeMap.get(current.id);
      if (!node) continue;

      for (const childId of node.children) {
        if (!coreSet.has(childId)) {
          coreSet.add(childId);
        }
        downQueue.push({ id: childId, d: current.d + 1 });
      }
    }

    const visibleNodes = new Set(coreSet);

    if (withSideBranches) {
      for (const coreId of coreSet) {
        const coreNode = nodeMap.get(coreId);
        if (!coreNode) continue;

        for (const parentId of coreNode.parents) {
          const parentNode = nodeMap.get(parentId);
          if (!parentNode) continue;

          visibleNodes.add(parentId);

          for (const siblingId of parentNode.children) {
            visibleNodes.add(siblingId);
          }
        }
      }
    }

    const visibleEdges = new Set();
    for (const edge of edges) {
      if (visibleNodes.has(edge.source) && visibleNodes.has(edge.target)) {
        visibleEdges.add(`${edge.source}->${edge.target}`);
      }
    }

    return {
      visibleNodes,
      visibleEdges,
      coreLineageNodes: coreSet,
    };
  }


  function collectFullView(withCollapsedLeaves, focusNodeId) {
    const allNodeIds = new Set(nodes.map((node) => node.id));
    if (!withCollapsedLeaves) {
      return {
        visibleNodes: allNodeIds,
        visibleEdges: new Set(edges.map((edge) => `${edge.source}->${edge.target}`)),
      };
    }

    const visibleNodes = new Set();
    for (const node of nodes) {
      const isRoot = node.parents.length === 0;
      const hasChildren = node.children.length > 0;
      const isBranching = node.children.length >= 2 || node.parents.length >= 2;
      const isEarlyGeneration = node.col <= 4;

      if (isRoot || hasChildren || isBranching || isEarlyGeneration) {
        visibleNodes.add(node.id);
      }
    }

    if (focusNodeId && nodeMap.has(focusNodeId)) {
      const lineage = computeLineageSet(focusNodeId);
      for (const lineageId of lineage) {
        visibleNodes.add(lineageId);
      }

      const queue = [{ id: focusNodeId, depth: 0 }];
      const visited = new Set([focusNodeId]);
      while (queue.length > 0) {
        const current = queue.shift();
        if (current.depth >= 1) continue;

        const neighbors = neighborMap.get(current.id);
        if (!neighbors) continue;

        for (const nextId of neighbors) {
          visibleNodes.add(nextId);
          if (visited.has(nextId)) continue;
          visited.add(nextId);
          queue.push({ id: nextId, depth: current.depth + 1 });
        }
      }
    }

    if (visibleNodes.size === 0) {
      for (const nodeId of allNodeIds) visibleNodes.add(nodeId);
    }

    const visibleEdges = new Set();
    for (const edge of edges) {
      if (visibleNodes.has(edge.source) && visibleNodes.has(edge.target)) {
        visibleEdges.add(`${edge.source}->${edge.target}`);
      }
    }

    return { visibleNodes, visibleEdges };
  }

  function distanceMapFromCenter(centerId, allowedNodeIds) {
    const distMap = new Map();
    if (!centerId || !allowedNodeIds || !allowedNodeIds.has(centerId)) {
      return distMap;
    }

    const queue = [centerId];
    distMap.set(centerId, 0);

    while (queue.length > 0) {
      const currentId = queue.shift();
      const currentDist = distMap.get(currentId) || 0;
      const neighbors = neighborMap.get(currentId);
      if (!neighbors) continue;

      for (const nextId of neighbors) {
        if (!allowedNodeIds.has(nextId)) continue;
        if (distMap.has(nextId)) continue;
        distMap.set(nextId, currentDist + 1);
        queue.push(nextId);
      }
    }

    return distMap;
  }

  function distanceMapFromSeedSet(seedIds, allowedNodeIds) {
    const distMap = new Map();
    const allowed = allowedNodeIds || new Set();
    const queue = [];
    for (const seedId of seedIds || []) {
      if (!allowed.has(seedId)) continue;
      if (distMap.has(seedId)) continue;
      distMap.set(seedId, 0);
      queue.push(seedId);
    }
    while (queue.length > 0) {
      const currentId = queue.shift();
      const currentDist = distMap.get(currentId) || 0;
      const neighbors = neighborMap.get(currentId);
      if (!neighbors) continue;
      for (const nextId of neighbors) {
        if (!allowed.has(nextId)) continue;
        if (distMap.has(nextId)) continue;
        distMap.set(nextId, currentDist + 1);
        queue.push(nextId);
      }
    }
    return distMap;
  }
  function buildFamilyTreeEdgeSet(visibleNodeIds, primaryLineIds, centerId) {
    const visibleNodes = visibleNodeIds || new Set();
    const lineSet = primaryLineIds || new Set();
    const selectedEdges = new Set();

    if (visibleNodes.size === 0) return selectedEdges;

    const lineNodes = [...lineSet]
      .filter((id) => visibleNodes.has(id))
      .map((id) => nodeById(id))
      .filter((node) => Boolean(node))
      .sort((a, b) => a.col - b.col || a.order - b.order);

    for (let i = 0; i < lineNodes.length - 1; i += 1) {
      const parent = lineNodes[i];
      const child = lineNodes[i + 1];
      const edgeId = `${parent.id}->${child.id}`;
      if (edgeMap.has(edgeId)) {
        selectedEdges.add(edgeId);
      }
    }

    const distToLine = distanceMapFromSeedSet(lineSet, visibleNodes);

    const addTreeEdge = (a, b) => {
      const forward = `${a}->${b}`;
      if (edgeMap.has(forward)) {
        selectedEdges.add(forward);
        return true;
      }
      const backward = `${b}->${a}`;
      if (edgeMap.has(backward)) {
        selectedEdges.add(backward);
        return true;
      }
      return false;
    };

    const visited = new Set();
    const queue = [];

    const pickStart = () => {
      if (centerId && visibleNodes.has(centerId)) return centerId;
      const lineStart = [...lineSet].find((id) => visibleNodes.has(id));
      if (lineStart) return lineStart;
      return [...visibleNodes][0];
    };

    const enqueueStart = (id) => {
      if (!id || visited.has(id) || !visibleNodes.has(id)) return;
      visited.add(id);
      queue.push(id);
    };

    enqueueStart(pickStart());

    while (visited.size < visibleNodes.size) {
      while (queue.length > 0) {
        const currentId = queue.shift();
        const neighbors = [...(neighborMap.get(currentId) || [])]
          .filter((id) => visibleNodes.has(id) && !visited.has(id))
          .sort((a, b) => {
            const da = distToLine.has(a) ? distToLine.get(a) : 99;
            const db = distToLine.has(b) ? distToLine.get(b) : 99;
            if (da !== db) return da - db;
            const na = nodeById(a);
            const nb = nodeById(b);
            if (!na || !nb) return 0;
            return na.col - nb.col || na.order - nb.order;
          });

        for (const nextId of neighbors) {
          visited.add(nextId);
          queue.push(nextId);
          addTreeEdge(currentId, nextId);
        }
      }

      const remaining = [...visibleNodes]
        .filter((id) => !visited.has(id))
        .sort((a, b) => {
          const da = distToLine.has(a) ? distToLine.get(a) : 99;
          const db = distToLine.has(b) ? distToLine.get(b) : 99;
          if (da !== db) return da - db;
          const na = nodeById(a);
          const nb = nodeById(b);
          if (!na || !nb) return 0;
          return na.col - nb.col || na.order - nb.order;
        });

      if (remaining.length === 0) break;
      const seed = remaining[0];
      enqueueStart(seed);
    }

    for (const nodeId of visibleNodes) {
      const node = nodeById(nodeId);
      if (!node) continue;
      const hasInTree = [...selectedEdges].some((eid) => {
        const [s, t] = eid.split("->");
        return s === nodeId || t === nodeId;
      });
      if (hasInTree) continue;

      const parentId = node.parents.find((pid) => visibleNodes.has(pid));
      if (parentId) {
        addTreeEdge(parentId, nodeId);
        continue;
      }
      const childId = node.children.find((cid) => visibleNodes.has(cid));
      if (childId) {
        addTreeEdge(nodeId, childId);
      }
    }

    return selectedEdges;
  }

  function computePrimaryLine(centerId, upDepth = Number.POSITIVE_INFINITY, downDepth = Number.POSITIVE_INFINITY) {
    const centerNode = nodeById(centerId);
    if (!centerNode) return new Set();

    const line = new Set([centerId]);

    let current = centerNode;
    let steps = 0;
    while (current && steps < upDepth) {
      if (!current.parents || current.parents.length === 0) break;
      const sortedParents = current.parents
        .map((id) => nodeById(id))
        .filter((node) => Boolean(node))
        .sort((a, b) => a.col - b.col || a.order - b.order);
      const next = sortedParents[0];
      if (!next) break;
      line.add(next.id);
      current = next;
      steps += 1;
    }

    current = centerNode;
    steps = 0;
    while (current && steps < downDepth) {
      if (!current.children || current.children.length === 0) break;
      const sortedChildren = current.children
        .map((id) => nodeById(id))
        .filter((node) => Boolean(node))
        .sort((a, b) => a.col - b.col || a.order - b.order);
      const next = sortedChildren[0];
      if (!next) break;
      line.add(next.id);
      current = next;
      steps += 1;
    }

    return line;
  }

  function alignPrimaryLine(nodeIds, primaryLineIds, centerId, animate) {
    if (!primaryLineIds || primaryLineIds.size === 0) return;

    const centerEle = cy.getElementById(centerId);
    let centerX = 0;
    if (centerEle && centerEle.length > 0) {
      centerX = centerEle.position("x");
    }

    const lineNodeIds = [...primaryLineIds].filter((id) => nodeIds.has(id));
    for (const nodeId of lineNodeIds) {
      const ele = cy.getElementById(nodeId);
      if (!ele || ele.length === 0) continue;

      // Keep lineage on the center axis first, then run collision solving.
      // Using immediate position avoids stale coordinates during animation.
      ele.position({ x: centerX, y: ele.position("y") });
    }
  }

  function separateCoincidentNodes(nodeIds, lockedIds, animate) {
    const lockSet = lockedIds || new Set();
    const buckets = new Map();

    for (const nodeId of nodeIds) {
      const ele = cy.getElementById(nodeId);
      if (!ele || ele.length === 0) continue;
      const pos = ele.position();
      const key = `${Math.round(pos.x)}:${Math.round(pos.y)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(ele);
    }

    for (const entries of buckets.values()) {
      if (entries.length <= 1) continue;

      const movable = entries.filter((ele) => !lockSet.has(ele.id()));
      if (movable.length === 0) continue;

      const locked = entries.filter((ele) => lockSet.has(ele.id()));
      const anchorY = locked.length > 0
        ? locked.reduce((sum, ele) => sum + ele.position("y"), 0) / locked.length
        : entries.reduce((sum, ele) => sum + ele.position("y"), 0) / entries.length;

      const offsetBase = 18;
      const center = (movable.length - 1) / 2;
      movable.forEach((ele, idx) => {
        const targetY = anchorY + (idx - center) * offsetBase;
        if (animate) {
          ele.animate({ position: { x: ele.position("x"), y: targetY } }, { duration: 220, easing: "ease-out-cubic" });
        } else {
          ele.position({ x: ele.position("x"), y: targetY });
        }
      });
    }
  }

  function rebalanceSideBranches(nodeIds, lockedIds, animate) {
    const lineSet = lockedIds || new Set();
    if (lineSet.size === 0) return;
    const visibleSet = nodeIds || new Set();
    const centerLineNodes = [...lineSet]
      .map((id) => nodeById(id))
      .filter((node) => Boolean(node));
    if (centerLineNodes.length === 0) return;
    const centerColNode = nodeById(focusedId || familyCenterId || [...lineSet][0]);
    const centerCol = centerColNode ? centerColNode.col : centerLineNodes[0].col;
    const centerX = centerLineNodes
      .map((node) => cy.getElementById(node.id))
      .filter((ele) => ele && ele.length > 0)
      .reduce((sum, ele) => sum + ele.position("x"), 0) / centerLineNodes.length;
    if (!Number.isFinite(centerX)) return;
    const bandMap = new Map();
    for (const id of visibleSet) {
      if (lineSet.has(id)) continue;
      const node = nodeById(id);
      if (!node) continue;
      if (!bandMap.has(node.col)) bandMap.set(node.col, []);
      bandMap.get(node.col).push(node);
    }
    const minCol = Math.min(...centerLineNodes.map((node) => node.col));
    const maxCol = Math.max(...centerLineNodes.map((node) => node.col));
    const bandGap = 122;
    const placeBand = (col, towardDescendants) => {
      const band = bandMap.get(col) || [];
      if (band.length === 0) return;
      const items = band
        .map((node) => {
          const anchors = [];
          const refIds = towardDescendants ? node.parents : node.children;
          for (const refId of refIds) {
            if (!visibleSet.has(refId)) continue;
            const refEle = cy.getElementById(refId);
            if (!refEle || refEle.length === 0) continue;
            anchors.push(refEle.position("x"));
          }
          const selfEle = cy.getElementById(node.id);
          if (!selfEle || selfEle.length === 0) return null;
          const fallback = selfEle.position("x");
          const anchorX = anchors.length > 0
            ? anchors.reduce((sum, x) => sum + x, 0) / anchors.length
            : fallback;
          return {
            node,
            ele: selfEle,
            anchorX,
          };
        })
        .filter((item) => Boolean(item))
        .sort((a, b) => a.anchorX - b.anchorX || a.node.order - b.node.order);
      if (items.length === 0) return;
      const left = [];
      const right = [];
      for (const item of items) {
        const delta = item.anchorX - centerX;
        if (Math.abs(delta) < 0.5) {
          if (left.length <= right.length) {
            left.push(item);
          } else {
            right.push(item);
          }
        } else if (delta < 0) {
          left.push(item);
        } else {
          right.push(item);
        }
      }
      for (let i = 0; i < left.length; i += 1) {
        const item = left[i];
        const nearCenterIndex = left.length - i;
        const targetX = centerX - nearCenterIndex * bandGap;
        const targetY = item.ele.position("y");
        if (animate) {
          item.ele.animate({ position: { x: targetX, y: targetY } }, { duration: 200, easing: "ease-out-cubic" });
        } else {
          item.ele.position({ x: targetX, y: targetY });
        }
      }
      for (let i = 0; i < right.length; i += 1) {
        const item = right[i];
        const targetX = centerX + (i + 1) * bandGap;
        const targetY = item.ele.position("y");
        if (animate) {
          item.ele.animate({ position: { x: targetX, y: targetY } }, { duration: 200, easing: "ease-out-cubic" });
        } else {
          item.ele.position({ x: targetX, y: targetY });
        }
      }
    };
    for (let col = centerCol + 1; col <= maxCol; col += 1) {
      placeBand(col, true);
    }
    for (let col = centerCol - 1; col >= minCol; col -= 1) {
      placeBand(col, false);
    }
  }
  function enforcePrimaryAxisClearance(nodeIds, primaryLineIds, centerId, animate) {
    if (!primaryLineIds || primaryLineIds.size === 0) return;
    const visibleIds = nodeIds || new Set();
    const lineSet = new Set([...primaryLineIds].filter((id) => visibleIds.has(id)));
    if (lineSet.size === 0) return;
    const centerEle = cy.getElementById(centerId);
    if (!centerEle || centerEle.length === 0) return;
    const centerX = centerEle.position("x");
    for (const nodeId of visibleIds) {
      if (lineSet.has(nodeId)) continue;
      const ele = cy.getElementById(nodeId);
      if (!ele || ele.length === 0) continue;
      const currentX = ele.position("x");
      const baseClearance = Math.max(82, Math.round(ele.width() * 0.92));
      const distanceToAxis = Math.abs(currentX - centerX);
      if (distanceToAxis >= baseClearance) continue;
      const node = nodeById(nodeId);
      let dir = currentX >= centerX ? 1 : -1;
      if (Math.abs(currentX - centerX) < 0.1) {
        dir = node && node.order % 2 === 0 ? 1 : -1;
      }
      if (node) {
        const parentOnLine = node.parents.find((pid) => lineSet.has(pid));
        if (parentOnLine) {
          const parentEle = cy.getElementById(parentOnLine);
          if (parentEle && parentEle.length > 0) {
            const delta = currentX - parentEle.position("x");
            if (Math.abs(delta) > 0.1) {
              dir = delta >= 0 ? 1 : -1;
            }
          }
        }
      }
      const nodeDegree = node ? node.parents.length + node.children.length : 0;
      const extraBand = Math.min(3, Math.max(0, nodeDegree - 1));
      const targetX = centerX + dir * (baseClearance + extraBand * 18);
      const targetY = ele.position("y");
      if (animate) {
        ele.animate({ position: { x: targetX, y: targetY } }, { duration: 180, easing: "ease-out-cubic" });
      } else {
        ele.position({ x: targetX, y: targetY });
      }
    }
  }
  function resolveNodeCollisions(nodeIds, lockedIds, animate) {
    const lockSet = lockedIds || new Set();
    const nodeElements = [];

    for (const nodeId of nodeIds) {
      const ele = cy.getElementById(nodeId);
      if (!ele || ele.length === 0) continue;
      nodeElements.push(ele);
    }

    if (nodeElements.length <= 1) return;
    if (nodeElements.length > 220) return;

    const posMap = new Map();
    for (const ele of nodeElements) {
      posMap.set(ele.id(), { x: ele.position("x"), y: ele.position("y") });
    }

    const minGap = 14;
    const maxPass = 18;

    for (let pass = 0; pass < maxPass; pass += 1) {
      let moved = false;

      for (let i = 0; i < nodeElements.length; i += 1) {
        for (let j = i + 1; j < nodeElements.length; j += 1) {
          const a = nodeElements[i];
          const b = nodeElements[j];
          const pa = posMap.get(a.id());
          const pb = posMap.get(b.id());
          if (!pa || !pb) continue;

          const dx = pb.x - pa.x;
          const dy = pb.y - pa.y;
          const dist = Math.hypot(dx, dy) || 0.0001;
          const minDist = (a.width() + b.width()) / 2 + minGap;
          if (dist >= minDist) continue;

          const overlap = minDist - dist;
          const aLocked = lockSet.has(a.id());
          const bLocked = lockSet.has(b.id());
          if (aLocked && bLocked) continue;

          let ux = dx / dist;
          let uy = dy / dist;

          if (!Number.isFinite(ux) || !Number.isFinite(uy)) {
            ux = 0;
            uy = 1;
          }

          if ((aLocked || bLocked) && Math.abs(ux) < 0.22) {
            ux = pa.x <= pb.x ? 1 : -1;
            uy = 0;
          }

          if (aLocked) {
            pb.x += ux * overlap;
            pb.y += uy * overlap;
          } else if (bLocked) {
            pa.x -= ux * overlap;
            pa.y -= uy * overlap;
          } else {
            const half = overlap / 2;
            pa.x -= ux * half;
            pa.y -= uy * half;
            pb.x += ux * half;
            pb.y += uy * half;
          }

          moved = true;
        }
      }

      if (!moved) break;
    }

    for (const ele of nodeElements) {
      const pos = posMap.get(ele.id());
      if (!pos) continue;
      if (animate) {
        ele.animate({ position: { x: pos.x, y: pos.y } }, { duration: 220, easing: "ease-out-cubic" });
      } else {
        ele.position({ x: pos.x, y: pos.y });
      }
    }
  }
  function updateVisibleEdgeCurves(nodeIdSet, edgeIdSet, primaryLineIds) {
    const visibleNodes = nodeIdSet || new Set();
    const visibleEdges = edgeIdSet || new Set();
    const primarySet = primaryLineIds || new Set();
    const laneByEdge = new Map();
    const edgeEles = [];
    for (const edgeId of visibleEdges) {
      const edgeEle = cy.getElementById(edgeId);
      if (!edgeEle || edgeEle.length === 0) continue;
      edgeEles.push(edgeEle);
      const baseLane = edgeRouteMap.edgeLaneMap.get(edgeId) || 0;
      laneByEdge.set(edgeId, baseLane * 0.45);
    }
    const outgoingBySource = new Map();
    for (const edgeEle of edgeEles) {
      const sourceId = edgeEle.data("source");
      if (!visibleNodes.has(sourceId)) continue;
      if (!outgoingBySource.has(sourceId)) outgoingBySource.set(sourceId, []);
      outgoingBySource.get(sourceId).push(edgeEle);
    }
    for (const [sourceId, sourceEdges] of outgoingBySource.entries()) {
      if (sourceEdges.length <= 1) continue;
      const sourceEle = cy.getElementById(sourceId);
      if (!sourceEle || sourceEle.length === 0) continue;
      const sourceX = sourceEle.position("x");
      const trunkEdge = sourceEdges.find((edgeEle) => {
        const targetId = edgeEle.data("target");
        return primarySet.has(sourceId) && primarySet.has(targetId);
      });
      const others = sourceEdges.filter((edgeEle) => edgeEle.id() !== trunkEdge?.id());
      const left = [];
      const right = [];
      for (const edgeEle of others) {
        const targetId = edgeEle.data("target");
        const targetEle = cy.getElementById(targetId);
        if (!targetEle || targetEle.length === 0) continue;
        if (targetEle.position("x") >= sourceX) {
          right.push(edgeEle);
        } else {
          left.push(edgeEle);
        }
      }
      left.sort((a, b) => {
        const ay = cy.getElementById(a.data("target")).position("y");
        const by = cy.getElementById(b.data("target")).position("y");
        return ay - by;
      });
      right.sort((a, b) => {
        const ay = cy.getElementById(a.data("target")).position("y");
        const by = cy.getElementById(b.data("target")).position("y");
        return ay - by;
      });
      left.forEach((edgeEle, idx) => {
        laneByEdge.set(edgeEle.id(), (laneByEdge.get(edgeEle.id()) || 0) - (idx + 1));
      });
      right.forEach((edgeEle, idx) => {
        laneByEdge.set(edgeEle.id(), (laneByEdge.get(edgeEle.id()) || 0) + (idx + 1));
      });
      if (trunkEdge) {
        laneByEdge.set(trunkEdge.id(), 0);
      }
    }
    const incomingByTarget = new Map();
    for (const edgeEle of edgeEles) {
      const targetId = edgeEle.data("target");
      if (!visibleNodes.has(targetId)) continue;
      if (!incomingByTarget.has(targetId)) incomingByTarget.set(targetId, []);
      incomingByTarget.get(targetId).push(edgeEle);
    }
    for (const [targetId, targetEdges] of incomingByTarget.entries()) {
      if (targetEdges.length <= 1) continue;
      const targetEle = cy.getElementById(targetId);
      if (!targetEle || targetEle.length === 0) continue;
      const targetX = targetEle.position("x");
      const trunkEdge = targetEdges.find((edgeEle) => {
        const sourceId = edgeEle.data("source");
        return primarySet.has(sourceId) && primarySet.has(targetId);
      });
      const others = targetEdges.filter((edgeEle) => edgeEle.id() !== trunkEdge?.id());
      const left = [];
      const right = [];
      for (const edgeEle of others) {
        const sourceId = edgeEle.data("source");
        const sourceEle = cy.getElementById(sourceId);
        if (!sourceEle || sourceEle.length === 0) continue;
        if (sourceEle.position("x") <= targetX) {
          left.push(edgeEle);
        } else {
          right.push(edgeEle);
        }
      }
      left.sort((a, b) => {
        const ay = cy.getElementById(a.data("source")).position("y");
        const by = cy.getElementById(b.data("source")).position("y");
        return ay - by;
      });
      right.sort((a, b) => {
        const ay = cy.getElementById(a.data("source")).position("y");
        const by = cy.getElementById(b.data("source")).position("y");
        return ay - by;
      });
      left.forEach((edgeEle, idx) => {
        laneByEdge.set(edgeEle.id(), (laneByEdge.get(edgeEle.id()) || 0) - (idx + 1) * 0.7);
      });
      right.forEach((edgeEle, idx) => {
        laneByEdge.set(edgeEle.id(), (laneByEdge.get(edgeEle.id()) || 0) + (idx + 1) * 0.7);
      });
      if (trunkEdge) {
        laneByEdge.set(trunkEdge.id(), 0);
      }
    }
    for (const edgeEle of edgeEles) {
      const edgeId = edgeEle.id();
      const sourceId = edgeEle.data("source");
      const targetId = edgeEle.data("target");
      const isPrimary = primarySet.has(sourceId) && primarySet.has(targetId);
      let lane = isPrimary ? 0 : (laneByEdge.get(edgeId) || 0);
      if (!isPrimary && Math.abs(lane) < 0.45) {
        lane = lane >= 0 ? 0.45 : -0.45;
      }
      const sourceEle = cy.getElementById(sourceId);
      const targetEle = cy.getElementById(targetId);
      let maxDistance = 180;
      if (sourceEle && sourceEle.length > 0 && targetEle && targetEle.length > 0) {
        const dx = targetEle.position("x") - sourceEle.position("x");
        const dy = targetEle.position("y") - sourceEle.position("y");
        const length = Math.hypot(dx, dy);
        maxDistance = Math.max(36, Math.min(220, length * 0.46));
      }
      const curveDistance = Math.max(-maxDistance, Math.min(maxDistance, lane * 28));
      const rounded = Math.round(curveDistance * 10) / 10;
      edgeEle.data("cpDistances", `${rounded} ${rounded}`);
    }
  }
  let edgeCurveTimer = null;
  function scheduleVisibleEdgeCurveRefresh(nodeIdSet, edgeIdSet, primaryLineIds, delay) {
    if (edgeCurveTimer) {
      clearTimeout(edgeCurveTimer);
      edgeCurveTimer = null;
    }
    const waitMs = typeof delay === "number" ? delay : 0;
    edgeCurveTimer = window.setTimeout(() => {
      updateVisibleEdgeCurves(nodeIdSet, edgeIdSet, primaryLineIds);
      edgeCurveTimer = null;
    }, waitMs);
  }

  function topRootsInSet(idSet) {
    const roots = [];

    for (const nodeId of idSet) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const hasParentInSet = node.parents.some((parentId) => idSet.has(parentId));
      if (!hasParentInSet) {
        roots.push(nodeId);
      }
    }

    if (roots.length > 0) {
      roots.sort((a, b) => {
        const na = nodeById(a);
        const nb = nodeById(b);
        return na.col - nb.col || na.order - nb.order;
      });
      return roots;
    }

    const fallback = [...idSet].sort((a, b) => {
      const na = nodeById(a);
      const nb = nodeById(b);
      return na.col - nb.col || na.order - nb.order;
    });
    return fallback.slice(0, 1);
  }

  function clearAllStateClasses() {
    cy.nodes().removeClass("lineage focused inactive mode-hidden");
    cy.edges().removeClass("active inactive mode-hidden");
  }

  function applyVisibility(visibleNodeIds, visibleEdgeIds) {
    const visibleNodes = visibleNodeIds || new Set();
    const visibleEdges = visibleEdgeIds || new Set();

    cy.nodes().forEach((n) => {
      n.toggleClass("mode-hidden", !visibleNodes.has(n.id()));
    });

    cy.edges().forEach((e) => {
      e.toggleClass("mode-hidden", !visibleEdges.has(e.id()));
    });
  }

  function applyHighlight(focusNodeId, lineageNodes, visibleNodeIds, visibleEdgeIds) {
    const hasFocus = Boolean(focusNodeId);
    const lineage = lineageNodes || new Set();
    const visibleNodes = visibleNodeIds || new Set();
    const visibleEdges = visibleEdgeIds || new Set();

    cy.nodes().forEach((n) => {
      const id = n.id();
      const isVisible = visibleNodes.has(id);
      const isLineage = hasFocus && lineage.has(id);

      n.toggleClass("lineage", isLineage);
      n.toggleClass("inactive", isVisible && hasFocus && !isLineage);
      n.toggleClass("focused", hasFocus && id === focusNodeId && isVisible);
    });

    cy.edges().forEach((e) => {
      const isVisible = visibleEdges.has(e.id());
      if (!isVisible) {
        e.removeClass("active inactive");
        return;
      }

      const src = e.data("source");
      const tgt = e.data("target");
      const isActive = hasFocus && lineage.has(src) && lineage.has(tgt);
      e.toggleClass("active", isActive);
      e.toggleClass("inactive", hasFocus && !isActive);
    });
  }

  function computeManualTreePositions(nodeIdSet, edgeIdSet, centerId, primaryLineIds) {
    const visibleNodes = nodeIdSet || new Set();
    const visibleEdges = edgeIdSet || new Set();
    const axisSet = new Set([...(primaryLineIds || new Set())].filter((id) => visibleNodes.has(id)));

    const parentCandidates = new Map();
    const neighbors = new Map();
    for (const nodeId of visibleNodes) {
      neighbors.set(nodeId, new Set());
    }

    for (const edgeId of visibleEdges) {
      const parts = edgeId.split("->");
      if (parts.length !== 2) continue;
      const a = parts[0];
      const b = parts[1];
      if (!visibleNodes.has(a) || !visibleNodes.has(b)) continue;

      neighbors.get(a)?.add(b);
      neighbors.get(b)?.add(a);

      const na = nodeById(a);
      const nb = nodeById(b);
      if (!na || !nb) continue;

      let parentId = a;
      let childId = b;
      if (na.col > nb.col || (na.col === nb.col && na.order > nb.order)) {
        parentId = b;
        childId = a;
      }

      if (!parentCandidates.has(childId)) parentCandidates.set(childId, []);
      parentCandidates.get(childId).push(parentId);
    }

    const parentByNode = new Map();
    const childrenByNode = new Map();
    for (const nodeId of visibleNodes) childrenByNode.set(nodeId, []);

    for (const [childId, candidatesRaw] of parentCandidates.entries()) {
      const candidates = [...new Set(candidatesRaw)]
        .map((pid) => nodeById(pid))
        .filter((node) => Boolean(node))
        .sort((a, b) => a.col - b.col || a.order - b.order);
      if (candidates.length === 0) continue;
      const chosen = candidates[0].id;
      parentByNode.set(childId, chosen);
      childrenByNode.get(chosen)?.push(childId);
    }

    for (const [parentId, kids] of childrenByNode.entries()) {
      kids.sort((a, b) => {
        const na = nodeById(a);
        const nb = nodeById(b);
        if (!na || !nb) return 0;
        return na.col - nb.col || na.order - nb.order;
      });
    }

    const axisOrdered = [];
    const axisVisited = new Set();
    const centerOnAxis = centerId && axisSet.has(centerId);

    if (centerOnAxis) {
      const up = [];
      let current = centerId;
      while (parentByNode.has(current)) {
        const p = parentByNode.get(current);
        if (!axisSet.has(p) || axisVisited.has(p)) break;
        up.push(p);
        axisVisited.add(p);
        current = p;
      }
      up.reverse().forEach((id) => axisOrdered.push(id));

      axisOrdered.push(centerId);
      axisVisited.add(centerId);

      current = centerId;
      while (true) {
        const next = (childrenByNode.get(current) || []).find((cid) => axisSet.has(cid) && !axisVisited.has(cid));
        if (!next) break;
        axisOrdered.push(next);
        axisVisited.add(next);
        current = next;
      }
    }

    for (const axisId of [...axisSet].sort((a, b) => {
      const na = nodeById(a);
      const nb = nodeById(b);
      if (!na || !nb) return 0;
      return na.col - nb.col || na.order - nb.order;
    })) {
      if (!axisVisited.has(axisId)) axisOrdered.push(axisId);
    }

    const pos = new Map();
    const unitX = 118;
    const unitY = 196;
    const siblingGapUnits = 0.72;

    let centerAxisIndex = axisOrdered.indexOf(centerId);
    if (centerAxisIndex < 0) centerAxisIndex = Math.floor(axisOrdered.length / 2);

    for (let i = 0; i < axisOrdered.length; i += 1) {
      const nodeId = axisOrdered[i];
      const y = (i - centerAxisIndex) * unitY;
      pos.set(nodeId, { x: 0, y });
    }

    const widthMemo = new Map();
    const subtreeWidth = (nodeId) => {
      if (widthMemo.has(nodeId)) return widthMemo.get(nodeId);
      const selfNode = nodeById(nodeId);
      const selfUnits = Math.max(1, ((selfNode?.size || 72) + 22) / unitX);
      const kids = (childrenByNode.get(nodeId) || []).filter((cid) => !axisSet.has(cid));
      if (kids.length === 0) {
        widthMemo.set(nodeId, selfUnits);
        return selfUnits;
      }
      let total = 0;
      for (let i = 0; i < kids.length; i += 1) {
        total += subtreeWidth(kids[i]);
        if (i < kids.length - 1) total += siblingGapUnits;
      }
      total = Math.max(selfUnits, total);
      widthMemo.set(nodeId, total);
      return total;
    };

    const placeBranch = (nodeId, x, y) => {
      if (pos.has(nodeId)) return;
      pos.set(nodeId, { x, y });
      const kids = (childrenByNode.get(nodeId) || []).filter((cid) => !axisSet.has(cid));
      if (kids.length === 0) return;

      const widths = kids.map((cid) => subtreeWidth(cid));
      let total = 0;
      for (let i = 0; i < widths.length; i += 1) {
        total += widths[i];
        if (i < widths.length - 1) total += siblingGapUnits;
      }

      let cursor = x - (total * unitX) / 2;
      for (let i = 0; i < kids.length; i += 1) {
        const block = widths[i] * unitX;
        const childX = cursor + block / 2;
        const childY = y + unitY;
        placeBranch(kids[i], childX, childY);
        cursor += block + siblingGapUnits * unitX;
      }
    };

    for (const axisId of axisOrdered) {
      const axisPos = pos.get(axisId);
      if (!axisPos) continue;
      const allChildren = childrenByNode.get(axisId) || [];
      const familyChildren = allChildren.filter((cid) => !axisSet.has(cid));
      if (familyChildren.length === 0) continue;

      const trunkIndex = allChildren.findIndex((cid) => axisSet.has(cid));
      const leftChildren = [];
      const rightChildren = [];

      if (trunkIndex >= 0) {
        for (let i = 0; i < allChildren.length; i += 1) {
          const cid = allChildren[i];
          if (axisSet.has(cid)) continue;
          if (i < trunkIndex) {
            leftChildren.push(cid);
          } else {
            rightChildren.push(cid);
          }
        }
      } else {
        const half = Math.floor(familyChildren.length / 2);
        for (let i = 0; i < familyChildren.length; i += 1) {
          if (i < half) {
            leftChildren.push(familyChildren[i]);
          } else {
            rightChildren.push(familyChildren[i]);
          }
        }
      }

      if (leftChildren.length === 0 && rightChildren.length === 0) {
        rightChildren.push(...familyChildren);
      }

      const placeAxisSide = (childIds, side) => {
        if (childIds.length === 0) return;

        const widths = childIds.map((cid) => subtreeWidth(cid));
        let total = 0;
        for (let i = 0; i < widths.length; i += 1) {
          total += widths[i];
          if (i < widths.length - 1) total += siblingGapUnits;
        }

        const sideGap = unitX * 0.76;
        let cursor = side === "left"
          ? axisPos.x - sideGap - total * unitX
          : axisPos.x + sideGap;

        for (let i = 0; i < childIds.length; i += 1) {
          const block = widths[i] * unitX;
          const childX = cursor + block / 2;
          const childY = axisPos.y + unitY;
          placeBranch(childIds[i], childX, childY);
          cursor += block + siblingGapUnits * unitX;
        }
      };

      placeAxisSide(leftChildren, "left");
      placeAxisSide(rightChildren, "right");
    }

    const axisClearance = unitX * 0.68;
    for (const [nodeId, p] of pos.entries()) {
      if (axisSet.has(nodeId)) continue;
      if (Math.abs(p.x) >= axisClearance) continue;
      const node = nodeById(nodeId);
      const dir = Math.abs(p.x) < 0.1
        ? (node && node.order % 2 === 0 ? 1 : -1)
        : (p.x >= 0 ? 1 : -1);
      p.x = dir * axisClearance;
    }

    const rowMap = new Map();
    for (const [nodeId, p] of pos.entries()) {
      const rowKey = Math.round(p.y);
      if (!rowMap.has(rowKey)) rowMap.set(rowKey, []);
      rowMap.get(rowKey).push(nodeId);
    }

    const rowPadding = 14;
    for (const rowNodeIds of rowMap.values()) {
      const entries = rowNodeIds
        .map((id) => {
          const n = nodeById(id);
          const point = pos.get(id);
          if (!n || !point) return null;
          return {
            id,
            x: point.x,
            size: n.size || 72,
            order: n.order || 0,
            axis: axisSet.has(id),
          };
        })
        .filter((entry) => Boolean(entry));
      if (entries.length <= 1) continue;

      const axisEntries = entries.filter((e) => e.axis);
      const axisX = axisEntries.length > 0
        ? axisEntries.reduce((sum, e) => sum + e.x, 0) / axisEntries.length
        : 0;

      const nonAxis = entries.filter((e) => !e.axis);
      const left = nonAxis
        .filter((e) => e.x < axisX - 1)
        .sort((a, b) => (b.x - a.x) || (a.order - b.order));
      const right = nonAxis
        .filter((e) => e.x > axisX + 1)
        .sort((a, b) => (a.x - b.x) || (a.order - b.order));
      const centered = nonAxis
        .filter((e) => Math.abs(e.x - axisX) <= 1)
        .sort((a, b) => a.order - b.order);

      for (const e of centered) {
        if (left.length <= right.length) {
          left.push(e);
        } else {
          right.push(e);
        }
      }

      if (left.length === 0 && right.length > 1) {
        const ordered = right.slice().sort((a, b) => a.order - b.order);
        left.length = 0;
        right.length = 0;
        for (let i = 0; i < ordered.length; i += 1) {
          if (i % 2 === 0) {
            left.push(ordered[i]);
          } else {
            right.push(ordered[i]);
          }
        }
      } else if (right.length === 0 && left.length > 1) {
        const ordered = left.slice().sort((a, b) => a.order - b.order);
        left.length = 0;
        right.length = 0;
        for (let i = 0; i < ordered.length; i += 1) {
          if (i % 2 === 0) {
            left.push(ordered[i]);
          } else {
            right.push(ordered[i]);
          }
        }
      }

      left.sort((a, b) => (b.x - a.x) || (a.order - b.order));
      right.sort((a, b) => (a.x - b.x) || (a.order - b.order));

      let prevLeftX = axisX;
      let prevLeftSize = 0;
      for (let i = 0; i < left.length; i += 1) {
        const e = left[i];
        const minDist = i === 0
          ? Math.max(axisClearance, e.size * 0.62 + rowPadding)
          : (prevLeftSize + e.size) / 2 + rowPadding;
        const maxX = prevLeftX - minDist;
        if (e.x > maxX) e.x = maxX;
        prevLeftX = e.x;
        prevLeftSize = e.size;
      }

      let prevRightX = axisX;
      let prevRightSize = 0;
      for (let i = 0; i < right.length; i += 1) {
        const e = right[i];
        const minDist = i === 0
          ? Math.max(axisClearance, e.size * 0.62 + rowPadding)
          : (prevRightSize + e.size) / 2 + rowPadding;
        const minX = prevRightX + minDist;
        if (e.x < minX) e.x = minX;
        prevRightX = e.x;
        prevRightSize = e.size;
      }

      for (const e of left) {
        const point = pos.get(e.id);
        if (point) point.x = e.x;
      }
      for (const e of right) {
        const point = pos.get(e.id);
        if (point) point.x = e.x;
      }
    }

    let spillX = unitX * 3.2;
    for (const nodeId of visibleNodes) {
      if (pos.has(nodeId)) continue;
      const node = nodeById(nodeId);
      const y = node ? (node.col - (nodeById(centerId)?.col || 0)) * unitY : 0;
      placeBranch(nodeId, spillX, y);
      spillX += unitX * 1.9;
    }

    const plain = {};
    for (const [nodeId, p] of pos.entries()) plain[nodeId] = p;
    return plain;
  }

  function runLayoutForNodeSet(nodeIdSet, edgeIdSet, animate, fitPadding, layoutOptions, onDone) {
    const options = layoutOptions || {};
    const layoutType = options.layoutType || "tree";
    const centerId = options.centerId || null;
    const lineageSet = options.lineageSet || new Set();
    const primaryLineIds = options.primaryLineIds || new Set();
    const keepLineCentered = Boolean(options.keepLineCentered);
    const centerOnFocused = options.centerOnFocused !== false;
    const autoFit = options.autoFit !== false;
    const preferDagre = Boolean(options.preferDagre);
    const useManualTreeLayout = layoutType === "tree" && preferDagre;

    const nodeCollection = collectionFromIds(nodeIdSet);
    const edgeCollection = edgeCollectionFromIds(edgeIdSet || []);
    const layoutCollection = nodeCollection.union(edgeCollection);

    if (nodeCollection.length === 0) {
      if (typeof onDone === "function") onDone();
      return;
    }

    const applyViewport = () => {
      const visibleEles = nodeCollection.union(edgeCollection);
      if (autoFit) {
        if (centerOnFocused && centerId) {
          applyFocusViewport(centerId, nodeIdSet, lineageSet, fitPadding, animate, visibleEles);
        } else if (animate) {
          cy.animate(
            { fit: { eles: visibleEles, padding: fitPadding } },
            { duration: 380, easing: "ease-out-cubic" },
          );
        } else {
          cy.fit(visibleEles, fitPadding);
        }
      }
      if (typeof onDone === "function") onDone();
    };

    if (useManualTreeLayout) {
      const positions = computeManualTreePositions(nodeIdSet, edgeIdSet, centerId, primaryLineIds);
      nodeCollection.forEach((ele) => {
        const p = positions[ele.id()];
        if (!p) return;
        if (animate) {
          ele.animate({ position: p }, { duration: 340, easing: "ease-out-cubic" });
        } else {
          ele.position(p);
        }
      });

      const finalize = () => {
        const lockedLineIds = new Set([...primaryLineIds].filter((id) => nodeIdSet.has(id)));
        if (keepLineCentered && lockedLineIds.size > 0) {
          alignPrimaryLine(nodeIdSet, primaryLineIds, centerId, false);
        }
        updateVisibleEdgeCurves(nodeIdSet, edgeIdSet, lockedLineIds);
        applyViewport();
      };

      if (animate) {
        window.setTimeout(finalize, 360);
      } else {
        finalize();
      }
      return;
    }

    let layout = null;

    if (layoutType === "radial") {
      const distMap = distanceMapFromCenter(centerId, nodeIdSet);
      layout = layoutCollection.layout({
        name: "concentric",
        fit: false,
        animate,
        animationDuration: animate ? 520 : 0,
        padding: 76,
        spacingFactor: 1.3,
        avoidOverlap: true,
        avoidOverlapPadding: 20,
        minNodeSpacing: 34,
        nodeDimensionsIncludeLabels: true,
        equidistant: true,
        startAngle: -Math.PI / 2,
        clockwise: true,
        sweep: Math.PI * 1.92,
        concentric: (ele) => {
          const id = ele.id();
          const dist = distMap.has(id) ? distMap.get(id) : 99;
          const node = nodeById(id);
          const degree = node ? node.parents.length + node.children.length : 0;
          const lineageBoost = lineageSet.has(id) ? 36 : 0;
          return 1000 - dist * 100 + lineageBoost + Math.min(26, degree * 2);
        },
        levelWidth: () => 100,
        sort: (a, b) => a.data("order") - b.data("order"),
      });
    } else {
      const roots = collectionFromIds(topRootsInSet(nodeIdSet));
      layout = layoutCollection.layout({
        name: "breadthfirst",
        directed: true,
        roots,
        padding: 74,
        spacingFactor: 1.18,
        avoidOverlap: true,
        avoidOverlapPadding: 18,
        nodeDimensionsIncludeLabels: true,
        animate,
        animationDuration: animate ? 480 : 0,
        sort: (a, b) => {
          const colDelta = a.data("col") - b.data("col");
          if (colDelta !== 0) return colDelta;
          return a.data("order") - b.data("order");
        },
      });
    }

    layout.on("layoutstop", () => {
      const lockedLineIds = new Set([...primaryLineIds].filter((id) => nodeIdSet.has(id)));
      const postAdjustAnimate = false;
      if (keepLineCentered && lockedLineIds.size > 0) {
        alignPrimaryLine(nodeIdSet, primaryLineIds, centerId, postAdjustAnimate);
        rebalanceSideBranches(nodeIdSet, lockedLineIds, postAdjustAnimate);
        enforcePrimaryAxisClearance(nodeIdSet, lockedLineIds, centerId, postAdjustAnimate);
      }
      separateCoincidentNodes(nodeIdSet, lockedLineIds, postAdjustAnimate);
      resolveNodeCollisions(nodeIdSet, lockedLineIds, postAdjustAnimate);
      if (keepLineCentered && lockedLineIds.size > 0) {
        alignPrimaryLine(nodeIdSet, primaryLineIds, centerId, false);
        enforcePrimaryAxisClearance(nodeIdSet, lockedLineIds, centerId, false);
      }
      updateVisibleEdgeCurves(nodeIdSet, edgeIdSet, lockedLineIds);
      if (animate) {
        scheduleVisibleEdgeCurveRefresh(nodeIdSet, edgeIdSet, lockedLineIds, 260);
      }
      applyViewport();
    });

    layout.run();
  }

  function updateModeButtons() {
    if (familyModeBtn) {
      familyModeBtn.classList.toggle("is-active", viewMode === "family");
    }
    if (fullModeBtn) {
      fullModeBtn.classList.toggle("is-active", viewMode === "full");
    }
    if (sideBranchToggle) {
      sideBranchToggle.checked = includeSideBranches;
      sideBranchToggle.disabled = viewMode !== "family";
    }
    if (familyTreeBtn) {
      familyTreeBtn.style.display = "none";
    }
    if (familyRadialBtn) {
      familyRadialBtn.style.display = "none";
    }
    if (fullCollapseToggle) {
      fullCollapseToggle.checked = collapseMinorInFull;
      fullCollapseToggle.disabled = viewMode !== "full";
    }
    if (autoZoomToggle) {
      autoZoomToggle.checked = autoZoomOnFocus;
    }
  }
  function updateFocusInfo(lineageCount, visibleCount, centerId) {
    if (!focusInfo) return;

    if (viewMode === "family") {
      const centerNode = nodeById(centerId || familyCenterId);
      const centerText = centerNode ? centerNode.label : "-";
      if (!focusedId) {
        focusInfo.textContent = `目前：家系模式（中心 ${centerText}，上下各 ${FAMILY_UP_DEPTH} 代，顯示 ${visibleCount || 0} 人）`;
        return;
      }

      const focusedNode = nodeById(focusedId);
      const focusText = focusedNode ? focusedNode.label : centerText;
      focusInfo.textContent = `目前：家系模式，已選取 ${focusText}（可視直系 ${Math.max(0, (lineageCount || 0) - 1)} 人）`;
      return;
    }

    const foldText = collapseMinorInFull ? "末梢已折疊" : "完整";

    if (!focusedId) {
      focusInfo.textContent = `目前：全圖模式（${foldText}，未選取）`;
      return;
    }

    const focusedNode = nodeById(focusedId);
    focusInfo.textContent = focusedNode
      ? `目前：全圖模式（${foldText}），已選取 ${focusedNode.label}（直系 ${Math.max(0, (lineageCount || 0) - 1)} 人）`
      : `目前：全圖模式（${foldText}，未選取）`;
  }
  function renderFamilyView(animateLayout, centerOnFocused) {
    const centerId = familyCenterId || focusedId || getDefaultCenterId();
    if (!centerId) return;

    familyCenterId = centerId;

    const familyView = collectFamilyView(
      centerId,
      FAMILY_UP_DEPTH,
      FAMILY_DOWN_DEPTH,
      includeSideBranches,
    );

    const visibleNodeIds = familyView.visibleNodes;
    const primaryLineIds = computePrimaryLine(centerId, FAMILY_UP_DEPTH, FAMILY_DOWN_DEPTH);
    const visibleEdgeIds = buildFamilyTreeEdgeSet(visibleNodeIds, primaryLineIds, centerId);

    applyVisibility(visibleNodeIds, visibleEdgeIds);
    const lineage = focusedId
      ? new Set([...familyView.coreLineageNodes].filter((id) => visibleNodeIds.has(id)))
      : new Set();
    applyHighlight(focusedId, lineage, visibleNodeIds, visibleEdgeIds);
    runLayoutForNodeSet(visibleNodeIds, visibleEdgeIds, animateLayout, 92, {
      layoutType: "tree",
      centerId,
      lineageSet: lineage,
      primaryLineIds,
      keepLineCentered: true,
      centerOnFocused,
      autoFit: autoZoomOnFocus,
      preferDagre: true,
    }, () => {
      updateFocusInfo(lineage.size, visibleNodeIds.size, centerId);
    });
  }
  function collectDescendantsInSet(rootId, allowedNodeIds) {
    const allowed = allowedNodeIds || new Set();
    const descendants = new Set();
    if (!rootId || !allowed.has(rootId)) return descendants;

    const queue = [rootId];
    descendants.add(rootId);

    while (queue.length > 0) {
      const currentId = queue.shift();
      const currentNode = nodeById(currentId);
      if (!currentNode) continue;

      for (const childId of currentNode.children) {
        if (!allowed.has(childId) || descendants.has(childId)) continue;
        descendants.add(childId);
        queue.push(childId);
      }
    }

    return descendants;
  }

  function collectEdgeSubset(nodeIdSet, candidateEdgeIds) {
    const subset = new Set();
    const candidates = candidateEdgeIds || new Set();

    for (const edgeId of candidates) {
      const parts = edgeId.split("->");
      if (parts.length !== 2) continue;
      if (nodeIdSet.has(parts[0]) && nodeIdSet.has(parts[1])) {
        subset.add(edgeId);
      }
    }

    return subset;
  }
  function renderFullView(animateLayout, centerOnFocused) {
    const fullView = collectFullView(collapseMinorInFull, focusedId);
    const visibleNodeIds = fullView.visibleNodes;
    const visibleEdgeIds = fullView.visibleEdges;

    applyVisibility(visibleNodeIds, visibleEdgeIds);

    const lineage = focusedId
      ? new Set([...computeLineageSet(focusedId)].filter((id) => visibleNodeIds.has(id)))
      : new Set();
    const primaryLineIds = focusedId ? computePrimaryLine(focusedId) : new Set();

    applyHighlight(focusedId, lineage, visibleNodeIds, visibleEdgeIds);

    if (animateLayout) {
      if (focusedId) {
        const subtreeNodeIds = collectDescendantsInSet(focusedId, visibleNodeIds);
        const subtreeEdgeIds = collectEdgeSubset(subtreeNodeIds, visibleEdgeIds);
        const subtreeLine = new Set(
          [...computePrimaryLine(focusedId, 0, Number.POSITIVE_INFINITY)]
            .filter((id) => subtreeNodeIds.has(id)),
        );
        const subtreeLineage = new Set([...lineage].filter((id) => subtreeNodeIds.has(id)));

        runLayoutForNodeSet(subtreeNodeIds, subtreeEdgeIds, true, 92, {
          layoutType: "tree",
          centerId: focusedId,
          lineageSet: subtreeLineage,
          primaryLineIds: subtreeLine,
          keepLineCentered: true,
          centerOnFocused,
          autoFit: autoZoomOnFocus,
          preferDagre: true,
        }, () => {
          updateFocusInfo(lineage.size, visibleNodeIds.size, focusedId);
        });
        return;
      }

      runLayoutForNodeSet(visibleNodeIds, visibleEdgeIds, true, 92, {
        layoutType: "tree",
        centerId: focusedId,
        lineageSet: lineage,
        primaryLineIds,
        keepLineCentered: Boolean(focusedId),
        centerOnFocused,
        autoFit: autoZoomOnFocus,
      }, () => {
        updateFocusInfo(lineage.size, visibleNodeIds.size, focusedId);
      });
      return;
    }

    if (centerOnFocused && focusedId && autoZoomOnFocus) {
      applyFocusViewport(focusedId, visibleNodeIds, lineage, 118, true, collectionFromIds(visibleNodeIds));
    }

    updateFocusInfo(lineage.size, visibleNodeIds.size, focusedId);
  }
  function renderCurrentView(options = {}) {
    const {
      animate = true,
      relayout = true,
      centerOnFocused = true,
    } = options;

    clearAllStateClasses();
    updateModeButtons();

    if (viewMode === "family") {
      renderFamilyView(relayout ? animate : false, centerOnFocused);
    } else {
      renderFullView(relayout ? animate : false, centerOnFocused && animate);
    }
  }

  function setViewMode(mode, options = {}) {
    if (mode !== "family" && mode !== "full") return;

    viewMode = mode;

    if (viewMode === "family") {
      if (!familyCenterId) {
        familyCenterId = focusedId || getDefaultCenterId();
      }
      if (!focusedId) {
        focusedId = familyCenterId;
      }
    }

    renderCurrentView({
      animate: options.animate !== false,
      relayout: true,
      centerOnFocused: true,
    });
  }

  function focusNode(nodeId, options = {}) {
    if (!nodeMap.has(nodeId)) return;

    focusedId = nodeId;
    familyCenterId = nodeId;

    renderCurrentView({
      animate: options.animate !== false,
      relayout: true,
      centerOnFocused: true,
    });
  }

  function clearSelection() {
    focusedId = null;

    if (viewMode === "family") {
      if (!familyCenterId) {
        familyCenterId = getDefaultCenterId();
      }
      renderCurrentView({ animate: true, relayout: false, centerOnFocused: false });
      return;
    }

    renderCurrentView({ animate: false, relayout: false, centerOnFocused: false });
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
        focusNode(node.id, { animate: true });
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

  function collectVisibleDescendants(rootId) {
    const descendants = [];
    const queue = [rootId];
    const visited = new Set([rootId]);

    while (queue.length > 0) {
      const currentId = queue.shift();
      const node = nodeById(currentId);
      if (!node) continue;

      for (const childId of node.children) {
        if (visited.has(childId)) continue;
        visited.add(childId);

        const childEle = cy.getElementById(childId);
        if (!childEle || childEle.length === 0 || childEle.hasClass("mode-hidden")) continue;

        descendants.push(childId);
        queue.push(childId);
      }
    }

    return descendants;
  }

  function collectVisibleStateForCurves() {
    const nodeIds = new Set();
    const edgeIds = new Set();

    cy.nodes().forEach((ele) => {
      if (!ele.hasClass("mode-hidden")) nodeIds.add(ele.id());
    });
    cy.edges().forEach((ele) => {
      if (!ele.hasClass("mode-hidden")) edgeIds.add(ele.id());
    });

    return { nodeIds, edgeIds };
  }

  cy.on("grab", "node", (event) => {
    const rootEle = event.target;
    const rootId = rootEle.id();
    const descendantIds = collectVisibleDescendants(rootId);
    const descendants = new Map();

    for (const id of descendantIds) {
      const ele = cy.getElementById(id);
      if (!ele || ele.length === 0) continue;
      const p = ele.position();
      descendants.set(id, { x: p.x, y: p.y });
    }

    const rootPos = rootEle.position();
    dragCascadeState = {
      rootId,
      rootStart: { x: rootPos.x, y: rootPos.y },
      descendants,
    };
  });

  cy.on("drag", "node", (event) => {
    if (!dragCascadeState) return;
    if (dragCascadeState.rootId !== event.target.id()) return;

    const rootPos = event.target.position();
    const dx = rootPos.x - dragCascadeState.rootStart.x;
    const dy = rootPos.y - dragCascadeState.rootStart.y;

    for (const [id, startPos] of dragCascadeState.descendants.entries()) {
      const ele = cy.getElementById(id);
      if (!ele || ele.length === 0 || ele.hasClass("mode-hidden")) continue;
      ele.position({ x: startPos.x + dx, y: startPos.y + dy });
    }

    const visible = collectVisibleStateForCurves();
    const centerId = familyCenterId || focusedId || getDefaultCenterId();
    const primaryLine = centerId
      ? computePrimaryLine(centerId, FAMILY_UP_DEPTH, FAMILY_DOWN_DEPTH)
      : new Set();
    updateVisibleEdgeCurves(visible.nodeIds, visible.edgeIds, primaryLine);
  });

  cy.on("free", "node", (event) => {
    if (!dragCascadeState) return;
    if (dragCascadeState.rootId !== event.target.id()) return;

    const visible = collectVisibleStateForCurves();
    const centerId = familyCenterId || focusedId || getDefaultCenterId();
    const primaryLine = centerId
      ? computePrimaryLine(centerId, FAMILY_UP_DEPTH, FAMILY_DOWN_DEPTH)
      : new Set();
    updateVisibleEdgeCurves(visible.nodeIds, visible.edgeIds, primaryLine);
    dragCascadeState = null;
  });
  cy.on("tap", "node", (event) => {
    focusNode(event.target.id(), { animate: true });
  });

  cy.on("tap", (event) => {
    if (event.target !== cy) return;
    clearSelection();
  });

  if (familyModeBtn) {
    familyModeBtn.addEventListener("click", () => {
      setViewMode("family", { animate: true });
    });
  }

  if (fullModeBtn) {
    fullModeBtn.addEventListener("click", () => {
      setViewMode("full", { animate: true });
    });
  }


  if (autoZoomToggle) {
    autoZoomToggle.addEventListener("change", () => {
      autoZoomOnFocus = Boolean(autoZoomToggle.checked);
      updateModeButtons();
      if (autoZoomOnFocus && focusedId) {
        renderCurrentView({ animate: true, relayout: false, centerOnFocused: true });
      }
    });
  }
  if (fullCollapseToggle) {
    fullCollapseToggle.addEventListener("change", () => {
      collapseMinorInFull = Boolean(fullCollapseToggle.checked);
      updateModeButtons();
      if (viewMode === "full") {
        renderCurrentView({ animate: true, relayout: true, centerOnFocused: true });
      }
    });
  }

  if (sideBranchToggle) {
    sideBranchToggle.addEventListener("change", () => {
      includeSideBranches = Boolean(sideBranchToggle.checked);
      if (viewMode === "family") {
        renderCurrentView({ animate: true, relayout: true, centerOnFocused: true });
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      focusedId = null;
      familyCenterId = getDefaultCenterId();
      renderCurrentView({ animate: true, relayout: true, centerOnFocused: false });
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

  includeSideBranches = Boolean(sideBranchToggle?.checked);
  collapseMinorInFull = fullCollapseToggle ? Boolean(fullCollapseToggle.checked) : true;
  autoZoomOnFocus = autoZoomToggle ? Boolean(autoZoomToggle.checked) : true;
  familyCenterId = getDefaultCenterId();
  focusedId = familyCenterId;

  renderSearchResults("");
  setViewMode("family", { animate: false });
})();


