import { connectBridge, disconnectBridge } from './connection';
import { openInNotes, promptNotebookLink } from './switch';

// the bridge entries of the command palette, texbrain has no settings
// dialog so this and ?bridge are the switch
export const bridgeCommands = [
  { id: 'bridgeconnect', label: 'Bridge: connect', shortcut: '', action: connectBridge, category: 'bridge' },
  { id: 'bridgedisconnect', label: 'Bridge: disconnect', shortcut: '', action: disconnectBridge, category: 'bridge' },
  { id: 'linknotes', label: 'Link braiNOTES notebook', shortcut: '', action: promptNotebookLink, category: 'bridge' },
  { id: 'opennotes', label: 'Open in braiNOTES', shortcut: '', action: openInNotes, category: 'bridge' }
];
