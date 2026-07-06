/**
 * Folder-source panel: wires `useFolderSwitch` (backend prefill + submit,
 * plus graph/chat teardown on a folder switch) to `FolderPathInput`, and
 * renders `FolderStatusLine` alongside it, inside the shared CollapsiblePanel
 * wrapper. `useIngestionStatus` (Round 3, Issue 5's polling loop) is called
 * here at the FolderPanel level -- not inside the panel's collapsible
 * content -- so its polling interval survives the content unmounting on
 * collapse (CollapsiblePanel's default, non-forceMount behavior).
 */
import { CollapsiblePanel } from "../ui/CollapsiblePanel";
import { FolderPathInput } from "./FolderPathInput";
import { FolderStatusLine } from "./FolderStatusLine";
import { useFolderSwitch } from "../../hooks/useFolderSwitch";
import { useIngestionStatus } from "../../hooks/useIngestionStatus";
import { useIngestionState } from "../../state/providers";

interface FolderPanelProps {
  /** Optional extra classes for panel sizing within the app shell. */
  className?: string;
}

/** Renders the folder panel with a stable `folder-panel` test id. */
export function FolderPanel({ className }: FolderPanelProps) {
  const { defaultFolder, error, submitting, submit } = useFolderSwitch();
  useIngestionStatus();
  const { state } = useIngestionState();

  return (
    <CollapsiblePanel title="Folder" testId="folder-panel" className={className}>
      <FolderPathInput
        defaultFolder={defaultFolder}
        error={error}
        submitting={submitting}
        onSubmit={submit}
      />
      <FolderStatusLine status={state.status} />
    </CollapsiblePanel>
  );
}
