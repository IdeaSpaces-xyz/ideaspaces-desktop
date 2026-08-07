// Pure path logic behind the local file preview. A file is editable only when it
// lives under home (the workspace Pi writes to) and NOT under a mounted
// reference (those are read-only context, matching the panel's authority model).
// Kept separate from the component so the rules are unit-tested.

/** Absolute path for a possibly-relative token, resolved under `base`. */
export function resolveUnder(base: string, p: string): string {
  if (p.startsWith("/")) return p;
  const clean = p.replace(/^\.\//, "");
  return `${base.replace(/\/+$/, "")}/${clean}`;
}

const under = (path: string, dir: string): boolean => {
  const prefix = `${dir.replace(/\/+$/, "")}/`;
  return path === dir || path.startsWith(prefix);
};

/** A file is editable when under home and not inside any read-only mount. */
export function isEditableFile(path: string, home: string, mounts: string[]): boolean {
  if (!under(path, home)) return false;
  return !mounts.some((m) => under(path, m));
}
