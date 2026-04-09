import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Note } from '../../types/note';
import { NoteEditor } from '../NoteEditor/NoteEditor';
import { CloseIcon, ExternalLinkIcon, MinusIcon, ExpandIcon } from '../Icons/Icons';
import styles from './PdfPostItNote.module.css';

interface Props {
  noteId: string;
  notes: Note[];
  saveNote: (note: Note) => void | Promise<void>;
  onClose: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

const MIN_W = 300;
const MIN_H = 250;
const MAX_W = 700;
const MAX_H = 600;
const DEFAULT_W = 420;
const DEFAULT_H = 360;
const COLLAPSED_H = 36;

export function PdfPostItNote({ noteId, notes, saveNote, onClose }: Props) {
  const note = useMemo(() => notes.find(n => n.id === noteId) ?? null, [notes, noteId]);

  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [collapsed, setCollapsed] = useState(false);

  // Position & size (bottom-right default)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });

  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevKeyRef = useRef('');

  // Initialize position to bottom-right of parent
  useLayoutEffect(() => {
    if (pos !== null) return;
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    setPos({ // eslint-disable-line react-hooks/set-state-in-effect -- sync layout measurement
      x: rect.width - DEFAULT_W - 16,
      y: rect.height - DEFAULT_H - 16,
    });
  }, [pos]);

  // Re-init local state when switching notes
  const prevNoteIdRef = useRef(noteId);
  useEffect(() => {
    if (prevNoteIdRef.current !== noteId && note) {
      prevNoteIdRef.current = noteId;
      setTitle(note.title); // eslint-disable-line react-hooks/set-state-in-effect -- sync from async data fetch
      setContent(note.content);
      prevKeyRef.current = '';
    }
  }, [noteId, note]);

  // Auto-save
  const debouncedSave = useCallback(
    (updatedNote: Note) => {
      const key = `${updatedNote.title}|${updatedNote.content}`;
      if (key === prevKeyRef.current) return;
      prevKeyRef.current = key;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(() => {
        setSaveStatus('saving');
        saveNote({ ...updatedNote, updatedAt: new Date().toISOString() });
        setSaveStatus('saved');
        savedTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }, 1500);
    },
    [saveNote],
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!note) return;
    debouncedSave({ ...note, title, content });
  }, [title, content, note, debouncedSave]);

  // Drag title bar to move
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!pos) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPos = { ...pos };
      const parent = containerRef.current?.parentElement;
      const parentRect = parent?.getBoundingClientRect();

      document.body.style.cursor = 'move';
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        let nx = startPos.x + (ev.clientX - startX);
        let ny = startPos.y + (ev.clientY - startY);
        if (parentRect) {
          nx = Math.max(0, Math.min(nx, parentRect.width - size.w));
          ny = Math.max(0, Math.min(ny, parentRect.height - (collapsed ? COLLAPSED_H : size.h)));
        }
        setPos({ x: nx, y: ny });
      };
      const onUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [pos, size.w, size.h, collapsed],
  );

  // Resize from bottom-right corner
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startSize = { ...size };

      document.body.style.cursor = 'nwse-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        const nw = Math.min(Math.max(startSize.w + (ev.clientX - startX), MIN_W), MAX_W);
        const nh = Math.min(Math.max(startSize.h + (ev.clientY - startY), MIN_H), MAX_H);
        setSize({ w: nw, h: nh });
      };
      const onUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [size],
  );

  if (!note) {
    return null;
  }

  const editorHeight = size.h - COLLAPSED_H - 44; // header + title input

  return (
    <div
      ref={containerRef}
      className={styles.postit}
      style={{
        width: size.w,
        height: collapsed ? COLLAPSED_H : size.h,
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
      }}
    >
      {/* Title bar — draggable */}
      <div className={styles.titleBar} onMouseDown={handleDragStart}>
        <div className={styles.titleBarLeft}>
          {note.page != null && (
            <span className={styles.pageBadge}>p. {note.page}</span>
          )}
          {saveStatus !== 'idle' && (
            <span className={styles.saveStatus}>
              {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
            </span>
          )}
        </div>
        <div className={styles.titleBarRight}>
          <Link
            to={`/note/${noteId}/edit`}
            className={styles.iconBtn}
            title="Open full editor"
            onMouseDown={e => e.stopPropagation()}
          >
            <ExternalLinkIcon size={12} />
          </Link>
          <button
            className={styles.iconBtn}
            onClick={() => setCollapsed(c => !c)}
            onMouseDown={e => e.stopPropagation()}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ExpandIcon size={12} /> : <MinusIcon size={12} />}
          </button>
          <button
            className={styles.iconBtn}
            onClick={onClose}
            onMouseDown={e => e.stopPropagation()}
            title="Close"
          >
            <CloseIcon size={12} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className={styles.titleRow}>
            <input
              className={styles.titleInput}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Untitled"
              aria-label="Note title"
            />
          </div>
          <div className={styles.editorArea}>
            <NoteEditor value={content} onChange={setContent} height={Math.max(100, editorHeight)} />
          </div>
          <div className={styles.resizeGrip} onMouseDown={handleResizeStart} />
        </>
      )}
    </div>
  );
}
