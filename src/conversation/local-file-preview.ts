// Pure path logic behind the local file preview. Two jobs:
//  - resolve a possibly-relative token to a normalized absolute path, and
//  - decide whether that path is even allowed (confined to the workspace) and,
//    if so, whether it's editable (under home, outside read-only mounts).
// Kept separate from the component so the rules are unit-tested. This is a
// security boundary: mention tokens are FREELY-TYPED user text (not a path
// picked from a directory listing), so `@../../.ideaspaces/credentials.json`
// must not resolve into a readable path. `..` is collapsed before any check.

/** Collapse `.`/`..` segments to a canonical path (no filesystem access). */
export function normalizePath(p: string): string {
  const isAbs = p.startsWith("/");
  const stack: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (stack.length && stack[stack.length - 1] !== "..") stack.pop();
      else if (!isAbs) stack.push(".."); // a relative path may climb above its base
      // for an absolute path, `..` above root is simply dropped
    } else {
      stack.push(seg);
    }
  }
  return (isAbs ? "/" : "") + stack.join("/");
}

/** Absolute, normalized path for a possibly-relative token resolved under `base`. */
export function resolveUnder(base: string, p: string): string {
  const joined = p.startsWith("/") ? p : `${base.replace(/\/+$/, "")}/${p}`;
  return normalizePath(joined);
}

const under = (path: string, dir: string): boolean => {
  const prefix = `${dir.replace(/\/+$/, "")}/`;
  return path === dir || path.startsWith(prefix);
};

/** Confinement gate: a path is allowed only inside home or a mounted reference.
 *  Pass a normalized path (resolveUnder already normalizes) so `..` can't escape. */
export function isWithinContext(path: string, home: string, mounts: string[]): boolean {
  return under(path, home) || mounts.some((m) => under(path, m));
}

/** A file is editable when under home and not inside any read-only mount. */
export function isEditableFile(path: string, home: string, mounts: string[]): boolean {
  if (!under(path, home)) return false;
  return !mounts.some((m) => under(path, m));
}
