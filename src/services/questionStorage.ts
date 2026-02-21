import type { Question } from '../types/question';

const STORAGE_KEY = 'scribe_questions';

export const questionStorage = {
  getAll(): Question[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  },

  save(question: Question): void {
    const questions = this.getAll();
    const index = questions.findIndex(q => q.id === question.id);
    if (index >= 0) {
      questions[index] = question;
    } else {
      questions.push(question);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
  },

  setChecked(id: string, checked: boolean): void {
    const questions = this.getAll();
    const q = questions.find(q => q.id === id);
    if (q) {
      q.checked = checked;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
    }
  },

  delete(id: string): void {
    const questions = this.getAll().filter(q => q.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
  },

  getByNode(nodeId: string, flowchartId: string): Question[] {
    return this.getAll().filter(
      q => q.nodeId === nodeId && q.flowchartId === flowchartId,
    );
  },

  getCountsByNode(flowchartId: string): Record<string, number> {
    const counts: Record<string, number> = {};
    this.getAll()
      .filter(q => q.flowchartId === flowchartId)
      .forEach(q => {
        counts[q.nodeId] = (counts[q.nodeId] || 0) + 1;
      });
    return counts;
  },
};
