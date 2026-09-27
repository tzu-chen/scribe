import { useEffect, useMemo, useRef, useState } from 'react';
import { sourceStorage } from '../../services/sourceStorage';
import type { ScanSummary, Source, SourcePreview, SourceSettings } from '../../types/source';
import styles from './LinkFolderDialog.module.css';

interface Props {
  /** Edit this folder; omitted to link a new one. */
  source?: Source;
  onClose: () => void;
  onSaved: (source: Source, summary: ScanSummary) => void;
}

const PREVIEW_DEBOUNCE_MS = 350;

function basename(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() ?? '';
}

function splitPath(rel: string): { dir: string; name: string } {
  const i = rel.lastIndexOf('/');
  return i === -1 ? { dir: '', name: rel } : { dir: rel.slice(0, i + 1), name: rel.slice(i + 1) };
}

/**
 * Link a folder on disk (or edit a linked one). Every change to the path,
 * subfolder switch or excludes re-runs a server-side dry run, so what will be
 * taken in — and which uploads it would adopt — is visible before saving.
 */
export function LinkFolderDialog({ source, onClose, onSaved }: Props) {
  const editing = !!source;
  const [path, setPath] = useState(source?.path ?? '');
  const [name, setName] = useState(source?.name ?? '');
  const [recursive, setRecursive] = useState(source?.recursive ?? true);
  const [excludeText, setExcludeText] = useState((source?.exclude ?? []).join('\n'));
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // Uploads NOT to adopt; everything matched is adopted unless unticked.
  const [declined, setDeclined] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  const settings = useMemo((): SourceSettings => ({
    path: path.trim(),
    recursive,
    exclude: excludeText.split('\n').map(l => l.trim()).filter(Boolean),
  }), [path, recursive, excludeText]);

  useEffect(() => { pathInputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!settings.path) {
      setPreview(null);
      setPreviewError(null);
      setPreviewing(false);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    const timer = setTimeout(async () => {
      try {
        const result = await sourceStorage.preview(settings, source?.id);
        if (cancelled) return;
        setPreview(result);
        setPreviewError(null);
      } catch (err) {
        if (cancelled) return;
        setPreview(null);
        setPreviewError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [settings, source?.id]);

  const toggleAdopt = (attachmentId: string) => {
    setDeclined(prev => {
      const next = new Set(prev);
      if (next.has(attachmentId)) next.delete(attachmentId); else next.add(attachmentId);
      return next;
    });
  };

  const canSave = !!settings.path && !!preview && !previewError && !previewing && !saving;

  const handleSave = async () => {
    if (!canSave || !preview) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = source
        ? await sourceStorage.update(source.id, { ...settings, name: name.trim() || undefined })
        : await sourceStorage.create({
          ...settings,
          name: name.trim() || undefined,
          adoptIds: preview.matches.map(m => m.attachmentId).filter(id => !declined.has(id)),
        });
      onSaved(result.source, result.summary);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const adoptCount = preview ? preview.matches.filter(m => !declined.has(m.attachmentId)).length : 0;

  return (
    <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="link-folder-title">
        <div className={styles.header}>
          <h3 id="link-folder-title" className={styles.title}>{editing ? 'Edit linked folder' : 'Link a folder'}</h3>
          <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className={styles.body}>
          <p className={styles.intro}>
            PDFs and DjVu files in the folder stay where they are. New, changed, moved and deleted files are
            picked up automatically; nothing on disk is ever modified.
          </p>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="link-folder-path">Folder</label>
            <input
              id="link-folder-path"
              ref={pathInputRef}
              className={`${styles.input} ${styles.mono}`}
              value={path}
              onChange={e => setPath(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              placeholder=""
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="link-folder-name">Name</label>
            <input
              id="link-folder-name"
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              placeholder={basename(settings.path) || 'Shown in the sidebar'}
            />
          </div>

          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)} />
            Include subfolders
          </label>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="link-folder-exclude">Exclude</label>
            <textarea
              id="link-folder-exclude"
              className={`${styles.textarea} ${styles.mono}`}
              value={excludeText}
              onChange={e => setExcludeText(e.target.value)}
              placeholder={'figures/\n*_plot.pdf\n/old_draft.pdf'}
              rows={4}
              spellCheck={false}
            />
            <p className={styles.hint}>
              One pattern per line, as in <code>.gitignore</code>: <code>figures/</code> skips every folder named
              figures, <code>*_plot.pdf</code> skips matching files, a leading <code>/</code> matches only at the top.
              Hidden folders, <code>node_modules</code> and <code>__pycache__</code> are always skipped.
            </p>
          </div>

          <div className={styles.preview} aria-live="polite">
            <div className={styles.previewStatus}>
              {!settings.path ? (
                <span className={styles.muted}>Enter a folder to see what it contains.</span>
              ) : previewError ? (
                <span className={styles.error}>{previewError}</span>
              ) : !preview ? (
                <span className={styles.muted}>Scanning…</span>
              ) : (
                <>
                  <strong>{preview.total === 1 ? '1 document' : `${preview.total.toLocaleString()} documents`}</strong>
                  <span className={styles.muted}> in {preview.path}</span>
                  {previewing && <span className={styles.muted}> · updating…</span>}
                </>
              )}
            </div>
            {preview && !previewError && preview.files.length > 0 && (
              <ul className={styles.fileList}>
                {preview.files.map(f => {
                  const { dir, name: file } = splitPath(f.relPath);
                  return (
                    <li key={f.relPath} className={styles.fileRow} title={f.relPath}>
                      <span className={styles.fileDir}>{dir}</span>{file}
                    </li>
                  );
                })}
                {preview.total > preview.files.length && (
                  <li className={`${styles.fileRow} ${styles.muted}`}>
                    …and {(preview.total - preview.files.length).toLocaleString()} more
                  </li>
                )}
              </ul>
            )}
          </div>

          {!editing && preview && !previewError && preview.matches.length > 0 && (
            <div className={styles.adopt}>
              <div className={styles.adoptTitle}>Already in your library</div>
              <p className={styles.hint}>
                These files have the same content as items you uploaded. Ticked ones become the file on disk and keep
                their highlights, notes, tags and projects; the uploaded copy is deleted. Unticked ones stay separate.
              </p>
              <ul className={styles.adoptList}>
                {preview.matches.map(m => (
                  <li key={m.attachmentId}>
                    <label className={styles.adoptRow}>
                      <input
                        type="checkbox"
                        checked={!declined.has(m.attachmentId)}
                        onChange={() => toggleAdopt(m.attachmentId)}
                      />
                      <span className={styles.adoptText}>
                        <span className={styles.adoptItem}>{m.title}</span>
                        <span className={`${styles.adoptPath} ${styles.mono}`}>{m.relPath}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {editing && preview && !previewError && preview.removals.count > 0 && (
            <p className={styles.warning}>
              {preview.removals.count === 1 ? '1 linked item' : `${preview.removals.count} linked items`} will leave the
              library
              {preview.removals.withHighlights > 0 && `, including ${preview.removals.withHighlights} with highlights`}.
            </p>
          )}

          {saveError && <p className={styles.error}>{saveError}</p>}

          <div className={styles.actions}>
            <button className={styles.button} onClick={onClose}>Cancel</button>
            <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={handleSave} disabled={!canSave}>
              {saving
                ? (editing ? 'Saving…' : 'Linking…')
                : editing
                  ? 'Save'
                  : adoptCount > 0 ? `Link folder (adopt ${adoptCount})` : 'Link folder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
