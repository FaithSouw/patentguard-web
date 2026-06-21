import { useState, useEffect } from "react";
import App from "./App";
import GovPortal from "./GovPortal";
import { store } from "./lib/store";
import { useAuth } from "./lib/auth";
import { TwoFactorPanel } from "./AuthScreen";

// ══════════════════════════════════════════════════════════════════════════════
//  PATENTGUARD — NAVIGATION SHELL
//  Single entry point routing between User Portal and Government Portal
// ══════════════════════════════════════════════════════════════════════════════

// Government Portal access is now gated by the examiner role (Supabase Auth),
// not a shared PIN.

// ── Shared storage helpers ────────────────────────────────────────────────────
async function getNotifications() {
  try {
    const r = await store.get("notifications:index", true).catch(() => null);
    if (!r) return [];
    return JSON.parse(r.value).slice(0, 20);
  } catch { return []; }
}

async function addNotification(msg, type, portal) {
  try {
    const r = await store.get("notifications:index", true).catch(() => null);
    const existing = r ? JSON.parse(r.value) : [];
    const entry = { id: Date.now(), msg, type, portal, timestamp: Date.now(), read: false };
    await store.set("notifications:index", JSON.stringify([entry, ...existing].slice(0, 50)), true);
  } catch {}
}

async function markAllRead(portal) {
  try {
    const r = await store.get("notifications:index", true).catch(() => null);
    if (!r) return;
    const updated = JSON.parse(r.value).map(n => n.portal === portal ? { ...n, read: true } : n);
    await store.set("notifications:index", JSON.stringify(updated), true);
  } catch {}
}

// ── Design tokens (neutral shell theme) ───────────────────────────────────────
const S = {
  bg:     "#04060e",
  panel:  "#080d1a",
  border: "#0e1428",
  user:   "#5b4bdb",   // purple — PatentGuard
  gov:    "#0ea87a",   // teal — Government
  text:   "#dde8f5",
  muted:  "#2a3a5a",
  dim:    "#0a0f1e",
};

function Spinner({ size = 14 }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      border: `2px solid ${S.user}40`, borderTopColor: S.user,
      borderRadius: "50%", animation: "shell-spin 0.7s linear infinite",
    }}/>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOGIN / PORTAL SELECTOR
// ══════════════════════════════════════════════════════════════════════════════
function LoginScreen({ onSelect, isExaminer, user, role, onSignOut, onManage2FA }) {
  const [showGovDenied, setShowGovDenied] = useState(false);
  const [hoveredUser,setHoveredUser]= useState(false);
  const [hoveredGov, setHoveredGov] = useState(false);

  const handleGov = () => { isExaminer ? onSelect("gov") : setShowGovDenied(true); };

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: S.bg, fontFamily: "'Courier New', monospace", color: S.text,
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Space+Mono:wght@400;700&display=swap');
        @keyframes shell-spin { to { transform: rotate(360deg); } }
        @keyframes shell-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes shell-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes shell-fade-in { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input { outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #1a2040; border-radius: 2px; }
      `}</style>

      {/* Background grid */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.04,
        backgroundImage: "linear-gradient(#5b4bdb 1px, transparent 1px), linear-gradient(90deg, #5b4bdb 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}/>

      {/* Glow blobs */}
      <div style={{ position:"absolute", top:"20%", left:"15%", width:300, height:300, borderRadius:"50%", background:`${S.user}08`, filter:"blur(80px)", animation:"shell-float 6s ease infinite" }}/>
      <div style={{ position:"absolute", bottom:"20%", right:"15%", width:300, height:300, borderRadius:"50%", background:`${S.gov}08`, filter:"blur(80px)", animation:"shell-float 6s ease infinite 3s" }}/>

      {/* Account bar */}
      <div style={{ position:"absolute", top:16, right:16, display:"flex", alignItems:"center", gap:10, fontFamily:"'Space Mono',monospace", fontSize:11, zIndex:5 }}>
        <span style={{ color:S.muted }}>{user?.email}</span>
        <span style={{ padding:"2px 8px", borderRadius:20,
          background:`${isExaminer?S.gov:S.user}22`, border:`1px solid ${isExaminer?S.gov:S.user}50`,
          color:isExaminer?S.gov:S.user, fontWeight:700, letterSpacing:"0.06em" }}>
          {(role||"applicant").toUpperCase()}
        </span>
        <button onClick={onManage2FA} style={{ padding:"4px 10px", borderRadius:6, background:S.dim, border:`1px solid ${S.border}`, color:S.text, fontFamily:"monospace", fontSize:11, cursor:"pointer" }}>🔐 2FA</button>
        <button onClick={onSignOut} style={{ padding:"4px 10px", borderRadius:6, background:S.dim, border:`1px solid ${S.border}`, color:S.muted, fontFamily:"monospace", fontSize:11, cursor:"pointer" }}>Sign out</button>
      </div>

      {/* Content */}
      <div style={{ position:"relative", textAlign:"center", animation:"shell-fade-in 0.6s ease forwards" }}>

        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, marginBottom:8 }}>
          <div style={{ width:44, height:44, background:`linear-gradient(135deg,${S.user},${S.gov})`, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>⚖</div>
          <div style={{ textAlign:"left" }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:26, letterSpacing:"0.04em" }}>
              PATENT<span style={{ color:S.user }}>GUARD</span>
            </div>
            <div style={{ fontSize:10, color:S.muted, letterSpacing:"0.16em" }}>INTEGRATED PATENT MANAGEMENT SYSTEM</div>
          </div>
        </div>

        <div style={{ fontSize:12, color:S.muted, marginBottom:48, letterSpacing:"0.08em" }}>
          SELECT YOUR PORTAL TO CONTINUE
        </div>

        {!showGovDenied ? (
          <div style={{ display:"flex", gap:20, justifyContent:"center", flexWrap:"wrap" }}>

            {/* USER PORTAL CARD */}
            <div
              onClick={() => onSelect("user")}
              onMouseOver={() => setHoveredUser(true)}
              onMouseOut={() => setHoveredUser(false)}
              style={{
                width: 260, padding:"28px 24px", borderRadius:16, cursor:"pointer",
                background: hoveredUser ? `${S.user}15` : S.panel,
                border: `1px solid ${hoveredUser ? S.user+"80" : S.border}`,
                transition: "all 0.25s", transform: hoveredUser ? "translateY(-4px)" : "none",
                boxShadow: hoveredUser ? `0 12px 40px ${S.user}25` : "none",
              }}
            >
              <div style={{ fontSize:40, marginBottom:16 }}>👤</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:S.user, marginBottom:8, letterSpacing:"0.06em" }}>
                USER PORTAL
              </div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:700, color:S.text, marginBottom:12 }}>
                PatentGuard
              </div>
              <div style={{ fontSize:11, color:S.muted, lineHeight:1.8, marginBottom:20, textAlign:"left" }}>
                • Draft & format patent applications<br/>
                • Real-time prior art scanning<br/>
                • Submit to government queue<br/>
                • Track prosecution deadlines<br/>
                • AI patent attorney chatbot<br/>
                • View global patent ledger
              </div>
              <div style={{
                padding:"10px", borderRadius:8,
                background:`${S.user}22`, border:`1px solid ${S.user}50`,
                fontSize:12, color:S.user, fontWeight:700, letterSpacing:"0.08em",
                transition:"all 0.2s",
              }}>
                OPEN PATENTGUARD →
              </div>
            </div>

            {/* GOVERNMENT PORTAL CARD */}
            <div
              onClick={handleGov}
              onMouseOver={() => setHoveredGov(true)}
              onMouseOut={() => setHoveredGov(false)}
              style={{
                width: 260, padding:"28px 24px", borderRadius:16, cursor:"pointer",
                background: hoveredGov ? `${S.gov}15` : S.panel,
                border: `1px solid ${hoveredGov ? S.gov+"80" : S.border}`,
                transition: "all 0.25s", transform: hoveredGov ? "translateY(-4px)" : "none",
                boxShadow: hoveredGov ? `0 12px 40px ${S.gov}25` : "none",
              }}
            >
              <div style={{ fontSize:40, marginBottom:16 }}>🏛</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:S.gov, marginBottom:8, letterSpacing:"0.06em" }}>
                GOVERNMENT PORTAL
              </div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:700, color:S.text, marginBottom:12 }}>
                USPTO Examiner Interface
              </div>
              <div style={{ fontSize:11, color:S.muted, lineHeight:1.8, marginBottom:20, textAlign:"left" }}>
                • Review pending applications<br/>
                • Run formality & fraud checks<br/>
                • Human claim verification<br/>
                • Issue government codes<br/>
                • Manage patent status flags<br/>
                • Monitor global ledger
              </div>
              <div style={{
                padding:"10px", borderRadius:8,
                background:`${S.gov}22`, border:`1px solid ${S.gov}50`,
                fontSize:12, color:S.gov, fontWeight:700, letterSpacing:"0.08em",
                transition:"all 0.2s",
              }}>
                GOVERNMENT ACCESS →
              </div>
            </div>
          </div>
        ) : (
          /* ACCESS DENIED — applicant trying to open the Government Portal */
          <div style={{ animation:"shell-fade-in 0.3s ease forwards" }}>
            <div style={{
              padding:"32px", borderRadius:16, background:S.panel,
              border:`1px solid ${S.gov}50`, width:340, margin:"0 auto",
              boxShadow:`0 12px 40px ${S.gov}20`,
            }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🏛</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:S.gov, marginBottom:8 }}>
                EXAMINER ACCESS ONLY
              </div>
              <div style={{ fontSize:11, color:S.muted, marginBottom:20, lineHeight:1.7 }}>
                The Government Portal requires a USPTO <b>examiner</b> account.
                Your account role is <b style={{ color:S.user }}>{(role||"applicant").toUpperCase()}</b>.
                Contact an administrator to be granted examiner access.
              </div>
              <button
                onClick={() => setShowGovDenied(false)}
                style={{
                  padding:"10px 16px", borderRadius:8,
                  background:S.dim, border:`1px solid ${S.border}`,
                  color:S.muted, fontFamily:"monospace", fontSize:12, cursor:"pointer",
                }}
              >
                ← BACK
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        position:"absolute", bottom:20, fontSize:10,
        color:S.muted, letterSpacing:"0.1em", textAlign:"center",
      }}>
        PATENTGUARD v4 · GLOBAL LEDGER EDITION · SIMULATED DEMO ENVIRONMENT
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  NOTIFICATION BELL
// ══════════════════════════════════════════════════════════════════════════════
function NotificationBell({ portal, notifications, onRead }) {
  const [open, setOpen] = useState(false);
  const mine    = notifications.filter(n => n.portal === portal || n.portal === "both");
  const unread  = mine.filter(n => !n.read).length;
  const accentC = portal === "gov" ? S.gov : S.user;

  return (
    <div style={{ position:"relative" }}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) onRead(); }}
        style={{
          background:`${accentC}15`, border:`1px solid ${accentC}40`,
          color:accentC, borderRadius:8, padding:"5px 10px", cursor:"pointer",
          fontFamily:"monospace", fontSize:12, display:"flex", alignItems:"center", gap:6,
          position:"relative",
        }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position:"absolute", top:-4, right:-4,
            background:portal==="gov"?S.gov:S.user, color:"#000",
            borderRadius:"50%", width:16, height:16,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:9, fontWeight:700,
          }}>{unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position:"absolute", right:0, top:"calc(100% + 6px)", width:300, zIndex:1000,
          background:S.panel, border:`1px solid ${accentC}40`, borderRadius:10,
          boxShadow:`0 8px 30px #00000060`,
          animation:"shell-fade-in 0.2s ease forwards",
        }}>
          <div style={{ padding:"10px 14px", borderBottom:`1px solid ${S.border}`, fontSize:10, color:accentC, letterSpacing:"0.1em", fontWeight:700 }}>
            NOTIFICATIONS
          </div>
          <div style={{ maxHeight:300, overflowY:"auto" }}>
            {mine.length === 0 && (
              <div style={{ padding:"20px", textAlign:"center", fontSize:11, color:S.muted }}>No notifications</div>
            )}
            {mine.map(n => (
              <div key={n.id} style={{
                padding:"10px 14px", borderBottom:`1px solid ${S.border}`,
                background:n.read?"transparent":`${accentC}08`,
              }}>
                <div style={{ fontSize:11, color:n.read?S.muted:S.text, lineHeight:1.6 }}>{n.msg}</div>
                <div style={{ fontSize:9, color:S.muted, marginTop:3 }}>{new Date(n.timestamp).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  PORTAL WRAPPER (top nav bar over each portal)
// ══════════════════════════════════════════════════════════════════════════════
function PortalWrapper({ portal, onSwitchRequest, notifications, onReadNotifications, onSignOut, onManage2FA }) {
  const isGov    = portal === "gov";
  const accentC  = isGov ? S.gov : S.user;
  const label    = isGov ? "GOVERNMENT PORTAL" : "USER PORTAL";
  const icon     = isGov ? "🏛" : "👤";
  const switchTo = isGov ? "USER PORTAL" : "GOV PORTAL";

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Top navigation bar */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"6px 16px", background:S.dim,
        borderBottom:`2px solid ${accentC}60`, flexShrink:0, zIndex:100,
      }}>
        {/* Left — identity */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:22, height:22, background:`linear-gradient(135deg,${S.user},${S.gov})`, borderRadius:5, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11 }}>⚖</div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:9, color:S.muted, letterSpacing:"0.12em" }}>PATENTGUARD</span>
            <span style={{ fontSize:9, color:S.muted }}>›</span>
            <span style={{ fontSize:9, color:accentC, fontWeight:700, letterSpacing:"0.1em" }}>
              {icon} {label}
            </span>
          </div>
        </div>

        {/* Right — controls */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <NotificationBell portal={portal} notifications={notifications} onRead={() => onReadNotifications(portal)}/>
          <button
            onClick={onSwitchRequest}
            style={{
              background:`${accentC}15`, border:`1px solid ${accentC}40`,
              color:accentC, borderRadius:8, padding:"5px 12px", cursor:"pointer",
              fontFamily:"monospace", fontSize:10, fontWeight:700, letterSpacing:"0.08em",
              display:"flex", alignItems:"center", gap:5, transition:"all 0.2s",
            }}
            onMouseOver={e => e.currentTarget.style.background=`${accentC}28`}
            onMouseOut={e => e.currentTarget.style.background=`${accentC}15`}
          >
            ⇄ SWITCH TO {switchTo}
          </button>
          <button
            onClick={onManage2FA}
            title="Two-factor authentication"
            style={{
              background:S.dim, border:`1px solid ${S.border}`, color:S.text,
              borderRadius:8, padding:"5px 10px", cursor:"pointer",
              fontFamily:"monospace", fontSize:10, fontWeight:700,
            }}
          >
            🔐 2FA
          </button>
          <button
            onClick={onSignOut}
            style={{
              background:S.dim, border:`1px solid ${S.border}`, color:S.muted,
              borderRadius:8, padding:"5px 10px", cursor:"pointer",
              fontFamily:"monospace", fontSize:10, fontWeight:700, letterSpacing:"0.06em",
            }}
          >
            SIGN OUT
          </button>
        </div>
      </div>

      {/* Portal content — fills remaining height */}
      <div style={{ flex:1, overflow:"hidden", minHeight:0 }}>
        {isGov ? <GovPortal /> : <App />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SWITCH CONFIRMATION MODAL
// ══════════════════════════════════════════════════════════════════════════════
function SwitchModal({ currentPortal, onConfirm, onCancel, isExaminer }) {
  const switchingToGov = currentPortal === "user";
  const denied = switchingToGov && !isExaminer;

  const handleConfirm = () => { if (!denied) onConfirm(); };

  return (
    <div style={{
      position:"fixed", inset:0, background:"#00000090",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:9999, animation:"shell-fade-in 0.2s ease",
    }}>
      <div style={{
        padding:"28px", borderRadius:16, background:S.panel,
        border:`1px solid ${switchingToGov ? S.gov+"60" : S.user+"60"}`,
        width:340, boxShadow:`0 16px 60px #00000080`,
        animation:"shell-fade-in 0.2s ease",
      }}>
        <div style={{ fontSize:28, textAlign:"center", marginBottom:12 }}>
          {switchingToGov ? "🏛" : "👤"}
        </div>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:800, textAlign:"center", marginBottom:6,
          color:switchingToGov?S.gov:S.user }}>
          SWITCH TO {switchingToGov ? "GOVERNMENT" : "USER"} PORTAL
        </div>
        <div style={{ fontSize:11, color:S.muted, textAlign:"center", marginBottom:20, lineHeight:1.6 }}>
          {denied
            ? "The Government Portal requires an examiner account. Your role does not have access."
            : switchingToGov
              ? "Switch to the USPTO Government Portal."
              : "Return to the PatentGuard user interface."}
        </div>

        <div style={{ display:"flex", gap:8, marginTop:8 }}>
          {!denied && <button onClick={handleConfirm} style={{
            flex:1, padding:"10px", borderRadius:8,
            background:switchingToGov?`${S.gov}22`:`${S.user}22`,
            border:`1px solid ${switchingToGov?S.gov+"50":S.user+"50"}`,
            color:switchingToGov?S.gov:S.user, fontFamily:"monospace",
            fontSize:12, fontWeight:700, cursor:"pointer", letterSpacing:"0.08em",
          }}>
            CONFIRM →
          </button>}
          <button onClick={onCancel} style={{
            padding:"10px 14px", borderRadius:8,
            background:S.dim, border:`1px solid ${S.border}`,
            color:S.muted, fontFamily:"monospace", fontSize:12, cursor:"pointer",
          }}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  ROOT SHELL
// ══════════════════════════════════════════════════════════════════════════════
export default function Shell() {
  const { isExaminer, user, role, signOut } = useAuth();
  const [portal,        setPortal]        = useState(null); // null | "user" | "gov"
  const [showSwitch,    setShowSwitch]    = useState(false);
  const [show2fa,       setShow2fa]       = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Poll notifications every 5 seconds
  useEffect(() => {
    const load = () => getNotifications().then(setNotifications);
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const handleLogin = (p) => {
    setPortal(p);
    addNotification(
      p === "gov"
        ? "Examiner session started — patent queue loaded"
        : "PatentGuard session started — ledger synced",
      "info", p
    );
  };

  const handleSwitchConfirm = () => {
    const next = portal === "user" ? "gov" : "user";
    setShowSwitch(false);
    setPortal(next);
    addNotification(
      next === "gov"
        ? "Switched to Government Portal"
        : "Switched to PatentGuard User Portal",
      "info", next
    );
  };

  const handleReadNotifications = async (p) => {
    await markAllRead(p);
    const updated = await getNotifications();
    setNotifications(updated);
  };

  if (!portal) return (
    <>
      <LoginScreen
        onSelect={handleLogin}
        isExaminer={isExaminer}
        user={user}
        role={role}
        onSignOut={signOut}
        onManage2FA={() => setShow2fa(true)}
      />
      {show2fa && <TwoFactorPanel onClose={() => setShow2fa(false)} />}
    </>
  );

  return (
    <>
      <PortalWrapper
        portal={portal}
        onSwitchRequest={() => setShowSwitch(true)}
        notifications={notifications}
        onReadNotifications={handleReadNotifications}
        onSignOut={signOut}
        onManage2FA={() => setShow2fa(true)}
      />
      {showSwitch && (
        <SwitchModal
          currentPortal={portal}
          onConfirm={handleSwitchConfirm}
          onCancel={() => setShowSwitch(false)}
          isExaminer={isExaminer}
        />
      )}
      {show2fa && <TwoFactorPanel onClose={() => setShow2fa(false)} />}
    </>
  );
}
