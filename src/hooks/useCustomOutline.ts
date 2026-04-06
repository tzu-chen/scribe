import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { outlineStorage, type FlatOutlineItem } from '../services/outlineStorage';
import type { OutlineItem } from './usePdfDocument';

export interface EditableOutlineItem {
  id: string;
  title: string;
  pageNumber: number;
  destTop: number | null;
  children: EditableOutlineItem[];
}

// --- Tree / Flat conversion ---

function flatToTree(items: FlatOutlineItem[]): EditableOutlineItem[] {
  const map = new Map<string, EditableOutlineItem>();
  const roots: EditableOutlineItem[] = [];

  // Create nodes
  for (const item of items) {
    map.set(item.id, {
      id: item.id,
      title: item.title,
      pageNumber: item.pageNumber,
      destTop: item.destTop,
      children: [],
    });
  }

  // Build tree
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const item of sorted) {
    const node = map.get(item.id)!;
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function treeToFlat(
  items: EditableOutlineItem[],
  parentId: string | null = null,
): Omit<FlatOutlineItem, 'attachmentId'>[] {
  const result: Omit<FlatOutlineItem, 'attachmentId'>[] = [];
  items.forEach((item, index) => {
    result.push({
      id: item.id,
      parentId,
      title: item.title,
      pageNumber: item.pageNumber,
      destTop: item.destTop,
      sortOrder: index,
    });
    result.push(...treeToFlat(item.children, item.id));
  });
  return result;
}

function pdfOutlineToEditable(items: OutlineItem[], prefix = ''): EditableOutlineItem[] {
  return items.map((item, i) => ({
    id: `${prefix}${i}`,
    title: item.title,
    pageNumber: item.pageNumber,
    destTop: item.destTop,
    children: pdfOutlineToEditable(item.children, `${prefix}${i}-`),
  }));
}

function assignUuids(items: EditableOutlineItem[]): EditableOutlineItem[] {
  return items.map(item => ({
    ...item,
    id: uuidv4(),
    children: assignUuids(item.children),
  }));
}

export function useCustomOutline(attachmentId: string | undefined, pdfOutline: OutlineItem[]) {
  const [customItems, setCustomItems] = useState<FlatOutlineItem[] | null>(null);
  // Track which attachmentId we've loaded data for; null means still loading.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const attachmentIdRef = useRef(attachmentId);

  const loading = attachmentId ? loadedFor !== attachmentId : false;

  useEffect(() => {
    attachmentIdRef.current = attachmentId;
    if (!attachmentId) return;

    let cancelled = false;
    outlineStorage.getByAttachment(attachmentId).then(items => {
      if (cancelled) return;
      setCustomItems(items.length > 0 ? items : null);
      setLoadedFor(attachmentId);
    }).catch(() => {
      if (cancelled) return;
      setCustomItems(null);
      setLoadedFor(attachmentId);
    });
    return () => { cancelled = true; };
  }, [attachmentId]);

  const hasCustomOutline = customItems !== null;

  const outline: EditableOutlineItem[] = hasCustomOutline
    ? flatToTree(customItems)
    : pdfOutlineToEditable(pdfOutline);

  // Fork the PDF outline into custom storage
  const ensureForked = useCallback(async (): Promise<EditableOutlineItem[]> => {
    if (!attachmentId) return [];
    if (customItems !== null) return flatToTree(customItems);

    // Fork: assign real UUIDs and save
    const editable = assignUuids(pdfOutlineToEditable(pdfOutline));
    const flat = treeToFlat(editable);
    await outlineStorage.saveAll(attachmentId, flat);
    const fullFlat = flat.map(f => ({ ...f, attachmentId }));
    setCustomItems(fullFlat);
    return editable;
  }, [attachmentId, customItems, pdfOutline]);

  const addItem = useCallback(async (
    title: string,
    pageNumber: number,
    destTop: number | null,
  ) => {
    if (!attachmentId) return;

    // Fork first if needed
    await ensureForked();

    const created = await outlineStorage.addItem(attachmentId, {
      title,
      pageNumber,
      destTop,
    });
    setCustomItems(prev => prev ? [...prev, created] : [created]);
  }, [attachmentId, ensureForked]);

  const renameItem = useCallback(async (id: string, title: string) => {
    if (!attachmentId) return;
    await ensureForked();
    await outlineStorage.renameItem(id, title);
    setCustomItems(prev => prev ? prev.map(item =>
      item.id === id ? { ...item, title } : item
    ) : null);
  }, [attachmentId, ensureForked]);

  const deleteItem = useCallback(async (id: string) => {
    if (!attachmentId) return;
    await ensureForked();
    await outlineStorage.deleteItem(id);
    // Remove the item and all descendants
    setCustomItems(prev => {
      if (!prev) return null;
      const toRemove = new Set<string>();
      const collectDescendants = (parentId: string) => {
        toRemove.add(parentId);
        for (const item of prev) {
          if (item.parentId === parentId && !toRemove.has(item.id)) {
            collectDescendants(item.id);
          }
        }
      };
      collectDescendants(id);
      const remaining = prev.filter(item => !toRemove.has(item.id));
      return remaining.length > 0 ? remaining : null;
    });
  }, [attachmentId, ensureForked]);

  const reorderItems = useCallback(async (newTree: EditableOutlineItem[]) => {
    if (!attachmentId) return;
    const flat = treeToFlat(newTree);
    await outlineStorage.saveAll(attachmentId, flat);
    setCustomItems(flat.map(f => ({ ...f, attachmentId })));
  }, [attachmentId]);

  const resetToOriginal = useCallback(async () => {
    if (!attachmentId) return;
    await outlineStorage.deleteAll(attachmentId);
    setCustomItems(null);
  }, [attachmentId]);

  return {
    outline,
    hasCustomOutline,
    loading,
    addItem,
    renameItem,
    deleteItem,
    reorderItems,
    resetToOriginal,
  };
}
