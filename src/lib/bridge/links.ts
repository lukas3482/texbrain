import { get, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { DEFAULT_PORT } from './protocol';

const KEY = 'texbrain-notes-links';
const NOTES_URL = 'https://notes.swimmingbrain.dev/';

// which braiNOTES notebook belongs to which project, by project name. it
// lives in this browser only, like the preferences
function load(): Record<string, string> {
  if (!browser) return {};
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}

export const notesLinks = writable<Record<string, string>>(load());

export function notebookFor(project: string): string | null {
  return get(notesLinks)[project] ?? null;
}

export function linkNotebook(project: string, notebook: string | null): void {
  notesLinks.update((links) => {
    const next = { ...links };
    if (notebook) next[project] = notebook;
    else delete next[project];
    if (browser) {
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
    }
    return next;
  });
}

// a pasted braiNOTES address works as well as the bare id
export function notebookId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const id = new URL(text).searchParams.get('notebook');
    if (id) return id;
  } catch {}
  return text;
}

// the notebook in braiNOTES, with the bridge switched on there as well
export function notesUrl(notebook: string, port = DEFAULT_PORT): string {
  return `${NOTES_URL}?notebook=${encodeURIComponent(notebook)}&bridge${port === DEFAULT_PORT ? '' : `=${port}`}`;
}
