export type NoteStatus = 'draft' | 'published';

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  status: NoteStatus;
  category?: string;
  subject?: string;
  createdAt: string;
  updatedAt: string;
}
