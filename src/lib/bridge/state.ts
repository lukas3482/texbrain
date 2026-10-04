import { writable } from 'svelte/store';
import { DEFAULT_PORT } from './protocol';

export type BridgeState = 'off' | 'connecting' | 'connected';

export interface BridgeInfo {
  state: BridgeState;
  port: number;
  // the brainbridge version from the welcome, for the tooltip
  server: string | null;
  // the last command, shown in the status bar so the user can follow along
  lastAction: string | null;
  calls: number;
}

export const bridge = writable<BridgeInfo>({ state: 'off', port: DEFAULT_PORT, server: null, lastAction: null, calls: 0 });
