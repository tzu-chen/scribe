import { v4 as uuidv4 } from 'uuid';
import type { Attachment, AttachmentMeta } from '../types/attachment';

const DB_NAME = 'scribe_attachments';
const DB_VERSION = 1;
const STORE_NAME = 'attachments';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_subject', 'subject', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const attachmentStorage = {
  async getBySubject(subject: string): Promise<AttachmentMeta[]> {
    const db = await openDB();
    const store = txStore(db, 'readonly');
    const index = store.index('by_subject');
    const records: Attachment[] = await reqToPromise(index.getAll(subject));
    db.close();
    return records.map(({ data: _, ...meta }) => meta);
  },

  async getCountsBySubject(): Promise<Record<string, number>> {
    const db = await openDB();
    const store = txStore(db, 'readonly');
    const all: Attachment[] = await reqToPromise(store.getAll());
    db.close();
    const counts: Record<string, number> = {};
    for (const rec of all) {
      counts[rec.subject] = (counts[rec.subject] || 0) + 1;
    }
    return counts;
  },

  async add(subject: string, file: File): Promise<AttachmentMeta> {
    const record: Attachment = {
      id: uuidv4(),
      subject,
      filename: file.name,
      type: file.type,
      size: file.size,
      data: file,
      createdAt: new Date().toISOString(),
    };
    const db = await openDB();
    const store = txStore(db, 'readwrite');
    await reqToPromise(store.add(record));
    db.close();
    const { data: _, ...meta } = record;
    return meta;
  },

  async delete(id: string): Promise<void> {
    const db = await openDB();
    const store = txStore(db, 'readwrite');
    await reqToPromise(store.delete(id));
    db.close();
  },

  async getBlob(id: string): Promise<Blob | null> {
    const db = await openDB();
    const store = txStore(db, 'readonly');
    const record: Attachment | undefined = await reqToPromise(store.get(id));
    db.close();
    return record?.data ?? null;
  },

  async getAll(): Promise<AttachmentMeta[]> {
    const db = await openDB();
    const store = txStore(db, 'readonly');
    const all: Attachment[] = await reqToPromise(store.getAll());
    db.close();
    return all
      .map(({ data: _, ...meta }) => meta)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async addFromBlob(subject: string, filename: string, type: string, blob: Blob): Promise<AttachmentMeta> {
    const record: Attachment = {
      id: uuidv4(),
      subject,
      filename,
      type,
      size: blob.size,
      data: blob,
      createdAt: new Date().toISOString(),
    };
    const db = await openDB();
    const store = txStore(db, 'readwrite');
    await reqToPromise(store.add(record));
    db.close();
    const { data: _, ...meta } = record;
    return meta;
  },

  async openFile(id: string): Promise<void> {
    const db = await openDB();
    const store = txStore(db, 'readonly');
    const record: Attachment | undefined = await reqToPromise(store.get(id));
    db.close();
    if (!record) return;
    const url = URL.createObjectURL(record.data);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.download = record.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};
