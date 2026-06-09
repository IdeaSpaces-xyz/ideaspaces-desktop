import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// clsx handles conditionals; twMerge resolves Tailwind conflicts so caller overrides win.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(...inputs));
}
