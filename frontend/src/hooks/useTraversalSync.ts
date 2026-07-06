/**
 * Bridges the chat slice's live traversal trace (`ChatState.traces`, populated
 * by `useChatSession`'s handling of `visit_node`/`traversal_complete` WebSocket
 * events) to the 3D graph: for each newly appended traversal step, dispatches
 * a graph highlight for the visited node (and, once a prior step in the same
 * trace establishes an edge into it, that edge too) and asks the graph view to
 * pan its camera toward the node, via `GraphView`'s exported camera-follow
 * seam (`graphCameraControls`). Once a trace's traversal completes
 * (`trace.collapsed` flips true), the graph highlight/camera-follow trail is
 * cleared for that query so the next traversal starts from a clean slate.
 *
 * Call once, from a component that stays mounted regardless of chat-panel
 * collapse state (see `ChatTranscript.tsx`, which is always mounted thanks to
 * `ChatPanel`'s `forceMount`) -- mirrors `useChatSession`'s own mounting
 * rationale so no traversal-step events are missed while the panel is
 * collapsed.
 */
import { useEffect, useRef } from "react";
import { useChatState, useGraphState } from "../state/providers";
import { graphCameraControls, edgeHighlightKey } from "../components/graph/GraphView";

/**
 * Watches the chat slice's traces for newly appended steps and, for each one
 * (processed in arrival order), dispatches a graph highlight for the visited
 * node/edge and asks the graph view to pan its camera toward that node. Once
 * a trace collapses, clears the graph's highlight trail for that query.
 */
export function useTraversalSync(): void {
  const { state: chatState } = useChatState();
  const { dispatch: dispatchGraph } = useGraphState();
  const processedStepCounts = useRef(new Map<string, number>());
  const clearedQueries = useRef(new Set<string>());

  useEffect(() => {
    for (const trace of chatState.traces) {
      const alreadyProcessed = processedStepCounts.current.get(trace.queryId) ?? 0;
      const newSteps = trace.steps.slice(alreadyProcessed);

      newSteps.forEach((step, offset) => {
        const stepIndex = alreadyProcessed + offset;
        const previousStep = stepIndex > 0 ? trace.steps[stepIndex - 1] : undefined;
        const edgeId = previousStep ? edgeHighlightKey(previousStep.nodeId, step.nodeId) : undefined;

        dispatchGraph({ type: "HIGHLIGHT_NODE", nodeId: step.nodeId, edgeId });
        graphCameraControls.current?.focusNode(step.nodeId);
      });

      if (newSteps.length > 0) {
        processedStepCounts.current.set(trace.queryId, trace.steps.length);
      }

      if (trace.collapsed && !clearedQueries.current.has(trace.queryId)) {
        dispatchGraph({ type: "CLEAR_HIGHLIGHT" });
        clearedQueries.current.add(trace.queryId);
      }
    }
  }, [chatState.traces, dispatchGraph]);
}
