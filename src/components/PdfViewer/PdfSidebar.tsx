import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { EditableOutlineItem } from '../../hooks/useCustomOutline';
import type { ViewerPosition } from './positionMath';
import { ChevronRightIcon, CloseIcon } from '../Icons/Icons';
import styles from './PdfSidebar.module.css';

interface Props {
  /** Overlay the document instead of taking layout space beside it. */
  floating?: boolean;
  /** Close handler for the floating variant's own dismiss button. */
  onClose?: () => void;
  outline: EditableOutlineItem[];
  onNavigate: (page: number, destTop: number | null) => void;
  onAddItem: (title: string, pageNumber: number, destTop: number | null) => void;
  onRenameItem: (id: string, title: string) => void;
  onDeleteItem: (id: string) => void;
  onReorderItems: (newTree: EditableOutlineItem[]) => void;
  onResetOutline: () => void;
  hasCustomOutline: boolean;
  getCurrentPosition: () => ViewerPosition | null;
}

type DropZone = 'before' | 'after' | 'into';

interface DragState {
  draggedId: string | null;
  overId: string | null;
  zone: DropZone | null;
}

interface ContextMenuState {
  itemId: string;
  x: number;
  y: number;
}

// Collect all descendant IDs of a node (to prevent dropping into own subtree)
function collectDescendantIds(items: EditableOutlineItem[], id: string): Set<string> {
  const ids = new Set<string>();
  const walk = (list: EditableOutlineItem[]) => {
    for (const item of list) {
      if (item.id === id || ids.has(item.id)) {
        ids.add(item.id);
        for (const child of item.children) {
          ids.add(child.id);
          walk(child.children);
        }
      } else {
        walk(item.children);
      }
    }
  };
  walk(items);
  ids.add(id);
  return ids;
}

// Collect IDs of every item that has children (the foldable ones)
function collectParentIds(items: EditableOutlineItem[]): string[] {
  const ids: string[] = [];
  const walk = (list: EditableOutlineItem[]) => {
    for (const item of list) {
      if (item.children.length > 0) {
        ids.push(item.id);
        walk(item.children);
      }
    }
  };
  walk(items);
  return ids;
}

// Remove an item by ID from the tree, returning [newTree, removedItem]
function removeFromTree(
  items: EditableOutlineItem[],
  id: string,
): [EditableOutlineItem[], EditableOutlineItem | null] {
  let removed: EditableOutlineItem | null = null;
  const filter = (list: EditableOutlineItem[]): EditableOutlineItem[] =>
    list.reduce<EditableOutlineItem[]>((acc, item) => {
      if (item.id === id) {
        removed = item;
        return acc;
      }
      acc.push({ ...item, children: filter(item.children) });
      return acc;
    }, []);
  const result = filter(items);
  return [result, removed];
}

// Insert an item into the tree at a target position
function insertIntoTree(
  items: EditableOutlineItem[],
  targetId: string,
  zone: DropZone,
  item: EditableOutlineItem,
): EditableOutlineItem[] {
  if (zone === 'into') {
    return items.map(node => {
      if (node.id === targetId) {
        return { ...node, children: [...node.children, item] };
      }
      return { ...node, children: insertIntoTree(node.children, targetId, zone, item) };
    });
  }

  // before or after — insert as sibling
  const result: EditableOutlineItem[] = [];
  for (const node of items) {
    if (node.id === targetId && zone === 'before') {
      result.push(item);
    }
    result.push({ ...node, children: insertIntoTree(node.children, targetId, zone, item) });
    if (node.id === targetId && zone === 'after') {
      result.push(item);
    }
  }
  return result;
}

function OutlineTree({
  items,
  depth,
  collapsedIds,
  onToggleCollapse,
  onNavigate,
  onContextMenu,
  renamingId,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  dragState,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  items: EditableOutlineItem[];
  depth: number;
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  onNavigate: (page: number, destTop: number | null) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  renamingId: string | null;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  dragState: DragState;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <ul className={styles.list} style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      {items.map((item) => {
        const isOver = dragState.overId === item.id;
        const dropClass = isOver && dragState.zone
          ? dragState.zone === 'before' ? styles.dragOverBefore
            : dragState.zone === 'after' ? styles.dragOverAfter
            : styles.dragOverInto
          : '';
        const hasChildren = item.children.length > 0;
        const isCollapsed = collapsedIds.has(item.id);

        return (
          <li key={item.id}>
            <div
              className={`${styles.itemWrapper} ${dropClass}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                onDragStart(item.id);
              }}
              onDragOver={(e) => onDragOver(e, item.id)}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            >
              {hasChildren ? (
                <button
                  className={styles.twisty}
                  onClick={() => onToggleCollapse(item.id)}
                  title={isCollapsed ? 'Unfold' : 'Fold'}
                  aria-label={isCollapsed ? 'Unfold' : 'Fold'}
                  aria-expanded={!isCollapsed}
                >
                  <ChevronRightIcon
                    size={12}
                    className={isCollapsed ? styles.twistyIcon : `${styles.twistyIcon} ${styles.twistyOpen}`}
                  />
                </button>
              ) : (
                <span className={styles.twistySpacer} />
              )}
              <button
                className={styles.item}
                onClick={() => onNavigate(item.pageNumber, item.destTop)}
                onContextMenu={(e) => onContextMenu(e, item.id)}
                title={`Go to page ${item.pageNumber}`}
              >
                {renamingId === item.id ? (
                  <input
                    className={styles.inlineEdit}
                    value={renameValue}
                    onChange={(e) => onRenameChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onRenameSubmit();
                      if (e.key === 'Escape') onRenameCancel();
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={onRenameSubmit}
                    autoFocus
                  />
                ) : (
                  <span className={styles.itemTitle}>{item.title}</span>
                )}
                <span className={styles.itemPage}>{item.pageNumber}</span>
              </button>
            </div>
            {hasChildren && !isCollapsed && (
              <OutlineTree
                items={item.children}
                depth={depth + 1}
                collapsedIds={collapsedIds}
                onToggleCollapse={onToggleCollapse}
                onNavigate={onNavigate}
                onContextMenu={onContextMenu}
                renamingId={renamingId}
                renameValue={renameValue}
                onRenameChange={onRenameChange}
                onRenameSubmit={onRenameSubmit}
                onRenameCancel={onRenameCancel}
                dragState={dragState}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PdfSidebar({
  floating,
  onClose,
  outline,
  onNavigate,
  onAddItem,
  onRenameItem,
  onDeleteItem,
  onReorderItems,
  onResetOutline,
  hasCustomOutline,
  getCurrentPosition,
}: Props) {
  // --- Add item state ---
  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);
  const addPositionRef = useRef<ViewerPosition | null>(null);

  // --- Context menu state ---
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // --- Rename state ---
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // --- Drag state ---
  const [dragState, setDragState] = useState<DragState>({
    draggedId: null,
    overId: null,
    zone: null,
  });

  // --- Fold state ---
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const parentIds = useMemo(() => collectParentIds(outline), [outline]);
  const allFolded = parentIds.length > 0 && parentIds.every(id => collapsedIds.has(id));

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const handleToggleFoldAll = useCallback(() => {
    setCollapsedIds(allFolded ? new Set() : new Set(parentIds));
  }, [allFolded, parentIds]);

  // Focus add input when shown
  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  // Close context menu on click-away
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  // --- Add handlers ---
  const handleStartAdd = useCallback(() => {
    addPositionRef.current = getCurrentPosition();
    setAddTitle('');
    setAdding(true);
  }, [getCurrentPosition]);

  const handleConfirmAdd = useCallback(() => {
    const title = addTitle.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    const pos = addPositionRef.current;
    onAddItem(title, pos?.pageIndex ?? 1, pos?.withinPageOffset ?? null);
    setAdding(false);
    setAddTitle('');
  }, [addTitle, onAddItem]);

  const handleCancelAdd = useCallback(() => {
    setAdding(false);
    setAddTitle('');
  }, []);

  // --- Context menu handlers ---
  const handleContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ itemId: id, x: e.clientX, y: e.clientY });
  }, []);

  const handleRenameStart = useCallback(() => {
    if (!contextMenu) return;
    // Find the item to get current title
    const findTitle = (items: EditableOutlineItem[]): string => {
      for (const item of items) {
        if (item.id === contextMenu.itemId) return item.title;
        const found = findTitle(item.children);
        if (found) return found;
      }
      return '';
    };
    setRenameValue(findTitle(outline));
    setRenamingId(contextMenu.itemId);
    setContextMenu(null);
  }, [contextMenu, outline]);

  const handleRenameSubmit = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRenameItem(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, onRenameItem]);

  const handleRenameCancel = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
  }, []);

  const handleDelete = useCallback(() => {
    if (!contextMenu) return;
    onDeleteItem(contextMenu.itemId);
    setContextMenu(null);
  }, [contextMenu, onDeleteItem]);

  // --- Drag handlers ---
  const handleDragStart = useCallback((id: string) => {
    setDragState({ draggedId: id, overId: null, zone: null });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!dragState.draggedId || dragState.draggedId === id) return;

    // Prevent dropping into own descendants
    const forbidden = collectDescendantIds(outline, dragState.draggedId);
    if (forbidden.has(id)) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = y / rect.height;

    let zone: DropZone;
    if (ratio < 0.25) zone = 'before';
    else if (ratio > 0.75) zone = 'after';
    else zone = 'into';

    setDragState(prev => ({ ...prev, overId: id, zone }));
  }, [dragState.draggedId, outline]);

  const handleDragLeave = useCallback(() => {
    setDragState(prev => ({ ...prev, overId: null, zone: null }));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const { draggedId, overId, zone } = dragState;
    if (!draggedId || !overId || !zone || draggedId === overId) {
      setDragState({ draggedId: null, overId: null, zone: null });
      return;
    }

    const [treeWithout, removed] = removeFromTree(outline, draggedId);
    if (!removed) {
      setDragState({ draggedId: null, overId: null, zone: null });
      return;
    }

    const newTree = insertIntoTree(treeWithout, overId, zone, removed);
    onReorderItems(newTree);
    if (zone === 'into') {
      // Keep the dropped item visible rather than hiding it inside a folded parent
      setCollapsedIds(prev => {
        if (!prev.has(overId)) return prev;
        const next = new Set(prev);
        next.delete(overId);
        return next;
      });
    }
    setDragState({ draggedId: null, overId: null, zone: null });
  }, [dragState, outline, onReorderItems]);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggedId: null, overId: null, zone: null });
  }, []);

  return (
    <div className={`${styles.sidebar} ${floating ? styles.floating : ''}`}>
      <div className={styles.header}>
        <div className={styles.headerActions}>
          <div className={styles.titleGroup}>
            <h3 className={styles.title}>Table of Contents</h3>
            {parentIds.length > 0 && (
              <button
                className={styles.foldAllButton}
                onClick={handleToggleFoldAll}
                title={allFolded ? 'Unfold all entries' : 'Fold all entries'}
                aria-label={allFolded ? 'Unfold all entries' : 'Fold all entries'}
                aria-expanded={!allFolded}
              >
                <ChevronRightIcon
                  size={12}
                  className={allFolded ? styles.twistyIcon : `${styles.twistyIcon} ${styles.twistyOpen}`}
                />
              </button>
            )}
          </div>
          <div className={styles.headerButtons}>
            <button
              className={styles.addButton}
              onClick={handleStartAdd}
              title="Add current location to TOC"
            >
              +
            </button>
            {/* The floating panel sits on top of the corner toggle, so it
                carries its own dismiss button. */}
            {floating && onClose && (
              <button
                className={styles.closeButton}
                onClick={onClose}
                title="Close table of contents"
                aria-label="Close table of contents"
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className={styles.content}>
        {adding && (
          <div className={styles.addForm}>
            <input
              ref={addInputRef}
              className={styles.addInput}
              type="text"
              placeholder="Entry title..."
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmAdd();
                if (e.key === 'Escape') handleCancelAdd();
              }}
              onBlur={handleConfirmAdd}
            />
          </div>
        )}
        {outline.length === 0 && !adding ? (
          <p className={styles.empty}>No table of contents. Click + to add an entry.</p>
        ) : (
          <OutlineTree
            items={outline}
            depth={0}
            collapsedIds={collapsedIds}
            onToggleCollapse={handleToggleCollapse}
            onNavigate={onNavigate}
            onContextMenu={handleContextMenu}
            renamingId={renamingId}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={handleRenameCancel}
            dragState={dragState}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        )}
        {hasCustomOutline && (
          <button className={styles.resetLink} onClick={onResetOutline}>
            Reset to PDF outline
          </button>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button className={styles.contextMenuItem} onClick={handleRenameStart}>
            Rename
          </button>
          <button className={styles.contextMenuItem} onClick={handleDelete}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
