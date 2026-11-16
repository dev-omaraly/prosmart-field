import { createClient } from '@supabase/supabase-js';

// Public values: safe to ship in the app. Security comes from RLS in the database.
// NEVER put the service_role key here.
export const SUPABASE_URL = 'https://iubracicfdvdphvatbqg.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1YnJhY2ljZmR2ZHBodmF0YnFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NzIwNzEsImV4cCI6MjExMDM0ODA3MX0.A2-UYJUK1UGksHnrxYmYHRxCRFwrQ-oYrkZ_CSDo1iA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
