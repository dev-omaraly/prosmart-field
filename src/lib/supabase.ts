import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { offlineFetch, setTokenProvider } from './offline';

export { SUPABASE_ANON_KEY, SUPABASE_URL };

// `offlineFetch` caches reads and queues writes while there is no internet (see lib/offline.ts).
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { fetch: offlineFetch },
});

setTokenProvider(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
