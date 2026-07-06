/**
 * Subtle status chip showing the live `/ws/chat` WebSocket connection state,
 * rendered in the mono telemetry font consistent with other system readouts.
 */
import type { ConnectionStatus } from "../../state/types";
import { cn } from "../../lib/utils";

interface ConnectionStatusChipProps {
  status: ConnectionStatus;
}

const LABELS: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  disconnected: "Disconnected",
  error: "Connection error",
};

/** Renders a small pill indicating the current connection status. */
export function ConnectionStatusChip({ status }: ConnectionStatusChipProps) {
  return (
    <span
      data-testid="connection-status-chip"
      data-status={status}
      className={cn(
        "font-mono text-xs tracking-wide self-start px-2 py-0.5 rounded-full border",
        status === "connected" && "text-ion border-ion/40",
        status === "connecting" && "text-text-secondary border-glass-border",
        status === "disconnected" && "text-muted border-glass-border",
        status === "error" && "text-synapse border-synapse/40"
      )}
    >
      {LABELS[status]}
    </span>
  );
}
