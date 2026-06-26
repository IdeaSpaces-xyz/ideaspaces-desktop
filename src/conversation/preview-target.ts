// A workspace node the right panel can preview: its id (for resolution) plus a
// label to show until its name resolves. Shared by the notes list and the
// preview pane so neither owns the other.
export interface PreviewTarget {
  nodeId: string;
  label: string;
}
