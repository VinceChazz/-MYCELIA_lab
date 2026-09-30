import type { ChatMessage, FarmSnapshot, SyncOperation } from './types';

const DB_NAME = 'root-to-power-v1';
const LOCAL_PREFIX = 'rtp:';
let openPromise: Promise<IDBDatabase> | null = null;

export const newId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function db(): Promise<IDBDatabase> {
  if (!openPromise) {
    openPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('state')) database.createObjectStore('state');
        if (!database.objectStoreNames.contains('queue')) database.createObjectStore('queue', { keyPath: 'op_id' });
        if (!database.objectStoreNames.contains('messages')) database.createObjectStore('messages');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Database upgrade blocked'));
    }).catch(error => { openPromise = null; throw error; });
  }
  return openPromise;
}

async function read<T>(store: string, key?: IDBValidKey): Promise<T | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readonly');
    const req = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function write(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite');
    key === undefined ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function localRead<T>(key: string, otherwise: T): T {
  try { return JSON.parse(localStorage.getItem(LOCAL_PREFIX + key) || 'null') ?? otherwise; } catch { return otherwise; }
}
function localWrite(key: string, value: unknown) {
  try { localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value)); } catch { /* device storage full: in-memory UI continues */ }
}

export async function loadSnapshot(): Promise<FarmSnapshot | null> {
  const fallback = localRead<FarmSnapshot | null>('snapshot', null);
  try {
    const stored = await read<FarmSnapshot>('state', 'snapshot');
    if (fallback && (!stored || fallback.generated_at > stored.generated_at)) {
      await write('state', fallback, 'snapshot');
      return fallback;
    }
    return stored ?? fallback;
  } catch { return fallback; }
}
export async function saveSnapshot(value: FarmSnapshot): Promise<void> {
  try { await write('state', value, 'snapshot'); } catch { localWrite('snapshot', value); }
}
export async function loadMessages(): Promise<ChatMessage[]> {
  const fallback = localRead<ChatMessage[]>('messages', []);
  try {
    const stored = (await read<ChatMessage[]>('messages', 'history')) ?? [];
    if (fallback.length && (!stored.length || fallback[fallback.length-1].time > stored[stored.length-1].time)) {
      await write('messages', fallback, 'history'); return fallback;
    }
    return stored;
  } catch { return fallback; }
}
export async function saveMessages(messages: ChatMessage[]): Promise<void> {
  try { await write('messages', messages.slice(-100), 'history'); } catch { localWrite('messages', messages.slice(-100)); }
}
export async function pendingOperations(): Promise<SyncOperation[]> {
  const fallback = localRead<SyncOperation[]>('queue', []);
  try {
    // If IndexedDB became available again after private-mode/storage errors, import the
    // fallback journal before clearing it. Never silently strand unsent records.
    for (const item of fallback) await write('queue', item);
    if (fallback.length) localWrite('queue', []);
    return ((await read<SyncOperation[]>('queue')) ?? []).sort((a,b) => a.created_at.localeCompare(b.created_at));
  } catch { return fallback; }
}
export async function enqueue(operation: SyncOperation): Promise<void> {
  try { await write('queue', operation); }
  catch {
    const queue = localRead<SyncOperation[]>('queue', []);
    if (!queue.some(o => o.op_id === operation.op_id)) localWrite('queue', [...queue, operation]);
  }
}
export async function dequeue(opIds: string[]): Promise<void> {
  try {
    const database = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('queue', 'readwrite');
      opIds.forEach(id => tx.objectStore('queue').delete(id));
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  } catch { localWrite('queue', localRead<SyncOperation[]>('queue', []).filter(o => !opIds.includes(o.op_id))); }
}
export async function clearDemoStorage(): Promise<void> {
  try {
    const database = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['state','messages','queue'], 'readwrite');
      ['state','messages','queue'].forEach(name => tx.objectStore(name).clear());
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  } catch { /* also clear fallback */ }
  ['snapshot','queue','messages'].forEach(key => localStorage.removeItem(LOCAL_PREFIX + key));
}
