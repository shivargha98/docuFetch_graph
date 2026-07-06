/**
 * Unit tests for TraceBlock, the collapsible traversal-trace UI rendered above
 * each chat answer.
 * Covers: live-updating sequence rendering, collapse into "show reasoning path",
 * expand-to-reveal, and independence across multiple past queries.
 * Source: Feature: Live Traversal Trace Block (docs/frontend/features.md), Issue 10.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TraceBlock } from "../../src/components/chat/TraceBlock";
import type { Trace } from "../../src/state/types";

afterEach(() => {
  cleanup();
});

const LIVE_TRACE: Trace = {
  queryId: "q1",
  collapsed: false,
  steps: [
    { nodeId: "n1", concept: "Alpha", hop: 0, viaRelation: null },
    { nodeId: "n2", concept: "Beta", hop: 1, viaRelation: "depends_on" },
  ],
};

const COMPLETED_TRACE: Trace = {
  queryId: "q2",
  collapsed: true,
  steps: [
    { nodeId: "n1", concept: "Alpha", hop: 0, viaRelation: null },
    { nodeId: "n2", concept: "Beta", hop: 1, viaRelation: "depends_on" },
    { nodeId: "n3", concept: "Gamma", hop: 2, viaRelation: "causes" },
  ],
};

describe("TraceBlock", () => {
  it("renders the live-updating visited-concept sequence while traversal is in progress", () => {
    /**
     * Given a trace prop with an in-progress, non-collapsed sequence of visited concepts,
     * when the trace block renders,
     * then each visited concept in the sequence is rendered in order.
     *
     * Source: Feature: Live Traversal Trace Block — criterion 1
     */
    render(<TraceBlock trace={LIVE_TRACE} />);

    const block = screen.getByTestId("trace-block");
    expect(block).toHaveAttribute("data-state", "live");
    expect(within(block).getByText("Alpha")).toBeInTheDocument();
    expect(within(block).getByText("Beta")).toBeInTheDocument();

    const concepts = within(block)
      .getAllByText(/Alpha|Beta/)
      .map((el) => el.textContent);
    expect(concepts).toEqual(["Alpha", "Beta"]);
  });

  it('renders in a collapsed "show reasoning path" state once given a completed trace', () => {
    /**
     * Given a trace prop marked as complete/collapsed,
     * when the trace block renders,
     * then it renders a collapsed summary labeled for expansion instead of the
     * full live sequence.
     *
     * Source: Feature: Live Traversal Trace Block — criterion 2
     */
    render(<TraceBlock trace={COMPLETED_TRACE} />);

    const block = screen.getByTestId("trace-block");
    expect(block).toHaveAttribute("data-state", "collapsed");
    expect(screen.getByText(/show reasoning path/i)).toBeInTheDocument();
    expect(screen.queryByText("Gamma")).not.toBeInTheDocument();
  });

  it("expands to reveal the full visited-concept sequence when toggled open", async () => {
    /**
     * Given a collapsed trace block,
     * when its expand control is activated,
     * then the full visited-concept sequence for that query becomes visible.
     *
     * Source: Feature: Live Traversal Trace Block — criterion 3
     */
    const user = userEvent.setup();
    render(<TraceBlock trace={COMPLETED_TRACE} />);

    await user.click(screen.getByText(/show reasoning path/i));

    const block = screen.getByTestId("trace-block");
    expect(block).toHaveAttribute("data-state", "expanded");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("renders independently for each of multiple past queries in the transcript", async () => {
    /**
     * Given a transcript with two completed queries, each with their own trace,
     * when both trace blocks render,
     * then expanding one query's trace does not affect the other's expand/collapse state.
     *
     * Source: Feature: Live Traversal Trace Block — criterion 4
     */
    const otherTrace: Trace = {
      queryId: "q3",
      collapsed: true,
      steps: [{ nodeId: "n9", concept: "Delta", hop: 0, viaRelation: null }],
    };
    const user = userEvent.setup();
    render(
      <>
        <TraceBlock trace={COMPLETED_TRACE} />
        <TraceBlock trace={otherTrace} />
      </>
    );

    const [firstToggle, secondToggle] = screen.getAllByText(/show reasoning path/i);
    await user.click(firstToggle);

    const blocks = screen.getAllByTestId("trace-block");
    expect(blocks[0]).toHaveAttribute("data-state", "expanded");
    expect(blocks[1]).toHaveAttribute("data-state", "collapsed");
    expect(secondToggle).toBeInTheDocument();
  });
});
