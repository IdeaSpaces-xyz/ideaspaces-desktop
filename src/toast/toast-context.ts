import { createContext, useContext } from "react";

export type ToastKind = "success" | "error";
export type ToastFn = (message: string, kind?: ToastKind) => void;

export const ToastContext = createContext<ToastFn | null>(null);

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
