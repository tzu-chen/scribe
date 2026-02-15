import { v4 as uuidv4 } from 'uuid';
import type { PdfHighlight, PdfComment, HighlightRect } from '../types/annotation';

const DB_NAME = 'scribe_annotations';
const DB_VERSION = 1;
const HIGHLIGHT_STORE = 'highlights';
const COMMENT_STORE = 'comments';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HIGHLIGHT_STORE)) {
        const hStore = db.createObjectStore(HIGHLIGHT_STORE, { keyPath: 'id' });
        hStore.createIndex('by_attachment', 'attachmentId', { unique: false });
      }
      if (!db.objectStoreNames.contains(COMMENT_STORE)) {
        const cStore = db.createObjectStore(COMMENT_STORE, { keyPath: 'id' });
        cStore.createIndex('by_highlight', 'highlightId', { unique: false });
        cStore.createIndex('by_attachment', 'attachmentId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const annotationStorage = {
  async getHighlightsByAttachment(attachmentId: string): Promise<PdfHighlight[]> {
    const db = await openDB();
    const tx = db.transaction(HIGHLIGHT_STORE, 'readonly');
    const store = tx.objectStore(HIGHLIGHT_STORE);
    const index = store.index('by_attachment');
    const records: PdfHighlight[] = await reqToPromise(index.getAll(attachmentId));
    db.close();
    return records;
  },

  async addHighlight(
    attachmentId: string,
    pageNumber: number,
    rects: HighlightRect[],
    selectedText: string,
    color: string = '#ffec99',
  ): Promise<PdfHighlight> {
    const highlight: PdfHighlight = {
      id: uuidv4(),
      attachmentId,
      pageNumber,
      rects,
      selectedText,
      color,
      createdAt: new Date().toISOString(),
    };
    const db = await openDB();
    const tx = db.transaction(HIGHLIGHT_STORE, 'readwrite');
    const store = tx.objectStore(HIGHLIGHT_STORE);
    await reqToPromise(store.add(highlight));
    db.close();
    return highlight;
  },

  async deleteHighlight(id: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(HIGHLIGHT_STORE, 'readwrite');
    const store = tx.objectStore(HIGHLIGHT_STORE);
    await reqToPromise(store.delete(id));
    db.close();
  },

  async getCommentsByHighlight(highlightId: string): Promise<PdfComment[]> {
    const db = await openDB();
    const tx = db.transaction(COMMENT_STORE, 'readonly');
    const store = tx.objectStore(COMMENT_STORE);
    const index = store.index('by_highlight');
    const records: PdfComment[] = await reqToPromise(index.getAll(highlightId));
    db.close();
    return records;
  },

  async getCommentsByAttachment(attachmentId: string): Promise<PdfComment[]> {
    const db = await openDB();
    const tx = db.transaction(COMMENT_STORE, 'readonly');
    const store = tx.objectStore(COMMENT_STORE);
    const index = store.index('by_attachment');
    const records: PdfComment[] = await reqToPromise(index.getAll(attachmentId));
    db.close();
    return records;
  },

  async addComment(highlightId: string, attachmentId: string, text: string): Promise<PdfComment> {
    const now = new Date().toISOString();
    const comment: PdfComment = {
      id: uuidv4(),
      highlightId,
      attachmentId,
      text,
      createdAt: now,
      updatedAt: now,
    };
    const db = await openDB();
    const tx = db.transaction(COMMENT_STORE, 'readwrite');
    const store = tx.objectStore(COMMENT_STORE);
    await reqToPromise(store.add(comment));
    db.close();
    return comment;
  },

  async updateComment(id: string, text: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(COMMENT_STORE, 'readwrite');
    const store = tx.objectStore(COMMENT_STORE);
    const existing: PdfComment | undefined = await reqToPromise(store.get(id));
    if (existing) {
      existing.text = text;
      existing.updatedAt = new Date().toISOString();
      await reqToPromise(store.put(existing));
    }
    db.close();
  },

  async deleteComment(id: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(COMMENT_STORE, 'readwrite');
    const store = tx.objectStore(COMMENT_STORE);
    await reqToPromise(store.delete(id));
    db.close();
  },

  async deleteCommentsByHighlight(highlightId: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(COMMENT_STORE, 'readwrite');
    const store = tx.objectStore(COMMENT_STORE);
    const index = store.index('by_highlight');
    const comments: PdfComment[] = await reqToPromise(index.getAll(highlightId));
    for (const comment of comments) {
      store.delete(comment.id);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  },
};
