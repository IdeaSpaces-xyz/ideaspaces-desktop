import { useEffect, useRef, type RefObject } from "react";

// Drag handle for the right-hand editor pane. Ported from is_web v2's repo
// browser / conversation split. Keyboard-accessible: a `slider` role with
// Arrow keys. Width is owned by the parent (EditorSurface).
const RESIZE_MIN = 360;
const RESIZE_MAX = 820;
const RESIZE_STEP = 24;

export function Resizer({
  containerRef,
  width,
  onResize,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  width: number;
  onResize: (width: number) => void;
}) {
  // Active drag's teardown, so an unmount mid-drag (e.g. the note is closed
  // programmatically) still removes the window listeners and resets the body
  // cursor — otherwise the cursor stays `col-resize` for the session.
  const endDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endDragRef.current?.(), []);

  // Clamp to the size bounds and to 70% of the container, so neither input path
  // (drag or keyboard) can let the pane swallow the tree on a wide window.
  const clampWidth = (w: number) => {
    const container = containerRef.current;
    const max = container
      ? Math.min(RESIZE_MAX, container.getBoundingClientRect().width * 0.7)
      : RESIZE_MAX;
    return Math.max(RESIZE_MIN, Math.min(w, max));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const move = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      onResize(clampWidth(rect.right - ev.clientX));
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

  return (
    <div
      role="slider"
      aria-label="Editor pane width"
      aria-valuenow={Math.round(width)}
      aria-valuemin={RESIZE_MIN}
      aria-valuemax={RESIZE_MAX}
      aria-orientation="horizontal"
      tabIndex={0}
      onMouseDown={onMouseDown}
      onKeyDown={(e) => {
        // Wider pane = handle moves left, so ArrowLeft grows it.
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onResize(clampWidth(width + RESIZE_STEP));
        } else if (e.key === "ArrowRight") {
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
