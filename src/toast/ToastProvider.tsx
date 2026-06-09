import { useCallback, useRef, useState, type ReactNode } from "react";
import * as Toast from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "../lib/cn";
import { ToastContext, type ToastKind } from "./toast-context";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const DURATION = 4000;

// Transient notifications for action outcomes (clone, sync, errors), built on
// Radix Toast — slide animation, swipe-to-dismiss, and an accessible live region.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    setItems((prev) => [...prev, { id: nextId.current++, message, kind }]);
  }, []);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      <Toast.Provider swipeDirection="right" duration={DURATION}>
        {children}
        {items.map((item) => (
          <Toast.Root
            key={item.id}
            // Errors can be multi-sentence CLI stderr — keep them up until the
            // user dismisses; success toasts auto-dismiss.
            duration={item.kind === "error" ? Infinity : DURATION}
            onOpenChange={(open) => {
              if (!open) remove(item.id);
            }}
            className={cn(
              "flex items-center gap-3 rounded-lg border border-is-border bg-is-surface px-4 py-2.5 text-sm shadow-lg",
              "data-[state=open]:animate-[toast-in_180ms_ease-out]",
              "data-[state=closed]:animate-[toast-out_140ms_ease-in]",
              "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
              "data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform",
              "data-[swipe=end]:animate-[toast-out_140ms_ease-in]",
            )}
          >
            <Toast.Description
              className={cn("flex-1", item.kind === "error" ? "text-is-danger-text" : "text-is-text")}
            >
              {item.message}
            </Toast.Description>
            <Toast.Close
              aria-label="Dismiss"
              className="shrink-0 text-is-text-tertiary transition hover:text-is-text"
            >
              <X size={14} strokeWidth={1.5} aria-hidden="true" />
            </Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed bottom-4 right-4 z-50 m-0 flex max-w-sm list-none flex-col gap-2 p-0 outline-none" />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}
