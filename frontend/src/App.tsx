/**
 * App shell: composes the global-state providers, the full-window graph
 * centerpiece, and the two floating docks — FolderDock (ingestion, pinned
 * top-left) and ChatDock (LinkedIn-style, pinned bottom-right). Both docks
 * are fixed overlays that never occupy layout space, so the graph owns the
 * entire viewport at every breakpoint.
 */
import { AppProviders } from "./state/providers";
import { FolderDock } from "./components/folder/FolderDock";
import { GraphView } from "./components/graph/GraphView";
import { ChatDock } from "./components/chat/ChatDock";

/** Renders the full docuFetch Graph app shell. */
function App() {
  return (
    <AppProviders>
      <div className="flex h-screen w-screen p-4 bg-void">
        <GraphView />
      </div>
      <FolderDock />
      <ChatDock />
    </AppProviders>
  );
}

export default App;
