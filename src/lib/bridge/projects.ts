import { get } from 'svelte/store';
import { tick } from 'svelte';
import { closeFileTab, files, pendingTexFiles } from '$lib/project/store';
import { createBrowserProject, loadBrowserProject, selectEntryPoint } from '$lib/project/manager';
import { listVirtualProjects } from '$lib/fs/virtual-fs';
import { addToast } from '$lib/stores/app';

// the tabs of the project that was open go first, otherwise the main.tex of
// the next one would land on the old tab with the same path. unsaved work
// stops the switch
function closeTabs(): void {
  const dirty = get(files).filter((f) => f.dirty);
  if (dirty.length > 0) {
    throw new Error(`Unsaved changes in ${dirty.map((f) => f.path).join(', ')}. Save or close ${dirty.length === 1 ? 'that tab' : 'those tabs'} in TeXbrain first.`);
  }
  for (const f of get(files)) closeFileTab(f.id);
}

export async function openStoredProject(name: string): Promise<void> {
  if (!(await listVirtualProjects()).includes(name)) {
    throw new Error(`No project named "${name}" is stored in this browser. A project in a folder on disk can only be opened by hand with Open Folder, the browser asks for the folder first.`);
  }
  closeTabs();
  await loadBrowserProject(name);
  // several tex files ask for the main file, main.tex is the usual answer
  if (get(pendingTexFiles).includes('main.tex')) await selectEntryPoint('main.tex');
  await tick();
}

export async function createStoredProject(name: string, content?: string): Promise<void> {
  if ((await listVirtualProjects()).includes(name)) {
    throw new Error(`A project named "${name}" already exists in this browser. Open it with tex_open, or pick another name.`);
  }
  closeTabs();
  await createBrowserProject(name, content);
  await tick();
}

// /editor?project=<name> opens a project stored in this browser right away,
// that is the address braiNOTES links to
export async function openProjectFromUrl(): Promise<void> {
  const name = new URL(location.href).searchParams.get('project');
  if (!name) return;
  try {
    await openStoredProject(name);
    addToast(`Opened project: ${name}`, 'success', 2000);
  } catch (e) {
    addToast(e instanceof Error ? e.message : String(e), 'error', 8000);
  }
}
