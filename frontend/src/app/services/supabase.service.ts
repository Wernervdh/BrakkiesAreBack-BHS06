import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const STORAGE_BUCKET = 'reunion-media';

/** Holds the single Supabase client. The publishable key is public by design; access is enforced by RLS. */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  publicUrl(path: string, download?: string): string {
    return this.client.storage.from(STORAGE_BUCKET).getPublicUrl(path, download ? { download } : undefined).data.publicUrl;
  }
}
