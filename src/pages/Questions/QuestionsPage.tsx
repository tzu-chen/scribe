import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { questionStorage } from '../../services/questionStorage';
import type { Question } from '../../types/question';
import styles from './QuestionsPage.module.css';

export function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);

  const reload = useCallback(() => {
    setQuestions(questionStorage.getAll());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleToggle = useCallback((id: string, checked: boolean) => {
    questionStorage.setChecked(id, checked);
    setQuestions(prev =>
      prev.map(q => (q.id === id ? { ...q, checked } : q)),
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    questionStorage.delete(id);
    setQuestions(prev => prev.filter(q => q.id !== id));
  }, []);

  // Group questions by flowchart then by node
  const grouped = questions.reduce<
    Record<string, Record<string, Question[]>>
  >((acc, q) => {
    if (!acc[q.flowchartId]) acc[q.flowchartId] = {};
    if (!acc[q.flowchartId][q.nodeId]) acc[q.flowchartId][q.nodeId] = [];
    acc[q.flowchartId][q.nodeId].push(q);
    return acc;
  }, {});

  const flowchartIds = Object.keys(grouped);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Questions</h1>
      {questions.length === 0 ? (
        <p className={styles.empty}>
          No questions yet. Add questions to flowchart nodes using the{' '}
          <Link to="/flowcharts">Flowcharts</Link> page.
        </p>
      ) : (
        <div className={styles.content}>
          {flowchartIds.map(flowchartId => {
            const nodeMap = grouped[flowchartId];
            const nodeIds = Object.keys(nodeMap);
            // Get flowchart name from the first question
            const flowchartName =
              nodeMap[nodeIds[0]][0]?.flowchartName ?? flowchartId;

            return (
              <section key={flowchartId} className={styles.flowchartSection}>
                <h2 className={styles.flowchartName}>
                  <Link
                    to={`/flowcharts?view=${encodeURIComponent(flowchartId)}`}
                    className={styles.flowchartLink}
                  >
                    {flowchartName}
                  </Link>
                </h2>
                {nodeIds.map(nodeId => {
                  const nodeQuestions = nodeMap[nodeId];
                  const nodeTitle = nodeQuestions[0]?.nodeTitle ?? nodeId;

                  return (
                    <div key={nodeId} className={styles.nodeGroup}>
                      <h3 className={styles.nodeTitle}>{nodeTitle}</h3>
                      <ul className={styles.questionList}>
                        {nodeQuestions.map(q => (
                          <li key={q.id} className={styles.questionItem}>
                            <label className={styles.questionLabel}>
                              <input
                                type="checkbox"
                                className={styles.checkbox}
                                checked={q.checked}
                                onChange={e =>
                                  handleToggle(q.id, e.target.checked)
                                }
                              />
                              <span
                                className={`${styles.questionText} ${q.checked ? styles.questionChecked : ''}`}
                              >
                                {q.text}
                              </span>
                            </label>
                            <button
                              className={styles.deleteBtn}
                              onClick={() => handleDelete(q.id)}
                              aria-label="Delete question"
                              title="Delete"
                            >
                              &times;
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
