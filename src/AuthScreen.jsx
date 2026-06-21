// Login / signup / 2FA UI. Rendered by Root when the user is not fully
// authenticated. Also exports TwoFactorPanel (used from the portal selector)
// and Splash (loading state).
import { useState, useEffect } from "react";
import { useAuth } from "./lib/auth";

const C = {
  bg: "#06060f", panel: "#0c0c1e", border: "#1b1b34", accent: "#5b4bdb",
  cyan: "#00c9f5", green: "#00d47e", red: "#f5365c", text: "#e8e8f8", muted: "#6a6a85",
};

const wrap = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
  background: C.bg, fontFamily: "'Space Mono', 'Courier New', monospace", color: C.text, padding: 20,
};
const card = {
  width: 380, maxWidth: "100%", background: C.panel, border: `1px solid ${C.border}`,
  borderRadius: 16, padding: 32, boxShadow: `0 12px 48px ${C.accent}18`,
};
const label = { fontSize: 11, color: C.muted, letterSpacing: "0.08em", marginBottom: 6, display: "block" };
const input = {
  width: "100%", padding: "11px 12px", marginBottom: 14, background: C.bg,
  border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
  fontFamily: "monospace", fontSize: 14, outline: "none",
};
const btn = (bg) => ({
  width: "100%", padding: "11px", borderRadius: 8, background: `${bg}22`,
  border: `1px solid ${bg}60`, color: bg, fontFamily: "monospace", fontSize: 13,
  fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em",
});

export function Splash() {
  return (
    <div style={wrap}>
      <style>{`@keyframes a-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 26, height: 26, border: `3px solid ${C.accent}40`, borderTopColor: C.accent, borderRadius: "50%", animation: "a-spin .7s linear infinite" }} />
    </div>
  );
}

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
      <div style={{ width: 38, height: 38, background: `linear-gradient(135deg,${C.accent},${C.cyan})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⚖</div>
      <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "0.04em" }}>PATENT<span style={{ color: C.accent }}>GUARD</span></div>
    </div>
  );
}

export function AuthScreen() {
  const { needsMfa, signIn, signUp, verifyLoginCode, signOut } = useAuth();
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setInfo(""); setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await signIn(email.trim(), password);
        if (error) setErr(error);
      } else {
        if (password.length < 8) { setErr("Password must be at least 8 characters."); return; }
        const { error, needsConfirm } = await signUp(email.trim(), password);
        if (error) setErr(error);
        else if (needsConfirm) setInfo("Account created. Check your email to confirm, then sign in.");
        // if auto-confirmed, AuthProvider picks up the session automatically.
        if (!error) setMode("login");
      }
    } finally { setBusy(false); }
  };

  const submitMfa = async () => {
    setErr(""); setBusy(true);
    try {
      const { error } = await verifyLoginCode(code.trim());
      if (error) setErr(error);
    } finally { setBusy(false); }
  };

  // ── 2FA challenge step (user has 2FA enabled, must enter code) ──
  if (needsMfa) {
    return (
      <div style={wrap}>
        <div style={card}>
          <Logo />
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Two-factor verification</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 18, lineHeight: 1.6 }}>
            Enter the 6-digit code from your authenticator app.
          </div>
          <input style={{ ...input, textAlign: "center", letterSpacing: "0.4em", fontSize: 20 }}
            value={code} maxLength={6} inputMode="numeric" autoFocus
            onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={e => e.key === "Enter" && submitMfa()} placeholder="••••••" />
          {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>✗ {err}</div>}
          <button style={btn(C.green)} disabled={busy} onClick={submitMfa}>{busy ? "VERIFYING…" : "VERIFY →"}</button>
          <button style={{ ...btn(C.muted), marginTop: 10, background: "transparent" }} onClick={signOut}>← Cancel / sign out</button>
        </div>
      </div>
    );
  }

  // ── Login / signup ──
  return (
    <div style={wrap}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');`}</style>
      <div style={card}>
        <Logo />
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          {mode === "login" ? "Sign in" : "Create your account"}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 20 }}>
          Integrated Patent Management System
        </div>

        <label style={label}>EMAIL</label>
        <input style={input} type="email" value={email} autoFocus
          onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />

        <label style={label}>PASSWORD</label>
        <input style={input} type="password" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder={mode === "signup" ? "min. 8 characters" : "••••••••"} />

        {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>✗ {err}</div>}
        {info && <div style={{ color: C.green, fontSize: 12, marginBottom: 10 }}>✓ {info}</div>}

        <button style={btn(C.accent)} disabled={busy} onClick={submit}>
          {busy ? "PLEASE WAIT…" : mode === "login" ? "SIGN IN →" : "CREATE ACCOUNT →"}
        </button>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: C.muted }}>
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <span style={{ color: C.cyan, cursor: "pointer" }}
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); setInfo(""); }}>
            {mode === "login" ? "Create one" : "Sign in"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── 2FA management modal (opened from the portal selector after login) ──
export function TwoFactorPanel({ onClose }) {
  const { enrollTotp, verifyTotp, listFactors, unenroll } = useAuth();
  const [factors, setFactors] = useState(null);
  const [enroll, setEnroll] = useState(null); // {factorId, qr, secret}
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => setFactors(await listFactors());
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasVerified = (factors || []).some(f => f.status === "verified");

  const startEnroll = async () => {
    setErr(""); setBusy(true);
    const r = await enrollTotp();
    setBusy(false);
    if (r.error) setErr(r.error); else setEnroll(r);
  };
  const confirmEnroll = async () => {
    setErr(""); setBusy(true);
    const r = await verifyTotp(enroll.factorId, code.trim());
    setBusy(false);
    if (r.error) setErr(r.error);
    else { setEnroll(null); setCode(""); await refresh(); }
  };
  const disable = async (id) => { setBusy(true); await unenroll(id); setBusy(false); await refresh(); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ ...card, fontFamily: "'Space Mono', monospace" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>🔐 Two-factor authentication</div>
          <span style={{ cursor: "pointer", color: C.muted }} onClick={onClose}>✕</span>
        </div>

        {factors === null ? (
          <div style={{ color: C.muted, fontSize: 12 }}>Loading…</div>
        ) : enroll ? (
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>
              Scan this with Google Authenticator / Authy, then enter the 6-digit code.
            </div>
            <div style={{ background: "#fff", padding: 10, borderRadius: 10, width: 180, margin: "0 auto 12px", display: "flex", justifyContent: "center" }}>
              <img src={enroll.qr} alt="2FA QR code" style={{ width: 160, height: 160 }} />
            </div>
            <div style={{ fontSize: 10, color: C.muted, textAlign: "center", marginBottom: 12, wordBreak: "break-all" }}>
              Manual key: <span style={{ color: C.cyan }}>{enroll.secret}</span>
            </div>
            <input style={{ ...input, textAlign: "center", letterSpacing: "0.4em", fontSize: 18 }}
              value={code} maxLength={6} inputMode="numeric" placeholder="••••••"
              onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={e => e.key === "Enter" && confirmEnroll()} />
            {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>✗ {err}</div>}
            <button style={btn(C.green)} disabled={busy} onClick={confirmEnroll}>{busy ? "VERIFYING…" : "CONFIRM & ENABLE →"}</button>
          </div>
        ) : hasVerified ? (
          <div>
            <div style={{ color: C.green, fontSize: 13, marginBottom: 14 }}>✓ 2FA is enabled on this account.</div>
            {(factors || []).filter(f => f.status === "verified").map(f => (
              <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: C.muted, marginBottom: 8 }}>
                <span>{f.friendly_name || "Authenticator"}</span>
                <span style={{ color: C.red, cursor: "pointer" }} onClick={() => disable(f.id)}>Disable</span>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
              Add an extra layer of security. You'll enter a code from your authenticator app each time you sign in.
            </div>
            {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>✗ {err}</div>}
            <button style={btn(C.accent)} disabled={busy} onClick={startEnroll}>{busy ? "…" : "ENABLE 2FA →"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
