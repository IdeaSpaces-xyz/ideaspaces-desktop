import type { ReactNode } from "react";
import { cn } from "../lib/cn";

// The solid card that holds the conversation composer — and, above it, the
// workspace strip. Ported from is_web's ComposerShell so both surfaces read the
// same. One opaque (glass, when floating) container is what stops the scrolling
// thread bleeding through the workspace block's labels and gaps.
export function ComposerShell({
  children,
  variant = "floating",
  className,
}: {
  children: ReactNode;
  variant?: "floating" | "static";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-is-border bg-is-surface",
        variant === "floating"
          ? "bg-is-surface/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-is-surface/90"
          : "shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
