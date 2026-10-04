// the commands brainbridge can run in this tab. each one goes through the
// same stores and the same editor view the ui uses, so an edit from here is
// one undo step like any other and shows up as it happens.
//
// this module stays importable in node for the tests: the pdf renderer is
// imported lazily

import { get } from 'svelte/store';
import { activeFile, projectHandle, projectName } from '$lib/project/store';
import { compileProblems, compileStatus } from '$lib/stores/app';
import { getVirtualRoot } from '$lib/fs/virtual-fs';
import { version } from '$lib/version';
import { editorHooks } from './hooks';

export type CommandArgs = Record<string, unknown>;

export interface CommandContext {
  // something happened that the server did not ask about
  emit(name: string, data: unknown): void;
}

type Handler = (args: CommandArgs, ctx: CommandContext) => Promise<unknown> | unknown;

function isDrawio(name: string): boolean {
  return name.toLowerCase().endsWith('.drawio');
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

async function describeProject() {
  const name = get(projectName);
  const handle = get(projectHandle);
  if (!name || !handle) return null;
  return { name, kind: await projectKind(handle) };
}

function cursor() {
  const file = get(activeFile);
  const view = file && !isDrawio(file.name) ? editorHooks()?.view() : null;
  if (!view) return null;
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return { line: line.number, col: head - line.from + 1 };
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
  status
};

export const commandNames = Object.keys(handlers);

export async function runCommand(cmd: string, args: CommandArgs, ctx: CommandContext): Promise<unknown> {
  if (!Object.hasOwn(handlers, cmd)) throw new Error('unknown command');
  return await handlers[cmd](args ?? {}, ctx);
}
