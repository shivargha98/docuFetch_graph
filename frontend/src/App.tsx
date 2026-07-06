/**
 * App shell: composes the three global-state providers and the three-panel
 * layout (folder | graph | chat). Mobile-first responsive layout: panels
 * stack vertically by default and switch to a side-by-side row at/above the
 * `md` (768px) breakpoint, which this app treats as the tablet-width
 * breakpoint per the PRD's "stacks below tablet width" requirement. The
 * graph view always carries a flex-grow class so it remains the dominant
 * central area whenever panels sit in a row.
 */
import { AppProviders } from "./state/providers";
import { FolderPanel } from "./components/folder/FolderPanel";
import { GraphView } from "./components/graph/GraphView";
import { ChatPanel } from "./components/chat/ChatPanel";

/** Renders the full docuFetch Graph app shell. */
function App() {
  return (
    <AppProviders>
      <div className="flex flex-col md:flex-row h-screen w-screen gap-4 p-4 bg-void">
        <FolderPanel className="md:w-72 md:flex-none" />
        <GraphView />
        <ChatPanel className="md:w-96 md:flex-none" />
      </div>
    </AppProviders>
  );
}

export default App;
