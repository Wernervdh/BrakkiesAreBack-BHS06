import { Injectable, NgZone, inject } from '@angular/core';
import {
  createClient,
  SupabaseClient,
  RealtimeChannel,
  RealtimePostgresChangesPayload
} from '@supabase/supabase-js';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Profile,
  Photo,
  Message,
  MessageCategory,
  ThenNowProfile,
  UploadPhotoPayload
} from '../models/reunion.model';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private readonly ngZone = inject(NgZone);

  // Storage bucket constants matching the specification
  readonly STORAGE_BUCKET = 'reunion-media';
  readonly PHOTOS_FOLDER = 'photos';
  readonly THEN_NOW_FOLDER = 'then-now';

  // Local Backend Sync Server on same host port 3000
  private readonly localBackendBase = this.detectLocalBackendUrl();
  private localWs: WebSocket | null = null;
  private wsPhotosSubject = new Subject<RealtimePostgresChangesPayload<Photo>>();
  private wsMessagesSubject = new Subject<RealtimePostgresChangesPayload<Message>>();
  private wsThenNowSubject = new Subject<RealtimePostgresChangesPayload<ThenNowProfile>>();
  private wsProfilesSubject = new Subject<RealtimePostgresChangesPayload<Profile>>();

  // Environment credentials with fallback
  private readonly supabaseUrl: string =
    environment.supabaseUrl || 'https://placeholder-reunion.supabase.co';

  private readonly supabaseAnonKey: string =
    environment.supabaseAnonKey || 'placeholder-anon-key';

  private supabase: SupabaseClient;

  // Active Realtime Channels
  private photosChannel: RealtimeChannel | null = null;
  private messagesChannel: RealtimeChannel | null = null;
  private thenNowChannel: RealtimeChannel | null = null;

  constructor() {
    this.supabase = createClient(this.supabaseUrl, this.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });

    this.initLocalWebSocket();
  }

  private detectLocalBackendUrl(): string {
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname || 'localhost';
      return `http://${hostname}:3000`;
    }
    return 'http://localhost:3000';
  }

  private initLocalWebSocket(): void {
    if (typeof window === 'undefined') return;
    try {
      const wsHost = window.location.hostname || 'localhost';
      this.localWs = new WebSocket(`ws://${wsHost}:3000`);

      this.localWs.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          this.ngZone.run(() => {
            if (parsed.table === 'photos') {
              this.wsPhotosSubject.next({
                eventType: parsed.eventType,
                new: parsed.data,
                old: parsed.data,
                schema: 'public',
                table: 'photos',
                commit_timestamp: new Date().toISOString(),
                errors: []
              });
            } else if (parsed.table === 'messages') {
              this.wsMessagesSubject.next({
                eventType: parsed.eventType,
                new: parsed.data,
                old: parsed.data,
                schema: 'public',
                table: 'messages',
                commit_timestamp: new Date().toISOString(),
                errors: []
              });
            } else if (parsed.table === 'then_now_profiles') {
              this.wsThenNowSubject.next({
                eventType: parsed.eventType,
                new: parsed.data,
                old: parsed.data,
                schema: 'public',
                table: 'then_now_profiles',
                commit_timestamp: new Date().toISOString(),
                errors: []
              });
            } else if (parsed.table === 'profiles') {
              this.wsProfilesSubject.next({
                eventType: parsed.eventType,
                new: parsed.data,
                old: parsed.data,
                schema: 'public',
                table: 'profiles',
                commit_timestamp: new Date().toISOString(),
                errors: []
              });
            }
          });
        } catch {}
      };
    } catch {}
  }

  /**
   * Direct accessor to the underlying Supabase client instance if needed
   */
  get client(): SupabaseClient {
    return this.supabase;
  }

  // ==========================================
  // LOCAL STORAGE GUEST SESSION HELPERS
  // ==========================================

  getStoredUserName(): string {
    return localStorage.getItem('brakke_user_name') || '';
  }

  setStoredUserName(name: string): void {
    localStorage.setItem('brakke_user_name', name.trim());
  }

  clearStoredUser(): void {
    localStorage.removeItem('brakke_user_name');
    localStorage.removeItem('brakke_user_id');
  }

  // ==========================================
  // PROFILE / GUEST REGISTRY METHODS
  // ==========================================

  /**
   * Registers or updates a guest profile upon entering the reunion app.
   */
  async registerProfile(displayName: string, email?: string): Promise<Profile> {
    // 1. Post to local shared backend
    try {
      const res = await fetch(`${this.localBackendBase}/api/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName.trim(), email: email?.trim() || null })
      });
      if (res.ok) {
        return (await res.json()) as Profile;
      }
    } catch {}

    // 2. Fallback to Supabase
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .insert({
          display_name: displayName.trim(),
          email: email?.trim() || null,
          is_organizer: false
        })
        .select()
        .single();

      if (error) throw error;
      return data as Profile;
    } catch {
      return {
        id: 'guest-' + Date.now(),
        display_name: displayName.trim(),
        email: email?.trim() || null,
        is_organizer: false
      };
    }
  }

  /**
   * Fetches all registered reunion guests / who's here
   */
  async getProfiles(): Promise<Profile[]> {
    // 1. Local backend
    try {
      const res = await fetch(`${this.localBackendBase}/api/profiles`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data as Profile[];
      }
    } catch {}

    // 2. Supabase
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) return data as Profile[];
    } catch {}

    return [
      { id: 'u1', display_name: 'Dirk Van Der Merwe', email: 'dirk@brakke06.co.za', is_organizer: true },
      { id: 'u2', display_name: 'Anri Smith', email: 'anri@brakke06.co.za', is_organizer: true },
      { id: 'u3', display_name: 'Francois Pienaar', is_organizer: false },
      { id: 'u4', display_name: 'Chantal Louw', is_organizer: false }
    ];
  }

  onProfilesChange(): Observable<RealtimePostgresChangesPayload<Profile>> {
    const subject = new Subject<RealtimePostgresChangesPayload<Profile>>();
    this.wsProfilesSubject.subscribe((payload) => subject.next(payload));

    try {
      this.supabase
        .channel('public:profiles')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          (payload: RealtimePostgresChangesPayload<Profile>) => {
            this.ngZone.run(() => subject.next(payload));
          }
        )
        .subscribe();
    } catch {}

    return subject.asObservable();
  }

  // ==========================================
  // PHOTOS (PAPARAZZI FEED) METHODS
  // ==========================================

  /**
   * Fetches photos for the Paparazzi feed.
   * Filters by approval status (unless admin requests all) and orders newest first.
   */
  async getPhotos(options: { onlyApproved?: boolean; limit?: number } = {}): Promise<Photo[]> {
    const { onlyApproved = true, limit = 50 } = options;

    // 1. Try Supabase cloud first
    try {
      let query = this.supabase
        .from('photos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (onlyApproved) {
        query = query.eq('is_approved', true);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data as Photo[];
      }
    } catch {}

    // 2. Try local shared backend
    try {
      const res = await fetch(`${this.localBackendBase}/api/photos`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data as Photo[];
        }
      }
    } catch {}

    return this.getLocalPhotos();
  }

  async uploadPhoto(payload: UploadPhotoPayload): Promise<Photo> {
    const { file, author_name, prompt_tag } = payload;
    const localDataUrl = await this.fileToDataUrl(file);

    // 1. Upload to Supabase Storage & Database
    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = `${this.PHOTOS_FOLDER}/${fileName}`;

      const { error: uploadError } = await this.supabase.storage
        .from(this.STORAGE_BUCKET)
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      let imageUrl = localDataUrl;
      if (!uploadError) {
        const { data: publicUrlData } = this.supabase.storage
          .from(this.STORAGE_BUCKET)
          .getPublicUrl(filePath);
        imageUrl = publicUrlData.publicUrl;
      }

      const { data, error } = await this.supabase
        .from('photos')
        .insert({
          author_name: author_name.trim(),
          prompt_tag,
          image_url: imageUrl,
          likes_count: 0,
          is_approved: true
        })
        .select()
        .single();

      if (!error && data) {
        // Also replicate to local backend
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('author_name', author_name.trim());
          formData.append('prompt_tag', prompt_tag);
          await fetch(`${this.localBackendBase}/api/photos`, { method: 'POST', body: formData });
        } catch {}
        return data as Photo;
      }
    } catch {}

    // 2. Fallback to local shared LAN backend
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('author_name', author_name.trim());
      formData.append('prompt_tag', prompt_tag);

      const res = await fetch(`${this.localBackendBase}/api/photos`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        return (await res.json()) as Photo;
      }
    } catch {}

    // 3. Fallback to localStorage
    const fallbackPhoto: Photo = {
      id: 'local-photo-' + Date.now(),
      created_at: new Date().toISOString(),
      author_name: author_name.trim(),
      prompt_tag,
      image_url: localDataUrl,
      likes_count: 0,
      is_approved: true
    };
    this.saveLocalPhoto(fallbackPhoto);
    return fallbackPhoto;
  }

  async likePhoto(photoId: string): Promise<void> {
    // 1. Send to local backend
    try {
      await fetch(`${this.localBackendBase}/api/photos/${photoId}/like`, { method: 'POST' });
    } catch {}

    // 2. Supabase RPC
    try {
      await this.supabase.rpc('increment_photo_likes', { target_photo_id: photoId });
    } catch {
      this.incrementLocalPhotoLikes(photoId);
    }
  }

  /**
   * Helper to convert File to Data URL
   */
  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  private getLocalPhotos(): Photo[] {
    const raw = localStorage.getItem('brakke_local_photos');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return [
      {
        id: 'p1',
        created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        author_name: 'Dirk Van Der Merwe',
        prompt_tag: 'Mid-laugh',
        image_url: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800&auto=format&fit=crop&q=60',
        likes_count: 15,
        is_approved: true
      },
      {
        id: 'p2',
        created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        author_name: 'Anri Smith',
        prompt_tag: 'Then & Now',
        image_url: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&auto=format&fit=crop&q=60',
        likes_count: 22,
        is_approved: true
      },
      {
        id: 'p3',
        created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
        author_name: 'Francois Pienaar',
        prompt_tag: 'Unchanged',
        image_url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=60',
        likes_count: 9,
        is_approved: true
      }
    ];
  }

  private saveLocalPhoto(photo: Photo): void {
    const list = this.getLocalPhotos();
    const updated = [photo, ...list.filter(p => p.id !== photo.id)];
    try {
      localStorage.setItem('brakke_local_photos', JSON.stringify(updated.slice(0, 30)));
    } catch {}
  }

  private incrementLocalPhotoLikes(photoId: string): void {
    const list = this.getLocalPhotos();
    const updated = list.map(p => p.id === photoId ? { ...p, likes_count: p.likes_count + 1 } : p);
    try {
      localStorage.setItem('brakke_local_photos', JSON.stringify(updated));
    } catch {}
  }

  /**
   * Content moderation: Toggle approval flag for a photo (Organizer feature).
   */
  async setPhotoApproval(photoId: string, isApproved: boolean): Promise<Photo> {
    const { data, error } = await this.supabase
      .from('photos')
      .update({ is_approved: isApproved })
      .eq('id', photoId)
      .select()
      .single();

    if (error) throw error;
    return data as Photo;
  }

  // ==========================================
  // MESSAGES (TIME CAPSULE WALL) METHODS
  // ==========================================

  async getMessages(category?: MessageCategory): Promise<Message[]> {
    // 1. Try local shared backend
    try {
      const url = category
        ? `${this.localBackendBase}/api/messages?category=${category}`
        : `${this.localBackendBase}/api/messages`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data as Message[];
      }
    } catch {}

    // 2. Try Supabase
    try {
      let query = this.supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (category) query = query.eq('category', category);

      const { data, error } = await query;
      if (!error && data && data.length > 0) return data as Message[];
    } catch {}

    return this.getLocalMessages(category);
  }

  async postMessage(message: {
    author_name: string;
    content: string;
    category: MessageCategory;
  }): Promise<Message> {
    if (!message.content || message.content.trim().length === 0) {
      throw new Error('Message content cannot be empty.');
    }
    if (message.content.length > 500) {
      throw new Error('Message content cannot exceed 500 characters.');
    }

    // 1. Try local shared backend (syncs cross-device!)
    try {
      const res = await fetch(`${this.localBackendBase}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
      if (res.ok) {
        const created = await res.json();
        return created as Message;
      }
    } catch {}

    // 2. Try Supabase
    try {
      const { data, error } = await this.supabase
        .from('messages')
        .insert({
          author_name: message.author_name.trim(),
          content: message.content.trim(),
          category: message.category
        })
        .select()
        .single();

      if (!error && data) return data as Message;
    } catch {}

    const fallbackMsg: Message = {
      id: 'local-msg-' + Date.now(),
      created_at: new Date().toISOString(),
      author_name: message.author_name.trim(),
      content: message.content.trim(),
      category: message.category
    };
    this.saveLocalMessage(fallbackMsg);
    return fallbackMsg;
  }

  // ==========================================
  // THEN & NOW (FACE MATCHER) METHODS
  // ==========================================

  async getThenNowProfiles(): Promise<ThenNowProfile[]> {
    try {
      const res = await fetch(`${this.localBackendBase}/api/then-now`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data as ThenNowProfile[];
      }
    } catch {}

    try {
      const { data, error } = await this.supabase
        .from('then_now_profiles')
        .select('*')
        .order('votes_most_changed', { ascending: false });

      if (!error && data && data.length > 0) return data as ThenNowProfile[];
    } catch {}

    return this.getLocalThenNowProfiles();
  }

  async voteThenNowProfile(profileId: string): Promise<void> {
    try {
      await fetch(`${this.localBackendBase}/api/then-now/${profileId}/vote`, { method: 'POST' });
    } catch {}

    try {
      await this.supabase.rpc('increment_then_now_vote', { target_profile_id: profileId });
    } catch {
      this.incrementLocalThenNowVotes(profileId);
    }
  }

  async uploadThenNowProfile(payload: {
    student_name: string;
    yearbook_file: File;
    current_file: File;
  }): Promise<ThenNowProfile> {
    const { student_name, yearbook_file, current_file } = payload;

    // 1. Send to local backend
    try {
      const formData = new FormData();
      formData.append('student_name', student_name.trim());
      formData.append('yearbook_file', yearbook_file);
      formData.append('current_file', current_file);

      const res = await fetch(`${this.localBackendBase}/api/then-now`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        return (await res.json()) as ThenNowProfile;
      }
    } catch {}

    // 2. Fallback
    const yUrl = await this.fileToDataUrl(yearbook_file);
    const cUrl = await this.fileToDataUrl(current_file);

    const fallback: ThenNowProfile = {
      id: 'tn_' + Date.now(),
      student_name: student_name.trim(),
      yearbook_image_url: yUrl,
      current_image_url: cUrl,
      votes_most_changed: 0
    };

    const currentList = this.getLocalThenNowProfiles();
    localStorage.setItem('brakke_local_then_now', JSON.stringify([fallback, ...currentList]));
    return fallback;
  }

  private getLocalMessages(category?: MessageCategory): Message[] {
    const raw = localStorage.getItem('brakke_local_messages');
    let list: Message[] = [];
    if (raw) {
      try {
        list = JSON.parse(raw);
      } catch {}
    }
    if (!list || list.length === 0) {
      list = [
        {
          id: 'm1',
          created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          author_name: 'Dirk Van Der Merwe',
          content: 'Welcome everyone to our 20-Year Brackenfell High Reunion! Huge thanks to the organizing committee for all the effort.',
          category: 'thank_you'
        },
        {
          id: 'm2',
          created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
          author_name: 'Anri Smith',
          content: 'Remember Mr. De Klerk’s math classes and hall assemblies? So wonderful to see everyone again tonight!',
          category: 'memory'
        },
        {
          id: 'm3',
          created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
          author_name: 'Francois Pienaar',
          content: 'Prediction for our 30th reunion: Dirk still drives the exact same bakkie and Chantal arrives in her own helicopter.',
          category: 'prediction_30th'
        }
      ];
    }
    return category ? list.filter(m => m.category === category) : list;
  }

  private saveLocalMessage(msg: Message): void {
    const list = this.getLocalMessages();
    const updated = [msg, ...list];
    try {
      localStorage.setItem('brakke_local_messages', JSON.stringify(updated.slice(0, 50)));
    } catch {}
  }

  private getLocalThenNowProfiles(): ThenNowProfile[] {
    const raw = localStorage.getItem('brakke_local_then_now');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return [
      {
        id: 'tn1',
        student_name: 'Dirk Van Der Merwe',
        yearbook_image_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=60',
        current_image_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=60',
        votes_most_changed: 4
      },
      {
        id: 'tn2',
        student_name: 'Anri Smith',
        yearbook_image_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&auto=format&fit=crop&q=60',
        current_image_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&auto=format&fit=crop&q=60',
        votes_most_changed: 7
      },
      {
        id: 'tn3',
        student_name: 'Francois Pienaar',
        yearbook_image_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=60',
        current_image_url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=500&auto=format&fit=crop&q=60',
        votes_most_changed: 12
      }
    ];
  }

  private incrementLocalThenNowVotes(profileId: string): void {
    const list = this.getLocalThenNowProfiles();
    const updated = list.map(item => item.id === profileId ? { ...item, votes_most_changed: item.votes_most_changed + 1 } : item);
    try {
      localStorage.setItem('brakke_local_then_now', JSON.stringify(updated));
    } catch {}
  }

  // ==========================================
  // REAL-TIME DATABASE & WEBSOCKET SUBSCRIPTIONS
  // ==========================================

  onPhotosChange(): Observable<RealtimePostgresChangesPayload<Photo>> {
    const subject = new Subject<RealtimePostgresChangesPayload<Photo>>();

    this.wsPhotosSubject.subscribe((payload) => subject.next(payload));

    if (this.photosChannel) {
      this.supabase.removeChannel(this.photosChannel);
    }

    try {
      this.photosChannel = this.supabase
        .channel('public:photos')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'photos' },
          (payload: RealtimePostgresChangesPayload<Photo>) => {
            this.ngZone.run(() => subject.next(payload));
          }
        )
        .subscribe();
    } catch {}

    return subject.asObservable();
  }

  onMessagesChange(): Observable<RealtimePostgresChangesPayload<Message>> {
    const subject = new Subject<RealtimePostgresChangesPayload<Message>>();

    this.wsMessagesSubject.subscribe((payload) => subject.next(payload));

    if (this.messagesChannel) {
      this.supabase.removeChannel(this.messagesChannel);
    }

    try {
      this.messagesChannel = this.supabase
        .channel('public:messages')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'messages' },
          (payload: RealtimePostgresChangesPayload<Message>) => {
            this.ngZone.run(() => subject.next(payload));
          }
        )
        .subscribe();
    } catch {}

    return subject.asObservable();
  }

  onThenNowProfilesChange(): Observable<RealtimePostgresChangesPayload<ThenNowProfile>> {
    const subject = new Subject<RealtimePostgresChangesPayload<ThenNowProfile>>();

    this.wsThenNowSubject.subscribe((payload) => subject.next(payload));

    if (this.thenNowChannel) {
      this.supabase.removeChannel(this.thenNowChannel);
    }

    try {
      this.thenNowChannel = this.supabase
        .channel('public:then_now_profiles')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'then_now_profiles' },
          (payload: RealtimePostgresChangesPayload<ThenNowProfile>) => {
            this.ngZone.run(() => subject.next(payload));
          }
        )
        .subscribe();
    } catch {}

    return subject.asObservable();
  }

  unsubscribeAll(): void {
    if (this.photosChannel) {
      this.supabase.removeChannel(this.photosChannel);
      this.photosChannel = null;
    }
    if (this.messagesChannel) {
      this.supabase.removeChannel(this.messagesChannel);
      this.messagesChannel = null;
    }
    if (this.thenNowChannel) {
      this.supabase.removeChannel(this.thenNowChannel);
      this.thenNowChannel = null;
    }
    this.supabase.removeAllChannels();

    if (this.localWs) {
      try {
        this.localWs.close();
      } catch {}
      this.localWs = null;
    }
  }
}
