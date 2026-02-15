import { useState, useEffect, useCallback } from 'react';
import { annotationStorage } from '../services/annotationStorage';
import type { PdfHighlight, PdfComment, HighlightRect } from '../types/annotation';

export function usePdfAnnotations(attachmentId: string) {
  const [highlights, setHighlights] = useState<PdfHighlight[]>([]);
  const [comments, setComments] = useState<Record<string, PdfComment[]>>({});

  useEffect(() => {
    let cancelled = false;

    annotationStorage.getHighlightsByAttachment(attachmentId).then(hl => {
      if (!cancelled) setHighlights(hl);
    });

    annotationStorage.getCommentsByAttachment(attachmentId).then(allComments => {
      if (cancelled) return;
      const grouped: Record<string, PdfComment[]> = {};
      for (const c of allComments) {
        if (!grouped[c.highlightId]) grouped[c.highlightId] = [];
        grouped[c.highlightId].push(c);
      }
      setComments(grouped);
    });

    return () => { cancelled = true; };
  }, [attachmentId]);

  const addHighlight = useCallback(
    async (pageNumber: number, rects: HighlightRect[], selectedText: string, color?: string) => {
      const highlight = await annotationStorage.addHighlight(
        attachmentId,
        pageNumber,
        rects,
        selectedText,
        color,
      );
      setHighlights(prev => [...prev, highlight]);
      return highlight;
    },
    [attachmentId],
  );

  const deleteHighlight = useCallback(async (id: string) => {
    await annotationStorage.deleteCommentsByHighlight(id);
    await annotationStorage.deleteHighlight(id);
    setHighlights(prev => prev.filter(h => h.id !== id));
    setComments(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const addComment = useCallback(
    async (highlightId: string, text: string) => {
      const comment = await annotationStorage.addComment(highlightId, attachmentId, text);
      setComments(prev => ({
        ...prev,
        [highlightId]: [...(prev[highlightId] || []), comment],
      }));
      return comment;
    },
    [attachmentId],
  );

  const updateComment = useCallback(async (id: string, highlightId: string, text: string) => {
    await annotationStorage.updateComment(id, text);
    setComments(prev => ({
      ...prev,
      [highlightId]: (prev[highlightId] || []).map(c =>
        c.id === id ? { ...c, text, updatedAt: new Date().toISOString() } : c,
      ),
    }));
  }, []);

  const deleteComment = useCallback(async (id: string, highlightId: string) => {
    await annotationStorage.deleteComment(id);
    setComments(prev => ({
      ...prev,
      [highlightId]: (prev[highlightId] || []).filter(c => c.id !== id),
    }));
  }, []);

  return { highlights, comments, addHighlight, deleteHighlight, addComment, updateComment, deleteComment };
}
