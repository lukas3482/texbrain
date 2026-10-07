// edits that go through the codemirror view, worked out on the state alone so
// the tests can run them without a page

import type { EditorState, TransactionSpec } from '@codemirror/state';

export function cursorOf(state: EditorState): { line: number; col: number } {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number, col: head - line.from + 1 };
}

// where an insert lands: at the cursor, at the end, or at a line and column
// counted from 1 like the status bar does
export function insertPosition(state: EditorState, at: unknown): number {
  if (at === undefined || at === null || at === 'cursor') return state.selection.main.head;
  if (at === 'end') return state.doc.length;
  if (typeof at === 'object' && 'line' in at) {
    const { line, col } = at as { line: unknown; col?: unknown };
    const n = Number(line);
    if (!Number.isInteger(n) || n < 1 || n > state.doc.lines) throw new Error(`line must be between 1 and ${state.doc.lines}`);
    const target = state.doc.line(n);
    const c = col === undefined || col === null ? 1 : Number(col);
    if (!Number.isInteger(c) || c < 1) throw new Error('col must be a whole number from 1');
    return target.from + Math.min(c - 1, target.length);
  }
  throw new Error('at must be "cursor", "end" or { line, col }');
}

// the text goes in exactly as given. the toolbar's insertAtCursor takes the
// first | as the spot for the cursor and drops it, which would break a {l|r}
// or a \left| from here
export function insertion(state: EditorState, text: string, at: unknown): TransactionSpec {
  const from = insertPosition(state, at);
  // codemirror keeps \n only, so the cursor is counted on that
  const insert = text.replace(/\r\n?/g, '\n');
  return { changes: { from, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true };
}

// the smallest change that turns one text into the other, so a write to the
// open file keeps the cursor where it was and the undo step stays small
export function changeBetween(before: string, after: string): { from: number; to: number; insert: string } | null {
  if (before === after) return null;
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let end = 0;
  while (end < max - start && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}
