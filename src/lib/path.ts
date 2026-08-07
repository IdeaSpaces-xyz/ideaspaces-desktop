/** Last path segment (POSIX), tolerating trailing slashes. */
export function basename(p: string): string {
  return p.split("/").filter(Boolean).pop() || p;
}
