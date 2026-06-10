import type React from "react";

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
  containerRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  onResize: (width: number) => void;
}) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const move = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const next = rect.right - ev.clientX;
      // Cap by RESIZE_MAX (same as the keyboard clamp) and by 70% of the
      // container so the pane can't swallow the tree on wide windows.
      onResize(Math.max(RESIZE_MIN, Math.min(next, RESIZE_MAX, rect.width * 0.7)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const clamp = (w: number) => Math.max(RESIZE_MIN, Math.min(w, RESIZE_MAX));

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
          onResize(clamp(width + RESIZE_STEP));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onResize(clamp(width - RESIZE_STEP));
        }
      }}
      className="group relative w-1 shrink-0 cursor-col-resize bg-is-border transition-colors hover:bg-is-accent focus-visible:outline-none focus-visible:bg-is-accent max-md:hidden"
    >
      {/* Wider invisible hit area so the 1px rule is easy to grab. */}
      <span aria-hidden className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}
