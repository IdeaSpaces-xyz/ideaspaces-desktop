import { cn } from "../lib/cn";
import { LogoSymbol } from "./LogoSymbol";

// The brand lockup — hexagon mark + the stacked `idea / spaces` wordmark in
// Fragment Mono. Ported from is_web; a plain element here (no router).
export function BrandLockup({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-label="IdeaSpaces"
      className={cn("inline-flex items-center gap-[7px] text-is-text", className)}
    >
      <LogoSymbol className={cn("shrink-0", compact ? "h-[31px] w-[36px]" : "h-[49px] w-[56px]")} />
      <span
        aria-hidden="true"
        className={cn(
          "flex flex-col font-chrome leading-none tracking-[0.01em]",
          compact ? "text-[14px]" : "text-[18px]",
        )}
      >
        <span>idea</span>
        <span className="mt-[-5px]">spaces</span>
      </span>
    </span>
  );
}
