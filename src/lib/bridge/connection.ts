// the tab's end of the bridge: one websocket to brainbridge on this
// machine, calls in, results out. nothing here leaves the machine; the
// socket only ever points at the loopback address

import { get } from 'svelte/store';
import { preferences } from '$lib/stores/preferences';
import { addToast } from '$lib/stores/app';
import { version } from '$lib/version';
import { PROTOCOL_VERSION, type CallMessage, type ServerMessage, type TabMessage } from './protocol';
import { bridge } from './state';
import { runCommand } from './commands';

let socket: WebSocket | null = null;
let wanted = false;
let port = 0;
let attempts = 0;
let retry: ReturnType<typeof setTimeout> | null = null;
// set when another tab took the connection, so this one stops trying
let replaced = false;
let announced = false;
// chrome asks before a public site may reach 127.0.0.1, and until someone
// clicks allow the socket just fails. said once per page load
let hinted = false;
let hint: ReturnType<typeof setTimeout> | null = null;

function clearHint(): void {
  if (hint) clearTimeout(hint);
  hint = null;
}

function hintSoon(): void {
  if (hinted || hint) return;
  hint = setTimeout(() => {
    hint = null;
    if (!wanted || get(bridge).state !== 'connecting') return;
    hinted = true;
    addToast(`Waiting for brainbridge on port ${port}. If the browser asks to let this site reach apps on this device, allow it`, 'info', 10000);
  }, 5000);
}

function send(message: TabMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

// something happened in the tab that brainbridge did not ask about
export function emit(name: string, data: unknown): void {
  send({ type: 'event', name, data });
}

function summarize(cmd: string, result: unknown): string {
  const summary = result && typeof result === 'object' && 'summary' in result ? (result as { summary?: unknown }).summary : null;
  return typeof summary === 'string' && summary ? `${cmd.replace(/_/g, ' ')}: ${summary}` : cmd.replace(/_/g, ' ');
}

async function handleCall(call: CallMessage): Promise<void> {
  const name = String(call.cmd);
  bridge.update((b) => ({ ...b, calls: b.calls + 1, lastAction: `${name.replace(/_/g, ' ')}...` }));
  try {
    const result = await runCommand(name, call.args ?? {}, { emit });
    send({ type: 'result', id: call.id, ok: true, result });
    bridge.update((b) => ({ ...b, lastAction: summarize(name, result) }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send({ type: 'result', id: call.id, ok: false, error: message });
    bridge.update((b) => ({ ...b, lastAction: `${name.replace(/_/g, ' ')} failed: ${message}` }));
  }
}

function onMessage(event: MessageEvent): void {
  let message: ServerMessage;
  try {
    message = JSON.parse(String(event.data)) as ServerMessage;
  } catch {
    return;
  }
  switch (message.type) {
    case 'welcome':
      attempts = 0;
      clearHint();
      bridge.update((b) => ({ ...b, state: 'connected', port, server: message.version ?? null }));
      if (!announced) addToast('Bridge connected to brainbridge', 'success');
      announced = true;
      break;
    case 'call':
      void handleCall(message);
      break;
    case 'replaced':
      replaced = true;
      addToast('Another tab took over the bridge', 'info', 5000);
      break;
  }
}

function scheduleRetry(): void {
  if (retry) clearTimeout(retry);
  const delay = Math.min(5000, 500 * 2 ** attempts);
  attempts += 1;
  retry = setTimeout(() => {
    retry = null;
    if (wanted && !replaced) connect();
  }, delay);
}

function connect(): void {
  if (retry) {
    clearTimeout(retry);
    retry = null;
  }
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  replaced = false;
  bridge.update((b) => ({ ...b, state: 'connecting', port }));
  hintSoon();
  let ws: WebSocket;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  } catch {
    scheduleRetry();
    return;
  }
  socket = ws;
  ws.onopen = () => {
    send({ type: 'hello', protocol: PROTOCOL_VERSION, app: 'texbrain', version, url: location.href });
  };
  ws.onmessage = onMessage;
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    if (wanted && !replaced) {
      bridge.update((b) => ({ ...b, state: 'connecting' }));
      scheduleRetry();
    } else {
      bridge.update((b) => ({ ...b, state: 'off' }));
    }
  };
}

function disconnect(): void {
  if (retry) {
    clearTimeout(retry);
    retry = null;
  }
  clearHint();
  const open = socket?.readyState === WebSocket.OPEN;
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  attempts = 0;
  announced = false;
  bridge.update((b) => ({ ...b, state: 'off', server: null, lastAction: null }));
  if (open) addToast('Bridge disconnected', 'info');
}

// wires the bridge to the preference: on means keep a connection up, off
// means drop it. opening the editor with ?bridge (or ?bridge=PORT) switches
// it on, which is the address brainbridge tells people to open
export function installBridge(): () => void {
  const flag = new URL(location.href).searchParams.get('bridge');
  if (flag !== null) {
    const asked = Number(flag);
    preferences.update((p) => ({
      ...p,
      bridge: true,
      bridgePort: Number.isInteger(asked) && asked > 0 && asked < 65536 ? asked : p.bridgePort
    }));
  }
  const unsubscribe = preferences.subscribe((p) => {
    if (p.bridge) {
      if (!wanted || p.bridgePort !== port) {
        wanted = true;
        port = p.bridgePort;
        connect();
      }
    } else if (wanted) {
      wanted = false;
      disconnect();
    }
  });
  return () => {
    unsubscribe();
    wanted = false;
    disconnect();
  };
}

export function connectBridge(): void {
  // a tab that another one replaced takes the connection back
  if (wanted && get(bridge).state === 'off') connect();
  else preferences.update((p) => ({ ...p, bridge: true }));
}

export function disconnectBridge(): void {
  preferences.update((p) => ({ ...p, bridge: false }));
}
