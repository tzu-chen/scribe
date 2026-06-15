import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { FlowchartSummary, Flowchart, FlowchartSpec } from '../../types/flowchart';
import type { FlowchartTag } from '../../types/flowchartTag';
import type { Note } from '../../types/note';
import type { AttachmentMeta } from '../../types/attachment';
import type { Question } from '../../types/question';
import { flowchartStorage } from '../../services/flowchartStorage';
import { flowchartTagStorage } from '../../services/flowchartTagStorage';
import { noteStorage } from '../../services/noteStorage';
import { attachmentStorage } from '../../services/attachmentStorage';
import { questionStorage } from '../../services/questionStorage';
import { FlowchartEditor } from '../../components/FlowchartEditor/FlowchartEditor';
import type { NodeAction, NodeCounts } from '../../components/FlowchartRenderer/FlowchartRenderer';
import { BookPicker } from '../../components/BookPicker/BookPicker';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { ContextMenu } from '../../components/ContextMenu/ContextMenu';
import type { ContextMenuItem } from '../../components/ContextMenu/ContextMenu';
import { ArrowLeftIcon, CloseIcon, ChevronUpIcon, ChevronDownIcon } from '../../components/Icons/Icons';
import { stripExtension } from '../../utils/filename';
import { NodePopup } from '../../components/NodePopup/NodePopup';
import popupStyles from '../../components/NodePopup/NodePopup.module.css';
import styles from './FlowchartsPage.module.css';

type ViewMode = 'card' | 'list';
type SortField = 'name' | 'created' | 'updated';
type SortDir = 'asc' | 'desc';

const VIEW_MODE_KEY = 'scribe_flowcharts_view';

const TAG_COLOR_PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
  '#06b6d4', '#a855f7', '#facc15', '#f43f5e', '#22c55e',
];

function randomTagColor(): string {
  return TAG_COLOR_PALETTE[Math.floor(Math.random() * TAG_COLOR_PALETTE.length)];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Create / Edit Flowchart Modal ───
// Handles creating a flowchart from JSON, and editing an existing flowchart's
// name, description, raw spec JSON, and tags.

interface FormModalProps {
  existing?: Flowchart | null;
  tags: FlowchartTag[];
  onClose: () => void;
  onSaved: () => void;
}

function FlowchartFormModal({ existing, tags, onClose, onSaved }: FormModalProps) {
  const isEdit = !!existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [specJson, setSpecJson] = useState(
    existing ? JSON.stringify(existing.spec, null, 2) : '',
  );
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    new Set(existing?.tags ?? []),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim() || !specJson.trim()) return;

    let spec: FlowchartSpec;
    try {
      spec = JSON.parse(specJson);
    } catch {
      setError('Invalid JSON');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const data = {
        name: name.trim(),
        description: description.trim() || undefined,
        spec,
      };
      const id = isEdit && existing
        ? (await flowchartStorage.update(existing.id, data)).id
        : (await flowchartStorage.create(data)).id;
      await flowchartStorage.setTags(id, Array.from(selectedTagIds));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modalPanel}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{isEdit ? 'Edit Flowchart' : 'Import Flowchart JSON'}</h3>
          <button className={styles.modalClose} onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Name</label>
            <input
              className={styles.modalInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Flowchart name"
              autoFocus
            />
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Description (optional)</label>
            <input
              className={styles.modalInput}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
            />
          </div>
          {tags.length > 0 && (
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Tags</label>
              <div className={styles.tagPickerRow}>
                {tags.map((tag) => {
                  const selected = selectedTagIds.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className={`${styles.tagPickerChip} ${selected ? styles.tagPickerChipSelected : ''}`}
                      style={selected && tag.color ? { backgroundColor: tag.color, borderColor: tag.color, color: '#fff' } : undefined}
                      onClick={() => toggleTag(tag.id)}
                    >
                      <span
                        className={styles.tagPickerDot}
                        style={tag.color ? { backgroundColor: tag.color } : undefined}
                        aria-hidden="true"
                      />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Spec JSON</label>
            <textarea
              className={styles.modalTextarea}
              value={specJson}
              onChange={(e) => { setSpecJson(e.target.value); setError(''); }}
              placeholder='Paste FlowchartSpec JSON here...'
              spellCheck={false}
            />
          </div>
          {error && <p className={styles.modalError}>{error}</p>}
          <div className={styles.modalActions}>
            <button className={styles.modalButton} onClick={onClose}>Cancel</button>
            <button
              className={`${styles.modalButton} ${styles.modalButtonPrimary}`}
              onClick={handleSave}
              disabled={!name.trim() || !specJson.trim() || saving}
            >
              {saving ? 'Saving...' : isEdit ? 'Save' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Node Action Panel ───

interface NodePanelProps {
  nodeId: string;
  nodeTitle: string;
  flowchartId: string;
  flowchartName: string;
  onClose: () => void;
}

function NodeActionPanel({ nodeId, nodeTitle, flowchartId, flowchartName, onClose }: NodePanelProps) {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [questionText, setQuestionText] = useState('');

  // Load linked data when node changes
  useEffect(() => {
    // Notes: query by subject matching node title (legacy) or nodeId
    noteStorage.getAll().then((allNotes) => {
      const linked = allNotes.filter(
        (n) => n.subject === nodeTitle || n.subject === nodeId,
      );
      setNotes(linked);
    });

    // Attachments via the m2m attachment_nodes table
    attachmentStorage.getByNode(flowchartId, nodeId).then(setAttachments).catch(() => setAttachments([]));

    // Questions
    questionStorage.getByNode(nodeId, flowchartId).then(setQuestions).catch(() => setQuestions([]));
  }, [nodeId, nodeTitle, flowchartId]);

  const handleWriteNote = () => {
    navigate(`/note/new?subject=${encodeURIComponent(nodeTitle)}`);
  };

  const handleViewNotes = () => {
    navigate(`/notes?subject=${encodeURIComponent(nodeTitle)}`);
  };

  const handleBookSelected = async (book: AttachmentMeta) => {
    await attachmentStorage.attachNode(book.id, flowchartId, nodeId);
    const updated = await attachmentStorage.getByNode(flowchartId, nodeId);
    setAttachments(updated);
    setShowBookPicker(false);
  };

  const handleRemoveAttachment = async (fileId: string) => {
    await attachmentStorage.detachNode(fileId, flowchartId, nodeId);
    setAttachments((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleOpenFile = (file: AttachmentMeta) => {
    if (file.type === 'application/pdf') {
      const params = new URLSearchParams();
      params.set('subject', nodeTitle);
      params.set('flowchart', flowchartId);
      navigate(`/pdf/${file.id}?${params.toString()}`);
    } else {
      attachmentStorage.openFile(file.id);
    }
  };

  const handleSaveQuestion = async () => {
    if (!questionText.trim()) return;
    const q: Question = {
      id: crypto.randomUUID(),
      text: questionText.trim(),
      nodeId,
      nodeTitle,
      flowchartId,
      flowchartName,
      checked: false,
      createdAt: new Date().toISOString(),
    };
    await questionStorage.save(q);
    setQuestions((prev) => [...prev, q]);
    setQuestionText('');
    setShowQuestionForm(false);
  };

  const handleToggleQuestion = async (id: string, checked: boolean) => {
    await questionStorage.setChecked(id, checked);
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, checked } : q)));
  };

  return (
    <>
      <div className={styles.nodePanel}>
        <div className={styles.nodePanelHeader}>
          <span className={styles.nodePanelTitle} title={nodeTitle}>{nodeTitle}</span>
          <button className={styles.nodePanelClose} onClick={onClose} aria-label="Close panel">
            <CloseIcon size={14} />
          </button>
        </div>

        <div className={styles.nodePanelBody}>
          {/* Notes section */}
          <div className={styles.nodePanelSection}>
            <div className={styles.nodePanelSectionHeader}>
              <span className={styles.nodePanelSectionTitle}>Notes ({notes.length})</span>
              <button className={styles.nodePanelAddButton} onClick={handleWriteNote}>+ New</button>
            </div>
            {notes.length === 0 ? (
              <p className={styles.nodePanelEmpty}>No linked notes</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className={styles.nodePanelItem}>
                  <button
                    className={styles.nodePanelItemLink}
                    onClick={() => navigate(`/note/${note.id}`)}
                  >
                    {note.title || 'Untitled'}
                  </button>
                  <span className={styles.nodePanelItemMeta}>{note.status}</span>
                </div>
              ))
            )}
            {notes.length > 0 && (
              <div className={styles.nodePanelItem}>
                <button className={styles.nodePanelAddButton} onClick={handleViewNotes}>
                  View all notes →
                </button>
              </div>
            )}
          </div>

          {/* Attachments section */}
          <div className={styles.nodePanelSection}>
            <div className={styles.nodePanelSectionHeader}>
              <span className={styles.nodePanelSectionTitle}>Attachments ({attachments.length})</span>
              <button className={styles.nodePanelAddButton} onClick={() => setShowBookPicker(true)}>+ Attach</button>
            </div>
            {attachments.length === 0 ? (
              <p className={styles.nodePanelEmpty}>No linked files</p>
            ) : (
              attachments.map((file) => (
                <div key={file.id} className={styles.nodePanelItem}>
                  <button
                    className={styles.nodePanelItemLink}
                    onClick={() => handleOpenFile(file)}
                  >
                    {stripExtension(file.filename)}
                  </button>
                  <button
                    className={styles.nodePanelRemoveButton}
                    onClick={() => handleRemoveAttachment(file.id)}
                    aria-label={`Remove ${file.filename}`}
                    title="Remove from node"
                  >
                    &times;
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Questions section */}
          <div className={styles.nodePanelSection}>
            <div className={styles.nodePanelSectionHeader}>
              <span className={styles.nodePanelSectionTitle}>Questions ({questions.length})</span>
              <button className={styles.nodePanelAddButton} onClick={() => setShowQuestionForm(true)}>+ Add</button>
            </div>
            {questions.length === 0 && !showQuestionForm && (
              <p className={styles.nodePanelEmpty}>No questions</p>
            )}
            {questions.map((q) => (
              <div key={q.id} className={styles.nodePanelItem}>
                <input
                  type="checkbox"
                  className={styles.nodePanelItemCheck}
                  checked={q.checked}
                  onChange={(e) => handleToggleQuestion(q.id, e.target.checked)}
                />
                <span className={styles.nodePanelItemText} style={q.checked ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                  {q.text}
                </span>
              </div>
            ))}
            {showQuestionForm && (
              <div className={styles.questionForm}>
                <textarea
                  className={styles.questionTextarea}
                  placeholder="Enter your question..."
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveQuestion();
                  }}
                  autoFocus
                />
                <div className={styles.questionFormActions}>
                  <button className={styles.questionFormButton} onClick={() => { setShowQuestionForm(false); setQuestionText(''); }}>
                    Cancel
                  </button>
                  <button
                    className={`${styles.questionFormButton} ${styles.questionFormButtonPrimary}`}
                    onClick={handleSaveQuestion}
                    disabled={!questionText.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showBookPicker && (
        <BookPicker
          onSelect={handleBookSelected}
          onCancel={() => setShowBookPicker(false)}
        />
      )}
    </>
  );
}

// ─── Main Page ───

export function FlowchartsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [flowcharts, setFlowcharts] = useState<FlowchartSummary[]>([]);
  const [tags, setTags] = useState<FlowchartTag[]>([]);
  const [activeFlowchart, setActiveFlowchart] = useState<Flowchart | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Flowchart | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ id: string; title: string } | null>(null);
  const [nodeCounts, setNodeCounts] = useState<NodeCounts>({ attachments: {}, questions: {} });
  const [showBookPicker, setShowBookPicker] = useState(false);

  // List view controls
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === 'list' ? 'list' : 'card';
  });
  const [sortField, setSortField] = useState<SortField>('updated');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Inline rename of a flowchart
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Tag sidebar create/rename
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [renamingTagId, setRenamingTagId] = useState<string | null>(null);
  const [renameTagValue, setRenameTagValue] = useState('');
  const newTagInputRef = useRef<HTMLInputElement>(null);
  const renameTagInputRef = useRef<HTMLInputElement>(null);

  // Context menus
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowchart: FlowchartSummary } | null>(null);
  const [tagContextMenu, setTagContextMenu] = useState<{ x: number; y: number; tag: FlowchartTag } | null>(null);

  // Popup state for node action icons
  const [popup, setPopup] = useState<{
    type: 'attachments' | 'notes' | 'questions';
    nodeId: string;
    nodeTitle: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [popupNotes, setPopupNotes] = useState<Note[]>([]);
  const [popupAttachments, setPopupAttachments] = useState<AttachmentMeta[]>([]);
  const [popupQuestions, setPopupQuestions] = useState<Question[]>([]);
  const [popupQuestionText, setPopupQuestionText] = useState('');
  const [showPopupQuestionForm, setShowPopupQuestionForm] = useState(false);

  const activeId = searchParams.get('view');

  // Load flowchart list
  const loadList = useCallback(async () => {
    try {
      const list = await flowchartStorage.getAll();
      setFlowcharts(list);
    } catch (err) {
      console.error('Failed to load flowcharts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      setTags(await flowchartTagStorage.getAll());
    } catch (err) {
      console.error('Failed to load flowchart tags:', err);
    }
  }, []);

  useEffect(() => {
    loadList();
    loadTags();
  }, [loadList, loadTags]);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  // '/' focuses the search input (when not already typing in a field)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      const input = searchInputRef.current;
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (creatingTag && newTagInputRef.current) newTagInputRef.current.focus();
  }, [creatingTag]);

  useEffect(() => {
    if (renamingTagId && renameTagInputRef.current) {
      renameTagInputRef.current.focus();
      renameTagInputRef.current.select();
    }
  }, [renamingTagId]);

  // Load active flowchart when view param changes
  useEffect(() => {
    if (!activeId) {
      setActiveFlowchart(null);
      return;
    }

    flowchartStorage.getById(activeId).then((fc) => {
      if (fc) setActiveFlowchart(fc);
      else setActiveFlowchart(null);
    });
  }, [activeId]);

  // Load node counts when active flowchart changes
  useEffect(() => {
    if (!activeId) return;

    Promise.all([
      attachmentStorage.getCountsByNode(activeId),
      questionStorage.getCountsByNode(activeId),
    ]).then(([attachCounts, qCounts]) => {
      setNodeCounts({ attachments: attachCounts, questions: qCounts });
    });
  }, [activeId]);

  const refreshCounts = useCallback(() => {
    if (!activeId) return;
    Promise.all([
      attachmentStorage.getCountsByNode(activeId),
      questionStorage.getCountsByNode(activeId),
    ]).then(([attachCounts, qCounts]) => {
      setNodeCounts({ attachments: attachCounts, questions: qCounts });
    });
  }, [activeId]);

  const selectFlowchart = useCallback((id: string) => {
    setSearchParams({ view: id });
    setSelectedNode(null);
  }, [setSearchParams]);

  const goBack = () => {
    setSearchParams({});
    setSelectedNode(null);
    setActiveFlowchart(null);
  };

  const handleCreated = () => {
    setShowCreate(false);
    loadList();
  };

  const handleEdited = () => {
    setEditing(null);
    loadList();
  };

  // ── List view: sorting, search, rename, edit, delete ──

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir(field === 'name' ? 'asc' : 'desc');
      return field;
    });
  }, []);

  const startRename = useCallback((fc: FlowchartSummary) => {
    setRenamingId(fc.id);
    setRenameValue(fc.name);
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    const current = flowcharts.find((f) => f.id === renamingId);
    if (trimmed && current && trimmed !== current.name) {
      await flowchartStorage.updateMeta(renamingId, { name: trimmed });
      setFlowcharts((prev) => prev.map((f) => (f.id === renamingId ? { ...f, name: trimmed } : f)));
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, flowcharts]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
  }, []);

  const handleEditFlowchart = useCallback(async (id: string) => {
    const fc = await flowchartStorage.getById(id);
    if (fc) setEditing(fc);
  }, []);

  const handleDeleteFlowchart = useCallback(async (id: string) => {
    const fc = flowcharts.find((f) => f.id === id);
    if (!confirm(`Delete "${fc?.name ?? 'this flowchart'}"? This cannot be undone.`)) return;
    await flowchartStorage.delete(id);
    await loadList();
  }, [flowcharts, loadList]);

  // ── Tag management ──

  const handleCreateTag = useCallback(async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setCreatingTag(false);
      setNewTagName('');
      return;
    }
    await flowchartTagStorage.create(trimmed, randomTagColor());
    await loadTags();
    setCreatingTag(false);
    setNewTagName('');
  }, [newTagName, loadTags]);

  const startRenameTag = useCallback((tag: FlowchartTag) => {
    setRenamingTagId(tag.id);
    setRenameTagValue(tag.name);
  }, []);

  const commitRenameTag = useCallback(async () => {
    if (!renamingTagId) return;
    const trimmed = renameTagValue.trim();
    if (trimmed && trimmed !== tags.find((t) => t.id === renamingTagId)?.name) {
      await flowchartTagStorage.rename(renamingTagId, trimmed);
      await loadTags();
    }
    setRenamingTagId(null);
    setRenameTagValue('');
  }, [renamingTagId, renameTagValue, tags, loadTags]);

  const cancelRenameTag = useCallback(() => {
    setRenamingTagId(null);
    setRenameTagValue('');
  }, []);

  const handleDeleteTag = useCallback(async (tagId: string) => {
    await flowchartTagStorage.delete(tagId);
    setTagFilter((prev) => (prev === tagId ? null : prev));
    await loadTags();
    await loadList();
  }, [loadTags, loadList]);

  const handleShuffleTagColors = useCallback(async () => {
    if (tags.length === 0) return;
    await Promise.all(tags.map((t) => flowchartTagStorage.update(t.id, { color: randomTagColor() })));
    await loadTags();
  }, [tags, loadTags]);

  // Toggle a single tag on a flowchart (optimistic, then persist).
  const handleToggleFlowchartTag = useCallback(async (flowchartId: string, tagId: string) => {
    const fc = flowcharts.find((f) => f.id === flowchartId);
    const current = fc?.tags ?? [];
    const next = current.includes(tagId)
      ? current.filter((t) => t !== tagId)
      : [...current, tagId];
    setFlowcharts((prev) => prev.map((f) => (f.id === flowchartId ? { ...f, tags: next } : f)));
    try {
      await flowchartStorage.setTags(flowchartId, next);
    } catch {
      loadList();
    }
  }, [flowcharts, loadList]);

  const removeFlowchartTag = useCallback(async (flowchartId: string, tagId: string) => {
    const fc = flowcharts.find((f) => f.id === flowchartId);
    const next = (fc?.tags ?? []).filter((t) => t !== tagId);
    setFlowcharts((prev) => prev.map((f) => (f.id === flowchartId ? { ...f, tags: next } : f)));
    try {
      await flowchartStorage.setTags(flowchartId, next);
    } catch {
      loadList();
    }
  }, [flowcharts, loadList]);

  const handleNodeSelect = useCallback((nodeId: string, nodeTitle: string) => {
    setSelectedNode({ id: nodeId, title: nodeTitle });
  }, []);

  const handleNodeDeselect = useCallback(() => {
    setSelectedNode(null);
    setPopup(null);
  }, []);

  const handleNodeAction = useCallback((action: NodeAction, nodeId: string, nodeTitle: string, anchorRect?: DOMRect) => {
    if (!activeFlowchart) return;

    switch (action) {
      case 'write-note':
        navigate(`/note/new?subject=${encodeURIComponent(nodeTitle)}`);
        break;
      case 'view-notes':
        setSelectedNode({ id: nodeId, title: nodeTitle });
        if (anchorRect) {
          setPopup({ type: 'notes', nodeId, nodeTitle, anchorRect });
          noteStorage.getAll().then((all) => {
            setPopupNotes(all.filter((n) => n.subject === nodeTitle || n.subject === nodeId));
          });
        }
        break;
      case 'attach-file':
        setSelectedNode({ id: nodeId, title: nodeTitle });
        setShowBookPicker(true);
        break;
      case 'view-attachments':
        setSelectedNode({ id: nodeId, title: nodeTitle });
        if (anchorRect) {
          setPopup({ type: 'attachments', nodeId, nodeTitle, anchorRect });
          attachmentStorage.getByNode(activeFlowchart.id, nodeId).then(setPopupAttachments).catch(() => setPopupAttachments([]));
        }
        break;
      case 'add-question':
        setSelectedNode({ id: nodeId, title: nodeTitle });
        if (anchorRect) {
          setPopup({ type: 'questions', nodeId, nodeTitle, anchorRect });
          setShowPopupQuestionForm(false);
          setPopupQuestionText('');
          questionStorage.getByNode(nodeId, activeFlowchart.id).then(setPopupQuestions).catch(() => setPopupQuestions([]));
        }
        break;
    }
  }, [activeFlowchart, navigate]);

  const handleBookSelected = useCallback(async (book: AttachmentMeta) => {
    if (!selectedNode || !activeFlowchart) return;
    await attachmentStorage.attachNode(book.id, activeFlowchart.id, selectedNode.id);
    setShowBookPicker(false);
    refreshCounts();
  }, [selectedNode, activeFlowchart, refreshCounts]);

  const closePopup = useCallback(() => {
    setPopup(null);
    setShowPopupQuestionForm(false);
    setPopupQuestionText('');
  }, []);

  const handlePopupOpenFile = useCallback((file: AttachmentMeta) => {
    if (!activeFlowchart || !popup) return;
    if (file.type === 'application/pdf') {
      const params = new URLSearchParams();
      params.set('subject', popup.nodeTitle);
      params.set('flowchart', activeFlowchart.id);
      navigate(`/pdf/${file.id}?${params.toString()}`);
    } else {
      attachmentStorage.openFile(file.id);
    }
  }, [activeFlowchart, popup, navigate]);

  const handlePopupSaveQuestion = useCallback(async () => {
    if (!popupQuestionText.trim() || !popup || !activeFlowchart) return;
    const q: Question = {
      id: crypto.randomUUID(),
      text: popupQuestionText.trim(),
      nodeId: popup.nodeId,
      nodeTitle: popup.nodeTitle,
      flowchartId: activeFlowchart.id,
      flowchartName: activeFlowchart.name,
      checked: false,
      createdAt: new Date().toISOString(),
    };
    await questionStorage.save(q);
    setPopupQuestions((prev) => [...prev, q]);
    setPopupQuestionText('');
    setShowPopupQuestionForm(false);
    refreshCounts();
  }, [popupQuestionText, popup, activeFlowchart, refreshCounts]);

  const handlePopupToggleQuestion = useCallback(async (id: string, checked: boolean) => {
    await questionStorage.setChecked(id, checked);
    setPopupQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, checked } : q)));
  }, []);

  const handlePopupRemoveAttachment = useCallback(async (fileId: string) => {
    if (!popup || !activeFlowchart) return;
    await attachmentStorage.detachNode(fileId, activeFlowchart.id, popup.nodeId);
    setPopupAttachments((prev) => prev.filter((f) => f.id !== fileId));
    refreshCounts();
  }, [popup, activeFlowchart, refreshCounts]);

  const handlePopupAttach = useCallback(() => {
    setPopup(null);
    setShowBookPicker(true);
  }, []);

  // ── Derived list-view data ──

  const tagsById = useMemo(() => {
    const map = new Map<string, FlowchartTag>();
    for (const t of tags) map.set(t.id, t);
    return map;
  }, [tags]);

  const filteredFlowcharts = useMemo(() => {
    let result = flowcharts;
    if (tagFilter) result = result.filter((f) => f.tags?.includes(tagFilter));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.description?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [flowcharts, tagFilter, searchQuery]);

  const sortedFlowcharts = useMemo(() => {
    return [...filteredFlowcharts].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'created':
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
        case 'updated':
          cmp = a.updatedAt.localeCompare(b.updatedAt);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredFlowcharts, sortField, sortDir]);

  const flowchartContextMenuItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const fc = flowcharts.find((f) => f.id === contextMenu.flowchart.id) ?? contextMenu.flowchart;
    const items: ContextMenuItem[] = [
      { label: 'Open', onClick: () => selectFlowchart(fc.id) },
      { label: 'Rename', onClick: () => startRename(fc) },
      { label: 'Edit details…', onClick: () => handleEditFlowchart(fc.id) },
    ];
    for (const tag of tags) {
      items.push({
        label: tag.name,
        checked: fc.tags?.includes(tag.id) ?? false,
        keepOpen: true,
        onClick: () => handleToggleFlowchartTag(fc.id, tag.id),
      });
    }
    items.push({ label: 'Delete', danger: true, onClick: () => handleDeleteFlowchart(fc.id) });
    return items;
  }, [contextMenu, flowcharts, tags, selectFlowchart, startRename, handleEditFlowchart, handleToggleFlowchartTag, handleDeleteFlowchart]);

  // ── Detail view ──

  if (activeId && activeFlowchart) {
    return (
      <div className={styles.viewPage}>
        <div className={styles.viewHeader}>
          <button className={styles.backButton} onClick={goBack}>
            <ArrowLeftIcon size={14} /> All Flowcharts
          </button>
          <h2 className={styles.viewTitle}>{activeFlowchart.name}</h2>
        </div>

        <div className={styles.viewBody}>
          <div className={styles.chartArea}>
            <FlowchartEditor
              flowchartId={activeFlowchart.id}
              initialSpec={activeFlowchart.spec}
              flowchartName={activeFlowchart.name}
              flowchartDescription={activeFlowchart.description}
              onNodeSelect={handleNodeSelect}
              onNodeDeselect={handleNodeDeselect}
              onNodeAction={handleNodeAction}
              nodeCounts={nodeCounts}
            />
          </div>

          {selectedNode && (
            <NodeActionPanel
              nodeId={selectedNode.id}
              nodeTitle={selectedNode.title}
              flowchartId={activeFlowchart.id}
              flowchartName={activeFlowchart.name}
              onClose={handleNodeDeselect}
            />
          )}
        </div>

        {popup && (
          <NodePopup
            anchorRect={popup.anchorRect}
            title={popup.type === 'attachments' ? 'Attachments' : popup.type === 'notes' ? 'Notes' : 'Questions'}
            onClose={closePopup}
          >
            {popup.type === 'attachments' && (
              <>
                <div className={popupStyles.itemList}>
                  {popupAttachments.length === 0 && (
                    <p className={popupStyles.emptyText}>No linked files</p>
                  )}
                  {popupAttachments.map((file) => (
                    <div key={file.id} className={popupStyles.item}>
                      <button className={popupStyles.itemLink} onClick={() => handlePopupOpenFile(file)}>
                        {stripExtension(file.filename)}
                      </button>
                      <button
                        className={popupStyles.removeBtn}
                        onClick={() => handlePopupRemoveAttachment(file.id)}
                        aria-label={`Remove ${file.filename}`}
                        title="Remove from node"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
                <div className={popupStyles.actionRow}>
                  <button className={popupStyles.actionBtn} onClick={handlePopupAttach}>+ Attach</button>
                </div>
              </>
            )}

            {popup.type === 'notes' && (
              <>
                <div className={popupStyles.itemList}>
                  {popupNotes.length === 0 && (
                    <p className={popupStyles.emptyText}>No linked notes</p>
                  )}
                  {popupNotes.map((note) => (
                    <div key={note.id} className={popupStyles.item}>
                      <button className={popupStyles.itemLink} onClick={() => navigate(`/note/${note.id}`)}>
                        {note.title || 'Untitled'}
                      </button>
                      <span className={popupStyles.itemMeta}>{note.status}</span>
                    </div>
                  ))}
                </div>
                <div className={popupStyles.actionRow}>
                  <button className={popupStyles.actionBtn} onClick={() => navigate(`/note/new?subject=${encodeURIComponent(popup.nodeTitle)}`)}>
                    + New
                  </button>
                  {popupNotes.length > 0 && (
                    <button className={popupStyles.actionBtn} onClick={() => navigate(`/notes?subject=${encodeURIComponent(popup.nodeTitle)}`)}>
                      View all &rarr;
                    </button>
                  )}
                </div>
              </>
            )}

            {popup.type === 'questions' && (
              <>
                <div className={popupStyles.itemList}>
                  {popupQuestions.length === 0 && !showPopupQuestionForm && (
                    <p className={popupStyles.emptyText}>No questions</p>
                  )}
                  {popupQuestions.map((q) => (
                    <div key={q.id} className={popupStyles.item}>
                      <input
                        type="checkbox"
                        className={popupStyles.itemCheck}
                        checked={q.checked}
                        onChange={(e) => handlePopupToggleQuestion(q.id, e.target.checked)}
                      />
                      <span className={popupStyles.itemText} style={q.checked ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                        {q.text}
                      </span>
                    </div>
                  ))}
                </div>
                {showPopupQuestionForm && (
                  <div className={popupStyles.questionForm}>
                    <textarea
                      className={popupStyles.questionTextarea}
                      placeholder="Enter your question..."
                      value={popupQuestionText}
                      onChange={(e) => setPopupQuestionText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePopupSaveQuestion();
                      }}
                      autoFocus
                    />
                    <div className={popupStyles.questionActions}>
                      <button className={popupStyles.questionBtn} onClick={() => { setShowPopupQuestionForm(false); setPopupQuestionText(''); }}>
                        Cancel
                      </button>
                      <button
                        className={`${popupStyles.questionBtn} ${popupStyles.questionBtnPrimary}`}
                        onClick={handlePopupSaveQuestion}
                        disabled={!popupQuestionText.trim()}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
                <div className={popupStyles.actionRow}>
                  <button className={popupStyles.actionBtn} onClick={() => setShowPopupQuestionForm(true)}>+ Add</button>
                </div>
              </>
            )}
          </NodePopup>
        )}

        {showBookPicker && (
          <BookPicker
            onSelect={handleBookSelected}
            onCancel={() => setShowBookPicker(false)}
          />
        )}
      </div>
    );
  }

  // ── Not found ──

  if (activeId && !activeFlowchart && !loading) {
    return (
      <div className={styles.page}>
        <p>Flowchart not found.</p>
        <button className={styles.backButton} onClick={goBack}>
          Back to list
        </button>
      </div>
    );
  }

  // ── List view ──

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Loading flowcharts...</p>
      </div>
    );
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return (
      <span className={styles.sortArrow}>
        {sortDir === 'asc' ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
      </span>
    );
  };

  const renderTagChips = (fc: FlowchartSummary) => {
    if (!fc.tags || fc.tags.length === 0) return null;
    return (
      <span className={styles.tagChipRow}>
        {fc.tags.map((tid) => {
          const tag = tagsById.get(tid);
          if (!tag) return null;
          return (
            <span
              key={tid}
              className={styles.tagChip}
              style={tag.color ? { backgroundColor: tag.color, color: '#fff' } : undefined}
              onClick={(e) => e.stopPropagation()}
            >
              {tag.name}
              <button
                type="button"
                className={styles.tagChipRemove}
                title={`Remove "${tag.name}"`}
                aria-label={`Remove ${tag.name}`}
                onClick={(e) => { e.stopPropagation(); removeFlowchartTag(fc.id, tid); }}
              >
                ×
              </button>
            </span>
          );
        })}
      </span>
    );
  };

  // Open the flowchart unless the click landed on an interactive child.
  const handleCardClick = (fc: FlowchartSummary, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, button')) return;
    selectFlowchart(fc.id);
  };

  const openContextMenu = (e: React.MouseEvent, fc: FlowchartSummary) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, flowchart: fc });
    setTagContextMenu(null);
  };

  const renderRenameInput = () => (
    <input
      ref={renameInputRef}
      className={styles.renameInput}
      value={renameValue}
      onChange={(e) => setRenameValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commitRename();
        if (e.key === 'Escape') cancelRename();
      }}
      onBlur={commitRename}
      onClick={(e) => e.stopPropagation()}
    />
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Flowcharts</h1>
        <div className={styles.headerActions}>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewToggleBtn} ${viewMode === 'card' ? styles.viewToggleActive : ''}`}
              onClick={() => setViewMode('card')}
              title="Card view"
              aria-label="Card view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="1" width="6" height="6" rx="1" />
                <rect x="9" y="1" width="6" height="6" rx="1" />
                <rect x="1" y="9" width="6" height="6" rx="1" />
                <rect x="9" y="9" width="6" height="6" rx="1" />
              </svg>
            </button>
            <button
              className={`${styles.viewToggleBtn} ${viewMode === 'list' ? styles.viewToggleActive : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
              aria-label="List view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="1" y1="3" x2="15" y2="3" />
                <line x1="1" y1="8" x2="15" y2="8" />
                <line x1="1" y1="13" x2="15" y2="13" />
              </svg>
            </button>
          </div>
          <button className={styles.importButton} onClick={() => setShowCreate(true)}>
            Import JSON
          </button>
        </div>
      </div>

      <div className={styles.layout}>
        {/* Sidebar: All + tags */}
        <nav className={styles.sidebar}>
          <button
            className={`${styles.sidebarItem} ${tagFilter === null ? styles.sidebarItemActive : ''}`}
            onClick={() => setTagFilter(null)}
          >
            All
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
          {tags.map((tag) => (
            <div key={tag.id}>
              {renamingTagId === tag.id ? (
                <input
                  ref={renameTagInputRef}
                  className={styles.sidebarRenameInput}
                  value={renameTagValue}
                  onChange={(e) => setRenameTagValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRenameTag();
                    if (e.key === 'Escape') cancelRenameTag();
                  }}
                  onBlur={commitRenameTag}
                />
              ) : (
                <button
                  className={`${styles.sidebarItem} ${tagFilter === tag.id ? styles.sidebarItemActive : ''}`}
                  onClick={() => setTagFilter((prev) => (prev === tag.id ? null : tag.id))}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTagContextMenu({ x: e.clientX, y: e.clientY, tag });
                    setContextMenu(null);
                  }}
                  title={`Filter by ${tag.name}`}
                >
                  <span
                    className={styles.sidebarTagDot}
                    style={tag.color ? { backgroundColor: tag.color } : undefined}
                    aria-hidden="true"
                  />
                  {tag.name}
                </button>
              )}
            </div>
          ))}
          {creatingTag ? (
            <input
              ref={newTagInputRef}
              className={styles.sidebarRenameInput}
              value={newTagName}
              placeholder="Tag name"
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTag();
                if (e.key === 'Escape') {
                  setCreatingTag(false);
                  setNewTagName('');
                }
              }}
              onBlur={handleCreateTag}
            />
          ) : (
            <button className={styles.newFolderBtn} onClick={() => setCreatingTag(true)}>
              + New Tag
            </button>
          )}
        </nav>

        {/* Main content */}
        <div className={styles.content}>
          {flowcharts.length > 0 && (
            <div className={styles.searchRow}>
              <SearchBar ref={searchInputRef} value={searchQuery} onChange={setSearchQuery} placeholder="Search flowcharts…" />
            </div>
          )}

          {flowcharts.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No flowcharts yet</p>
              <p className={styles.emptyText}>Import one with the “Import JSON” button above.</p>
            </div>
          ) : sortedFlowcharts.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>
                {tagFilter && !searchQuery ? 'No flowcharts with this tag' : 'No matching flowcharts'}
              </p>
              <p className={styles.emptyText}>
                {tagFilter && !searchQuery
                  ? 'Right-click a flowchart to apply this tag.'
                  : 'Try adjusting your search or filter.'}
              </p>
            </div>
          ) : viewMode === 'card' ? (
            <div className={styles.cardList}>
              {sortedFlowcharts.map((fc) => (
                <article
                  key={fc.id}
                  className={styles.card}
                  onClick={(e) => handleCardClick(fc, e)}
                  onContextMenu={(e) => openContextMenu(e, fc)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renamingId !== fc.id) selectFlowchart(fc.id);
                  }}
                >
                  <div className={styles.cardTitle}>
                    {renamingId === fc.id ? renderRenameInput() : fc.name}
                  </div>
                  {fc.description && <p className={styles.cardDesc}>{fc.description}</p>}
                  <div className={styles.cardMeta}>
                    {renderTagChips(fc)}
                    <span className={styles.cardDates}>
                      <span title="Last updated">{formatDate(fc.updatedAt)}</span>
                      <span className={styles.cardDatesSep} aria-hidden="true" />
                      <span title="Created">{formatDate(fc.createdAt)}</span>
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.listContainer}>
              <table className={styles.listTable}>
                <thead>
                  <tr className={styles.listHeaderRow}>
                    <th className={styles.listHeaderCell} onClick={() => handleSort('name')}>
                      Name{sortIndicator('name')}
                    </th>
                    <th className={styles.listHeaderCell}>Tags</th>
                    <th className={styles.listHeaderCell} onClick={() => handleSort('created')}>
                      Created{sortIndicator('created')}
                    </th>
                    <th className={styles.listHeaderCell} onClick={() => handleSort('updated')}>
                      Updated{sortIndicator('updated')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFlowcharts.map((fc) => (
                    <tr
                      key={fc.id}
                      className={styles.listRow}
                      onClick={(e) => handleCardClick(fc, e)}
                      onContextMenu={(e) => openContextMenu(e, fc)}
                    >
                      <td className={styles.listNameCell}>
                        {renamingId === fc.id ? renderRenameInput() : (
                          <span className={styles.listFileName}>{fc.name}</span>
                        )}
                      </td>
                      <td className={styles.listCell}>{renderTagChips(fc)}</td>
                      <td className={styles.listCell}>{formatDate(fc.createdAt)}</td>
                      <td className={styles.listCell}>{formatDate(fc.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Context menus */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={flowchartContextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
      {tagContextMenu && (
        <ContextMenu
          x={tagContextMenu.x}
          y={tagContextMenu.y}
          items={[
            { label: 'Rename', onClick: () => startRenameTag(tagContextMenu.tag) },
            { label: 'Delete tag', onClick: () => handleDeleteTag(tagContextMenu.tag.id), danger: true },
          ]}
          onClose={() => setTagContextMenu(null)}
        />
      )}

      {showCreate && (
        <FlowchartFormModal tags={tags} onClose={() => setShowCreate(false)} onSaved={handleCreated} />
      )}
      {editing && (
        <FlowchartFormModal existing={editing} tags={tags} onClose={() => setEditing(null)} onSaved={handleEdited} />
      )}
    </div>
  );
}
