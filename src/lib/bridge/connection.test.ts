// the tab side of the protocol against a fake socket: hello, welcome, calls,
// results, backoff and a tab that gets replaced

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import { connectBridge, installBridge } from './connection';
import { bridge } from './state';
import { preferences } from '$lib/stores/preferences';

class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeSocket.all.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3;
  }

  // what the server would do
  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1];

async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function connected(): FakeSocket {
  const socket = last();
  socket.open();
  socket.receive({ type: 'welcome', protocol: 1, server: 'brainbridge', version: '0.1.0' });
  return socket;
}

let remove: () => void = () => {};

beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', { href: 'http://localhost:5173/editor?bridge' });
  preferences.update((p) => ({ ...p, bridge: false, bridgePort: 7332 }));
});

afterEach(() => {
  remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('bridge connection', () => {
  test('?bridge connects to 127.0.0.1:7332 and says hello first', () => {
    remove = installBridge();
    expect(last().url).toBe('ws://127.0.0.1:7332/ws');
    expect(get(bridge).state).toBe('connecting');
    last().open();
    expect(last().sent[0]).toEqual({ type: 'hello', protocol: 1, app: 'texbrain', version: '1.0.0', url: 'http://localhost:5173/editor?bridge' });
  });

  test('?bridge=PORT picks the port', () => {
    vi.stubGlobal('location', { href: 'http://localhost:5173/editor?bridge=7400' });
    remove = installBridge();
    expect(last().url).toBe('ws://127.0.0.1:7400/ws');
  });

  test('is connected after the welcome and answers a call with the same id', async () => {
    remove = installBridge();
    const socket = connected();
    expect(get(bridge)).toMatchObject({ state: 'connected', server: '0.1.0' });
    socket.receive({ type: 'call', id: 'a1', cmd: 'status', args: {} });
    await settle();
    const result = socket.sent.find((m) => m.type === 'result');
    expect(result).toMatchObject({ type: 'result', id: 'a1', ok: true });
    expect(result.result).toMatchObject({ project: null, compiling: false, version: '1.0.0' });
    expect(get(bridge).lastAction).toBe('status');
  });

  test('says unknown command for anything it does not have', async () => {
    remove = installBridge();
    const socket = connected();
    socket.receive({ type: 'call', id: 'b2', cmd: 'toString', args: {} });
    socket.receive({ type: 'call', id: 'b3', cmd: 'format_disk', args: {} });
    await settle();
    expect(socket.sent.filter((m) => m.type === 'result')).toEqual([
      { type: 'result', id: 'b2', ok: false, error: 'unknown command' },
      { type: 'result', id: 'b3', ok: false, error: 'unknown command' }
    ]);
  });

  test('a command that cannot run answers with a sentence', async () => {
    remove = installBridge();
    const socket = connected();
    socket.receive({ type: 'call', id: 'c4', cmd: 'files', args: {} });
    await settle();
    const result = socket.sent.find((m) => m.type === 'result');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No project is open/);
    expect(get(bridge).lastAction).toMatch(/^files failed/);
  });

  test('retries with a growing pause while the server is not there', () => {
    vi.useFakeTimers();
    remove = installBridge();
    last().drop();
    expect(get(bridge).state).toBe('connecting');
    vi.advanceTimersByTime(499);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(2);
    last().drop();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(3);
    last().drop();
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.all).toHaveLength(4);
  });

  test('a replaced tab stops trying until it is switched on again', () => {
    vi.useFakeTimers();
    remove = installBridge();
    const socket = connected();
    socket.receive({ type: 'replaced' });
    socket.drop();
    expect(get(bridge).state).toBe('off');
    vi.advanceTimersByTime(30000);
    expect(FakeSocket.all).toHaveLength(1);
    connectBridge();
    expect(FakeSocket.all).toHaveLength(2);
    expect(get(bridge).state).toBe('connecting');
  });

  test('switching it off closes the socket and stays off', () => {
    vi.useFakeTimers();
    remove = installBridge();
    const socket = connected();
    preferences.update((p) => ({ ...p, bridge: false }));
    expect(socket.readyState).toBe(3);
    expect(get(bridge).state).toBe('off');
    vi.advanceTimersByTime(30000);
    expect(FakeSocket.all).toHaveLength(1);
  });
});
