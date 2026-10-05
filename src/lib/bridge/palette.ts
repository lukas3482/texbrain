import { connectBridge, disconnectBridge } from './connection';

// the bridge entries of the command palette, texbrain has no settings
// dialog so this and ?bridge are the switch
export const bridgeCommands = [
  { id: 'bridgeconnect', label: 'Bridge: connect', shortcut: '', action: connectBridge, category: 'bridge' },
  { id: 'bridgedisconnect', label: 'Bridge: disconnect', shortcut: '', action: disconnectBridge, category: 'bridge' }
];
