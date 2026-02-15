export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfHighlight {
  id: string;
  attachmentId: string;
  pageNumber: number;
  rects: HighlightRect[];
  selectedText: string;
  color: string;
  createdAt: string;
}

export interface PdfComment {
  id: string;
  highlightId: string;
  attachmentId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}
