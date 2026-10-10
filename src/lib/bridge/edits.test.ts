import { describe, expect, test } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { changeBetween, cursorOf, insertion } from './edits';

function stateAt(doc: string, cursor: number): EditorState {
  return EditorState.create({ doc, selection: EditorSelection.cursor(cursor) });
}

function insert(state: EditorState, text: string, at?: unknown): EditorState {
  return state.update(insertion(state, text, at)).state;
}

describe('insertion', () => {
  test('keeps every | of the text', () => {
    const doc = 'a\n\nb';
    const text = '\\begin{tabular}{l|r}\n$\\left| x \\right|$ & \\|v\\|\n\\end{tabular}';
    const next = insert(stateAt(doc, 2), text);
    expect(next.doc.toString()).toBe('a\n' + text + '\nb');
    expect(next.selection.main.head).toBe(2 + text.length);
  });

  test('a lone | is text too, not the spot for the cursor', () => {
    const next = insert(stateAt('ab', 1), '|');
    expect(next.doc.toString()).toBe('a|b');
    expect(cursorOf(next)).toEqual({ line: 1, col: 3 });
  });

  test('goes to the end, or to a line and column counted from 1', () => {
    const state = stateAt('one\ntwo\nthree', 0);
    expect(insert(state, '!', 'end').doc.toString()).toBe('one\ntwo\nthree!');
    expect(insert(state, 'X', { line: 2, col: 2 }).doc.toString()).toBe('one\ntXwo\nthree');
    expect(insert(state, 'X', { line: 2, col: 99 }).doc.toString()).toBe('one\ntwoX\nthree');
    expect(() => insertion(state, 'X', { line: 4, col: 1 })).toThrow(/between 1 and 3/);
    expect(() => insertion(state, 'X', 'middle')).toThrow(/cursor/);
  });

  test('windows line ends still put the cursor after the text', () => {
    const next = insert(stateAt('', 0), 'a\r\nb');
    expect(next.doc.toString()).toBe('a\nb');
    expect(cursorOf(next)).toEqual({ line: 2, col: 2 });
  });
});

describe('changeBetween', () => {
  test('replaces only the part that differs', () => {
    expect(changeBetween('hello world', 'hello there world')).toEqual({ from: 6, to: 6, insert: 'there ' });
    expect(changeBetween('a{l|r}b', 'a{l|c|r}b')).toEqual({ from: 4, to: 4, insert: 'c|' });
    expect(changeBetween('same', 'same')).toBeNull();
  });

  test('turns one text into the other', () => {
    const pairs = [['', 'new'], ['old', ''], ['aaa', 'aa'], ['abcabc', 'abc'], ['x\ny\nz', 'x\nY\nz']];
    for (const [before, after] of pairs) {
      const state = EditorState.create({ doc: before });
      const change = changeBetween(before, after);
      expect(change).not.toBeNull();
      expect(state.update({ changes: change! }).state.doc.toString()).toBe(after);
    }
  });
});
