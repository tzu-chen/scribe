export interface NodeAttachmentLink {
  flowchartId: string;
  nodeKey: string;
  title: string;
  flowchartName: string;
}

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
  nodeAttachments?: NodeAttachmentLink[];
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
  nodeAttachments?: NodeAttachmentLink[];
}
