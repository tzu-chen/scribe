import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { FlowchartSummary, Flowchart, FlowchartSpec } from '../../types/flowchart';
import type { Note } from '../../types/note';
import type { AttachmentMeta } from '../../types/attachment';
import type { Question } from '../../types/question';
import { flowchartStorage } from '../../services/flowchartStorage';
import { noteStorage } from '../../services/noteStorage';
import { attachmentStorage } from '../../services/attachmentStorage';
import { questionStorage } from '../../services/questionStorage';
import { FlowchartEditor } from '../../components/FlowchartEditor/FlowchartEditor';
import type { NodeAction, NodeCounts } from '../../components/FlowchartRenderer/FlowchartRenderer';
import { BookPicker } from '../../components/BookPicker/BookPicker';
import { ArrowLeftIcon, CloseIcon } from '../../components/Icons/Icons';
import { stripExtension } from '../../utils/filename';
import { NodePopup } from '../../components/NodePopup/NodePopup';
import popupStyles from '../../components/NodePopup/NodePopup.module.css';
import styles from './FlowchartsPage.module.css';

// ─── Import JSON Modal ───

interface ImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

function ImportModal({ onClose, onImported }: ImportModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [specJson, setSpecJson] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!name.trim() || !specJson.trim()) return;

    let spec: FlowchartSpec;
    try {
      spec = JSON.parse(specJson);
    } catch {
      setError('Invalid JSON');
      return;
    }

    setImporting(true);
    setError('');
    try {
      await flowchartStorage.create({
        name: name.trim(),
        description: description.trim() || undefined,
        spec,
      });
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setImporting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modalPanel}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Import Flowchart JSON</h3>
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
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Spec JSON</label>
            <textarea
              className={styles.modalTextarea}
              value={specJson}
              onChange={(e) => { setSpecJson(e.target.value); setError(''); }}
              placeholder='Paste FlowchartSpec JSON here...'
            />
          </div>
          {error && <p className={styles.modalError}>{error}</p>}
          <div className={styles.modalActions}>
            <button className={styles.modalButton} onClick={onClose}>Cancel</button>
            <button
              className={`${styles.modalButton} ${styles.modalButtonPrimary}`}
              onClick={handleImport}
              disabled={!name.trim() || !specJson.trim() || importing}
            >
              {importing ? 'Importing...' : 'Import'}
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

    // Attachments by subject
    attachmentStorage.getBySubject(nodeTitle).then(setAttachments).catch(() => setAttachments([]));

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
    await attachmentStorage.updateSubject(book.id, nodeTitle);
    const updated = await attachmentStorage.getBySubject(nodeTitle);
    setAttachments(updated);
    setShowBookPicker(false);
  };

  const handleRemoveAttachment = async (fileId: string) => {
    await attachmentStorage.updateSubject(fileId, '');
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
  const [activeFlowchart, setActiveFlowchart] = useState<Flowchart | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [selectedNode, setSelectedNode] = useState<{ id: string; title: string } | null>(null);
  const [nodeCounts, setNodeCounts] = useState<NodeCounts>({ attachments: {}, questions: {} });
  const [showBookPicker, setShowBookPicker] = useState(false);

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

  useEffect(() => {
    loadList();
  }, [loadList]);

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
      attachmentStorage.getCountsBySubject(),
      questionStorage.getCountsByNode(activeId),
    ]).then(([attachCounts, qCounts]) => {
      setNodeCounts({ attachments: attachCounts, questions: qCounts });
    });
  }, [activeId]);

  const refreshCounts = useCallback(() => {
    if (!activeId) return;
    Promise.all([
      attachmentStorage.getCountsBySubject(),
      questionStorage.getCountsByNode(activeId),
    ]).then(([attachCounts, qCounts]) => {
      setNodeCounts({ attachments: attachCounts, questions: qCounts });
    });
  }, [activeId]);

  const selectFlowchart = (id: string) => {
    setSearchParams({ view: id });
    setSelectedNode(null);
  };

  const goBack = () => {
    setSearchParams({});
    setSelectedNode(null);
    setActiveFlowchart(null);
  };

  const handleImported = () => {
    setShowImport(false);
    loadList();
  };

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
          attachmentStorage.getBySubject(nodeTitle).then(setPopupAttachments).catch(() => setPopupAttachments([]));
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
    if (!selectedNode) return;
    await attachmentStorage.updateSubject(book.id, selectedNode.title);
    setShowBookPicker(false);
    refreshCounts();
  }, [selectedNode, refreshCounts]);

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
    await attachmentStorage.updateSubject(fileId, '');
    setPopupAttachments((prev) => prev.filter((f) => f.id !== fileId));
    refreshCounts();
  }, [refreshCounts]);

  const handlePopupAttach = useCallback(() => {
    setPopup(null);
    setShowBookPicker(true);
  }, []);

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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Flowcharts</h1>
        <div className={styles.headerActions}>
          <button className={styles.importButton} onClick={() => setShowImport(true)}>
            Import JSON
          </button>
        </div>
      </div>

      {flowcharts.length === 0 ? (
        <p className={styles.empty}>
          No flowcharts yet. Import one using the button above.
        </p>
      ) : (
        <div className={styles.grid}>
          {flowcharts.map((fc) => (
            <article
              key={fc.id}
              className={styles.card}
              onClick={() => selectFlowchart(fc.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') selectFlowchart(fc.id);
              }}
            >
              <h3 className={styles.cardTitle}>{fc.name}</h3>
              {fc.description && <p className={styles.cardDesc}>{fc.description}</p>}
            </article>
          ))}
        </div>
      )}

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={handleImported} />
      )}
    </div>
  );
}
