export interface Profile {
  id: string;
  created_at: string;
  display_name: string;
  is_organizer: boolean;
  /** Organiser logged in with the super admin code: can also build the Facebook pack. */
  is_super_admin?: boolean;
}

export interface Photo {
  id: string;
  created_at: string;
  owner_id: string;
  author_name: string;
  prompt_tag: PhotoPrompt;
  caption: string | null;
  image_path: string;
  likes_count: number;
  /** On the organisers' Facebook shortlist. */
  shortlisted: boolean;
  /** Profile ids of tagged guests (from photo_tags). */
  tagged_ids: string[];
  /** Public URL, derived client-side from image_path. */
  url: string;
}

export type MessageCategory = 'thank_you' | 'memory' | 'prediction_30th';

export interface Message {
  id: string;
  created_at: string;
  owner_id: string;
  author_name: string;
  content: string;
  category: MessageCategory;
  /** Profile ids of tagged guests (from message_tags). */
  tagged_ids: string[];
}

export interface ThenNowEntry {
  id: string;
  created_at: string;
  owner_id: string;
  author_name: string;
  then_path: string;
  now_path: string;
  votes_count: number;
  /** Public URLs, derived client-side from the paths. */
  then_url: string;
  now_url: string;
}

export const PHOTO_PROMPTS = [
  'Mid-laugh',
  'Unchanged',
  'Best Dance Move',
  'Group Hug',
  'Brakkie Pride',
  'Golden Oldies',
  'Squad'
] as const;

export type PhotoPrompt = (typeof PHOTO_PROMPTS)[number];

export const MESSAGE_CATEGORIES: { value: MessageCategory; label: string; icon: string }[] = [
  { value: 'thank_you', label: 'Thank You', icon: '🙏' },
  { value: 'memory', label: 'Memory', icon: '💭' },
  { value: 'prediction_30th', label: '30th Prediction', icon: '🔮' }
];

export const MESSAGE_MAX_LENGTH = 500;
export const CAPTION_MAX_LENGTH = 140;

export const MAX_TAGS = 20;

/** One row of the activity log (readable by the super admin only). */
export interface ActivityEntry {
  id: number;
  at: string;
  category: 'session' | 'security' | 'content' | 'reaction' | 'tag' | 'moderation' | 'admin';
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: 'guest' | 'organiser' | 'super admin' | null;
  subject_id: string | null;
  summary: string;
}
