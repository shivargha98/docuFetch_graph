/**
 * Central 3D concept-graph scene: fetches (via useGraphData) and renders the
 * active folder's graph as an orbit-able WebGL scene using
 * react-force-graph-3d. Concept nodes render as glowing ion-colored orbs
 * (see ./nodeGlow); edges render with a color/width/particle-flow treatment
 * derived from their relation-type label (see ../../lib/edgeStyles), so
 * distinct relation types read as visually distinct connections at a glance.
 * Camera orbit/zoom/pan use ForceGraph3D's built-in trackball controls,
 * enabled by default and not overridden here.
 *
 * The real canvas requires WebGL, which jsdom (every test in this suite) and
 * a small minority of real browsers don't provide -- GraphSceneErrorBoundary
 * catches that failure and swaps in a themed fallback message instead of
 * crashing the app shell.
 *
 * Extension points for later rounds -- extend these seams, don't rewrite them:
 * - `fgRef.current` exposes ForceGraph3D's imperative methods (cameraPosition,
 *   zoomToFit, emitParticle, scene(), etc.).
 * - `graphData` is centralized as a single memoized object below; Round 4
 *   fade-in state should add accessor props alongside the ones already wired
 *   here, rather than restructuring the <ForceGraph3D> element.
 * - `handleNodeClick` is a deliberate no-op seam -- Round 4 (Issue 8) wires it
 *   to open the node-detail HUD overlay (dispatch a `selectedNodeId` update).
 *
 * Round 3 (Issue 10) additions, both purely additive extensions of the seams
 * above -- neither restructures the <ForceGraph3D> element nor touches
 * nodeGlow.ts (frozen):
 * - `graphCameraControls` (module-level ref, exported below) is the seam
 *   `useTraversalSync` (which lives outside this component's tree, watching
 *   chat state) uses to drive camera-follow through `fgRef` without this
 *   component needing to know anything about traversal/chat state itself.
 * - `linkColor`/`linkWidth` now also check `state.highlightedEdgeIds` (built
 *   from `edgeHighlightKey`, also exported below) to render the traversed
 *   edge trail in the synapse accent. Node highlighting can't route through
 *   `nodeThreeObject` (buildNodeGlowObject ignores its node argument and
 *   nodeGlow.ts is frozen), so visited nodes instead get a small additive
 *   sprite halo added directly to the scene via `fgRef`, mirroring the same
 *   imperative-scene-mutation pattern already used for the fog effect below.
 *
 * Round 4 (Issues 7-8) additions:
 * - Issue 7 (live node fade-in): `useNodeFadeIn` polls for newly-ingested
 *   nodes/edges and returns `fadeMapRef` (node id -> first-seen timestamp).
 *   Since `nodeGlow.ts`'s core/halo materials are shared across every node
 *   instance (frozen, can't be made per-node), per-node opacity fade isn't
 *   available -- instead the `nodePositionUpdate` accessor (called once per
 *   node per rendered frame by the underlying force-graph engine, and which
 *   already fires for every graphData change since the library auto-reheats
 *   on data change) scales each still-fading node's glow Group up from
 *   near-zero with an ease-out-back curve, reading as an energetic
 *   "materialization" pop rather than a plain linear grow-in.
 * - Issue 8 (node-detail HUD): `handleNodeClick` now dispatches `SELECT_NODE`
 *   (toggling to null on a re-click of the same node) instead of being a
 *   no-op. `reprojectNodeToScreen` (exported, pure) computes the selected
 *   node's live 2D screen position via `ForceGraphMethods.graph2ScreenCoords`
 *   (confirmed present on the installed react-force-graph-3d version's
 *   `ForceGraphMethods` interface -- see node_modules/react-force-graph-3d/
 *   dist/react-force-graph-3d.d.ts); the `onEngineTick` prop (also confirmed
 *   present, fired every rendered frame) recomputes it continuously while an
 *   overlay is open, so `<NodeDetailOverlay>` stays anchored without drift
 *   as the camera orbits/zooms. Rendered as a sibling of
 *   `GraphSceneErrorBoundary` (not inside it) since the overlay is plain
 *   DOM/CSS with no WebGL dependency.
 *
 * Folder-selection rework (Task 9) addition: while `state.generating` is set
 * (a genuine folder switch/upload kicked off ingestion), `<GeneratingOverlay>`
 * renders over the scene (same plain-DOM sibling pattern as
 * NodeDetailOverlay) with the live node count, and `useGeneratingStatus()` --
 * called here since the center pane never unmounts -- polls
 * /api/ingest-status to clear the flag when the backend goes idle. The
 * empty-state hint is suppressed while generating so the two messages never
 * stack.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods, type NodeObject, type LinkObject } from "react-force-graph-3d";
import * as THREE from "three";
import { useGraphState } from "../../state/providers";
import { useGraphData } from "../../hooks/useGraphData";
import { useGeneratingStatus } from "../../hooks/useGeneratingStatus";
import { useNodeFadeIn, FADE_DURATION_MS } from "../../hooks/useNodeFadeIn";
import { relationTypeToEdgeStyle } from "../../lib/edgeStyles";
import { buildNodeGlowObject } from "./nodeGlow";
import { GraphSceneErrorBoundary } from "./GraphSceneErrorBoundary";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { NodeDetailOverlay, type LinkedConcept } from "./NodeDetailOverlay";
import { VOID, SYNAPSE } from "./sceneColors";
import type { GraphNode, GraphEdge } from "../../state/types";

interface GraphViewProps {
  /** Optional extra classes for panel sizing within the app shell. */
  className?: string;
}

type SceneNode = NodeObject<GraphNode>;
type SceneLink = LinkObject<GraphNode, GraphEdge>;

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
 * rather than a flat linear grow-in (Issue 7 -- see nodePositionUpdate below).
 */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * Pure reprojection helper (Issue 8): computes the 2D screen coordinates for
 * a node's live 3D position via the given ForceGraph instance's
 * `graph2ScreenCoords` accessor. Returns null if the node's position isn't
 * known yet, or no ForceGraph instance is available (WebGL unavailable, or
 * not yet mounted) -- exported standalone so the reprojection math is
 * testable against a mocked camera-state input without mounting a real WebGL
 * scene.
 */
export function reprojectNodeToScreen(
  fg: Pick<ForceGraphMethods<SceneNode, SceneLink>, "graph2ScreenCoords"> | undefined,
  node: { x?: number; y?: number; z?: number } | undefined
): { x: number; y: number } | null {
  if (!fg || !node || typeof node.x !== "number" || typeof node.y !== "number" || typeof node.z !== "number") {
    return null;
  }
  const { x, y } = fg.graph2ScreenCoords(node.x, node.y, node.z);
  return { x, y };
}

/**
 * Imperative camera-follow seam for `useTraversalSync`: that hook watches chat
 * state, which lives outside this component's tree, so it has no other way to
 * reach ForceGraph3D's camera controls than through this module-level ref,
 * registered by the mounted GraphView instance (null while unmounted).
 */
export interface GraphCameraControls {
  /** Pans/zooms the camera toward the given node's current simulated position, if known. */
  focusNode(nodeId: string): void;
}

export const graphCameraControls: { current: GraphCameraControls | null } = { current: null };

let highlightTexture: THREE.Texture | null = null;

/**
 * Lazily builds (once) the radial-gradient canvas texture used for the
 * traversal-highlight halo sprite, the same soft-glow technique nodeGlow.ts
 * uses for node glow (duplicated here in miniature since nodeGlow.ts is
 * frozen and doesn't export its own texture).
 */
function getHighlightTexture(): THREE.Texture {
  if (highlightTexture) return highlightTexture;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.25)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  highlightTexture = new THREE.CanvasTexture(canvas);
  return highlightTexture;
}

/**
 * Builds a synapse-colored sprite halo marking a visited node during a live
 * traversal. The most-recently-visited node gets a brighter, larger halo than
 * earlier nodes in the same trail, so the trail reads as a path with a clear
 * "current position" rather than a flat set of equally-weighted marks.
 */
function buildHighlightSprite(isLatest: boolean): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: getHighlightTexture(),
    color: SYNAPSE,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: isLatest ? 0.95 : 0.35,
  });
  const sprite = new THREE.Sprite(material);
  const scale = isLatest ? 34 : 26;
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

/** Renders the 3D concept-graph scene with a stable `graph-view` test id. */
export function GraphView({ className }: GraphViewProps) {
  useGraphData();
  useGeneratingStatus();
  const fadeMapRef = useNodeFadeIn();
  const { state, dispatch } = useGraphState();
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<SceneNode, SceneLink> | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [overlayScreenPos, setOverlayScreenPos] = useState<{ x: number; y: number } | null>(null);

  // Size the canvas to the container -- ForceGraph3D defaults to the window
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

  // Atmosphere: a soft exponential fog matching the void background, so
  // distant nodes recede into the scene instead of popping against a flat
  // backdrop. No bloom/postprocessing pipeline is installed this round --
  // node/edge glow is faked via nodeGlow.ts and additive-blended materials.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.scene().fog = new THREE.FogExp2(new THREE.Color(VOID).getHex(), 0.018);
  }, []);

  const graphData = useMemo(() => ({ nodes: state.nodes, links: state.edges }), [state.nodes, state.edges]);

  // Mirrors the latest graphData into a ref so the camera-follow seam below
  // (called from outside this component's render cycle, by useTraversalSync)
  // always reads the current node list -- including x/y/z, which the force
  // simulation mutates on the same node objects in place, outside React
  // state. Cast to SceneNode: these are the exact objects react-force-graph-3d
  // annotates with x/y/z at runtime, which GraphNode's own type doesn't model.
  const graphDataRef = useRef(graphData as { nodes: SceneNode[]; links: SceneLink[] });
  graphDataRef.current = graphData as { nodes: SceneNode[]; links: SceneLink[] };

  // Node-detail HUD overlay state (Issue 8): the selected node's data and its
  // linked concepts (other nodes reachable via a direct edge, resolved by id
  // to their display name) are derived from graph state whenever the
  // selection or graph data changes.
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

  // Per-frame reprojection (Issue 8): recomputes the selected node's 2D
  // screen position on every rendered frame (ForceGraph3D's onEngineTick
  // fires once per frame -- see file header comment), so the HUD overlay
  // tracks the node without drift as the camera orbits/zooms. A no-op
  // whenever no node is selected.
  function handleEngineTick() {
    if (!state.selectedNodeId) return;
    const node = graphDataRef.current.nodes.find((n) => n.id === state.selectedNodeId);
    const next = reprojectNodeToScreen(fgRef.current, node);
    setOverlayScreenPos((prev) => (prev && next && prev.x === next.x && prev.y === next.y ? prev : next));
  }

  // Registers the imperative camera-follow seam for useTraversalSync (Issue
  // 10) for as long as this component is mounted.
  useEffect(() => {
    graphCameraControls.current = {
      focusNode(nodeId: string) {
        const fg = fgRef.current;
        if (!fg) return;
        const node = graphDataRef.current.nodes.find((n) => n.id === nodeId);
        if (!node || typeof node.x !== "number" || typeof node.y !== "number" || typeof node.z !== "number") return;

        // Standard react-force-graph "fly to node" recipe: place the camera
        // further out along the same vector from the origin through the
        // node, looking at the node itself. cameraPosition's transitionMs
        // arg drives the library's own tweened camera move.
        const distance = 120;
        const nodeDistance = Math.hypot(node.x, node.y, node.z);
        const camPos =
          nodeDistance === 0
            ? { x: node.x, y: node.y, z: node.z + distance }
            : (() => {
                const ratio = 1 + distance / nodeDistance;
                return { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio };
              })();

        fg.cameraPosition(camPos, { x: node.x, y: node.y, z: node.z }, 800);
      },
    };
    return () => {
      graphCameraControls.current = null;
    };
  }, []);

  // Visualizes the live traversal highlight trail (Issue 10): adds a
  // synapse-colored halo sprite directly to the scene for each newly
  // highlighted node (can't route through nodeThreeObject -- see file header
  // comment), and removes any sprites for ids no longer in the trail (e.g.
  // after CLEAR_HIGHLIGHT). The most-recent id gets the brighter halo.
  const highlightSpritesRef = useRef(new Map<string, THREE.Sprite>());
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const scene = fg.scene();
    const currentIds = new Set(state.highlightedNodeIds);

    for (const [nodeId, sprite] of highlightSpritesRef.current) {
      if (!currentIds.has(nodeId)) {
        scene.remove(sprite);
        sprite.material.dispose();
        highlightSpritesRef.current.delete(nodeId);
      }
    }

    state.highlightedNodeIds.forEach((nodeId, index) => {
      const isLatest = index === state.highlightedNodeIds.length - 1;
      const existing = highlightSpritesRef.current.get(nodeId);
      if (existing) {
        existing.material.opacity = isLatest ? 0.95 : 0.35;
        return;
      }
      const node = graphDataRef.current.nodes.find((n) => n.id === nodeId);
      if (!node || typeof node.x !== "number" || typeof node.y !== "number" || typeof node.z !== "number") return;
      const sprite = buildHighlightSprite(isLatest);
      sprite.position.set(node.x, node.y, node.z);
      scene.add(sprite);
      highlightSpritesRef.current.set(nodeId, sprite);
    });
  }, [state.highlightedNodeIds]);

  // Cleans up any remaining highlight sprites on unmount.
  useEffect(() => {
    return () => {
      const scene = fgRef.current?.scene();
      for (const sprite of highlightSpritesRef.current.values()) {
        scene?.remove(sprite);
        sprite.material.dispose();
      }
      highlightSpritesRef.current.clear();
    };
  }, []);

  /**
   * Opens the node-detail HUD overlay for the clicked node (Issue 8), or
   * dismisses it if the same node is clicked again while already selected.
   */
  function handleNodeClick(node: SceneNode) {
    const nodeId = String(node.id ?? "");
    dispatch({ type: "SELECT_NODE", nodeId: state.selectedNodeId === nodeId ? null : nodeId });
  }

  /**
   * Animates a still-fading node's glow Group scale along an ease-out-back
   * curve (Issue 7), reading as a "materialization" pop rather than a linear
   * grow-in. Returns false (falsy) so the library's default position
   * assignment for this node still applies -- this accessor only touches
   * scale, never position.
   */
  function handleNodePositionUpdate(obj: THREE.Object3D, _coords: unknown, node: NodeObject) {
    const addedAt = fadeMapRef.current.get(String(node.id ?? ""));
    const progress =
      addedAt != null ? easeOutBack(Math.min((Date.now() - addedAt) / FADE_DURATION_MS, 1)) : 1;
    obj.scale.setScalar(progress);
    return false;
  }

  return (
    <div
      ref={containerRef}
      data-testid="graph-view"
      className={`glass-panel flex-1 min-h-[320px] rounded-xl shadow-glow-soft relative overflow-hidden ${className ?? ""}`}
    >
      <GraphSceneErrorBoundary
        fallback={<p className={OVERLAY_TEXT_CLASS}>3D graph rendering isn't available in this browser.</p>}
      >
        {state.nodes.length === 0 && !state.generating && (
          <p className={OVERLAY_TEXT_CLASS}>No graph loaded yet — drop a folder to begin.</p>
        )}
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          width={size.width || undefined}
          height={size.height || undefined}
          backgroundColor={VOID}
          showNavInfo={false}
          nodeLabel={(node) => node.name}
          nodeThreeObject={buildNodeGlowObject}
          nodeThreeObjectExtend={false}
          nodePositionUpdate={handleNodePositionUpdate}
          onEngineTick={handleEngineTick}
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
