import { get } from 'svelte/store';
import { projectHandle, projectName } from '$lib/project/store';
import { preferences } from '$lib/stores/preferences';
import { addToast } from '$lib/stores/app';
import { bridge } from './state';
import { emit } from './connection';
import { linkNotebook, notebookFor, notebookId, notesUrl } from './links';

function openProject(): string | null {
  const name = get(projectName);
  return name && get(projectHandle) ? name : null;
}

// the notebook id is in the address of the notebook in braiNOTES, pasting
// the whole address works too
export function promptNotebookLink(): void {
  const project = openProject();
  if (!project) {
    addToast('Open a project first, the notebook is linked to a project', 'info', 4000);
    return;
  }
  const answer = prompt(`braiNOTES notebook for ${project} (its id or its address, empty unlinks):`, notebookFor(project) ?? '');
  if (answer === null) return;
  const notebook = notebookId(answer);
  linkNotebook(project, notebook);
  addToast(notebook ? `${project} is linked to the notebook ${notebook}` : `${project} has no notebook any more`, 'success', 3000);
}

// the linked notebook in a new tab. with the bridge connected brainbridge
// hears about it too, so a braiNOTES tab that is already open can follow
export function openInNotes(): void {
  const project = openProject();
  const notebook = project ? notebookFor(project) : null;
  if (!notebook) {
    addToast('This project has no braiNOTES notebook yet, link one with Link braiNOTES notebook in the palette', 'info', 5000);
    return;
  }
  window.open(notesUrl(notebook, get(preferences).bridgePort), '_blank', 'noopener');
  if (get(bridge).state === 'connected') emit('switch', { to: 'notes', notebook });
}
