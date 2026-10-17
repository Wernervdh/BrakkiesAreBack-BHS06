export interface Profile {
  id: string;
  created_at?: string;
  display_name: string;
  email?: string | null;
  is_organizer?: boolean;
}

export interface Photo {
  id: string;
  created_at: string;
  author_name: string;
  prompt_tag: string;
  image_url: string;
  likes_count: number;
  is_approved: boolean;
}

export type MessageCategory = 'thank_you' | 'memory' | 'prediction_30th';

export interface Message {
  id: string;
  created_at: string;
  author_name: string;
  content: string;
  category: MessageCategory;
}

export interface ThenNowProfile {
  id: string;
  student_name: string;
  yearbook_image_url: string;
  current_image_url: string;
  votes_most_changed: number;
}

export interface UploadPhotoPayload {
  file: File;
  author_name: string;
  prompt_tag: string;
}

export const PHOTO_PROMPTS = [
  'Mid-laugh',
  'Then & Now',
  'Unchanged',
  'Best Dance Move',
  'Group Hug',
  'Brakkie Pride',
  'Golden Oldies'
] as const;

export type PhotoPrompt = typeof PHOTO_PROMPTS[number];

export interface VoteRecord {
  photos: string[];
  messages: string[];
  thenNow: string[];
}
