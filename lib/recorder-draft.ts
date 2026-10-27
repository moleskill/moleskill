// Best-effort crash recovery for in-browser recordings: every MediaRecorder chunk is mirrored into IndexedDB,
// so a reload or a crashed tab does not lose a long recording. All functions swallow storage errors.
const DB_NAME = "moleskill-recorder-draft";
const ACTIVE = "active";

type Meta = { id: typeof ACTIVE; session: string; type: string; updatedAt: number; finalized: boolean; partCount: number };
type Chunk = { key: string; id: string; part: number; index: number; blob: Blob };

let connection: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks", { keyPath: "key" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { connection = null; reject(req.error); };
  });
  return connection;
}

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const request = <T,>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

/** Starts a new draft, discarding any previous one so chunks from old sessions do not pile up. */
export async function startDraft(session: string, type: string) {
  try {
    const db = await open();
    const tx = db.transaction(["chunks", "meta"], "readwrite");
    tx.objectStore("chunks").clear();
    tx.objectStore("meta").clear();
    tx.objectStore("meta").put({ id: ACTIVE, session, type, updatedAt: Date.now(), finalized: false, partCount: 1 } satisfies Meta);
    await finished(tx);
  } catch { /* recovery is optional */ }
}

export async function saveChunk(session: string, part: number, index: number, blob: Blob) {
  try {
    const db = await open();
    const tx = db.transaction("chunks", "readwrite");
    tx.objectStore("chunks").put({ key: `${session}:${part}:${index}`, id: session, part, index, blob } satisfies Chunk);
    await finished(tx);
  } catch { /* recovery is optional */ }
}

export async function addDraftPart(session: string, partCount: number) {
  try {
    const db = await open();
    const tx = db.transaction("meta", "readwrite");
    const store = tx.objectStore("meta");
    const meta = await request<Meta | undefined>(store.get(ACTIVE));
    if (meta?.session === session) store.put({ ...meta, partCount, finalized: false, updatedAt: Date.now() });
    await finished(tx);
  } catch { /* recovery is optional */ }
}

/** Mark a cleanly stopped recording so it is never mistaken for an interrupted session. */
export async function finalizeDraft() {
  try {
    const db = await open();
    const tx = db.transaction("meta", "readwrite");
    const store = tx.objectStore("meta");
    const meta = await request<Meta | undefined>(store.get(ACTIVE));
    if (meta) store.put({ ...meta, finalized: true, updatedAt: Date.now() });
    await finished(tx);
  } catch { /* recovery is optional */ }
}

export async function readDraft(): Promise<File[] | null> {
  try {
    const db = await open();
    const meta = await request<Meta | undefined>(db.transaction("meta").objectStore("meta").get(ACTIVE));
    if (!meta || meta.finalized) return null;
    const all = await request<Chunk[]>(db.transaction("chunks").objectStore("chunks").getAll());
    const chunks = all.filter((c) => c.id === meta.session).sort((a, b) => a.index - b.index);
    if (!chunks.length) return null;
    const type = meta.type || "audio/webm";
    const { restoredPartFiles } = await import("@/lib/recorder-parts");
    return restoredPartFiles(chunks, type);
  } catch {
    return null;
  }
}

export async function clearDraft() {
  try {
    const db = await open();
    const tx = db.transaction(["chunks", "meta"], "readwrite");
    tx.objectStore("chunks").clear();
    tx.objectStore("meta").clear();
    await finished(tx);
  } catch { /* recovery is optional */ }
}
