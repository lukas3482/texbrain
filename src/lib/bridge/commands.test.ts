import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { runCommand } from './commands';
import { setEditorHooks } from './hooks';
import { activeFile, closeFileTab, files, openFileTab, updateFileContent } from '$lib/project/store';

const ctx = { emit() {} };
type Any = Record<string, any>;
const run = (cmd: string, args: Record<string, unknown> = {}): Promise<Any> => runCommand(cmd, args, ctx) as Promise<Any>;

// stands in for the editor page: one view on the active tab, edits flow
// back into the tab like handleEditorUpdate does
function fakePage(doc: string, cursor: number) {
  const id = openFileTab('main.tex', doc, null, 'main.tex');
  const view = {
    state: EditorState.create({ doc, selection: EditorSelection.cursor(cursor) }),
    dispatch(spec: TransactionSpec) {
      view.state = view.state.update(spec).state;
      updateFileContent(id, view.state.doc.toString());
    }
  };
  setEditorHooks({ view: () => view as unknown as EditorView, compile() {}, compiling: () => false, pdf: () => undefined });
  return view;
}

beforeEach(() => {
  for (const f of get(files)) closeFileTab(f.id);
});

afterEach(() => setEditorHooks(null));

describe('bridge commands', () => {
  test('insert puts the text in exactly as sent, | and all', async () => {
    const view = fakePage('\\begin{document}\n\n\\end{document}', 17);
    const text = '\\begin{tabular}{l|c|r}\n$\\left|x\\right|$ & a \\| b\n\\end{tabular}';
    const result = await run('insert', { text });
    expect(view.state.doc.toString()).toBe(`\\begin{document}\n${text}\n\\end{document}`);
    expect(get(activeFile)?.content).toContain('{l|c|r}');
    expect(result.cursor).toEqual({ line: 4, col: 14 });
  });

  test('insert at the end and at a line, status follows the cursor', async () => {
    const view = fakePage('one\ntwo', 0);
    await run('insert', { text: '|', at: 'end' });
    await run('insert', { text: '|', at: { line: 2, col: 1 } });
    expect(view.state.doc.toString()).toBe('one\n|two|');
    expect((await run('status')).cursor).toEqual({ line: 2, col: 2 });
  });

  test('insert needs an open file, write and link need a project', async () => {
    await expect(run('insert', { text: 'x' })).rejects.toThrow(/No file is open/);
    await expect(run('write', { path: 'a.tex', text: 'x' })).rejects.toThrow(/No project is open/);
    await expect(run('link', { notes: 'nb1' })).rejects.toThrow(/No project is open/);
  });

  test('paths stay inside the project', async () => {
    await expect(run('read', { path: '../secret.tex' })).rejects.toThrow(/plain path/);
    await expect(run('read', { path: '/etc/passwd' })).rejects.toThrow(/not relative/);
    await expect(run('read', { path: 'C:\\x.tex' })).rejects.toThrow(/not relative/);
  });

  test('compile without a pdf yet, and pdf_page before any compile', async () => {
    fakePage('x', 0);
    expect(await run('compile_status')).toMatchObject({ state: 'idle', problems: expect.stringContaining('no problems') });
    await expect(run('pdf_page', { page: 1 })).rejects.toThrow(/no PDF yet/);
  });
});
