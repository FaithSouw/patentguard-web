// Single shared Supabase client used by BOTH auth and the data store.
// Sharing one instance is what lets RLS work: after a user logs in, this
// client automatically attaches their JWT to every database request, so the
// "authenticated" row-level-security policies apply.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = supabaseEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,        // keep the user logged in across refreshes
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
