/**
 * Full-viewport "graph is generating" overlay for the graph viewport, shown
 * while a folder switch/upload's ingestion is running (GraphState.generating,
 * cleared by useGeneratingStatus polling /api/ingest-status). Reads as the
 * scene scanning the new folder: a sonar ping of expanding ion rings from the
 * viewport center, a sparse field of drifting ion/synapse particles, and a
 * compact glass telemetry banner pinned to the TOP of the viewport — mono
 * eyebrow, "Generating graph" headline, and a live "{n} concepts discovered"
 * counter — over a subtle edge vignette. The banner deliberately avoids the
 * center, where the graph materializes brightly beneath the overlay. Purely presentational and
 * pointer-events-none throughout (orbit/zoom still reach the canvas);
 * GraphView supplies the live node count. All motion is CSS keyframes on
 * theme tokens (see "Generating overlay animations" in index.css; disabled
 * under prefers-reduced-motion). No new dependencies.
 *
 * Design (frontend-design skill, invoked before writing this file): stays
 * strictly inside the HUD/telemetry grammar NodeDetailOverlay established —
 * ":: label" mono eyebrows, ion/synapse duotone only, glass-era restraint.
 * The sonar ping is the one signature element; everything else stays quiet.
 */

interface GeneratingOverlayProps {
  /** Live count of concept nodes currently in the graph, shown in the counter. */
  nodeCount: number;
}

/**
 * Deterministic particle field (no randomness — stable across renders and
 * under test): position, stagger, drift duration, and accent per dot.
 */
const PARTICLES: Array<{ left: string; top: string; delay: string; duration: string; accent: "ion" | "synapse" }> = [
  { left: "14%", top: "76%", delay: "0s", duration: "7s", accent: "ion" },
  { left: "26%", top: "38%", delay: "1.2s", duration: "9s", accent: "synapse" },
  { left: "38%", top: "82%", delay: "2.6s", duration: "6.5s", accent: "synapse" },
  { left: "52%", top: "24%", delay: "0.6s", duration: "8s", accent: "ion" },
  { left: "63%", top: "68%", delay: "3.4s", duration: "7.5s", accent: "ion" },
  { left: "74%", top: "42%", delay: "1.8s", duration: "9.5s", accent: "synapse" },
  { left: "84%", top: "78%", delay: "0.9s", duration: "6s", accent: "ion" },
  { left: "91%", top: "30%", delay: "2.2s", duration: "8.5s", accent: "synapse" },
];

/** Renders the scanning overlay: vignette, sonar rings, particle drift, and the live telemetry readout. */
export function GeneratingOverlay({ nodeCount }: GeneratingOverlayProps) {
  return (
    <div
      data-testid="generating-overlay"
      role="status"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      <div aria-hidden="true" className="generating-vignette absolute inset-0" />

      {[0, 1, 2].map((ring) => (
        <span
          key={ring}
          aria-hidden="true"
          className="generating-ring absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-ion/30"
          style={{ animationDelay: `${ring * 0.8}s` }}
        />
      ))}

      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`generating-particle absolute h-1 w-1 rounded-full ${
            particle.accent === "ion" ? "bg-ion/70" : "bg-synapse/70"
          }`}
          style={{
            left: particle.left,
            top: particle.top,
            animationDelay: particle.delay,
            animationDuration: particle.duration,
          }}
        />
      ))}

      {/* Readout rides the TOP of the viewport, not the center: the graph
          materializes brightly in the middle beneath this overlay, and a
          centered readout collided with it (unreadable text over glowing
          nodes — user screenshot 2026-07-10). */}
      <div className="absolute inset-x-0 top-6 flex justify-center">
        <div className="glass-panel flex items-baseline gap-3 rounded-full px-5 py-2 shadow-glow-soft">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
            :: Ingesting
          </span>
          <h2 className="font-display text-sm uppercase tracking-wide text-ion">Generating graph</h2>
          <p className="font-mono text-xs tabular-nums text-synapse">{nodeCount} concepts discovered</p>
        </div>
      </div>
    </div>
  );
}
