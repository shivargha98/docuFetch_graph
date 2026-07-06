/**
 * Shared collapsible glass-panel wrapper used by both the folder panel and
 * the chat panel. Wraps Radix's Collapsible primitive with the app's dark
 * neon/glow visual treatment: a titled header row with a toggle trigger that
 * stays rendered (the re-expand affordance) whether the panel is open or
 * collapsed, and content that unmounts when collapsed.
 */
import { type ReactNode, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

interface CollapsiblePanelProps {
  /** Header label shown next to the collapse/expand trigger. */
  title: string;
  /** Panel body, unmounted while collapsed (unless `forceMount` is set). */
  children: ReactNode;
  /** Whether the panel starts expanded. Defaults to true. */
  defaultOpen?: boolean;
  /** Optional `data-testid` applied to the outer panel element. */
  testId?: string;
  /** Optional extra classes for the outer panel element (e.g. layout sizing). */
  className?: string;
  /**
   * When true, content stays mounted in the DOM while collapsed (visually
   * hidden via a CSS class we control ourselves, independent of Radix's own
   * open/closed bookkeeping) instead of unmounting. This lets state tied to
   * that DOM subtree -- e.g. a scroll position -- survive a collapse/re-expand
   * cycle. Defaults to false, preserving the original unmount-on-collapse
   * behavior for existing consumers (e.g. the folder panel).
   */
  forceMount?: boolean;
  /**
   * When true, the panel's own outer width shrinks to fit its header once
   * collapsed (overriding any fixed width supplied via `className`), freeing
   * horizontal space for sibling flex items in a row layout. Defaults to
   * false, preserving the original fixed-width behavior for existing
   * consumers.
   */
  shrinkWidthOnCollapse?: boolean;
}

/**
 * Renders a glass-panel surface with a title bar whose trigger button toggles
 * the visibility of its children. The trigger itself is always present so a
 * collapsed panel can always be re-expanded.
 */
export function CollapsiblePanel({
  title,
  children,
  defaultOpen = true,
  testId,
  className,
  forceMount = false,
  shrinkWidthOnCollapse = false,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      data-testid={testId}
      className={cn(
        "glass-panel flex flex-col rounded-xl shadow-glow-soft overflow-hidden",
        className,
        shrinkWidthOnCollapse && !open && "md:w-auto"
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
        <span className="font-display text-sm tracking-wide text-text-primary">{title}</span>
        <Collapsible.Trigger
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          className="text-ion hover:text-synapse transition-colors"
        >
          <ChevronDown
            size={16}
            className={cn("transition-transform", open ? "rotate-0" : "-rotate-90")}
          />
        </Collapsible.Trigger>
      </div>
      <Collapsible.Content
        data-testid={testId ? `${testId}-content` : undefined}
        forceMount={forceMount ? true : undefined}
        className={cn("flex-1 min-h-0 overflow-auto", forceMount && !open && "hidden")}
      >
        <div className="p-4">{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
