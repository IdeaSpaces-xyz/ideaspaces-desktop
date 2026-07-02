// Some browser-targeted deps still ship UMD bundles that reference Node's
// `global` (e.g. `@turbodocx/html-to-docx`, used for .docx export). The Tauri
// WKWebView has no `global`, so evaluating those modules throws
// "Can't find variable: global". Point `global` at `globalThis`.
//
// Imported first in `main.tsx` so it runs before any such module is evaluated
// (the docx lib is dynamically imported at export time, well after this).
const g = globalThis as unknown as { global?: typeof globalThis };
if (typeof g.global === "undefined") {
  g.global = globalThis;
}

export {};
