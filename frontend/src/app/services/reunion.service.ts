import { Injectable, computed, inject, signal } from '@angular/core';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { STORAGE_BUCKET, SupabaseService } from './supabase.service';
import { SessionService } from './session.service';
import {
  Message,
  MessageCategory,
  Photo,
  PhotoPrompt,
  Profile,
  ThenNowEntry,
  MAX_TAGS
} from '../models/reunion.model';
import { UserFacingError } from '../utils/errors';
import { prepareImage, randomId } from '../utils/image';

const PHOTO_PAGE_SIZE = 24;
const PHOTO_SELECT = '*, photo_tags(profile_id)';
const MESSAGE_SELECT = '*, message_tags(profile_id)';
/** Refetch everything when the app comes back after this long in the background. */
const STALE_AFTER_MS = 30_000;

type Row = Record<string, unknown>;

/** Reunion content (photos, notes, Then & Now, guests) with live updates from Supabase Realtime. */
@Injectable({ providedIn: 'root' })
export class ReunionService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly supabase = this.supabaseService.client;
  private readonly session = inject(SessionService);

  readonly photos = signal<Photo[]>([]);
  readonly hasMorePhotos = signal(false);
  readonly messages = signal<Message[]>([]);
  readonly thenNow = signal<ThenNowEntry[]>([]);
  readonly profiles = signal<Profile[]>([]);
  /** Checked-in classmates (organiser accounts are moderators, not guests). */
  readonly guests = computed(() => this.profiles().filter((p) => !p.is_organizer));
  readonly likedPhotoIds = signal<ReadonlySet<string>>(new Set());
  readonly votedEntryIds = signal<ReadonlySet<string>>(new Set());
  /** The Story page is visible to guests once an organiser publishes it. */
  readonly storyPublished = signal(false);

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly live = signal(false);

  private channel: RealtimeChannel | null = null;
  private hiddenAt = 0;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
    } else if (this.hiddenAt && Date.now() - this.hiddenAt > STALE_AFTER_MS) {
      this.hiddenAt = 0;
      void this.refreshAll();
    }
  };

  async start(): Promise<void> {
    if (this.channel) return;
    this.subscribe();
    document.addEventListener('visibilitychange', this.onVisibility);
    await this.refreshAll();
  }

  stop(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.live.set(false);
    this.photos.set([]);
    this.messages.set([]);
    this.thenNow.set([]);
    this.profiles.set([]);
    this.likedPhotoIds.set(new Set());
    this.votedEntryIds.set(new Set());
    this.storyPublished.set(false);
  }

  async refreshAll(): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([
        this.loadPhotos(),
        this.loadMessages(),
        this.loadThenNow(),
        this.loadProfiles(),
        this.loadMyReactions(),
        this.loadSettings()
      ]);
      this.loadError.set(false);
    } catch (err) {
      console.error('Loading reunion data failed', err);
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  private async loadPhotos(): Promise<void> {
    const { data, error } = await this.supabase
      .from('photos')
      .select(PHOTO_SELECT)
      .order('created_at', { ascending: false })
      .limit(PHOTO_PAGE_SIZE + 1);
    if (error) throw error;
    this.hasMorePhotos.set(data.length > PHOTO_PAGE_SIZE);
    this.photos.set(data.slice(0, PHOTO_PAGE_SIZE).map((r) => this.toPhoto(r)));
  }

  async loadMorePhotos(): Promise<void> {
    const last = this.photos().at(-1);
    if (!last) return;
    const { data, error } = await this.supabase
      .from('photos')
      .select(PHOTO_SELECT)
      .order('created_at', { ascending: false })
      .lt('created_at', last.created_at)
      .limit(PHOTO_PAGE_SIZE + 1);
    if (error) throw error;
    this.hasMorePhotos.set(data.length > PHOTO_PAGE_SIZE);
    const more = data.slice(0, PHOTO_PAGE_SIZE).map((r) => this.toPhoto(r));
    this.photos.update((list) => [...list, ...more.filter((p) => !list.some((x) => x.id === p.id))]);
  }

  private async loadMessages(): Promise<void> {
    const { data, error } = await this.supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    this.messages.set(data.map((r) => this.toMessage(r)));
  }

  private async loadThenNow(): Promise<void> {
    const { data, error } = await this.supabase
      .from('then_now_entries')
      .select('*')
      .order('votes_count', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    this.thenNow.set(data.map((r) => this.toThenNow(r)));
  }

  private async loadProfiles(): Promise<void> {
    const { data, error } = await this.supabase.from('profiles').select('*').order('display_name');
    if (error) throw error;
    this.profiles.set(data as Profile[]);
  }

  private async loadSettings(): Promise<void> {
    const { data, error } = await this.supabase.from('app_settings').select('story_published').maybeSingle();
    if (error) throw error;
    this.storyPublished.set(data?.story_published === true);
  }

  async setStoryPublished(publish: boolean): Promise<void> {
    const { error } = await this.supabase.rpc('set_story_published', { publish });
    if (error) throw error;
    this.storyPublished.set(publish);
  }

  private async loadMyReactions(): Promise<void> {
    const [likes, votes] = await Promise.all([
      this.supabase.from('photo_likes').select('photo_id'),
      this.supabase.from('then_now_votes').select('entry_id')
    ]);
    if (likes.error) throw likes.error;
    if (votes.error) throw votes.error;
    this.likedPhotoIds.set(new Set(likes.data.map((r) => r.photo_id as string)));
    this.votedEntryIds.set(new Set(votes.data.map((r) => r.entry_id as string)));
  }

  // ---------------------------------------------------------------------------
  // Photos
  // ---------------------------------------------------------------------------

  async uploadPhoto(file: File, prompt: PhotoPrompt, caption: string, tagIds: string[]): Promise<void> {
    const uid = this.requireGuest();
    const image = await prepareImage(file);
    const path = `photos/${uid}/${randomId()}.jpg`;
    await this.uploadFile(path, image);

    const { data, error } = await this.supabase
      .from('photos')
      .insert({ prompt_tag: prompt, caption: caption.trim() || null, image_path: path })
      .select()
      .single();
    if (error) {
      await this.removeFiles([path]);
      throw error;
    }
    const photo = this.toPhoto(data);
    photo.tagged_ids = await this.insertTags('photo_tags', 'photo_id', photo.id, tagIds);
    this.upsertPhoto(photo);
  }

  async deletePhoto(photo: Photo): Promise<void> {
    const { data, error } = await this.supabase.from('photos').delete().eq('id', photo.id).select('id');
    if (error) throw error;
    if (!data.length) throw new UserFacingError('This photo could not be deleted.');
    this.photos.update((list) => list.filter((p) => p.id !== photo.id));
    await this.removeFiles([photo.image_path]);
  }

  async toggleLike(photo: Photo): Promise<void> {
    const uid = this.requireGuest();
    const liked = this.likedPhotoIds().has(photo.id);
    this.applyLike(photo.id, !liked);

    const { error } = liked
      ? await this.supabase.from('photo_likes').delete().eq('photo_id', photo.id).eq('user_id', uid)
      : await this.supabase.from('photo_likes').insert({ photo_id: photo.id });
    // 23505 = already liked on another tab; the server state is what we wanted.
    if (error && error.code !== '23505') {
      this.applyLike(photo.id, liked);
      throw error;
    }
  }

  private applyLike(photoId: string, liked: boolean): void {
    this.likedPhotoIds.update((set) => {
      const next = new Set(set);
      if (liked) next.add(photoId);
      else next.delete(photoId);
      return next;
    });
    this.photos.update((list) =>
      list.map((p) =>
        p.id === photoId ? { ...p, likes_count: Math.max(0, p.likes_count + (liked ? 1 : -1)) } : p
      )
    );
  }

  downloadUrl(path: string, author: string): string {
    const safe = author.replace(/[^\w-]+/g, '_').slice(0, 40) || 'photo';
    return this.supabaseService.publicUrl(path, `BHS06_${safe}_${path.split('/').pop()}`);
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  async postMessage(content: string, category: MessageCategory, tagIds: string[]): Promise<void> {
    this.requireGuest();
    const { data, error } = await this.supabase
      .from('messages')
      .insert({ content: content.trim(), category })
      .select()
      .single();
    if (error) throw error;
    const message = this.toMessage(data);
    message.tagged_ids = await this.insertTags('message_tags', 'message_id', message.id, tagIds);
    this.upsertMessage(message);
  }

  // ---------------------------------------------------------------------------
  // Tags (only checked-in guests can be tagged; enforced by foreign keys)
  // ---------------------------------------------------------------------------

  /** Inserts tags for a new photo / note. Tags that fail (e.g. the guest just left) are skipped. */
  private async insertTags(
    table: 'photo_tags' | 'message_tags',
    column: 'photo_id' | 'message_id',
    itemId: string,
    tagIds: string[]
  ): Promise<string[]> {
    const uid = this.session.userId();
    const ids = [...new Set(tagIds)].filter((id) => id !== uid).slice(0, MAX_TAGS);
    if (!ids.length) return [];
    const { error } = await this.supabase.from(table).insert(ids.map((id) => ({ [column]: itemId, profile_id: id })));
    if (!error) return ids;

    // Fall back to one by one so a single bad tag does not drop the rest.
    const saved: string[] = [];
    for (const id of ids) {
      const res = await this.supabase.from(table).insert({ [column]: itemId, profile_id: id });
      if (!res.error) saved.push(id);
    }
    return saved;
  }

  async removePhotoTag(photo: Photo, profileId: string): Promise<void> {
    const { error } = await this.supabase.from('photo_tags').delete().eq('photo_id', photo.id).eq('profile_id', profileId);
    if (error) throw error;
    this.applyTag('photo', photo.id, profileId, false);
  }

  async removeMessageTag(message: Message, profileId: string): Promise<void> {
    const { error } = await this.supabase
      .from('message_tags')
      .delete()
      .eq('message_id', message.id)
      .eq('profile_id', profileId);
    if (error) throw error;
    this.applyTag('message', message.id, profileId, false);
  }

  private applyTag(kind: 'photo' | 'message', itemId: string, profileId: string, tagged: boolean): void {
    const next = (ids: string[]) =>
      tagged ? (ids.includes(profileId) ? ids : [...ids, profileId]) : ids.filter((id) => id !== profileId);
    if (kind === 'photo') {
      this.photos.update((list) => list.map((p) => (p.id === itemId ? { ...p, tagged_ids: next(p.tagged_ids) } : p)));
    } else {
      this.messages.update((list) =>
        list.map((m) => (m.id === itemId ? { ...m, tagged_ids: next(m.tagged_ids) } : m))
      );
    }
  }

  async deleteMessage(message: Message): Promise<void> {
    const { data, error } = await this.supabase.from('messages').delete().eq('id', message.id).select('id');
    if (error) throw error;
    if (!data.length) throw new UserFacingError('This note could not be deleted.');
    this.messages.update((list) => list.filter((m) => m.id !== message.id));
  }

  // ---------------------------------------------------------------------------
  // Then & Now
  // ---------------------------------------------------------------------------

  async uploadThenNow(thenFile: File, nowFile: File): Promise<void> {
    const uid = this.requireGuest();
    if (this.thenNow().some((e) => e.owner_id === uid)) {
      throw new UserFacingError('You already have a Then & Now entry. Delete it first to post a new one.');
    }
    const [thenImage, nowImage] = await Promise.all([prepareImage(thenFile, 1200), prepareImage(nowFile, 1200)]);
    const thenPath = `then-now/${uid}/${randomId()}.jpg`;
    const nowPath = `then-now/${uid}/${randomId()}.jpg`;
    await this.uploadFile(thenPath, thenImage);
    try {
      await this.uploadFile(nowPath, nowImage);
    } catch (err) {
      await this.removeFiles([thenPath]);
      throw err;
    }

    const { data, error } = await this.supabase
      .from('then_now_entries')
      .insert({ then_path: thenPath, now_path: nowPath })
      .select()
      .single();
    if (error) {
      await this.removeFiles([thenPath, nowPath]);
      if (error.code === '23505') {
        throw new UserFacingError('You already have a Then & Now entry. Delete it first to post a new one.');
      }
      throw error;
    }
    this.upsertThenNow(this.toThenNow(data));
  }

  async deleteThenNow(entry: ThenNowEntry): Promise<void> {
    const { data, error } = await this.supabase.from('then_now_entries').delete().eq('id', entry.id).select('id');
    if (error) throw error;
    if (!data.length) throw new UserFacingError('This entry could not be deleted.');
    this.thenNow.update((list) => list.filter((e) => e.id !== entry.id));
    await this.removeFiles([entry.then_path, entry.now_path]);
  }

  async toggleVote(entry: ThenNowEntry): Promise<void> {
    const uid = this.requireGuest();
    if (entry.owner_id === uid) throw new UserFacingError('You cannot vote for yourself. 😉');
    const voted = this.votedEntryIds().has(entry.id);
    this.applyVote(entry.id, !voted);

    const { error } = voted
      ? await this.supabase.from('then_now_votes').delete().eq('entry_id', entry.id).eq('user_id', uid)
      : await this.supabase.from('then_now_votes').insert({ entry_id: entry.id });
    if (error && error.code !== '23505') {
      this.applyVote(entry.id, voted);
      throw error;
    }
  }

  private applyVote(entryId: string, voted: boolean): void {
    this.votedEntryIds.update((set) => {
      const next = new Set(set);
      if (voted) next.add(entryId);
      else next.delete(entryId);
      return next;
    });
    this.thenNow.update((list) =>
      sortThenNow(
        list.map((e) =>
          e.id === entryId ? { ...e, votes_count: Math.max(0, e.votes_count + (voted ? 1 : -1)) } : e
        )
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Guests (organiser tools)
  // ---------------------------------------------------------------------------

  /** Organisers: removes a guest and everything they posted (rows cascade in the database). */
  async removeGuest(profile: Profile): Promise<void> {
    await this.removeUserFiles(profile.id);
    const { data, error } = await this.supabase.from('profiles').delete().eq('id', profile.id).select('id');
    if (error) throw error;
    if (!data.length) throw new UserFacingError('This guest could not be removed.');
    this.profiles.update((list) => list.filter((p) => p.id !== profile.id));
    this.photos.update((list) => list.filter((p) => p.owner_id !== profile.id));
    this.messages.update((list) => list.filter((m) => m.owner_id !== profile.id));
    this.thenNow.update((list) => list.filter((e) => e.owner_id !== profile.id));
  }

  /** Deletes every uploaded file of a guest (own files, or any guest's files for organisers). */
  async removeUserFiles(userId: string): Promise<void> {
    const bucket = this.supabase.storage.from(STORAGE_BUCKET);
    for (const folder of [`photos/${userId}`, `then-now/${userId}`]) {
      // Delete in pages until the folder is empty.
      for (let round = 0; round < 50; round++) {
        const { data, error } = await bucket.list(folder, { limit: 100 });
        if (error) throw error;
        const files = data.filter((f) => f.id !== null).map((f) => `${folder}/${f.name}`);
        if (!files.length) break;
        const { error: removeError } = await bucket.remove(files);
        if (removeError) throw removeError;
      }
    }
  }

  /** Organisers: add / remove a photo from the Facebook shortlist. */
  async setShortlisted(photo: Photo, value: boolean): Promise<void> {
    const { error } = await this.supabase.rpc('set_photo_shortlisted', { target: photo.id, value });
    if (error) throw error;
    this.photos.update((list) => list.map((p) => (p.id === photo.id ? { ...p, shortlisted: value } : p)));
  }

  /** Every photo (not just the loaded page), for the organiser export. */
  async fetchAllPhotos(): Promise<Photo[]> {
    const { data, error } = await this.supabase
      .from('photos')
      .select(PHOTO_SELECT)
      .order('created_at', { ascending: true })
      .limit(5000);
    if (error) throw error;
    return data.map((r) => this.toPhoto(r));
  }

  // ---------------------------------------------------------------------------
  // Realtime
  // ---------------------------------------------------------------------------

  private subscribe(): void {
    this.channel = this.supabase
      .channel('reunion-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, (p) => this.onPhoto(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (p) => this.onMessage(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'then_now_entries' }, (p) => this.onThenNow(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p) => this.onProfile(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_tags' }, (p) => this.onTag('photo', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_tags' }, (p) => this.onTag('message', p))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings' }, (p) =>
        this.storyPublished.set((p.new as Row)['story_published'] === true)
      )
      .subscribe((status) => {
        const wasLive = this.live();
        this.live.set(status === 'SUBSCRIBED');
        // Catch up on anything missed while disconnected.
        if (status === 'SUBSCRIBED' && !wasLive && !this.loading()) void this.refreshAll();
      });
  }

  private onPhoto(payload: RealtimePostgresChangesPayload<Row>): void {
    if (payload.eventType === 'DELETE') {
      const id = payload.old['id'];
      this.photos.update((list) => list.filter((p) => p.id !== id));
    } else {
      this.upsertPhoto(this.toPhoto(payload.new));
    }
  }

  private onMessage(payload: RealtimePostgresChangesPayload<Row>): void {
    if (payload.eventType === 'DELETE') {
      const id = payload.old['id'];
      this.messages.update((list) => list.filter((m) => m.id !== id));
    } else {
      this.upsertMessage(this.toMessage(payload.new));
    }
  }

  private onThenNow(payload: RealtimePostgresChangesPayload<Row>): void {
    if (payload.eventType === 'DELETE') {
      const id = payload.old['id'];
      this.thenNow.update((list) => list.filter((e) => e.id !== id));
    } else {
      this.upsertThenNow(this.toThenNow(payload.new));
    }
  }

  private onTag(kind: 'photo' | 'message', payload: RealtimePostgresChangesPayload<Row>): void {
    const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Row;
    const itemId = row[kind === 'photo' ? 'photo_id' : 'message_id'] as string | undefined;
    const profileId = row['profile_id'] as string | undefined;
    if (!itemId || !profileId) return;
    this.applyTag(kind, itemId, profileId, payload.eventType !== 'DELETE');
  }

  private onProfile(payload: RealtimePostgresChangesPayload<Row>): void {
    if (payload.eventType === 'DELETE') {
      const id = payload.old['id'];
      this.profiles.update((list) => list.filter((p) => p.id !== id));
      if (id === this.session.userId()) this.session.handleRemoved();
      return;
    }
    const profile = payload.new as unknown as Profile;
    this.profiles.update((list) => {
      const rest = list.filter((p) => p.id !== profile.id);
      return [...rest, profile].sort((a, b) => a.display_name.localeCompare(b.display_name));
    });
    if (profile.id === this.session.userId()) this.session.profile.set(profile);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private upsertPhoto(photo: Photo): void {
    this.photos.update((list) => {
      if (list.some((p) => p.id === photo.id)) {
        // Realtime row payloads carry no tags; keep the ones we already know.
        return list.map((p) =>
          p.id === photo.id ? { ...photo, tagged_ids: [...new Set([...p.tagged_ids, ...photo.tagged_ids])] } : p
        );
      }
      return [photo, ...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    });
  }

  private upsertMessage(message: Message): void {
    this.messages.update((list) => {
      if (list.some((m) => m.id === message.id)) {
        return list.map((m) =>
          m.id === message.id ? { ...message, tagged_ids: [...new Set([...m.tagged_ids, ...message.tagged_ids])] } : m
        );
      }
      return [message, ...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    });
  }

  private upsertThenNow(entry: ThenNowEntry): void {
    this.thenNow.update((list) => sortThenNow([...list.filter((e) => e.id !== entry.id), entry]));
  }

  private toPhoto(row: Row): Photo {
    const { photo_tags, ...photo } = row as Row & { photo_tags?: { profile_id: string }[] };
    return {
      ...(photo as unknown as Photo),
      tagged_ids: (photo_tags ?? []).map((t) => t.profile_id),
      url: this.supabaseService.publicUrl(photo['image_path'] as string)
    };
  }

  private toMessage(row: Row): Message {
    const { message_tags, ...message } = row as Row & { message_tags?: { profile_id: string }[] };
    return { ...(message as unknown as Message), tagged_ids: (message_tags ?? []).map((t) => t.profile_id) };
  }

  private toThenNow(row: Row): ThenNowEntry {
    const entry = row as unknown as ThenNowEntry;
    return {
      ...entry,
      then_url: this.supabaseService.publicUrl(entry.then_path),
      now_url: this.supabaseService.publicUrl(entry.now_path)
    };
  }

  private async uploadFile(path: string, blob: Blob): Promise<void> {
    const { error } = await this.supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (error) throw error;
  }

  private async removeFiles(paths: string[]): Promise<void> {
    const { error } = await this.supabase.storage.from(STORAGE_BUCKET).remove(paths);
    if (error) console.warn('Could not remove files', paths, error);
  }

  /** Posting, hearts and votes are for guests only; organisers moderate. */
  private requireGuest(): string {
    const uid = this.session.userId();
    if (!uid || !this.session.profile()) throw new UserFacingError('Please check in first.');
    if (this.session.isOrganizer()) throw new UserFacingError('Organisers can only moderate, not post.');
    return uid;
  }
}

function sortThenNow(list: ThenNowEntry[]): ThenNowEntry[] {
  return [...list].sort((a, b) => b.votes_count - a.votes_count || a.created_at.localeCompare(b.created_at));
}
