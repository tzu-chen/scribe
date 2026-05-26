import { useState, useEffect, useMemo, useRef } from 'react';
import { attachmentStorage } from '../../services/attachmentStorage';
import type { AttachmentMeta } from '../../types/attachment';
import type { Folder } from '../../types/folder';
import type { BookTag } from '../../types/bookTag';
import type { FlowchartNodeWithFlowchart } from '../../types/flowchart';
import styles from './AssignPopup.module.css';

type AppliedState = 'all' | 'partial' | 'none';

type Item =
  | { kind: 'folder'; key: string; id: string; name: string; applied: AppliedState; appliedCount: number }
  | { kind: 'tag'; key: string; id: string; name: string; color?: string; applied: AppliedState; appliedCount: number }
  | { kind: 'node'; key: string; flowchartId: string; nodeKey: string; title: string; flowchartName: string; applied: AppliedState; appliedCount: number };

interface Props {
  selectedBookIds: Set<string>;
  books: AttachmentMeta[];
  folders: Folder[];
  tags: BookTag[];
  nodes: FlowchartNodeWithFlowchart[];
  onClose: () => void;
  onApplied: () => Promise<void> | void;
}

export function AssignPopup({
  selectedBookIds,
  books,
  folders,
  tags,
  nodes,
  onClose,
  onApplied,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [applying, setApplying] = useState(false);
  const selectedRowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSize = selectedBookIds.size;
  const selectedBooks = useMemo(
    () => books.filter(b => selectedBookIds.has(b.id)),
    [books, selectedBookIds],
  );

  const allItems: Item[] = useMemo(() => {
    function appliedState(matchCount: number): AppliedState {
      if (selectedSize > 0 && matchCount === selectedSize) return 'all';
      if (matchCount > 0) return 'partial';
      return 'none';
    }

    const folderItems: Item[] = folders.map(f => {
      const count = selectedBooks.filter(b => b.folderId === f.id).length;
      return { kind: 'folder', key: `folder:${f.id}`, id: f.id, name: f.name, applied: appliedState(count), appliedCount: count };
    });

    const tagItems: Item[] = tags.map(t => {
      const count = selectedBooks.filter(b => b.tags?.includes(t.id)).length;
      return { kind: 'tag', key: `tag:${t.id}`, id: t.id, name: t.name, color: t.color, applied: appliedState(count), appliedCount: count };
    });

    const nodeItems: Item[] = nodes.map(n => {
      const count = selectedBooks.filter(b =>
        (b.nodeAttachments ?? []).some(
          link => link.flowchartId === n.flowchartId && link.nodeKey === n.nodeKey,
        ),
      ).length;
      return {
        kind: 'node',
        key: `node:${n.flowchartId}:${n.nodeKey}`,
        flowchartId: n.flowchartId,
        nodeKey: n.nodeKey,
        title: n.title,
        flowchartName: n.flowchartName,
        applied: appliedState(count),
        appliedCount: count,
      };
    });

    return [...folderItems, ...tagItems, ...nodeItems];
  }, [folders, tags, nodes, selectedBooks, selectedSize]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? allItems.filter(it => {
          const name = it.kind === 'node' ? it.title : it.name;
          return name.toLowerCase().includes(q);
        })
      : allItems;
    const rank = (s: AppliedState) => (s === 'all' ? 0 : s === 'partial' ? 1 : 2);
    return matched.slice().sort((a, b) => rank(a.applied) - rank(b.applied));
  }, [allItems, query]);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  // Esc closes from anywhere (not just the input)
  useEffect(() => {
    function onDocKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onDocKey);
    return () => document.removeEventListener('keydown', onDocKey);
  }, [onClose]);

  async function applyItem(item: Item) {
    if (applying) return;
    setApplying(true);
    const ids = Array.from(selectedBookIds);
    try {
      if (item.kind === 'folder') {
        await Promise.all(ids.map(id => attachmentStorage.moveToFolder(id, item.id)));
      } else if (item.kind === 'tag') {
        await Promise.all(
          ids.map(async id => {
            const book = books.find(b => b.id === id);
            const current = book?.tags ?? [];
            if (current.includes(item.id)) return;
            await attachmentStorage.setTags(id, [...current, item.id]);
          }),
        );
      } else {
        // Node attach is additive: only POST for books not already linked.
        await Promise.all(
          ids.map(async id => {
            const book = books.find(b => b.id === id);
            const linked = (book?.nodeAttachments ?? []).some(
              link => link.flowchartId === item.flowchartId && link.nodeKey === item.nodeKey,
            );
            if (linked) return;
            await attachmentStorage.attachNode(id, item.flowchartId, item.nodeKey);
          }),
        );
      }
      await onApplied();
      onClose();
    } catch (err) {
      console.error('Failed to apply', err);
      setApplying(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(Math.max(filtered.length - 1, 0), i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[selectedIdx];
      if (item) applyItem(item);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popup} onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          autoFocus
          className={styles.search}
          placeholder={`Apply to ${selectedSize} book${selectedSize === 1 ? '' : 's'}…`}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setSelectedIdx(0);
          }}
          onKeyDown={handleKey}
        />
        <div className={styles.list}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>
              {allItems.length === 0 ? 'No folders, tags, or nodes yet' : 'No matches'}
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIdx;
              const name = item.kind === 'node' ? item.title : item.name;
              const appliedLabel =
                item.applied === 'all'
                  ? 'Applied'
                  : item.applied === 'partial'
                    ? `Applied to ${item.appliedCount}/${selectedSize}`
                    : null;
              return (
                <div
                  key={item.key}
                  ref={isSelected ? selectedRowRef : undefined}
                  className={[
                    styles.row,
                    isSelected ? styles.rowSelected : '',
                    item.applied === 'all' ? styles.rowAppliedAll : '',
                  ].filter(Boolean).join(' ')}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  onClick={() => applyItem(item)}
                >
                  {item.kind === 'tag' ? (
                    <span
                      className={styles.dot}
                      style={item.color ? { background: item.color } : undefined}
                    />
                  ) : (
                    <span className={styles.dotEmpty} />
                  )}
                  <span className={styles.name}>{name}</span>
                  {item.kind === 'node' && (
                    <span className={styles.flowchartName} title={item.flowchartName}>
                      {item.flowchartName}
                    </span>
                  )}
                  {appliedLabel && (
                    <span className={`${styles.applied} ${item.applied === 'all' ? styles.appliedAll : styles.appliedPartial}`}>
                      {item.applied === 'all' && <span className={styles.check}>✓</span>}
                      {appliedLabel}
                    </span>
                  )}
                  <span className={`${styles.kind} ${styles[`kind_${item.kind}`]}`}>
                    {item.kind}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
