export type ChatRole = 'user' | 'model';

export interface Attachment {
  name: string;
  type: string; // e.g., 'image/png' or 'application/pdf'
  url: string;  // A data URL for preview
  data: string; // Base64 encoded data for sending to API
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  attachments?: Attachment[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string; // ISO string
}
