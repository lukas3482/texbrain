import { derived, get } from 'svelte/store';
import { compileProblems, compileStatus } from '$lib/stores/app';
import { projectHandle, projectName } from '$lib/project/store';
import { notesLinks } from './links';
import { describeProject } from './commands';

// tells brainbridge what changed without being asked: a compile that started
// or ended, another project, another notebook link. a socket that is not open
// just drops them
export function watchEditor(emit: (name: string, data: unknown) => void): () => void {
  let firstCompile = true;
  const stopCompile = compileStatus.subscribe((state) => {
    if (firstCompile) {
      firstCompile = false;
      return;
    }
    const problems = get(compileProblems);
    emit('compile', {
      state: state === 'success' ? 'ready' : state,
      errors: problems.filter((p) => p.severity === 'error').length,
      warnings: problems.filter((p) => p.severity === 'warning').length
    });
  });

  const documentKey = derived([projectName, projectHandle, notesLinks], ([name, handle, links]) => (name && handle ? `${name}\n${links[name] ?? ''}` : ''));
  let firstDocument = true;
  const stopDocument = documentKey.subscribe(() => {
    if (firstDocument) {
      firstDocument = false;
      return;
    }
    void describeProject().then((project) => emit('document', { project }));
  });

  return () => {
    stopCompile();
    stopDocument();
  };
}
