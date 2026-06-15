// ── Unified storage adapter ──────────────────────────────────────────────────
// Priority: Supabase (when configured) → window.storage (Claude artifact) → localStorage.
//
// Interface (unchanged from the original inline adapter):
//   get(key, shared=false)    -> { value: string } | null
//   set(key, value, shared)   -> void   (value is a JSON string)
//   delete(key, shared=false) -> void
//
// Keys are of the form "<namespace>:<id>" and are routed to per-namespace
// Supabase tables (each shaped { id text pk, data jsonb, updated_at }).
// Unmapped keys (e.g. "notifications:index") go to the catch-all app_kv table.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const NS_TABLE = {
  vault: "user_vault",
  pending: "pending_applications",
  pendingvault: "pending_vault",
  ledger: "ledger_entries",
  status: "patent_status",
  review: "claim_reviews",
};

// Resolve a storage key to { table, id }.
function route(key) {
  const i = key.indexOf(":");
  if (i === -1) return { table: "app_kv", id: key };
  const ns = key.slice(0, i);
  const table = NS_TABLE[ns];
  return table ? { table, id: key.slice(i + 1) } : { table: "app_kv", id: key };
}

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    // eslint-disable-next-line no-console
    console.info("[store] Supabase backend active");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[store] Supabase init failed, using local fallback:", e);
    supabase = null;
  }
}

export const supabaseEnabled = !!supabase;

// ── localStorage / window.storage fallback (original behavior) ────────────────
const localStore = {
  async get(key, shared = false) {
    try {
      if (typeof window !== "undefined" && window.storage)
        return window.storage.get(key, shared);
    } catch {}
    const v = localStorage.getItem(key);
    return v ? { value: v } : null;
  },
  async set(key, value, shared = false) {
    try {
      if (typeof window !== "undefined" && window.storage)
        return window.storage.set(key, value, shared);
    } catch {}
    localStorage.setItem(key, value);
  },
  async delete(key, shared = false) {
    try {
      if (typeof window !== "undefined" && window.storage)
        return window.storage.delete(key, shared);
    } catch {}
    localStorage.removeItem(key);
  },
};

export const store = supabase
  ? {
      async get(key /*, shared */) {
        const { table, id } = route(key);
        try {
          const { data, error } = await supabase
            .from(table)
            .select("data")
            .eq("id", id)
            .maybeSingle();
          if (error) throw error;
          return data ? { value: JSON.stringify(data.data) } : null;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`[store] get(${key}) failed, falling back:`, e?.message || e);
          return localStore.get(key);
        }
      },
      async set(key, value /*, shared */) {
        const { table, id } = route(key);
        let parsed;
        try {
          parsed = JSON.parse(value);
        } catch {
          parsed = value; // tolerate non-JSON values
        }
        try {
          const { error } = await supabase
            .from(table)
            .upsert({ id, data: parsed, updated_at: new Date().toISOString() });
          if (error) throw error;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`[store] set(${key}) failed, falling back:`, e?.message || e);
          return localStore.set(key, value);
        }
      },
      async delete(key /*, shared */) {
        const { table, id } = route(key);
        try {
          const { error } = await supabase.from(table).delete().eq("id", id);
          if (error) throw error;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`[store] delete(${key}) failed, falling back:`, e?.message || e);
          return localStore.delete(key);
        }
      },
    }
  : localStore;
