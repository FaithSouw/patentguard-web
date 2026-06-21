// Auth state + helpers for the whole app. Wrap the app in <AuthProvider>, then
// any component can call useAuth(). Backed by Supabase Auth (email/password) with
// built-in TOTP 2FA (authenticator app).
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser]   = useState(null);
  const [role, setRole]   = useState(null);
  const [aal, setAal]     = useState({ current: null, next: null });

  const refreshAal = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data) setAal({ current: data.currentLevel, next: data.nextLevel });
  }, []);

  const loadProfile = useCallback(async (uid) => {
    if (!supabase || !uid) { setRole(null); return; }
    const { data } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
    setRole(data?.role || "applicant");
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      setUser(session?.user || null);
      if (session?.user) { await loadProfile(session.user.id); await refreshAal(); }
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user || null);
      if (session?.user) { await loadProfile(session.user.id); await refreshAal(); }
      else { setRole(null); setAal({ current: null, next: null }); }
    });
    return () => { active = false; sub?.subscription?.unsubscribe(); };
  }, [loadProfile, refreshAal]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    await refreshAal();
    return {};
  }, [refreshAal]);

  const signUp = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    return { needsConfirm: !data.session };
  }, []);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);

  // Enroll a new TOTP factor — returns a QR code (SVG data URI) + manual secret.
  const enrollTotp = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `authenticator-${Date.now()}`,
    });
    if (error) return { error: error.message };
    return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  }, []);

  // Verify a 6-digit code against a factor (used for enrollment confirm AND login).
  const verifyTotp = useCallback(async (factorId, code) => {
    const ch = await supabase.auth.mfa.challenge({ factorId });
    if (ch.error) return { error: ch.error.message };
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
    if (error) return { error: error.message };
    await refreshAal();
    return {};
  }, [refreshAal]);

  // Login-time challenge: verify against the user's existing TOTP factor.
  const verifyLoginCode = useCallback(async (code) => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return { error: error.message };
    const factor = (data?.totp || []).find(f => f.status === "verified") || (data?.totp || [])[0];
    if (!factor) return { error: "No 2FA factor found" };
    return verifyTotp(factor.id, code);
  }, [verifyTotp]);

  const listFactors = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    return data?.totp || [];
  }, []);

  const unenroll = useCallback(async (factorId) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    await refreshAal();
    return error ? { error: error.message } : {};
  }, [refreshAal]);

  // True when the user has 2FA enabled and still needs to enter their code.
  const needsMfa = aal.current === "aal1" && aal.next === "aal2";
  const isExaminer = role === "examiner" || role === "admin";

  const value = {
    loading, user, role, isExaminer, aal, needsMfa,
    signIn, signUp, signOut,
    enrollTotp, verifyTotp, verifyLoginCode, listFactors, unenroll, refreshAal,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
