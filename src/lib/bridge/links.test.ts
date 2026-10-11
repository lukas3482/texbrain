import { describe, expect, test } from 'vitest';
import { linkNotebook, notebookFor, notebookId, notesUrl } from './links';

describe('notebook links', () => {
  test('a pasted address works as well as the id', () => {
    expect(notebookId('  nb-1  ')).toBe('nb-1');
    expect(notebookId('https://notes.swimmingbrain.dev/?notebook=nb-2&bridge')).toBe('nb-2');
    expect(notebookId('')).toBeNull();
  });

  test('the address carries the port only when it is not the usual one', () => {
    expect(notesUrl('nb 3')).toBe('https://notes.swimmingbrain.dev/?notebook=nb%203&bridge');
    expect(notesUrl('nb-3', 7400)).toBe('https://notes.swimmingbrain.dev/?notebook=nb-3&bridge=7400');
  });

  test('a link belongs to a project and goes again with null', () => {
    linkNotebook('thesis', 'nb-4');
    expect(notebookFor('thesis')).toBe('nb-4');
    linkNotebook('thesis', null);
    expect(notebookFor('thesis')).toBeNull();
  });
});
