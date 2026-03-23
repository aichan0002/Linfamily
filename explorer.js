(() => {
  const graphCanvas = document.getElementById("graphCanvas");
  const versionBadge = document.getElementById("versionBadge");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  const detailContent = document.getElementById("detailContent");
  const nodeCount = document.getElementById("nodeCount");
  const edgeCount = document.getElementById("edgeCount");
  const focusName = document.getElementById("focusName");
  const showAllBtn = document.getElementById("showAllBtn");
  const focusFamilyBtn = document.getElementById("focusFamilyBtn");
  const relayoutBtn = document.getElementById("relayoutBtn");
  const centerBtn = document.getElementById("centerBtn");
  const resetViewBtn = document.getElementById("resetViewBtn");
  const labelsToggle = document.getElementById("labelsToggle");
  const notesToggle = document.getElementById("notesToggle");

  const APP_VERSION = "v2026.03.23-explorer-01";

  if (versionBadge) {
    versionBadge.textContent = APP_VERSION;
  }

  if (!graphCanvas || typeof window.cytoscape !== "function") {
    return;
  }

  if (typeof window.cytoscapeDagre === "function" && typeof window.dagre !== "undefined") {
    window.cytoscape.use(window.cytoscapeDagre);
  }

  const columns = Array.isArray(window.FAMILY_COLUMNS) ? window.FAMILY_COLUMNS : [];
  const rawRows = Array.isArray(window.FAMILY_ROWS) ? window.FAMILY_ROWS : [];
  const nodeMap = new Map();
  const edgeMap = new Map();

  function cleanCell(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  function detectRootName(rows) {
    const counts = new Map();
    rows.forEach((row) => {
      const firstCell = cleanCell(row?.[0]);
      if (!firstCell) return;
      counts.set(firstCell, (counts.get(firstCell) || 0) + 1);
    });
    let root = null;
    let maxCount = -1;
    counts.forEach((count, label) => {
      if (count > maxCount) {
        root = label;
        maxCount = count;
      }
    });
    return root;
  }

  const tableRows = rawRows
    .map((row) => {
      const cells = Array.isArray(row) ? row : [];
      return columns.map((_, index) => cleanCell(cells[index]));
    })
    .filter((row) => row.some(Boolean));

  const rootName = detectRootName(tableRows);
  let sequence = 0;

  function getNode(id, col, label) {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        label,
        col,
        notes: new Set(),
        parents: [],
        children: [],
        order: sequence,
        note: "",
        size: 74,
      });
      sequence += 1;
    }
    return nodeMap.get(id);
  }

  function link(source, target) {
    if (!source || !target || source === target) return;
    const key = `${source}->${target}`;
    if (edgeMap.has(key)) return;
    edgeMap.set(key, { source, target });
    const sourceNode = nodeMap.get(source);
    const targetNode = nodeMap.get(target);
    if (sourceNode && !sourceNode.children.includes(target)) {
      sourceNode.children.push(target);
    }
    if (targetNode && !targetNode.parents.includes(source)) {
      targetNode.parents.push(source);
    }
  }

  const lastPathNodeByCol = Array.from({ length: columns.length }, () => null);

  tableRows.forEach((row) => {
    const isPathRow = row[0] && (!rootName || row[0] === rootName);

    if (isPathRow) {
      for (let i = 0; i < lastPathNodeByCol.length; i += 1) {
        lastPathNodeByCol[i] = null;
      }

      const prefix = [];
      let previousId = null;
      for (let col = 0; col < columns.length; col += 1) {
        const label = row[col];
        if (!label) continue;
        prefix.push(label);
        const id = `${col}:${prefix.join(">")}`;
        getNode(id, col, label);
        lastPathNodeByCol[col] = id;
        if (previousId) {
          link(previousId, id);
        }
        previousId = id;
      }
      return;
    }

    for (let col = 0; col < columns.length; col += 1) {
      const note = row[col];
      const nodeId = lastPathNodeByCol[col];
      if (!note || !nodeId) continue;
      nodeMap.get(nodeId)?.notes.add(note);
    }
  });

  const nodes = [...nodeMap.values()];
  const edges = [...edgeMap.values()];
  const nodeById = (id) => nodeMap.get(id) || null;
  const maxCol = Math.max(1, ...nodes.map((node) => node.col));

  nodes.forEach((node) => {
    const notes = [...node.notes].map(cleanCell).filter((note) => note && note !== "*" && note !== node.label);
    node.note = notes.slice(0, 4).join("、");
    const degree = node.parents.length + node.children.length;
    const labelBonus = Math.min(28, node.label.length * 2.3);
    const degreeBonus = Math.min(24, degree * 2.5);
    const noteBonus = node.note ? 8 : 0;
    node.size = Math.max(66, Math.min(118, 52 + labelBonus + degreeBonus + noteBonus));
  });

  function generationText(col) {
    const column = columns[col];
    if (!column) return "";
    const parts = [column.generation, column.marker].map(cleanCell).filter(Boolean);
    return parts.join(" ");
  }

  function nodeTone(col) {
    const ratio = Math.max(0, Math.min(1, col / maxCol));
    const hue = Math.round(195 + ratio * 48);
    const light = Math.round(24 + ratio * 8);
    return {
      fill: `hsl(${hue}, 30%, ${light}%)`,
      glow: `hsla(${170 - ratio * 34}, 78%, 72%, 0.24)`,
      line: `hsla(${55 + ratio * 80}, 74%, ${72 - ratio * 10}%, 0.74)`,
      active: `hsla(${180 - ratio * 24}, 92%, 80%, 0.98)`,
    };
  }

  const elements = [];
  nodes.forEach((node) => {
    const tone = nodeTone(node.col);
    elements.push({
      group: "nodes",
      data: {
        id: node.id,
        label: node.label,
        note: node.note,
        displayLabel: node.note ? `${node.label}\n${node.note}` : node.label,
        generation: generationText(node.col),
        col: node.col,
        size: node.size,
        fill: tone.fill,
        glow: tone.glow,
        ring: tone.active,
        searchText: `${node.label} ${node.note} ${generationText(node.col)}`.toLowerCase(),
      },
    });
  });

  edges.forEach((edge) => {
    const sourceNode = nodeById(edge.source);
    const tone = nodeTone(sourceNode?.col || 0);
    elements.push({
      group: "edges",
      data: {
        id: `${edge.source}->${edge.target}`,
        source: edge.source,
        target: edge.target,
        lineColor: tone.line,
      },
    });
  });

  const cy = window.cytoscape({
    container: graphCanvas,
    elements,
    minZoom: 0.12,
    maxZoom: 2.4,
    wheelSensitivity: 0.2,
    style: [
      {
        selector: "node",
        style: {
          shape: "round-rectangle",
          width: "data(size)",
          height: "data(size)",
          "border-width": 2.5,
          "border-color": "#d6fff8",
          "background-color": "data(fill)",
          "background-opacity": 0.96,
          label: "data(displayLabel)",
          color: "#f3fbff",
          "font-size": 17,
          "font-weight": 700,
          "text-wrap": "wrap",
          "text-max-width": 100,
          "line-height": 1.18,
          "text-halign": "center",
          "text-valign": "center",
          "overlay-opacity": 0,
          "shadow-blur": 30,
          "shadow-opacity": 0.3,
          "shadow-color": "data(glow)",
          "shadow-offset-x": 0,
          "shadow-offset-y": 0,
        },
      },
      {
        selector: "node.has-note",
        style: {
          "border-width": 3,
        },
      },
      {
        selector: "node.dimmed",
        style: {
          opacity: 0.18,
        },
      },
      {
        selector: "node.focused",
        style: {
          "border-color": "#ffffff",
          "border-width": 4.5,
          "shadow-opacity": 0.55,
          "shadow-blur": 42,
          "z-index": 999,
        },
      },
      {
        selector: "node.kin",
        style: {
          opacity: 1,
        },
      },
      {
        selector: "edge",
        style: {
          width: 2.3,
          "curve-style": "unbundled-bezier",
          "line-color": "data(lineColor)",
          "target-arrow-color": "data(lineColor)",
          "target-arrow-shape": "chevron",
          "arrow-scale": 1.05,
          "source-endpoint": "outside-to-node",
          "target-endpoint": "outside-to-node",
          opacity: 0.6,
        },
      },
      {
        selector: "edge.dimmed",
        style: {
          opacity: 0.08,
        },
      },
      {
        selector: "edge.focused",
        style: {
          width: 3.6,
          opacity: 0.98,
        },
      },
      {
        selector: "edge.family",
        style: {
          opacity: 0.88,
        },
      },
    ],
  });

  nodes.forEach((node) => {
    if (node.note) {
      cy.getElementById(node.id).addClass("has-note");
    }
  });

  if (nodeCount) {
    nodeCount.textContent = String(nodes.length);
  }
  if (edgeCount) {
    edgeCount.textContent = String(edges.length);
  }

  let activeFocusId = null;

  function runGlobalLayout(animated = true) {
    cy.layout({
      name: "cose",
      animate: animated,
      animationDuration: 700,
      fit: true,
      padding: 70,
      idealEdgeLength: 180,
      nodeRepulsion: 780000,
      gravity: 0.16,
      nestingFactor: 0.8,
      componentSpacing: 180,
      edgeElasticity: 90,
      numIter: 1400,
      initialTemp: 160,
      coolingFactor: 0.94,
      minTemp: 1,
    }).run();
  }

  function collectFamily(nodeId, upDepth = 3, downDepth = 3) {
    const familyNodes = new Set([nodeId]);
    const familyEdges = new Set();

    function walkUp(currentId, depth) {
      if (depth <= 0) return;
      const current = nodeById(currentId);
      if (!current) return;
      current.parents.forEach((parentId) => {
        familyNodes.add(parentId);
        familyEdges.add(`${parentId}->${currentId}`);
        walkUp(parentId, depth - 1);
      });
    }

    function walkDown(currentId, depth) {
      if (depth <= 0) return;
      const current = nodeById(currentId);
      if (!current) return;
      current.children.forEach((childId) => {
        familyNodes.add(childId);
        familyEdges.add(`${currentId}->${childId}`);
        walkDown(childId, depth - 1);
      });
    }

    walkUp(nodeId, upDepth);
    walkDown(nodeId, downDepth);

    [...familyNodes].forEach((id) => {
      const current = nodeById(id);
      if (!current) return;
      current.parents.forEach((parentId) => {
        const parent = nodeById(parentId);
        if (!parent) return;
        parent.children.forEach((siblingId) => {
          familyNodes.add(siblingId);
          familyEdges.add(`${parentId}->${siblingId}`);
        });
      });
    });

    return { familyNodes, familyEdges };
  }

  function applyDimState(nodeIds, edgeIds) {
    const keepNodes = nodeIds || new Set(nodes.map((node) => node.id));
    const keepEdges = edgeIds || new Set(edges.map((edge) => `${edge.source}->${edge.target}`));

    cy.nodes().forEach((node) => {
      const keep = keepNodes.has(node.id());
      node.toggleClass("dimmed", !keep);
      node.toggleClass("kin", keep);
    });
    cy.edges().forEach((edge) => {
      const keep = keepEdges.has(edge.id());
      edge.toggleClass("dimmed", !keep);
      edge.toggleClass("family", keep);
      edge.toggleClass("focused", keep);
    });
  }

  function clearFocusState() {
    activeFocusId = null;
    cy.nodes().removeClass("focused dimmed kin");
    cy.edges().removeClass("focused dimmed family");
    if (focusName) {
      focusName.textContent = "全部族譜";
    }
    if (detailContent) {
      detailContent.innerHTML = '<p class="detail-empty">點選圖上的人物後，這裡會顯示其直系、旁系與人物附註。</p>';
    }
  }

  function listHtml(title, labels) {
    const chips = labels.length
      ? labels.map((label) => `<span class="chip">${label}</span>`).join("")
      : '<span class="chip">無</span>';
    return `<section class="detail-section"><h3>${title}</h3><div class="chip-list">${chips}</div></section>`;
  }

  function renderDetail(node) {
    if (!detailContent) return;
    const parents = node.parents.map((id) => nodeById(id)?.label).filter(Boolean);
    const children = node.children.map((id) => nodeById(id)?.label).filter(Boolean);
    const siblings = new Set();
    node.parents.forEach((parentId) => {
      nodeById(parentId)?.children.forEach((childId) => {
        if (childId !== node.id) {
          const sibling = nodeById(childId);
          if (sibling) siblings.add(sibling.label);
        }
      });
    });

    detailContent.innerHTML = `
      <section class="detail-section">
        <h3>目前人物</h3>
        <p class="detail-text"><strong>${node.label}</strong>${node.note ? `，附註：${node.note}` : ""}</p>
        <p class="detail-text">${generationText(node.col) || "世代資訊未標記"}，上游 ${parents.length} 人，下游 ${children.length} 人。</p>
      </section>
      ${listHtml("上代", parents)}
      ${listHtml("同輩", [...siblings])}
      ${listHtml("下代", children)}
    `;
  }

  function centerOnNode(nodeId, zoom = 0.92) {
    const target = cy.getElementById(nodeId);
    if (!target || target.empty()) return;
    cy.animate({
      center: { eles: target },
      zoom,
      duration: 520,
    });
  }

  function focusNode(nodeId, options = {}) {
    const target = nodeById(nodeId);
    if (!target) return;
    activeFocusId = nodeId;
    cy.nodes().removeClass("focused");
    cy.edges().removeClass("focused");

    const graphNode = cy.getElementById(nodeId);
    graphNode.addClass("focused");

    const { familyNodes, familyEdges } = collectFamily(nodeId, 3, 4);
    applyDimState(familyNodes, familyEdges);
    renderDetail(target);
    if (focusName) {
      focusName.textContent = target.label;
    }
    if (options.center !== false) {
      centerOnNode(nodeId, options.zoom || 0.96);
    }
  }

  function runFocusedLayout(nodeId) {
    const target = nodeById(nodeId);
    if (!target) return;
    const family = collectFamily(nodeId, 3, 4);
    const eles = cy.elements().filter((ele) => {
      if (ele.isNode()) return family.familyNodes.has(ele.id());
      return family.familyEdges.has(ele.id());
    });

    const roots = target.parents.length ? target.parents : [nodeId];

    eles.layout({
      name: "dagre",
      rankDir: "TB",
      fit: false,
      animate: true,
      animationDuration: 520,
      nodeSep: 44,
      rankSep: 120,
      edgeSep: 30,
      roots,
    }).run();

    window.setTimeout(() => focusNode(nodeId, { zoom: 0.98 }), 120);
  }

  function refreshLabels() {
    const showLabels = labelsToggle?.checked !== false;
    const showNotes = notesToggle?.checked !== false;
    cy.nodes().forEach((nodeEle) => {
      const data = nodeEle.data();
      if (!showLabels) {
        nodeEle.data("displayLabel", "");
        return;
      }
      nodeEle.data("displayLabel", showNotes && data.note ? `${data.label}\n${data.note}` : data.label);
    });
  }

  function renderSearchResults(query) {
    if (!searchResults) return;
    const keyword = String(query || "").trim().toLowerCase();
    if (!keyword) {
      searchResults.innerHTML = "";
      return;
    }

    const matches = nodes
      .filter((node) => {
        const haystack = `${node.label} ${node.note} ${generationText(node.col)}`.toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((a, b) => a.col - b.col || a.order - b.order)
      .slice(0, 24);

    if (matches.length === 0) {
      searchResults.innerHTML = '<p class="detail-empty">找不到符合的姓名。</p>';
      return;
    }

    searchResults.innerHTML = matches
      .map(
        (node) => `
          <button class="search-item" type="button" data-node-id="${node.id}">
            ${node.label}
            <span class="search-meta">${generationText(node.col) || "未標示世代"}${node.note ? ` · ${node.note}` : ""}</span>
          </button>
        `
      )
      .join("");
  }

  searchResults?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-node-id]");
    if (!button) return;
    const nodeId = button.getAttribute("data-node-id");
    if (!nodeId) return;
    focusNode(nodeId);
    runFocusedLayout(nodeId);
  });

  searchInput?.addEventListener("input", (event) => {
    renderSearchResults(event.target.value);
  });

  cy.on("tap", "node", (event) => {
    const nodeId = event.target.id();
    focusNode(nodeId);
    runFocusedLayout(nodeId);
  });

  cy.on("tap", (event) => {
    if (event.target !== cy) return;
    clearFocusState();
    runGlobalLayout(false);
  });

  showAllBtn?.addEventListener("click", () => {
    clearFocusState();
    runGlobalLayout(true);
  });

  focusFamilyBtn?.addEventListener("click", () => {
    if (!activeFocusId) return;
    runFocusedLayout(activeFocusId);
  });

  relayoutBtn?.addEventListener("click", () => {
    if (activeFocusId) {
      runFocusedLayout(activeFocusId);
      return;
    }
    runGlobalLayout(true);
  });

  centerBtn?.addEventListener("click", () => {
    if (activeFocusId) {
      centerOnNode(activeFocusId, 0.98);
      return;
    }
    cy.fit(cy.elements(), 70);
  });

  resetViewBtn?.addEventListener("click", () => {
    clearFocusState();
    runGlobalLayout(true);
  });

  labelsToggle?.addEventListener("change", refreshLabels);
  notesToggle?.addEventListener("change", refreshLabels);

  refreshLabels();
  clearFocusState();
  runGlobalLayout(false);
})();
