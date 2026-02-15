import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

export function FlowchartsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [flowcharts, setFlowcharts] = useState<FlowchartEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<NodeSelection | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const activeFlowchart = searchParams.get('view');

  useEffect(() => {
    fetch('/flowchart/index.json')
      .then(res => res.json())
      .then(data => setFlowcharts(data.flowcharts))
      .catch(err => console.error('Failed to load flowchart manifest:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'node-selected') {
        setSelectedNode({
          nodeId: event.data.nodeId,
          nodeTitle: event.data.nodeTitle,
        });
      } else if (event.data?.type === 'node-deselected') {
        setSelectedNode(null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleWriteNote = useCallback(() => {
    if (selectedNode) {
      navigate(`/note/new?subject=${encodeURIComponent(selectedNode.nodeTitle)}`);
    }
  }, [selectedNode, navigate]);

  const selectFlowchart = (id: string) => {
    setSearchParams({ view: id });
    setSelectedNode(null);
  };

  const goBack = () => {
    setSearchParams({});
    setSelectedNode(null);
  };

  if (loading) {
    return <div className={styles.page}><p className={styles.loading}>Loading flowcharts...</p></div>;
  }

  if (activeFlowchart) {
    const flowchart = flowcharts.find(f => f.id === activeFlowchart);
    if (!flowchart) {
      return (
        <div className={styles.page}>
          <p>Flowchart not found.</p>
          <button className={styles.backButton} onClick={goBack}>Back to list</button>
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
          />
        </div>
        {selectedNode && (
          <div className={styles.nodePanel}>
            <span className={styles.nodePanelTitle}>
              Selected: <strong>{selectedNode.nodeTitle}</strong>
            </span>
            <button className={styles.writeNoteButton} onClick={handleWriteNote}>
              Write note
            </button>
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
              onKeyDown={e => { if (e.key === 'Enter') selectFlowchart(fc.id); }}
            >
              <h3 className={styles.cardTitle}>{fc.name}</h3>
              {fc.description && <p className={styles.cardDesc}>{fc.description}</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
