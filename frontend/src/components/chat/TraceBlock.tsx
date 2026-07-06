/**
 * Renders the live-updating (or, once complete, collapsed-and-expandable)
 * reasoning-path trace for a single chat query's graph traversal -- the
 * "watch the LLM actually fetch data" payoff moment. While the trace is in
 * progress, the ordered sequence of visited concepts renders as a live,
 * telemetry-style readout, with the most-recently-visited concept picked out
 * in the ion accent with a gentle pulse. Once the traversal completes, the
 * trace collapses into a compact "show reasoning path" control; each rendered
 * instance owns its own local expand/collapse state, so multiple past
 * queries' traces in the transcript never interfere with one another.
 */
import { useState } from "react";
import { cn } from "../../lib/utils";
import type { Trace, TraceStep } from "../../state/types";

interface TraceBlockProps {
  trace: Trace;
}

interface TraceStepRowProps {
  step: TraceStep;
  /** Whether this is the most-recently-visited step in the sequence -- picked out visually as "current". */
  active: boolean;
}

/** Renders one visited-concept step as a telemetry-style readout row. */
function TraceStepRow({ step, active }: TraceStepRowProps) {
  return (
    <div className={cn("flex items-baseline gap-2 font-mono text-xs", active ? "text-ion" : "text-text-secondary")}>
      <span className="text-muted tabular-nums">{String(step.hop).padStart(2, "0")}</span>
      <span className={cn(active && "motion-safe:animate-pulse")}>{step.concept}</span>
      {step.viaRelation && <span className="text-muted">via {step.viaRelation}</span>}
    </div>
  );
}

/** Renders a single query's traversal trace: live while in progress, collapsed-and-expandable once complete. */
export function TraceBlock({ trace }: TraceBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!trace.collapsed) {
    return (
      <div
        data-testid="trace-block"
        data-state="live"
        className="flex flex-col gap-1 rounded-lg border border-glass-border bg-glass px-3 py-2 shadow-glow-soft"
      >
        {trace.steps.map((step, index) => (
          <TraceStepRow key={`${step.nodeId}-${index}`} step={step} active={index === trace.steps.length - 1} />
        ))}
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        data-testid="trace-block"
        data-state="collapsed"
        onClick={() => setExpanded(true)}
        className="self-start font-mono text-xs text-muted hover:text-ion transition-colors flex items-center gap-1.5"
      >
        <span aria-hidden="true">›</span>
        Show reasoning path ({trace.steps.length} {trace.steps.length === 1 ? "hop" : "hops"})
      </button>
    );
  }

  return (
    <div data-testid="trace-block" data-state="expanded" className="flex flex-col gap-1 rounded-lg border border-glass-border bg-glass px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="self-start font-mono text-xs text-muted hover:text-ion transition-colors mb-1"
      >
        <span aria-hidden="true">⌄</span> Hide reasoning path
      </button>
      {trace.steps.map((step, index) => (
        <TraceStepRow key={`${step.nodeId}-${index}`} step={step} active={false} />
      ))}
    </div>
  );
}
