import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ContextMenu } from '../../components/ContextMenu/ContextMenu';
import { folderStorage } from '../../services/folderStorage';
import { bookTagStorage } from '../../services/bookTagStorage';
import { sourceStorage } from '../../services/sourceStorage';
import type { AttachmentMeta } from '../../types/attachment';
import type { Folder } from '../../types/folder';
import type { BookTag } from '../../types/bookTag';
import type { Source } from '../../types/source';
import { randomCategorical } from '../../palette';
import type { Selection } from './libraryModel';
import { sameSelection } from './libraryModel';
import { LinkFolderDialog } from './LinkFolderDialog';
import styles from './LibraryPage.module.css';

interface Props {
  books: AttachmentMeta[];
  folders: Folder[];
  tags: BookTag[];
  sources: Source[];
  selection: Selection;
  selectedCount: number;
  onSelect: (selection: Selection) => void;
  /** Sidebar tag click while books are selected toggles the tag on them. */
  onApplyTagToSelection: (tag: BookTag) => void;
  onFoldersChanged: () => Promise<void> | void;
  onTagsChanged: () => Promise<void> | void;
  onSourcesChanged: () => Promise<void> | void;
  onBooksChanged: () => Promise<void> | void;
}

export function LibrarySidebar({
  books,
  folders,
  tags,
  sources,
  selection,
  selectedCount,
  onSelect,
  onApplyTagToSelection,
  onFoldersChanged,
  onTagsChanged,
  onSourcesChanged,
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
  const [sourceMenu, setSourceMenu] = useState<{ x: number; y: number; source: Source } | null>(null);
  /** Open link/edit dialog: `null` source = link a new folder. */
  const [sourceDialog, setSourceDialog] = useState<{ source: Source | null } | null>(null);

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

  const sourceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of books) if (b.sourceId) m.set(b.sourceId, (m.get(b.sourceId) ?? 0) + 1);
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

  // --- Linked folders ---
  const handleRescanSource = useCallback(async (source: Source) => {
    try {
      await sourceStorage.scan(source.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
    await onSourcesChanged();
    await onBooksChanged();
  }, [onSourcesChanged, onBooksChanged]);

  const handleRemoveMissing = useCallback(async (source: Source) => {
    const n = source.missingCount;
    if (!confirm(`Remove ${n} missing item${n === 1 ? '' : 's'} of "${source.name}" from the library? Their highlights and comments are deleted too.`)) return;
    await sourceStorage.removeMissing(source.id);
    await onSourcesChanged();
    await onBooksChanged();
  }, [onSourcesChanged, onBooksChanged]);

  const handleUnlinkSource = useCallback(async (source: Source) => {
    const n = source.itemCount;
    const lines = [`Unlink "${source.name}"?`];
    if (n > 0) {
      lines.push(`Its ${n} item${n === 1 ? '' : 's'} leave the library${source.highlightCount > 0 ? `, along with ${source.highlightCount} highlight${source.highlightCount === 1 ? '' : 's'} on them` : ''}.`);
    }
    lines.push('The files on disk are not touched.');
    if (!confirm(lines.join(' '))) return;
    await sourceStorage.delete(source.id);
    if (selection.kind === 'source' && selection.id === source.id) onSelect({ kind: 'all' });
    await onSourcesChanged();
    await onBooksChanged();
  }, [selection, onSelect, onSourcesChanged, onBooksChanged]);

  const sourceTitle = (source: Source): string => {
    if (source.offline) return `${source.path} — offline: the folder can't be reached, so its items are left as they were`;
    if (source.error) return `${source.path} — ${source.error}`;
    if (source.missingCount > 0) return `${source.path} — ${source.missingCount} missing`;
    return source.path;
  };

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
          setSourceMenu(null);
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
        <span className={styles.sidebarSectionLabel}>Linked folders</span>
      </div>
      {sources.map(source => {
        const sel: Selection = { kind: 'source', id: source.id };
        const flagged = source.offline || !!source.error;
        return (
          <button
            key={source.id}
            className={`${itemClass(sel)} ${flagged ? styles.sidebarItemArchived : ''}`}
            onClick={() => onSelect(sel)}
            onContextMenu={e => {
              e.preventDefault();
              setSourceMenu({ x: e.clientX, y: e.clientY, source });
              setFolderMenu(null);
              setTagMenu(null);
            }}
            title={sourceTitle(source)}
          >
            <span className={styles.sidebarItemLabel}>{source.name}</span>
            {flagged ? (
              <span className={styles.sidebarWarn} aria-label={source.offline ? 'offline' : 'error'}>{source.offline ? 'offline' : '!'}</span>
            ) : (
              <span className={styles.sidebarCount}>{sourceCounts.get(source.id) ?? 0}</span>
            )}
          </button>
        );
      })}
      <button className={styles.newFolderBtn} onClick={() => setSourceDialog({ source: null })}>
        + Link folder…
      </button>

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
              setSourceMenu(null);
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
      {sourceMenu && (
        <ContextMenu
          x={sourceMenu.x}
          y={sourceMenu.y}
          items={[
            { label: 'Rescan', onClick: () => handleRescanSource(sourceMenu.source) },
            { label: 'Edit…', onClick: () => setSourceDialog({ source: sourceMenu.source }) },
            ...(sourceMenu.source.missingCount > 0
              ? [{ label: `Remove ${sourceMenu.source.missingCount} missing`, onClick: () => handleRemoveMissing(sourceMenu.source) }]
              : []),
            { label: 'Unlink folder', onClick: () => handleUnlinkSource(sourceMenu.source), danger: true },
          ]}
          onClose={() => setSourceMenu(null)}
        />
      )}
      {sourceDialog && (
        <LinkFolderDialog
          source={sourceDialog.source ?? undefined}
          onClose={() => setSourceDialog(null)}
          onSaved={async saved => {
            const isNew = !sourceDialog.source;
            setSourceDialog(null);
            await onSourcesChanged();
            await onBooksChanged();
            if (isNew) onSelect({ kind: 'source', id: saved.id });
          }}
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
