const DB_NAME = "lazarus-field-capture";
const DB_VERSION = 1;
const CHUNKS_STORE = "recording_chunks";
const PENDING_STORE = "pending_analyses";

export interface RecordingChunk {
  id: string;
  sessionId: string;
  index: number;
  blob: Blob;
  timestamp: number;
}

export interface PendingAnalysis {
  id: string;
  createdAt: string;
  dealValue: string;
  transcript: string;
  emailThread: string;
  recordingSessionId?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        db.createObjectStore(CHUNKS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: "id" });
      }
    };
  });
}

export async function saveRecordingChunk(chunk: RecordingChunk): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, "readwrite");
    tx.objectStore(CHUNKS_STORE).put(chunk);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getChunksForSession(sessionId: string): Promise<RecordingChunk[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, "readonly");
    const request = tx.objectStore(CHUNKS_STORE).getAll();
    request.onsuccess = () => {
      const all = (request.result as RecordingChunk[]).filter((c) => c.sessionId === sessionId);
      all.sort((a, b) => a.index - b.index);
      resolve(all);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearSessionChunks(sessionId: string): Promise<void> {
  const chunks = await getChunksForSession(sessionId);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, "readwrite");
    const store = tx.objectStore(CHUNKS_STORE);
    for (const chunk of chunks) store.delete(chunk.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function assembleSessionBlob(sessionId: string, mimeType: string): Promise<Blob | null> {
  const chunks = await getChunksForSession(sessionId);
  if (!chunks.length) return null;
  return new Blob(
    chunks.map((c) => c.blob),
    { type: mimeType }
  );
}

export async function queuePendingAnalysis(entry: PendingAnalysis): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readwrite");
    tx.objectStore(PENDING_STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPendingAnalyses(): Promise<PendingAnalysis[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readonly");
    const request = tx.objectStore(PENDING_STORE).getAll();
    request.onsuccess = () => resolve(request.result as PendingAnalysis[]);
    request.onerror = () => reject(request.error);
  });
}

export async function removePendingAnalysis(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readwrite");
    tx.objectStore(PENDING_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
