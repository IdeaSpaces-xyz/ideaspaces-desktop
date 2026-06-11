import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "../toast/toast-context";
import { cn } from "../lib/cn";

// Small clipboard-copy affordance for a path/doc. Stops propagation so it can
// sit inside clickable rows without also triggering them.
export function CopyButton({
  value,
  label = "path",
  size = 13,
  className,
}: {
  value: string;
  label?: string;
  size?: number;
  className?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      toast(`Couldn't copy: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void copy();
      }}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      title={`Copy ${label}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded p-1 text-is-text-tertiary transition hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring",
        className,
      )}
    >
      {copied ? (
        <Check size={size} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Copy size={size} strokeWidth={1.5} aria-hidden="true" />
      )}
    </button>
  );
}
