import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import type { Simulation, SimulationLinkDatum } from "d3-force";
import type { GraphSettings } from "../editorTypes";
import type { GraphData, GraphLink, GraphNode } from "../utils/graphData";
import { getLinkColor } from "../utils/graphData";

export interface GraphViewProps {
  graphData: GraphData;
  settings: GraphSettings;
  activeNodeId?: string;
  highlightedNodes?: Set<string>;
  resetSignal?: number;
  width?: number;
  height?: number;
  onNodeClick: (nodePath: string) => void;
  onOpenLocalGraph: (nodePath: string) => void;
  onRevealNode: (nodePath: string) => void;
  onNodeHover?: (node: GraphNode | null) => void;
}

interface D3Node extends GraphNode {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface D3Link extends SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
  type: GraphLink["type"];
  strength: number;
  label?: string;
  directed?: boolean;
}

type ViewTransform = { x: number; y: number; k: number };

type DragState =
  | { kind: "pan"; startX: number; startY: number; origin: ViewTransform }
  | { kind: "node"; node: D3Node; startX: number; startY: number; moved: boolean };

export function GraphView({
  graphData,
  settings,
  activeNodeId,
  highlightedNodes,
  resetSignal,
  width,
  height,
  onNodeClick,
  onOpenLocalGraph,
  onRevealNode,
  onNodeHover,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<Simulation<D3Node, D3Link> | null>(null);
  const nodesRef = useRef<D3Node[]>([]);
  const linksRef = useRef<D3Link[]>([]);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const transformRef = useRef<ViewTransform>({ x: 0, y: 0, k: 1 });
  const dragStateRef = useRef<DragState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | undefined>();
  const hoveredNodeIdRef = useRef<string | undefined>(undefined);
  const [measuredSize, setMeasuredSize] = useState({ width: width ?? 800, height: height ?? 600 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: GraphNode } | null>(
    null,
  );
  const canvasWidth = width ?? measuredSize.width;
  const canvasHeight = height ?? measuredSize.height;

  const connectedNodeIds = useMemo(() => {
    const connected = new Set<string>();
    const targetIds = new Set<string>();
    if (hoveredNodeId) targetIds.add(hoveredNodeId);
    highlightedNodes?.forEach((id) => targetIds.add(id));
    if (activeNodeId) targetIds.add(activeNodeId);
    if (!targetIds.size) return connected;

    graphData.links.forEach((link) => {
      if (targetIds.has(link.source) || targetIds.has(link.target)) {
        connected.add(link.source);
        connected.add(link.target);
      }
    });
    targetIds.forEach((id) => connected.add(id));
    return connected;
  }, [activeNodeId, graphData.links, highlightedNodes, hoveredNodeId]);

  useEffect(() => {
    hoveredNodeIdRef.current = hoveredNodeId;
    renderGraph();
  }, [connectedNodeIds, hoveredNodeId]);

  useEffect(() => {
    if (width && height) return;
    const container = containerRef.current;
    if (!container) return;
    const observedContainer = container;

    function updateSize() {
      setMeasuredSize({
        width: Math.max(1, Math.floor(observedContainer.clientWidth || 800)),
        height: Math.max(1, Math.floor(observedContainer.clientHeight || 600)),
      });
    }

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(observedContainer);
    return () => observer.disconnect();
  }, [width, height]);

  useEffect(() => {
    if (!graphData.nodes.length) {
      simulationRef.current?.stop();
      simulationRef.current = null;
      nodesRef.current = [];
      linksRef.current = [];
      renderGraph();
      return;
    }

    const d3Nodes: D3Node[] = graphData.nodes.map((node, index) => {
      const savedPosition = positionsRef.current.get(node.id);
      const seededPosition =
        savedPosition ?? seedPosition(index, graphData.nodes.length, canvasWidth, canvasHeight);
      return {
        ...node,
        x: seededPosition.x,
        y: seededPosition.y,
      };
    });

    const d3Links: D3Link[] = graphData.links.map((link) => ({
      ...link,
      source: link.source,
      target: link.target,
    }));

    nodesRef.current = d3Nodes;
    linksRef.current = d3Links;
    if (
      transformRef.current.x === 0 &&
      transformRef.current.y === 0 &&
      transformRef.current.k === 1
    ) {
      transformRef.current = { x: canvasWidth / 2, y: canvasHeight / 2, k: 1 };
    }

    const simulation = forceSimulation<D3Node>(d3Nodes)
      .force(
        "link",
        forceLink<D3Node, D3Link>(d3Links)
          .id((node) => node.id)
          .distance(settings.linkDistance)
          .strength(settings.linkForce),
      )
      .force("charge", forceManyBody<D3Node>().strength(-settings.repelForce).distanceMax(700))
      .force("x", forceX<D3Node>(0).strength(settings.centerForce))
      .force("y", forceY<D3Node>(0).strength(settings.centerForce))
      .force(
        "collide",
        forceCollide<D3Node>()
          .radius((node) => nodeRadius(node) + 8)
          .iterations(2),
      )
      .alpha(0.85)
      .alphaDecay(0.05)
      .on("tick", () => {
        nodesRef.current.forEach((node) => {
          positionsRef.current.set(node.id, { x: node.x, y: node.y });
        });
        renderGraph();
      });

    simulationRef.current = simulation;
    return () => {
      simulation.stop();
      if (simulationRef.current === simulation) simulationRef.current = null;
    };
  }, [
    canvasHeight,
    canvasWidth,
    graphData.links,
    graphData.nodes,
    settings.centerForce,
    settings.linkDistance,
    settings.linkForce,
    settings.nodeSize,
    settings.repelForce,
  ]);

  useEffect(() => {
    fitToGraph();
  }, [resetSignal]);

  useEffect(() => {
    renderGraph();
  }, [
    activeNodeId,
    canvasHeight,
    canvasWidth,
    graphData.nodes.length,
    settings.linkThickness,
    settings.nodeSize,
    settings.showArrows,
    settings.textFadeThreshold,
  ]);

  useEffect(() => {
    if (!contextMenu) return;
    function closeMenu(event: Event) {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    }
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeMenu);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, [contextMenu]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dragState = dragStateRef.current;
      if (dragState?.kind === "pan") {
        const pointer = canvasPoint(event.clientX, event.clientY);
        transformRef.current = {
          ...dragState.origin,
          x: dragState.origin.x + pointer.x - dragState.startX,
          y: dragState.origin.y + pointer.y - dragState.startY,
        };
        renderGraph();
        return;
      }

      const worldPoint = screenToWorld(event.clientX, event.clientY);
      if (dragState?.kind === "node") {
        const pointer = canvasPoint(event.clientX, event.clientY);
        const moved = Math.hypot(pointer.x - dragState.startX, pointer.y - dragState.startY) > 3;
        dragState.moved = dragState.moved || moved;
        dragState.node.fx = worldPoint.x;
        dragState.node.fy = worldPoint.y;
        simulationRef.current?.alphaTarget(0.18).restart();
        renderGraph();
        return;
      }

      const hitNode = findNodeAt(worldPoint.x, worldPoint.y);
      const nextHoveredId = hitNode?.id;
      if (nextHoveredId !== hoveredNodeIdRef.current) {
        hoveredNodeIdRef.current = nextHoveredId;
        setHoveredNodeId(nextHoveredId);
        onNodeHover?.(hitNode ?? null);
      }
      canvas.style.cursor = hitNode ? "pointer" : "grab";
    },
    [onNodeHover],
  );

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = canvasPoint(event.clientX, event.clientY);
    const hitPoint = screenToWorld(event.clientX, event.clientY);
    const hitNode = findNodeAt(hitPoint.x, hitPoint.y);
    if (hitNode) {
      dragStateRef.current = {
        kind: "node",
        node: hitNode,
        startX: pointer.x,
        startY: pointer.y,
        moved: false,
      };
      hitNode.fx = hitNode.x;
      hitNode.fy = hitNode.y;
      simulationRef.current?.alphaTarget(0.18).restart();
    } else {
      dragStateRef.current = {
        kind: "pan",
        startX: pointer.x,
        startY: pointer.y,
        origin: { ...transformRef.current },
      };
    }
  }, []);

  const finishPointerDrag = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>, activateNode: boolean) => {
      const dragState = dragStateRef.current;
      dragStateRef.current = null;
      simulationRef.current?.alphaTarget(0);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (activateNode && dragState?.kind === "node" && !dragState.moved && dragState.node.path) {
        onNodeClick(dragState.node.path);
      }
    },
    [onNodeClick],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => finishPointerDrag(event, true),
    [finishPointerDrag],
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => finishPointerDrag(event, false),
    [finishPointerDrag],
  );

  const handleMouseLeave = useCallback(() => {
    if (!dragStateRef.current) {
      hoveredNodeIdRef.current = undefined;
      setHoveredNodeId(undefined);
      onNodeHover?.(null);
    }
  }, [onNodeHover]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const current = transformRef.current;
    const nextScale = clamp(current.k * scaleFactor, 0.18, 4);
    const pointer = canvasPoint(event.clientX, event.clientY);
    const mouseX = pointer.x;
    const mouseY = pointer.y;
    const worldX = (mouseX - current.x) / current.k;
    const worldY = (mouseY - current.y) / current.k;
    transformRef.current = {
      k: nextScale,
      x: mouseX - worldX * nextScale,
      y: mouseY - worldY * nextScale,
    };
    renderGraph();
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const hitPoint = screenToWorld(event.clientX, event.clientY);
    const hitNode = findNodeAt(hitPoint.x, hitPoint.y);
    if (!hitNode) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, node: hitNode });
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = transformRef.current;
    const panStep = event.shiftKey ? 120 : 36;
    if (event.key === "+" || event.key === "=") {
      transformRef.current = zoomFromCenter(1.12);
    } else if (event.key === "-" || event.key === "_") {
      transformRef.current = zoomFromCenter(0.88);
    } else if (event.key === "ArrowLeft") {
      transformRef.current = { ...current, x: current.x + panStep };
    } else if (event.key === "ArrowRight") {
      transformRef.current = { ...current, x: current.x - panStep };
    } else if (event.key === "ArrowUp") {
      transformRef.current = { ...current, y: current.y + panStep };
    } else if (event.key === "ArrowDown") {
      transformRef.current = { ...current, y: current.y - panStep };
    } else {
      return;
    }
    event.preventDefault();
    renderGraph();
  }, []);

  function renderGraph() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    // Always start from the bitmap's native coordinate system. This prevents
    // stale transforms or drawing state from leaving a ghost frame after zoom.
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.setLineDash([]);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle =
      getComputedStyle(document.documentElement).getPropertyValue("--wn-editor-bg").trim() ||
      "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const transform = transformRef.current;
    context.translate(transform.x, transform.y);
    context.scale(transform.k, transform.k);

    const focusIds = connectedNodeIds;
    const hasFocus = focusIds.size > 0;

    linksRef.current.forEach((link) => {
      const sourceNode = linkEndpoint(link.source);
      const targetNode = linkEndpoint(link.target);
      if (!sourceNode || !targetNode) return;
      const isFocused = !hasFocus || focusIds.has(sourceNode.id) || focusIds.has(targetNode.id);
      const linkColor = getLinkColor(link.type);
      context.strokeStyle = isFocused ? linkColor : `${linkColor}35`;
      context.globalAlpha = isFocused ? 0.9 : 0.22;
      context.lineWidth = settings.linkThickness / transform.k;
      if (link.type === "hierarchy") context.setLineDash([6 / transform.k, 6 / transform.k]);
      else context.setLineDash([]);
      context.beginPath();
      context.moveTo(sourceNode.x, sourceNode.y);
      context.lineTo(targetNode.x, targetNode.y);
      context.stroke();
      context.setLineDash([]);
      if (settings.showArrows && link.directed)
        drawArrow(context, sourceNode, targetNode, linkColor, transform.k, nodeRadius(targetNode));
      context.globalAlpha = 1;
    });

    nodesRef.current.forEach((node) => {
      const isHovered = node.id === hoveredNodeIdRef.current;
      const isActive = node.id === activeNodeId;
      const isHighlighted = highlightedNodes?.has(node.id);
      const isConnected = connectedNodeIds.has(node.id);
      const isDimmed = hasFocus && !isConnected;
      const radius = nodeRadius(node);
      context.globalAlpha = isDimmed ? 0.25 : 1;
      context.fillStyle = node.color ?? "#7c8a96";
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fill();

      if (isHovered || isActive || isHighlighted) {
        context.strokeStyle = isActive
          ? getComputedStyle(document.documentElement).getPropertyValue("--wn-accent").trim() ||
            "#3f7f64"
          : "#ffffff";
        context.lineWidth = (isActive ? 3 : 2) / transform.k;
        context.stroke();
      }

      const shouldShowLabel =
        isHovered ||
        isActive ||
        isHighlighted ||
        transform.k >= settings.textFadeThreshold ||
        node.degree >= 3;
      if (shouldShowLabel) {
        drawNodeLabel(context, node, radius, transform.k, isDimmed);
      }
      context.globalAlpha = 1;
    });
    context.restore();
  }

  function nodeRadius(node: GraphNode): number {
    const degreeBoost = Math.min(10, node.degree * 1.2);
    const kindBoost = node.kind === "tag" ? 1.2 : node.kind === "unresolved" ? 0.9 : 1;
    return Math.max(3.5, (5.5 + degreeBoost) * settings.nodeSize * kindBoost);
  }

  function drawNodeLabel(
    context: CanvasRenderingContext2D,
    node: D3Node,
    radius: number,
    scale: number,
    dimmed: boolean,
  ) {
    const fontSize = Math.max(10 / scale, 11);
    context.font = `${fontSize}px Inter, system-ui, sans-serif`;
    context.fillStyle =
      getComputedStyle(document.documentElement).getPropertyValue("--wn-text").trim() || "#111827";
    context.globalAlpha = dimmed ? 0.35 : 0.88;
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillText(node.label.slice(0, 36), node.x, node.y + radius + 5 / scale);
    context.globalAlpha = 1;
  }

  function canvasPoint(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    const scaleX = rect?.width ? canvasWidth / rect.width : 1;
    const scaleY = rect?.height ? canvasHeight / rect.height : 1;
    return {
      x: (clientX - (rect?.left ?? 0)) * scaleX,
      y: (clientY - (rect?.top ?? 0)) * scaleY,
    };
  }

  function screenToWorld(clientX: number, clientY: number) {
    const pointer = canvasPoint(clientX, clientY);
    const transform = transformRef.current;
    return {
      x: (pointer.x - transform.x) / transform.k,
      y: (pointer.y - transform.y) / transform.k,
    };
  }

  function findNodeAt(x: number, y: number): D3Node | undefined {
    for (let index = nodesRef.current.length - 1; index >= 0; index -= 1) {
      const node = nodesRef.current[index];
      const distance = Math.hypot(node.x - x, node.y - y);
      if (distance <= nodeRadius(node) + 5 / transformRef.current.k) return node;
    }
    return undefined;
  }

  function fitToGraph() {
    if (!nodesRef.current.length) {
      transformRef.current = { x: canvasWidth / 2, y: canvasHeight / 2, k: 1 };
      renderGraph();
      return;
    }
    const bounds = nodesRef.current.reduce(
      (acc, node) => ({
        minX: Math.min(acc.minX, node.x),
        maxX: Math.max(acc.maxX, node.x),
        minY: Math.min(acc.minY, node.y),
        maxY: Math.max(acc.maxY, node.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );
    const graphWidth = Math.max(1, bounds.maxX - bounds.minX);
    const graphHeight = Math.max(1, bounds.maxY - bounds.minY);
    const nextScale = clamp(
      Math.min((canvasWidth * 0.72) / graphWidth, (canvasHeight * 0.72) / graphHeight),
      0.25,
      1.8,
    );
    transformRef.current = {
      k: nextScale,
      x: canvasWidth / 2 - ((bounds.minX + bounds.maxX) / 2) * nextScale,
      y: canvasHeight / 2 - ((bounds.minY + bounds.maxY) / 2) * nextScale,
    };
    renderGraph();
  }

  function zoomFromCenter(factor: number): ViewTransform {
    const current = transformRef.current;
    const nextScale = clamp(current.k * factor, 0.18, 4);
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    const worldX = (centerX - current.x) / current.k;
    const worldY = (centerY - current.y) / current.k;
    return {
      k: nextScale,
      x: centerX - worldX * nextScale,
      y: centerY - worldY * nextScale,
    };
  }

  function linkEndpoint(endpoint: string | D3Node): D3Node | undefined {
    return typeof endpoint === "string"
      ? nodesRef.current.find((node) => node.id === endpoint)
      : endpoint;
  }

  const isEmpty = graphData.nodes.length === 0;

  return (
    <div
      ref={containerRef}
      className="graph-view-container"
      style={{ width: width ?? "100%", height: height ?? "100%", position: "relative" }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="graph-canvas"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handleMouseLeave}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      />
      {isEmpty ? (
        <div className="graph-empty-state">
          <strong>No graph nodes visible</strong>
          <span>Adjust filters or add links between notes.</span>
        </div>
      ) : null}
      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="graph-node-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <strong>{contextMenu.node.label}</strong>
          <button
            type="button"
            disabled={!contextMenu.node.path}
            onClick={() => contextMenu.node.path && onNodeClick(contextMenu.node.path)}
          >
            Open
          </button>
          <button
            type="button"
            disabled={!contextMenu.node.path}
            onClick={() => contextMenu.node.path && onOpenLocalGraph(contextMenu.node.path)}
          >
            Open local graph
          </button>
          <button
            type="button"
            disabled={!contextMenu.node.path}
            onClick={() => contextMenu.node.path && onRevealNode(contextMenu.node.path)}
          >
            Reveal in explorer
          </button>
        </div>
      ) : null}
    </div>
  );
}

function seedPosition(index: number, total: number, width: number, height: number) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const radius = Math.min(width, height) * 0.24 + (index % 7) * 8;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function drawArrow(
  context: CanvasRenderingContext2D,
  source: D3Node,
  target: D3Node,
  color: string,
  scale: number,
  targetRadius: number,
) {
  const angle = Math.atan2(target.y - source.y, target.x - source.x);
  const arrowLength = 8 / scale;
  const arrowWidth = 5 / scale;
  const x = target.x - Math.cos(angle) * targetRadius;
  const y = target.y - Math.sin(angle) * targetRadius;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(
    x - Math.cos(angle - Math.PI / 6) * arrowLength,
    y - Math.sin(angle - Math.PI / 6) * arrowLength,
  );
  context.lineTo(
    x - Math.cos(angle + Math.PI / 6) * arrowLength,
    y - Math.sin(angle + Math.PI / 6) * arrowLength,
  );
  context.closePath();
  context.fill();
  context.lineWidth = arrowWidth;
}
