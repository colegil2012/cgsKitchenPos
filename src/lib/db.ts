/**
 * Tiny IndexedDB wrapper — no external dependency. Two object stores:
 *
 *   kv     general key/value (menu cache, last-sync timestamps)
 *   queue  pending mutating operations awaiting flush to the server
 *
 * IndexedDB (not localStorage) because the menu can exceed localStorage's
 * ~5MB and because the queue benefits from ordered keys. Chromium on the
 * Pi kiosk supports IndexedDB fully.
 */

const DB_NAME = 'cgs-pos';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
      if (!db.objectStoreNames.contains('queue')) {
        // autoIncrement key preserves FIFO order of queued operations.
        db.createObjectStore('queue', {keyPath: 'seq', autoIncrement: true});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ---- KV store ------------------------------------------------------------

export function kvGet<T>(key: string): Promise<T | undefined> {
  return tx<T>('kv', 'readonly', s => s.get(key) as IDBRequest<T>);
}

export function kvSet<T>(key: string, value: T): Promise<IDBValidKey> {
  return tx('kv', 'readwrite', s => s.put(value as any, key));
}

// ---- Queue store ---------------------------------------------------------

export interface QueuedOp {
  seq?: number; // assigned by autoIncrement
  kind: 'create_order' | 'update_status';
  /** ISO timestamp the op was enqueued. */
  enqueuedAt: string;
  /** Opaque payload, interpreted by the sync engine per `kind`. */
  payload: unknown;
  /** Number of failed flush attempts so far. */
  attempts: number;
  /** Client-generated id so the UI can reference the op before it has a seq. */
  clientId: string;
}

export function queueAdd(op: QueuedOp): Promise<IDBValidKey> {
  return tx('queue', 'readwrite', s => s.add(op));
}

export function queueAll(): Promise<QueuedOp[]> {
  return tx<QueuedOp[]>('queue', 'readonly', s => s.getAll() as IDBRequest<QueuedOp[]>);
}

export function queueDelete(seq: number): Promise<undefined> {
  return tx('queue', 'readwrite', s => s.delete(seq) as IDBRequest<undefined>);
}

export function queuePut(op: QueuedOp): Promise<IDBValidKey> {
  return tx('queue', 'readwrite', s => s.put(op));
}

export function queueCount(): Promise<number> {
  return tx<number>('queue', 'readonly', s => s.count());
}
