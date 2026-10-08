// the commands brainbridge can run in this tab. each one goes through the
// same stores and the same editor view the ui uses, so an edit from here is
// one undo step like any other and shows up as it happens.
//
// this module stays importable in node for the tests: the pdf renderer is
// imported lazily

import { get } from 'svelte/store';
import { tick } from 'svelte';
import type { EditorView } from '@codemirror/view';
import { activeFile, activeFileId, entryPoint, files, markFileSaved, projectHandle, projectName, setActiveTab } from '$lib/project/store';
import { findProjectFile, handleOpenFileFromTree, refreshProjectTree } from '$lib/project/manager';
import { compileLog, compileProblems, compileStatus } from '$lib/stores/app';
import { problemsReport } from '$lib/compiler/log';
import { getVirtualRoot, listVirtualProjects } from '$lib/fs/virtual-fs';
import { templates } from '$lib/templates';
import { version } from '$lib/version';
import { editorHooks } from './hooks';
import { linkNotebook, notebookFor } from './links';
import { cleanPath, listProjectFiles, readProjectFile, writeProjectFile } from './project-files';
import { changeBetween, cursorOf, insertion } from './edits';
import { createStoredProject, openStoredProject } from './projects';

export type CommandArgs = Record<string, unknown>;

export interface CommandContext {
  // something happened that the server did not ask about
  emit(name: string, data: unknown): void;
}

type Handler = (args: CommandArgs, ctx: CommandContext) => Promise<unknown> | unknown;

function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function isDrawio(name: string): boolean {
  return name.toLowerCase().endsWith('.drawio');
}

// a project name becomes a folder, so no slashes and nothing hidden
function projectNameArg(value: unknown): string {
  const name = str(value, 'name').trim();
  if (!name || /[\\/:*?"<>|]/.test(name) || name.startsWith('.') || name.length > 100) {
    throw new Error(`"${name}" can't be a project name, it becomes a folder name`);
  }
  return name;
}

function requireProjectName(): string {
  const name = get(projectName);
  if (!name || !get(projectHandle)) throw new Error('No project is open. Open one with tex_open or create one with tex_create.');
  return name;
}

function requireProject(): FileSystemDirectoryHandle {
  requireProjectName();
  return get(projectHandle) as FileSystemDirectoryHandle;
}

// these have no text to hand over
const BINARY = /\.(png|jpe?g|gif|bmp|webp|pdf|eps|ps|tfm|pfb|vf|otf|ttf|woff2?|zip|gz)$/i;

// an open tab shows what was written. the one in the editor gets it through
// the view, so ctrl+z brings the old text back
function showWritten(path: string, text: string): void {
  const tab = get(files).find((f) => f.path === path);
  if (!tab) return;
  const view = tab.id === get(activeFileId) && !isDrawio(tab.name) ? editorHooks()?.view() : null;
  const change = view ? changeBetween(view.state.doc.toString(), text) : null;
  if (view && change) view.dispatch({ changes: change });
  markFileSaved(tab.id, text);
}

function count(severity: 'error' | 'warning'): number {
  return get(compileProblems).filter((p) => p.severity === severity).length;
}

// a project from the folder picker or one stored inside the browser. only
// the second kind can be opened again without a click
async function projectKind(handle: FileSystemDirectoryHandle): Promise<'browser' | 'folder'> {
  try {
    const root = await getVirtualRoot();
    return (await root.resolve(handle)) ? 'browser' : 'folder';
  } catch {
    return 'folder';
  }
}

export async function describeProject() {
  const name = get(projectName);
  const handle = get(projectHandle);
  if (!name || !handle) return null;
  return { name, kind: await projectKind(handle), notes: notebookFor(name) };
}

function cursor() {
  const file = get(activeFile);
  const view = file && !isDrawio(file.name) ? editorHooks()?.view() : null;
  return view ? cursorOf(view.state) : null;
}

// the file an insert goes to comes up in the editor first
async function focusFile(path: string): Promise<void> {
  let tab = get(files).find((f) => f.path === path);
  if (!tab) {
    const entry = findProjectFile(path);
    if (!entry?.handle || entry.path !== path) throw new Error(`There is no file ${path} in the project. Make it with tex_write first.`);
    await handleOpenFileFromTree(entry.handle, entry.path);
    tab = get(files).find((f) => f.path === path);
    if (!tab) throw new Error(`${path} could not be opened`);
  }
  if (get(activeFileId) !== tab.id) setActiveTab(tab.id);
  await tick();
}

function requireView(): EditorView {
  const file = get(activeFile);
  if (!file) throw new Error('No file is open in the editor');
  if (isDrawio(file.name)) throw new Error(`${file.path} is a draw.io diagram, there is no text to insert into`);
  const view = editorHooks()?.view();
  if (!view) throw new Error('The editor is not ready in the tab yet, try again');
  // the page swaps the text of the active tab into the view on its own time
  if (view.state.doc.toString() !== file.content.replace(/\r\n?/g, '\n')) throw new Error(`The editor is not showing ${file.path} yet, try again`);
  return view;
}

async function status() {
  const state = get(compileStatus);
  return {
    project: await describeProject(),
    file: get(activeFile)?.path ?? null,
    cursor: cursor(),
    compiling: state === 'compiling',
    last: state === 'success' || state === 'error' ? { ok: state === 'success', errors: count('error'), warnings: count('warning') } : null,
    version
  };
}

const handlers: Record<string, Handler> = {
  status,

  // only the projects stored inside the browser, a folder on disk needs the
  // picker and a click every time
  async projects() {
    const root = await getVirtualRoot();
    const out = [];
    for (const name of await listVirtualProjects()) {
      const list = await listProjectFiles(await root.getDirectoryHandle(name));
      const updatedAt = list.length > 0 ? Math.max(...list.map((f) => f.modified)) : null;
      out.push({ name, updatedAt, notes: notebookFor(name) });
    }
    return out;
  },

  async open({ name }) {
    const wanted = str(name, 'name');
    if (get(projectName) !== wanted || !get(projectHandle)) await openStoredProject(wanted);
    return { ...(await status()), summary: `opened ${wanted}` };
  },

  async create({ name, template }) {
    const project = projectNameArg(name);
    const id = optStr(template);
    const picked = id ? templates.find((t) => t.id === id) : undefined;
    if (id && !picked) throw new Error(`Unknown template "${id}", there are ${templates.map((t) => t.id).join(', ')}`);
    await createStoredProject(project, picked?.content);
    return { ...(await status()), summary: `created ${project}` };
  },

  async files() {
    const list = await listProjectFiles(requireProject());
    return list.map(({ path, size }) => ({ path, size }));
  },

  async read({ path }) {
    const p = cleanPath(path);
    // an open tab has the newest text, unsaved edits included
    const tab = get(files).find((f) => f.path === p);
    if (tab) return { path: p, text: tab.content };
    if (BINARY.test(p)) throw new Error(`${p} is not a text file`);
    return { path: p, text: await readProjectFile(requireProject(), p) };
  },

  async write({ path, text }) {
    const p = cleanPath(path);
    if (typeof text !== 'string') throw new Error('text must be a string');
    const created = await writeProjectFile(requireProject(), p, text);
    showWritten(p, text);
    if (created) await refreshProjectTree();
    return { path: p, size: new TextEncoder().encode(text).length, created, summary: `${created ? 'created' : 'wrote'} ${p}` };
  },

  // straight through the view, one undo step, the text exactly as sent
  async insert({ text, at, file }) {
    if (typeof text !== 'string' || !text) throw new Error('text must be a non-empty string');
    if (file !== undefined && file !== null) await focusFile(cleanPath(file));
    const view = requireView();
    view.dispatch(insertion(view.state, text, at));
    const path = get(activeFile)?.path ?? null;
    return { file: path, cursor: cursorOf(view.state), summary: `${text.length} characters into ${path}` };
  },

  // answers right away, compile_status says when it is done. the first
  // compile pulls packages and can take a while
  compile() {
    const hooks = editorHooks();
    if (!hooks) throw new Error('The editor is not open in the tab');
    const file = get(activeFile);
    if (!file) throw new Error('Nothing to compile, no file is open');
    if (hooks.compiling()) return { started: false, reason: 'a compile is already running', summary: 'already compiling' };
    hooks.compile();
    if (get(compileStatus) !== 'compiling') return { started: false, reason: `${file.path} can't be compiled`, summary: 'nothing to compile' };
    return { started: true, summary: 'started' };
  },

  compile_status() {
    const state = get(compileStatus);
    const mainFile = get(entryPoint) || get(activeFile)?.path || 'document';
    return {
      state: state === 'success' ? 'ready' : state,
      errors: count('error'),
      warnings: count('warning'),
      problems: problemsReport(get(compileProblems), mainFile),
      log: get(compileLog).slice(-60).join('\n'),
      summary: state === 'success' ? 'ready' : state
    };
  },

  // the braiNOTES notebook that belongs to the open project, null unlinks
  link({ notes }) {
    const project = requireProjectName();
    if (notes !== null && notes !== undefined && typeof notes !== 'string') throw new Error('notes must be a notebook id or null');
    const notebook = optStr(notes)?.trim() || null;
    linkNotebook(project, notebook);
    return { project, notes: notebook, summary: notebook ? `${project} linked to notebook ${notebook}` : `${project} unlinked` };
  }
};

export const commandNames = Object.keys(handlers);

export async function runCommand(cmd: string, args: CommandArgs, ctx: CommandContext): Promise<unknown> {
  if (!Object.hasOwn(handlers, cmd)) throw new Error('unknown command');
  return await handlers[cmd](args ?? {}, ctx);
}
