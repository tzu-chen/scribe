import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ContextMenu } from '../../components/ContextMenu/ContextMenu';
import { folderStorage } from '../../services/folderStorage';
import { bookTagStorage } from '../../services/bookTagStorage';
import type { AttachmentMeta } from '../../types/attachment';
import type { Folder } from '../../types/folder';
import type { BookTag } from '../../types/bookTag';
import { randomCategorical } from '../../palette';
import type { Selection } from './libraryModel';
import { sameSelection } from './libraryModel';
import styles from './LibraryPage.module.css';

interface Props {
  books: AttachmentMeta[];
  folders: Folder[];
  tags: BookTag[];
  selection: Selection;
  selectedCount: number;
  onSelect: (selection: Selection) => void;
  /** Sidebar tag click while books are selected toggles the tag on them. */
  onApplyTagToSelection: (tag: BookTag) => void;
  onFoldersChanged: () => Promise<void> | void;
  onTagsChanged: () => Promise<void> | void;
  onBooksChanged: () => Promise<void> | void;
}

export function LibrarySidebar({
  books,
  folders,
  tags,
  selection,
  selectedCount,
  onSelect,
  onApplyTagToSelection,
  onFoldersChanged,
  onTagsChanged,
  onBooksChanged,
}: Props) {
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const renameFolderInputRef = useRef<HTMLInputElement>(null);

  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [renamingTagId, setRenamingTagId] = useState<string | null>(null);
  const [renameTagValue, setRenameTagValue] = useState('');
  const newTagInputRef = useRef<HTMLInputElement>(null);
  const renameTagInputRef = useRef<HTMLInputElement>(null);

  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; folder: Folder } | null>(null);
  const [tagMenu, setTagMenu] = useState<{ x: number; y: number; tag: BookTag } | null>(null);

  useEffect(() => { if (creatingFolder) newFolderInputRef.current?.focus(); }, [creatingFolder]);
  useEffect(() => {
    if (renamingFolderId) { renameFolderInputRef.current?.focus(); renameFolderInputRef.current?.select(); }
  }, [renamingFolderId]);
  useEffect(() => { if (creatingTag) newTagInputRef.current?.focus(); }, [creatingTag]);
  useEffect(() => {
    if (renamingTagId) { renameTagInputRef.current?.focus(); renameTagInputRef.current?.select(); }
  }, [renamingTagId]);

  const folderCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of books) for (const id of b.folderIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [books]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of books) for (const id of b.tags ?? []) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [books]);

  const activeFolders = useMemo(() => folders.filter(f => !f.archivedAt), [folders]);
  const archivedFolders = useMemo(() => folders.filter(f => !!f.archivedAt), [folders]);

  // Keep an archived project visible while it is the current selection.
  const archivedVisible = showArchived || (selection.kind === 'folder' && archivedFolders.some(f => f.id === selection.id));

  // --- Projects ---
  const handleCreateFolder = useCallback(async () => {
    const trimmed = newFolderName.trim();
    setCreatingFolder(false);
    setNewFolderName('');
    if (!trimmed) return;
    const created = await folderStorage.create(trimmed);
    await onFoldersChanged();
    onSelect({ kind: 'folder', id: created.id });
  }, [newFolderName, onFoldersChanged, onSelect]);

  const commitRenameFolder = useCallback(async () => {
    if (!renamingFolderId) return;
    const trimmed = renameFolderValue.trim();
    if (trimmed && trimmed !== folders.find(f => f.id === renamingFolderId)?.name) {
      await folderStorage.rename(renamingFolderId, trimmed);
      await onFoldersChanged();
    }
    setRenamingFolderId(null);
    setRenameFolderValue('');
  }, [renamingFolderId, renameFolderValue, folders, onFoldersChanged]);

  const handleDeleteFolder = useCallback(async (folder: Folder) => {
    const n = folderCounts.get(folder.id) ?? 0;
    const msg = n > 0
      ? `Delete project "${folder.name}"? Its ${n} item${n === 1 ? '' : 's'} stay in the library.`
      : `Delete project "${folder.name}"?`;
    if (!confirm(msg)) return;
    await folderStorage.delete(folder.id);
    if (selection.kind === 'folder' && selection.id === folder.id) onSelect({ kind: 'all' });
    await onFoldersChanged();
    await onBooksChanged();
  }, [folderCounts, selection, onSelect, onFoldersChanged, onBooksChanged]);

  const handleArchiveFolder = useCallback(async (folder: Folder, archived: boolean) => {
    await folderStorage.setArchived(folder.id, archived);
    await onFoldersChanged();
  }, [onFoldersChanged]);

  // --- Tags ---
  const handleCreateTag = useCallback(async () => {
    const trimmed = newTagName.trim();
    setCreatingTag(false);
    setNewTagName('');
    if (!trimmed) return;
    await bookTagStorage.create(trimmed, randomCategorical());
    await onTagsChanged();
  }, [newTagName, onTagsChanged]);

  const commitRenameTag = useCallback(async () => {
    if (!renamingTagId) return;
    const trimmed = renameTagValue.trim();
    if (trimmed && trimmed !== tags.find(t => t.id === renamingTagId)?.name) {
      await bookTagStorage.rename(renamingTagId, trimmed);
      await onTagsChanged();
    }
    setRenamingTagId(null);
    setRenameTagValue('');
  }, [renamingTagId, renameTagValue, tags, onTagsChanged]);

  const handleDeleteTag = useCallback(async (tag: BookTag) => {
    if (!confirm(`Delete tag "${tag.name}"?`)) return;
    await bookTagStorage.delete(tag.id);
    if (selection.kind === 'tag' && selection.id === tag.id) onSelect({ kind: 'all' });
    await onTagsChanged();
    await onBooksChanged();
  }, [selection, onSelect, onTagsChanged, onBooksChanged]);

  const handleShuffleTagColors = useCallback(async () => {
    if (tags.length === 0) return;
    await Promise.all(tags.map(t => bookTagStorage.update(t.id, { color: randomCategorical() })));
    await onTagsChanged();
  }, [tags, onTagsChanged]);

  const itemClass = (sel: Selection) =>
    `${styles.sidebarItem} ${sameSelection(selection, sel) ? styles.sidebarItemActive : ''}`;

  const renderFolder = (folder: Folder) => {
    const sel: Selection = { kind: 'folder', id: folder.id };
    if (renamingFolderId === folder.id) {
      return (
        <input
          key={folder.id}
          ref={renameFolderInputRef}
          className={styles.sidebarRenameInput}
          value={renameFolderValue}
          onChange={e => setRenameFolderValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRenameFolder();
            if (e.key === 'Escape') { setRenamingFolderId(null); setRenameFolderValue(''); }
          }}
          onBlur={commitRenameFolder}
        />
      );
    }
    return (
      <button
        key={folder.id}
        className={`${itemClass(sel)} ${folder.archivedAt ? styles.sidebarItemArchived : ''}`}
        onClick={() => onSelect(sel)}
        onContextMenu={e => {
          e.preventDefault();
          setFolderMenu({ x: e.clientX, y: e.clientY, folder });
          setTagMenu(null);
        }}
        title={folder.name}
      >
        <span className={styles.sidebarItemLabel}>{folder.name}</span>
        <span className={styles.sidebarCount}>{folderCounts.get(folder.id) ?? 0}</span>
      </button>
    );
  };

  return (
    <nav className={styles.sidebar}>
      <button className={itemClass({ kind: 'home' })} onClick={() => onSelect({ kind: 'home' })}>
        <span className={styles.sidebarItemLabel}>Home</span>
      </button>
      <button className={itemClass({ kind: 'all' })} onClick={() => onSelect({ kind: 'all' })}>
        <span className={styles.sidebarItemLabel}>All items</span>
        <span className={styles.sidebarCount}>{books.length}</span>
      </button>

      <div className={styles.sidebarSectionHeader}>
        <span className={styles.sidebarSectionLabel}>Projects</span>
      </div>
      {activeFolders.map(renderFolder)}
      {creatingFolder ? (
        <input
          ref={newFolderInputRef}
          className={styles.sidebarRenameInput}
          value={newFolderName}
          placeholder="Project name"
          onChange={e => setNewFolderName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCreateFolder();
            if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
          }}
          onBlur={handleCreateFolder}
        />
      ) : (
        <button className={styles.newFolderBtn} onClick={() => setCreatingFolder(true)}>
          + New project
        </button>
      )}
      {archivedFolders.length > 0 && (
        <>
          <button className={styles.sidebarDisclosure} onClick={() => setShowArchived(!archivedVisible)}>
            {archivedVisible ? '▾' : '▸'} Archived ({archivedFolders.length})
          </button>
          {archivedVisible && archivedFolders.map(renderFolder)}
        </>
      )}

      <div className={styles.sidebarSectionHeader}>
        <span className={styles.sidebarSectionLabel}>Tags</span>
        {tags.length > 0 && (
          <button
            type="button"
            className={styles.sidebarHelpBtn}
            onClick={handleShuffleTagColors}
            title="Shuffle all tag colors"
            aria-label="Shuffle all tag colors"
          >
            ⤭
          </button>
        )}
      </div>
      {tags.map(tag => {
        const sel: Selection = { kind: 'tag', id: tag.id };
        if (renamingTagId === tag.id) {
          return (
            <input
              key={tag.id}
              ref={renameTagInputRef}
              className={styles.sidebarRenameInput}
              value={renameTagValue}
              onChange={e => setRenameTagValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRenameTag();
                if (e.key === 'Escape') { setRenamingTagId(null); setRenameTagValue(''); }
              }}
              onBlur={commitRenameTag}
            />
          );
        }
        return (
          <button
            key={tag.id}
            className={itemClass(sel)}
            onClick={() => (selectedCount > 0 ? onApplyTagToSelection(tag) : onSelect(sameSelection(selection, sel) ? { kind: 'all' } : sel))}
            onContextMenu={e => {
              e.preventDefault();
              setTagMenu({ x: e.clientX, y: e.clientY, tag });
              setFolderMenu(null);
            }}
            title={selectedCount > 0 ? `Apply "${tag.name}" to ${selectedCount} selected` : `Filter by ${tag.name}`}
          >
            <span className={styles.sidebarTagDot} style={tag.color ? { backgroundColor: tag.color } : undefined} aria-hidden="true" />
            <span className={styles.sidebarItemLabel}>{tag.name}</span>
            <span className={styles.sidebarCount}>{tagCounts.get(tag.id) ?? 0}</span>
          </button>
        );
      })}
      {creatingTag ? (
        <input
          ref={newTagInputRef}
          className={styles.sidebarRenameInput}
          value={newTagName}
          placeholder="Tag name"
          onChange={e => setNewTagName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCreateTag();
            if (e.key === 'Escape') { setCreatingTag(false); setNewTagName(''); }
          }}
          onBlur={handleCreateTag}
        />
      ) : (
        <button className={styles.newFolderBtn} onClick={() => setCreatingTag(true)}>
          + New tag
        </button>
      )}

      {folderMenu && (
        <ContextMenu
          x={folderMenu.x}
          y={folderMenu.y}
          items={[
            { label: 'Rename', onClick: () => { setRenamingFolderId(folderMenu.folder.id); setRenameFolderValue(folderMenu.folder.name); } },
            folderMenu.folder.archivedAt
              ? { label: 'Unarchive', onClick: () => handleArchiveFolder(folderMenu.folder, false) }
              : { label: 'Archive', onClick: () => handleArchiveFolder(folderMenu.folder, true) },
            { label: 'Delete project', onClick: () => handleDeleteFolder(folderMenu.folder), danger: true },
          ]}
          onClose={() => setFolderMenu(null)}
        />
      )}
      {tagMenu && (
        <ContextMenu
          x={tagMenu.x}
          y={tagMenu.y}
          items={[
            { label: 'Rename', onClick: () => { setRenamingTagId(tagMenu.tag.id); setRenameTagValue(tagMenu.tag.name); } },
            { label: 'Delete tag', onClick: () => handleDeleteTag(tagMenu.tag), danger: true },
          ]}
          onClose={() => setTagMenu(null)}
        />
      )}
    </nav>
  );
}
