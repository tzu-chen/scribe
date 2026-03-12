import type { PdfHighlight, PdfComment, HighlightRect } from '../types/annotation';

export const annotationStorage = {
  async getHighlightsByAttachment(attachmentId: string): Promise<PdfHighlight[]> {
    const res = await fetch(`/api/annotations/highlights?attachmentId=${encodeURIComponent(attachmentId)}`);
    return res.json();
  },

  async addHighlight(
    attachmentId: string,
    pageNumber: number,
    rects: HighlightRect[],
    selectedText: string,
    color: string = '#ffec99',
  ): Promise<PdfHighlight> {
    const res = await fetch('/api/annotations/highlights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachmentId, pageNumber, rects, selectedText, color }),
    });
    return res.json();
  },

  async deleteHighlight(id: string): Promise<void> {
    await fetch(`/api/annotations/highlights/${id}`, { method: 'DELETE' });
  },

  async getCommentsByHighlight(highlightId: string): Promise<PdfComment[]> {
    const res = await fetch(`/api/annotations/comments?highlightId=${encodeURIComponent(highlightId)}`);
    return res.json();
  },

  async getCommentsByAttachment(attachmentId: string): Promise<PdfComment[]> {
    const res = await fetch(`/api/annotations/comments?attachmentId=${encodeURIComponent(attachmentId)}`);
    return res.json();
  },

  async addComment(highlightId: string, attachmentId: string, text: string): Promise<PdfComment> {
    const res = await fetch('/api/annotations/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ highlightId, attachmentId, text }),
    });
    return res.json();
  },

  async updateComment(id: string, text: string): Promise<void> {
    await fetch(`/api/annotations/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  },

  async deleteComment(id: string): Promise<void> {
    await fetch(`/api/annotations/comments/${id}`, { method: 'DELETE' });
  },

  async deleteCommentsByHighlight(highlightId: string): Promise<void> {
    await fetch(`/api/annotations/comments?highlightId=${encodeURIComponent(highlightId)}`, { method: 'DELETE' });
  },
};
