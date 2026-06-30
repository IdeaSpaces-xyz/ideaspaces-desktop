// Canonical web (is_web) URLs for sharing/opening in the browser. The desktop
// has no web origin of its own, so we mirror is_web's `SITE_ORIGIN` constant.
export const SITE_ORIGIN = "https://ideaspaces.xyz";

/**
 * Public web URL for a node in a space — `/<owner>/<repo>/space/<path>` (the
 * path route is public). `namespace` is the owner handle (a username, or an org
 * hostname). `relPath` is the repo-relative path; a trailing `.md`/`.markdown`
 * is dropped since node paths are extensionless. Empty path → the repo root.
 */
export function spaceUrl(namespace: string, slug: string, relPath = ""): string {
  const nodePath = relPath.replace(/\.(md|markdown)$/i, "");
  const tail = nodePath
    ? `/${nodePath.split("/").map(encodeURIComponent).join("/")}`
    : "";
  return `${SITE_ORIGIN}/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}/space${tail}`;
}
