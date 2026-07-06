/**
 * Catches errors thrown while mounting the real ForceGraph3D WebGL canvas --
 * most notably "no WebGL context available", which is true in every jsdom
 * test environment (and in rare real browsers without WebGL support) -- and
 * renders a themed fallback instead of crashing the whole app shell. A class
 * component is required here since React error boundaries have no hook
 * equivalent.
 */
import { Component, type ReactNode } from "react";

interface GraphSceneErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface GraphSceneErrorBoundaryState {
  hasError: boolean;
}

export class GraphSceneErrorBoundary extends Component<
  GraphSceneErrorBoundaryProps,
  GraphSceneErrorBoundaryState
> {
  state: GraphSceneErrorBoundaryState = { hasError: false };

  /** Flips the boundary into its fallback-rendering state once a child throws. */
  static getDerivedStateFromError(): GraphSceneErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
