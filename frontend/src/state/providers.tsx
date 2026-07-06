/**
 * Global app state providers: one React Context per concern (graph, chat,
 * ingestion), each backed by its own useReducer, composed into a single
 * AppProviders wrapper. Any panel can dispatch through its typed hook and
 * have the update observed by any other panel, with no prop drilling.
 */
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { graphReducer, initialGraphState } from "./graphReducer";
import { chatReducer, initialChatState } from "./chatReducer";
import { ingestionReducer, initialIngestionState } from "./ingestionReducer";
import type { GraphState, GraphAction, ChatState, ChatAction, IngestionState, IngestionAction } from "./types";

interface GraphContextValue {
  state: GraphState;
  dispatch: Dispatch<GraphAction>;
}
interface ChatContextValue {
  state: ChatState;
  dispatch: Dispatch<ChatAction>;
}
interface IngestionContextValue {
  state: IngestionState;
  dispatch: Dispatch<IngestionAction>;
}

const GraphContext = createContext<GraphContextValue | undefined>(undefined);
const ChatContext = createContext<ChatContextValue | undefined>(undefined);
const IngestionContext = createContext<IngestionContextValue | undefined>(undefined);

/**
 * Wraps children with all three global-state providers (graph, chat,
 * ingestion). Mounted once at the root of the app shell.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [graphStateValue, graphDispatch] = useReducer(graphReducer, initialGraphState);
  const [chatStateValue, chatDispatch] = useReducer(chatReducer, initialChatState);
  const [ingestionStateValue, ingestionDispatch] = useReducer(ingestionReducer, initialIngestionState);

  return (
    <GraphContext.Provider value={{ state: graphStateValue, dispatch: graphDispatch }}>
      <ChatContext.Provider value={{ state: chatStateValue, dispatch: chatDispatch }}>
        <IngestionContext.Provider value={{ state: ingestionStateValue, dispatch: ingestionDispatch }}>
          {children}
        </IngestionContext.Provider>
      </ChatContext.Provider>
    </GraphContext.Provider>
  );
}

/** Reads and dispatches against the graph slice of global state. Must be used within AppProviders. */
export function useGraphState(): GraphContextValue {
  const ctx = useContext(GraphContext);
  if (!ctx) throw new Error("useGraphState must be used within AppProviders");
  return ctx;
}

/** Reads and dispatches against the chat slice of global state. Must be used within AppProviders. */
export function useChatState(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatState must be used within AppProviders");
  return ctx;
}

/** Reads and dispatches against the ingestion slice of global state. Must be used within AppProviders. */
export function useIngestionState(): IngestionContextValue {
  const ctx = useContext(IngestionContext);
  if (!ctx) throw new Error("useIngestionState must be used within AppProviders");
  return ctx;
}
