import type { EditorView } from '@codemirror/view';

// the editor page owns the codemirror view, the compile and the pdf bytes as
// plain variables, so it hands them over here when it mounts. the commands
// ask at call time, the page builds a new view now and then
export interface EditorHooks {
  view: () => EditorView | null;
  // starts a compile like the button does
  compile: () => void;
  compiling: () => boolean;
  // the last compiled pdf
  pdf: () => Uint8Array | undefined;
}

let hooks: EditorHooks | null = null;

export function setEditorHooks(next: EditorHooks | null): void {
  hooks = next;
}

export function editorHooks(): EditorHooks | null {
  return hooks;
}
