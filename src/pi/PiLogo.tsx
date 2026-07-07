// The pi mark — from https://pi.dev/press-kit (the P + i glyph). Rendered
// monochrome via `currentColor` so it inherits the app's icon color like the
// other connectors; props mirror the Lucide icon API `ConnectCard` uses
// (`strokeWidth` is accepted but unused — the mark is fill-based).
export function PiLogo({
  size = 20,
  className,
  "aria-hidden": ariaHidden,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 800 800"
      fill="currentColor"
      className={className}
      aria-hidden={ariaHidden ?? true}
    >
      <path
        fillRule="evenodd"
        d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
      />
      <path d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  );
}
