import { useEffect, useRef, type RefObject } from "react";

// Drag handle for a resizable pane. Ported from is_web v2's repo browser /
// conversation split. Keyboard-accessible: a `slider` role with Arrow keys.
// Width is owned by the parent (EditorSurface). `side` is which side of the
// handle the measured pane sits on — "right" (the editor pane, browse split) or
// "left" (the Focus-mode rail).
const RESIZE_STEP = 24;

export function Resizer({
  containerRef,
  width,
  onResize,
  side = "right",
  min = 360,
  max = 820,
  label = "Editor pane width",
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  width: number;
  onResize: (width: number) => void;
  side?: "left" | "right";
  min?: number;
  max?: number;
  label?: string;
}) {
  // Active drag's teardown, so an unmount mid-drag (e.g. the note is closed
  // programmatically) still removes the window listeners and resets the body
  // cursor — otherwise the cursor stays `col-resize` for the session.
  const endDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endDragRef.current?.(), []);

  // Clamp to the size bounds and to 70% of the container, so neither input path
  // (drag or keyboard) can let the pane swallow the other side on a wide window.
  const clampWidth = (w: number) => {
    const container = containerRef.current;
    const cap = container ? Math.min(max, container.getBoundingClientRect().width * 0.7) : max;
    return Math.max(min, Math.min(w, cap));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const move = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      // The measured pane spans from the container edge on `side` to the handle.
      onResize(clampWidth(side === "left" ? ev.clientX - rect.left : rect.right - ev.clientX));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      endDragRef.current = null;
    };
    endDragRef.current = up;
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // Which arrow grows the pane depends on which side it's on.
  const grow = side === "left" ? "ArrowRight" : "ArrowLeft";

  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-orientation="horizontal"
      tabIndex={0}
      onMouseDown={onMouseDown}
      onKeyDown={(e) => {
        if (e.key === grow) {
          e.preventDefault();
          onResize(clampWidth(width + RESIZE_STEP));
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onResize(clampWidth(width - RESIZE_STEP));
        }
      }}
      className="group relative w-1 shrink-0 cursor-col-resize bg-is-border transition-colors hover:bg-is-accent focus-visible:bg-is-accent focus-visible:outline-none max-md:hidden"
    >
      {/* Wider invisible hit area so the 1px rule is easy to grab. */}
      <span aria-hidden className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}
