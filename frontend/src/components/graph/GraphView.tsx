/**
 * Central concept-graph scene: fetches (via useGraphData) and renders the
 * active folder's graph as a pannable/zoomable 2D canvas constellation using
 * react-force-graph-2d. Concept nodes render as glowing ion discs (radial-
 * gradient halo + core, drawn per node in nodeCanvasObject); edges keep the
 * relation-type color/width/particle treatment (../../lib/edgeStyles), so
 * distinct relation types read as visually distinct connections at a glance.
 *
 * 2D REWRITE (2026-07-10, user request — WebGL/three.js rendered too slowly
 * on their laptop; spec: docs/superpowers/specs/2026-07-10-graph-2d-design.md).
 * Every behavior decision from the 3D era carries over:
 * - Settle-then-freeze stillness: onEngineStop pins every node (fx/fy) —
 *   pinned nodes are immovable to d3, so nothing ever drifts on its own.
 *   Nodes added during ingestion stay unpinned until the next cool-down.
 * - Compact layout: weak charge, short links, gentle forceX/forceY pull
 *   toward the origin so disconnected clusters stay gathered.
 * - NO auto camera motion: the view opens at the library default (zoom 1,
 *   centered on the origin — the compact layout fits typical viewports) and
 *   only moves via user pan/wheel and the +/− zoom buttons (fg.zoom, 300ms).
 * - Hover-only labels: exactly the hovered node's name is painted under its
 *   glow (hoveredNodeIdRef; the canvas repaints on hover). No default
 *   tooltip. Ellipsized past 24 chars — the full name lives in the HUD card.
 * - Traversal highlights: visited nodes get synapse rings drawn in the same
 *   canvas pass (latest hop brighter) — replaces the 3D sprite-halo system.
 * - Materialize pop-in: still-fading nodes (useNodeFadeIn's fadeMap) scale
 *   their radius along the ease-out-back curve.
 * - Node-detail HUD: onNodeClick dispatches SELECT_NODE; the overlay is
 *   anchored per frame via graph2ScreenCoords (reprojectNodeToScreen,
 *   exported pure) from onEngineTick.
 * - `graphCameraControls.focusNode` (useTraversalSync's camera-follow seam)
 *   pans via centerAt(x, y, 800ms).
 * - GeneratingOverlay banner + empty-state hint unchanged.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from "react-force-graph-2d";
import { forceX, forceY } from "d3-force-3d";
import { useGraphState } from "../../state/providers";
import { useGraphData } from "../../hooks/useGraphData";
import { useGeneratingStatus } from "../../hooks/useGeneratingStatus";
import { useNodeFadeIn, FADE_DURATION_MS } from "../../hooks/useNodeFadeIn";
import { relationTypeToEdgeStyle } from "../../lib/edgeStyles";
import { GraphSceneErrorBoundary } from "./GraphSceneErrorBoundary";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { NodeDetailOverlay, type LinkedConcept } from "./NodeDetailOverlay";
import { ION, SYNAPSE, VOID } from "./sceneColors";
import type { GraphNode, GraphEdge } from "../../state/types";

interface GraphViewProps {
  /** Optional extra classes for panel sizing within the app shell. */
  className?: string;
}

type SceneNode = NodeObject<GraphNode>;
type SceneLink = LinkObject<GraphNode, GraphEdge>;

/** Core disc radius (world units); the gradient halo extends to 3x this. */
const NODE_RADIUS = 4;
/** Names longer than this are ellipsized on the hover label (full name lives in the HUD card). */
const LABEL_MAX_CHARS = 24;

/** Shared positioning for the empty-state / fallback overlay text. */
const OVERLAY_TEXT_CLASS =
  "absolute inset-0 flex items-center justify-center font-display text-sm text-text-secondary tracking-wide pointer-events-none";

/** Builds the composite id used to identify a highlighted edge in `GraphState.highlightedEdgeIds`. */
export function edgeHighlightKey(sourceId: string, targetId: string): string {
  return `${sourceId}->${targetId}`;
}

/** Reads a link endpoint's node id, whether the simulation has already resolved it to a node object reference or it's still the raw id string. */
function edgeEndpointId(endpoint: string | number | SceneNode | undefined): string {
  if (endpoint == null) return "";
  if (typeof endpoint === "object") return String(endpoint.id ?? "");
  return String(endpoint);
}

/**
 * Ease-out-back curve: overshoots past 1 before settling, so a node scaled
 * along this curve reads as an energetic "pop" materializing into the scene
 * rather than a flat linear grow-in (see nodeCanvasObject below).
 */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * Pure reprojection helper: computes the 2D screen coordinates for a node's
 * live canvas position via the given ForceGraph instance's
 * `graph2ScreenCoords` accessor. Returns null if the node's position isn't
 * known yet, or no ForceGraph instance is available (not yet mounted) --
 * exported standalone so the reprojection math is testable against a mocked
 * camera-state input without mounting a real canvas scene.
 */
export function reprojectNodeToScreen(
  fg: Pick<ForceGraphMethods<SceneNode, SceneLink>, "graph2ScreenCoords"> | undefined,
  node: { x?: number; y?: number } | undefined
): { x: number; y: number } | null {
  if (!fg || !node || typeof node.x !== "number" || typeof node.y !== "number") {
    return null;
  }
  const { x, y } = fg.graph2ScreenCoords(node.x, node.y);
  return { x, y };
}

/**
 * Imperative camera-follow seam for `useTraversalSync`: that hook watches chat
 * state, which lives outside this component's tree, so it has no other way to
 * reach the graph's camera than through this module-level ref, registered by
 * the mounted GraphView instance (null while unmounted).
 */
export interface GraphCameraControls {
  /** Pans the view toward the given node's current simulated position, if known. */
  focusNode(nodeId: string): void;
}

export const graphCameraControls: { current: GraphCameraControls | null } = { current: null };

/** Renders the 2D concept-graph scene with a stable `graph-view` test id. */
export function GraphView({ className }: GraphViewProps) {
  useGraphData();
  useGeneratingStatus();
  const fadeMapRef = useNodeFadeIn();
  const { state, dispatch } = useGraphState();
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<SceneNode, SceneLink> | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [overlayScreenPos, setOverlayScreenPos] = useState<{ x: number; y: number } | null>(null);

  // Size the canvas to the container -- the library defaults to the window
  // size, not its parent's, if width/height aren't supplied. Guarded for
  // jsdom (no ResizeObserver) so this effect is a no-op under vitest.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => ({ nodes: state.nodes, links: state.edges }), [state.nodes, state.edges]);

  // Mirrors the latest graphData into a ref so imperative callbacks (camera
  // follow, reprojection, pinning) always read the current node list --
  // including x/y, which the force simulation mutates on the same node
  // objects in place, outside React state.
  const graphDataRef = useRef(graphData as { nodes: SceneNode[]; links: SceneLink[] });
  graphDataRef.current = graphData as { nodes: SceneNode[]; links: SceneLink[] };

  // Node-detail HUD overlay state: the selected node's data and its linked
  // concepts (other nodes reachable via a direct edge, resolved by id to
  // their display name) are derived from graph state whenever the selection
  // or graph data changes.
  const selectedNode = useMemo(
    () => (state.selectedNodeId ? (state.nodes.find((n) => n.id === state.selectedNodeId) ?? null) : null),
    [state.selectedNodeId, state.nodes]
  );

  const linkedConcepts = useMemo<LinkedConcept[]>(() => {
    if (!selectedNode) return [];
    const nodeById = new Map(state.nodes.map((n) => [n.id, n]));
    const seen = new Set<string>();
    const results: LinkedConcept[] = [];
    for (const edge of state.edges) {
      const otherId =
        edge.source === selectedNode.id ? edge.target : edge.target === selectedNode.id ? edge.source : null;
      if (otherId && !seen.has(otherId)) {
        const other = nodeById.get(otherId);
        if (other) {
          results.push({ id: other.id, name: other.name });
          seen.add(otherId);
        }
      }
    }
    return results;
  }, [selectedNode, state.nodes, state.edges]);

  // Clears any stale reprojected position as soon as the selection changes,
  // so a freshly-opened overlay never briefly shows the previously-selected
  // node's screen position before the next engine tick recomputes it.
  useEffect(() => {
    setOverlayScreenPos(null);
  }, [state.selectedNodeId]);

  // Compact layout: weaker repulsion + shorter links + gentle positional
  // forces toward the origin. The positional forces keep DISCONNECTED
  // clusters gathered into one compact constellation — with pure charge
  // repulsion and no links between components, they otherwise fling each
  // other apart. Applied once; d3 keeps these across re-heats.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    (fg.d3Force("charge") as { strength?: (s: number) => void } | undefined)?.strength?.(-12);
    (fg.d3Force("link") as { distance?: (d: number) => void } | undefined)?.distance?.(22);
    fg.d3Force("x", forceX(0).strength(0.08));
    fg.d3Force("y", forceY(0).strength(0.08));
  }, []);

  // Opening zoom (user feedback: the default zoom 1 showed the compact
  // layout too small): when a graph first loads, the view is PLACED
  // instantly (0ms — placement, not motion) centered on the origin at a
  // closer zoom, once per load; from then on the camera is entirely the
  // user's (drag/wheel + the +/− buttons). Re-armed when the graph empties.
  const hasPlacedCameraRef = useRef(false);
  useEffect(() => {
    const fg = fgRef.current;
    if (state.nodes.length === 0) {
      hasPlacedCameraRef.current = false;
      return;
    }
    if (!fg || hasPlacedCameraRef.current) return;
    hasPlacedCameraRef.current = true;
    fg.centerAt(0, 0, 0);
    fg.zoom(1.8, 0);
  }, [state.nodes.length]);

  /**
   * Settle-then-freeze (stillness as a guarantee): when the simulation
   * cools, pin every node at its settled position — pinned nodes are
   * immovable to d3, so no future re-heat (data ticks during ingestion,
   * accessor churn, anything) can ever move the settled constellation.
   * Nodes added later start unpinned, drift into place around the frozen
   * ones, and freeze on the next cool-down. A folder reset creates fresh
   * unpinned node objects, so a new graph still lays out normally.
   */
  function handleEngineStop() {
    for (const node of graphDataRef.current.nodes) {
      node.fx = node.x;
      node.fy = node.y;
    }
  }

  // Hovered node (ref, not state — read inside the canvas paint pass, and
  // the library repaints on hover changes): only the hovered node's name is
  // painted. Labels are HOVER-ONLY at every zoom level.
  const hoveredNodeIdRef = useRef<string | null>(null);

  // Highlight state mirrored into a ref for the canvas paint closures.
  const highlightedNodeIdsRef = useRef<string[]>(state.highlightedNodeIds);
  highlightedNodeIdsRef.current = state.highlightedNodeIds;

  /**
   * Paints one concept node: radial-gradient ion halo + core disc, a synapse
   * highlight ring while the node is on the live traversal trail (latest hop
   * brighter), the materialization pop for still-fading nodes, and — for the
   * hovered node only — its name beneath the glow.
   */
  function paintNode(node: SceneNode, ctx: CanvasRenderingContext2D, globalScale: number) {
    if (typeof node.x !== "number" || typeof node.y !== "number") return;
    const nodeId = String(node.id ?? "");

    const addedAt = fadeMapRef.current.get(nodeId);
    const pop = addedAt != null ? easeOutBack(Math.min((Date.now() - addedAt) / FADE_DURATION_MS, 1)) : 1;
    const r = Math.max(0.1, NODE_RADIUS * pop);

    const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 3);
    gradient.addColorStop(0, "rgba(110, 231, 249, 0.85)");
    gradient.addColorStop(0.4, "rgba(110, 231, 249, 0.25)");
    gradient.addColorStop(1, "rgba(110, 231, 249, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r * 3, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = ION;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fill();

    const trail = highlightedNodeIdsRef.current;
    const trailIndex = trail.indexOf(nodeId);
    if (trailIndex !== -1) {
      const isLatest = trailIndex === trail.length - 1;
      ctx.strokeStyle = SYNAPSE;
      ctx.globalAlpha = isLatest ? 0.95 : 0.4;
      ctx.lineWidth = (isLatest ? 2 : 1.2) / globalScale;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r * (isLatest ? 3 : 2.4), 0, 2 * Math.PI);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (nodeId === hoveredNodeIdRef.current) {
      const name = node.name ?? "";
      const text = name.length > LABEL_MAX_CHARS ? `${name.slice(0, LABEL_MAX_CHARS - 1)}…` : name;
      const fontSize = Math.max(12 / globalScale, 3);
      ctx.font = `${fontSize}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      // Backing plate so the label stays legible over edges/glow.
      const width = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(7, 8, 18, 0.75)";
      ctx.fillRect(node.x - width / 2 - 2, node.y + r * 3 + 1, width + 4, fontSize + 3);
      ctx.fillStyle = "rgba(231, 236, 245, 0.95)";
      ctx.fillText(text, node.x, node.y + r * 3 + 2.5);
    }
  }

  /** Generous circular pointer hitbox so small zoomed-out nodes hover easily. */
  function paintPointerArea(node: SceneNode, color: string, ctx: CanvasRenderingContext2D) {
    if (typeof node.x !== "number" || typeof node.y !== "number") return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, NODE_RADIUS * 3, 0, 2 * Math.PI);
    ctx.fill();
  }

  /**
   * Zooms the canvas view by the given factor (>1 zooms in) with a short
   * glide — the manual zoom behind the +/− buttons in the viewport's
   * top-right corner.
   */
  function zoomBy(factor: number) {
    const fg = fgRef.current;
    if (!fg) return;
    fg.zoom(fg.zoom() * factor, 300);
  }

  // Per-frame reprojection: recomputes the selected node's 2D screen
  // position (onEngineTick fires once per rendered frame), so the HUD
  // overlay tracks the node without drift as the view pans/zooms. A no-op
  // whenever no node is selected.
  function handleEngineTick() {
    if (!state.selectedNodeId) return;
    const node = graphDataRef.current.nodes.find((n) => n.id === state.selectedNodeId);
    const next = reprojectNodeToScreen(fgRef.current, node);
    setOverlayScreenPos((prev) => (prev && next && prev.x === next.x && prev.y === next.y ? prev : next));
  }

  // Registers the imperative camera-follow seam for useTraversalSync for as
  // long as this component is mounted.
  useEffect(() => {
    graphCameraControls.current = {
      focusNode(nodeId: string) {
        const fg = fgRef.current;
        if (!fg) return;
        const node = graphDataRef.current.nodes.find((n) => n.id === nodeId);
        if (!node || typeof node.x !== "number" || typeof node.y !== "number") return;
        fg.centerAt(node.x, node.y, 800);
      },
    };
    return () => {
      graphCameraControls.current = null;
    };
  }, []);

  /**
   * Opens the node-detail HUD overlay for the clicked node, or dismisses it
   * if the same node is clicked again while already selected.
   */
  function handleNodeClick(node: SceneNode) {
    const nodeId = String(node.id ?? "");
    dispatch({ type: "SELECT_NODE", nodeId: state.selectedNodeId === nodeId ? null : nodeId });
  }

  return (
    <div
      ref={containerRef}
      data-testid="graph-view"
      className={`glass-panel flex-1 min-h-[320px] rounded-xl shadow-glow-soft relative overflow-hidden ${className ?? ""}`}
    >
      <GraphSceneErrorBoundary
        fallback={<p className={OVERLAY_TEXT_CLASS}>Graph rendering isn't available in this browser.</p>}
      >
        {state.nodes.length === 0 && !state.generating && (
          <p className={OVERLAY_TEXT_CLASS}>No graph loaded yet — drop a folder to begin.</p>
        )}
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={size.width || undefined}
          height={size.height || undefined}
          backgroundColor={VOID}
          // The library pauses its redraw loop once the physics engine
          // idles — which froze the custom hover labels and left stale
          // pointer hitboxes for late-added nodes (some unhoverable /
          // unclickable). Continuous canvas repaint is cheap at this scale.
          autoPauseRedraw={false}
          nodeLabel={() => ""}
          onNodeHover={(node) => {
            hoveredNodeIdRef.current = node ? String(node.id ?? "") : null;
          }}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointerArea}
          onEngineTick={handleEngineTick}
          onEngineStop={handleEngineStop}
          linkColor={(link) =>
            state.highlightedEdgeIds.includes(edgeHighlightKey(edgeEndpointId(link.source), edgeEndpointId(link.target)))
              ? SYNAPSE
              : relationTypeToEdgeStyle(link.relation).color
          }
          linkWidth={(link) =>
            state.highlightedEdgeIds.includes(edgeHighlightKey(edgeEndpointId(link.source), edgeEndpointId(link.target)))
              ? relationTypeToEdgeStyle(link.relation).width + 1.2
              : relationTypeToEdgeStyle(link.relation).width
          }
          linkDirectionalParticles={(link) => relationTypeToEdgeStyle(link.relation).particles}
          linkDirectionalParticleColor={(link) => relationTypeToEdgeStyle(link.relation).particleColor}
          linkDirectionalParticleSpeed={(link) => relationTypeToEdgeStyle(link.relation).particleSpeed}
          onNodeClick={handleNodeClick}
        />
      </GraphSceneErrorBoundary>
      <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5">
        <button
          type="button"
          aria-label="Zoom in"
          data-testid="graph-zoom-in"
          onClick={() => zoomBy(1.4)}
          className="glass-panel h-8 w-8 rounded-md font-mono text-base leading-none text-text-secondary transition-colors hover:border-ion hover:text-ion"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          data-testid="graph-zoom-out"
          onClick={() => zoomBy(1 / 1.4)}
          className="glass-panel h-8 w-8 rounded-md font-mono text-base leading-none text-text-secondary transition-colors hover:border-ion hover:text-ion"
        >
          −
        </button>
      </div>
      {state.generating && <GeneratingOverlay nodeCount={state.nodes.length} />}
      {selectedNode && (
        <NodeDetailOverlay
          node={selectedNode}
          linkedConcepts={linkedConcepts}
          position={overlayScreenPos}
          onSelectLinked={(nodeId) => dispatch({ type: "SELECT_NODE", nodeId })}
          onDismiss={() => dispatch({ type: "SELECT_NODE", nodeId: null })}
        />
      )}
    </div>
  );
}
