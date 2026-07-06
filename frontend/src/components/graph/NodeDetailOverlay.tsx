/**
 * Floating HUD-style detail card shown when a concept node is clicked in the
 * 3D graph: surfaces the node's description, source files, and linked
 * concepts (other nodes reachable via a direct edge) as clickable buttons for
 * re-selecting. Purely presentational -- GraphView supplies the node data,
 * linked concepts, live reprojected screen position, and the
 * selection/dismiss callbacks; this component owns no state of its own.
 *
 * Design (frontend-design skill, invoked before writing this file): reads as
 * a targeting-computer readout rather than a generic tooltip/popover --
 * ion corner brackets frame the glass-panel card like a HUD reticle, a thin
 * ion-to-synapse gradient "energy bar" caps the top edge as the one signature
 * flourish, and section labels are uppercase, tracked-out monospace
 * telemetry rather than plain prose headings. Strictly within the existing
 * ion/synapse/muted duotone -- no new colors introduced.
 */
import type { GraphNode } from "../../state/types";

/** A concept linked to the overlay's node via a direct graph edge, for the "linked concepts" list. */
export interface LinkedConcept {
  id: string;
  name: string;
}

interface NodeDetailOverlayProps {
  /** The concept node the overlay is showing detail for. */
  node: GraphNode;
  /** Other concepts directly connected to `node` by an edge, in edge order. */
  linkedConcepts: LinkedConcept[];
  /** The node's live reprojected 2D screen position (container-relative px), or null while not yet known -- falls back to a centered placement so the overlay still appears immediately on click. */
  position: { x: number; y: number } | null;
  /** Called with a linked concept's id when its chip is clicked, to re-select that node. */
  onSelectLinked: (nodeId: string) => void;
  /** Called when the overlay should close: backdrop click or the close control. */
  onDismiss: () => void;
}

/** One small ion "L" bracket, positioned at a corner of the card, forming the HUD reticle frame together with its three siblings. */
function CornerBracket({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  const position =
    corner === "tl"
      ? "-left-px -top-px border-l-2 border-t-2"
      : corner === "tr"
        ? "-right-px -top-px border-r-2 border-t-2"
        : corner === "bl"
          ? "-left-px -bottom-px border-l-2 border-b-2"
          : "-right-px -bottom-px border-r-2 border-b-2";
  return <span aria-hidden="true" className={`pointer-events-none absolute h-3 w-3 border-ion ${position}`} />;
}

/** Renders the node-detail HUD card anchored near `position`, with a full-bleed dismiss backdrop behind it. */
export function NodeDetailOverlay({ node, linkedConcepts, position, onSelectLinked, onDismiss }: NodeDetailOverlayProps) {
  const left = position?.x ?? "50%";
  const top = position?.y ?? "50%";

  return (
    <>
      <div data-testid="node-overlay-backdrop" className="absolute inset-0 z-10" onClick={onDismiss} />
      <div
        data-testid="node-detail-overlay"
        className="glass-panel absolute z-20 w-72 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-md p-4 shadow-glow-ion"
        style={{ left, top }}
      >
        <CornerBracket corner="tl" />
        <CornerBracket corner="tr" />
        <CornerBracket corner="bl" />
        <CornerBracket corner="br" />
        <div
          aria-hidden="true"
          className="absolute inset-x-3 -top-px h-px bg-gradient-to-r from-ion via-synapse to-ion"
        />

        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-sm uppercase tracking-wide text-ion">{node.name}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onDismiss}
            className="font-mono text-xs text-text-secondary hover:text-ion"
          >
            [x]
          </button>
        </div>

        <p className="mt-2 font-body text-sm text-text-primary">{node.description}</p>

        {node.source_files.length > 0 && (
          <div className="mt-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">:: Source files</p>
            <ul className="mt-1 space-y-0.5 font-mono text-xs text-text-secondary">
              {node.source_files.map((file) => (
                <li key={file} className="truncate">
                  {file}
                </li>
              ))}
            </ul>
          </div>
        )}

        {linkedConcepts.length > 0 && (
          <div className="mt-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">:: Linked concepts</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {linkedConcepts.map((concept) => (
                <button
                  key={concept.id}
                  type="button"
                  onClick={() => onSelectLinked(concept.id)}
                  className="border border-synapse/60 px-2 py-0.5 font-mono text-xs text-synapse [clip-path:polygon(6px_0,100%_0,100%_100%,0_100%)] hover:shadow-glow-synapse"
                >
                  {concept.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
