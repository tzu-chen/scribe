import type { PdfHighlight, PdfComment, HighlightRect } from '../types/annotation';

export const annotationStorage = {
  async getHighlightsByAttachment(attachmentId: string): Promise<PdfHighlight[]> {
    const res = await fetch(`/api/annotations/highlights?attachmentId=${encodeURIComponent(attachmentId)}`);
    if (!res.ok) throw new Error(`Failed to fetch highlights: ${res.status}`);
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
    if (!res.ok) throw new Error(`Failed to add highlight: ${res.status}`);
    return res.json();
  },

  async deleteHighlight(id: string): Promise<void> {
    const res = await fetch(`/api/annotations/highlights/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete highlight: ${res.status}`);
  },

  async getCommentsByHighlight(highlightId: string): Promise<PdfComment[]> {
    const res = await fetch(`/api/annotations/comments?highlightId=${encodeURIComponent(highlightId)}`);
    if (!res.ok) throw new Error(`Failed to fetch comments: ${res.status}`);
    return res.json();
  },

  async getCommentsByAttachment(attachmentId: string): Promise<PdfComment[]> {
    const res = await fetch(`/api/annotations/comments?attachmentId=${encodeURIComponent(attachmentId)}`);
    if (!res.ok) throw new Error(`Failed to fetch comments: ${res.status}`);
    return res.json();
  },

  async addComment(highlightId: string, attachmentId: string, text: string): Promise<PdfComment> {
    const res = await fetch('/api/annotations/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ highlightId, attachmentId, text }),
    });
    if (!res.ok) throw new Error(`Failed to add comment: ${res.status}`);
    return res.json();
  },

  async updateComment(id: string, text: string): Promise<void> {
    const res = await fetch(`/api/annotations/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Failed to update comment: ${res.status}`);
  },

  async deleteComment(id: string): Promise<void> {
    const res = await fetch(`/api/annotations/comments/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete comment: ${res.status}`);
  },

  async deleteCommentsByHighlight(highlightId: string): Promise<void> {
    const res = await fetch(`/api/annotations/comments?highlightId=${encodeURIComponent(highlightId)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete comments: ${res.status}`);
  },
};
