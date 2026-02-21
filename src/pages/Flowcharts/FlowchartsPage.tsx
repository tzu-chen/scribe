import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { attachmentStorage } from '../../services/attachmentStorage';
import { BookPicker } from '../../components/BookPicker/BookPicker';
import { useTheme } from '../../contexts/ThemeContext';
import type { AttachmentMeta } from '../../types/attachment';
import styles from './FlowchartsPage.module.css';

interface FlowchartEntry {
  id: string;
  name: string;
  filename: string;
  description?: string;
}

interface NodeSelection {
  nodeId: string;
  nodeTitle: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FlowchartsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [flowcharts, setFlowcharts] = useState<FlowchartEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setSelectedNode] = useState<NodeSelection | null>(null);
  const [attachmentPanel, setAttachmentPanel] = useState<{
    subject: string;
    files: AttachmentMeta[];
  } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [bookPickerSubject, setBookPickerSubject] = useState<string | null>(null);

  const { theme } = useTheme();
  const activeFlowchart = searchParams.get('view');

  useEffect(() => {
    fetch('/flowchart/index.json')
      .then(res => res.json())
      .then(data => setFlowcharts(data.flowcharts))
      .catch(err => console.error('Failed to load flowchart manifest:', err))
      .finally(() => setLoading(false));
  }, []);

  const sendAttachmentCounts = useCallback(async () => {
    try {
      const counts = await attachmentStorage.getCountsBySubject();
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'attachment-counts', counts },
        '*',
      );
    } catch (err) {
      console.error('Failed to send attachment counts:', err);
    }
  }, []);

  /**
   * Inject the shared theme CSS and JS files into the iframe document.
   * These files live alongside the flowchart HTML files in /flowchart/ so
   * they apply automatically to any flowchart without modifying the HTML.
   */
  const injectThemeAssets = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    if (!doc.getElementById('flowchart-theme-css')) {
      const link = doc.createElement('link');
      link.id = 'flowchart-theme-css';
      link.rel = 'stylesheet';
      link.href = '/flowchart/flowchart-theme.css';
      doc.head.appendChild(link);
    }

    if (!doc.getElementById('flowchart-theme-js')) {
      const script = doc.createElement('script');
      script.id = 'flowchart-theme-js';
      script.src = '/flowchart/flowchart-theme.js';
      doc.head.appendChild(script);
    }
  }, []);

  /**
   * Mirror the app's data-theme attribute onto the iframe's <html> element.
   * Because the iframe is same-origin, we can set the attribute directly —
   * no postMessage needed. The injected CSS and JS react to this attribute.
   */
  const applyThemeToIframe = useCallback(() => {
    const htmlEl = iframeRef.current?.contentDocument?.documentElement;
    if (!htmlEl) return;
    if (theme === 'dark') {
      htmlEl.setAttribute('data-theme', 'dark');
    } else {
      htmlEl.removeAttribute('data-theme');
    }
  }, [theme]);

  /* Re-apply theme whenever the user toggles it while the iframe is visible. */
  useEffect(() => {
    applyThemeToIframe();
  }, [applyThemeToIframe]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data?.type) return;

      if (data.type === 'node-selected') {
        setSelectedNode({ nodeId: data.nodeId, nodeTitle: data.nodeTitle });
        setAttachmentPanel(null);
      } else if (data.type === 'node-deselected') {
        setSelectedNode(null);
        setAttachmentPanel(null);
      } else if (data.type === 'node-action') {
        const { action, nodeTitle } = data as {
          action: string;
          nodeId: string;
          nodeTitle: string;
        };

        switch (action) {
          case 'write-note':
            navigate(`/note/new?subject=${encodeURIComponent(nodeTitle)}`);
            break;
          case 'attach-file':
            setBookPickerSubject(nodeTitle);
            break;
          case 'view-attachments':
            attachmentStorage.getBySubject(nodeTitle).then(files => {
              setAttachmentPanel({ subject: nodeTitle, files });
            });
            break;
          case 'view-notes':
            navigate(`/notes?subject=${encodeURIComponent(nodeTitle)}`);
            break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [navigate]);

  const handleBookSelected = useCallback(
    async (book: AttachmentMeta) => {
      if (bookPickerSubject === null) return;
      await attachmentStorage.updateSubject(book.id, bookPickerSubject);
      await sendAttachmentCounts();
      setBookPickerSubject(null);
    },
    [bookPickerSubject, sendAttachmentCounts],
  );

  const handleBookPickerCancel = useCallback(() => {
    setBookPickerSubject(null);
  }, []);

  const handleOpenFile = useCallback(
    async (file: AttachmentMeta) => {
      if (file.type === 'application/pdf') {
        const params = new URLSearchParams();
        if (attachmentPanel?.subject) {
          params.set('subject', attachmentPanel.subject);
        }
        if (activeFlowchart) {
          params.set('flowchart', activeFlowchart);
        }
        const qs = params.toString();
        navigate(`/pdf/${file.id}${qs ? `?${qs}` : ''}`);
      } else {
        await attachmentStorage.openFile(file.id);
      }
    },
    [navigate, attachmentPanel, activeFlowchart],
  );

  const handleDeleteAttachment = useCallback(
    async (id: string) => {
      if (!attachmentPanel) return;
      await attachmentStorage.delete(id);
      const files = await attachmentStorage.getBySubject(attachmentPanel.subject);
      setAttachmentPanel(prev => (prev ? { ...prev, files } : null));
      await sendAttachmentCounts();
    },
    [attachmentPanel, sendAttachmentCounts],
  );

  const closeAttachmentPanel = useCallback(() => {
    setAttachmentPanel(null);
  }, []);

  const selectFlowchart = (id: string) => {
    setSearchParams({ view: id });
    setSelectedNode(null);
    setAttachmentPanel(null);
  };

  const goBack = () => {
    setSearchParams({});
    setSelectedNode(null);
    setAttachmentPanel(null);
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Loading flowcharts...</p>
      </div>
    );
  }

  if (activeFlowchart) {
    const flowchart = flowcharts.find(f => f.id === activeFlowchart);
    if (!flowchart) {
      return (
        <div className={styles.page}>
          <p>Flowchart not found.</p>
          <button className={styles.backButton} onClick={goBack}>
            Back to list
          </button>
        </div>
      );
    }

    return (
      <div className={styles.viewPage}>
        <div className={styles.viewHeader}>
          <button className={styles.backButton} onClick={goBack}>
            &larr; All Flowcharts
          </button>
          <h2 className={styles.viewTitle}>{flowchart.name}</h2>
        </div>
        <div className={styles.iframeContainer}>
          <iframe
            ref={iframeRef}
            src={`/flowchart/${flowchart.filename}`}
            className={styles.iframe}
            title={flowchart.name}
            onLoad={() => {
              injectThemeAssets();
              applyThemeToIframe();
              void sendAttachmentCounts();
            }}
          />
        </div>

        {bookPickerSubject !== null && (
          <BookPicker
            onSelect={handleBookSelected}
            onCancel={handleBookPickerCancel}
          />
        )}

        {attachmentPanel && (
          <div
            className={styles.attachmentOverlay}
            onClick={closeAttachmentPanel}
          >
            <div
              className={styles.attachmentPanel}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.attachmentHeader}>
                <h3 className={styles.attachmentTitle}>
                  Attachments: {attachmentPanel.subject}
                </h3>
                <button
                  className={styles.attachmentClose}
                  onClick={closeAttachmentPanel}
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>
              {attachmentPanel.files.length === 0 ? (
                <p className={styles.attachmentEmpty}>
                  No files attached yet.
                </p>
              ) : (
                <ul className={styles.attachmentList}>
                  {attachmentPanel.files.map(file => (
                    <li key={file.id} className={styles.attachmentItem}>
                      <button
                        className={styles.attachmentFilename}
                        onClick={() => handleOpenFile(file)}
                        title={`Open ${file.filename}`}
                      >
                        {file.filename}
                      </button>
                      <span className={styles.attachmentSize}>
                        {formatFileSize(file.size)}
                      </span>
                      <button
                        className={styles.attachmentDelete}
                        onClick={() => handleDeleteAttachment(file.id)}
                        title="Remove attachment"
                      >
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Flowcharts</h1>
      {flowcharts.length === 0 ? (
        <p className={styles.empty}>No flowcharts available.</p>
      ) : (
        <div className={styles.grid}>
          {flowcharts.map(fc => (
            <article
              key={fc.id}
              className={styles.card}
              onClick={() => selectFlowchart(fc.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter') selectFlowchart(fc.id);
              }}
            >
              <h3 className={styles.cardTitle}>{fc.name}</h3>
              {fc.description && (
                <p className={styles.cardDesc}>{fc.description}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
