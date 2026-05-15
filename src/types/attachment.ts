export interface Attachment {
  id: string;
  subject: string;
  filename: string;
  type: string;
  size: number;
  data: Blob;
  createdAt: string;
  lastOpenedAt?: string;
  folderId?: string;
  tags?: string[];
}

export interface AttachmentMeta {
  id: string;
  subject: string;
  filename: string;
  type: string;
  size: number;
  createdAt: string;
  lastOpenedAt?: string;
  folderId?: string;
  tags?: string[];
}
