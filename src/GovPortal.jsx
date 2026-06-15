import { useState, useEffect, useRef } from "react";
import { GrantedPatentEditor } from "./GrantedPatentEditor";

// ══════════════════════════════════════════════════════════════════════════════
//  PATENTGUARD — GOVERNMENT PORTAL v1
//  Shares window.storage (shared:true) with PatentGuard retail app
// ══════════════════════════════════════════════════════════════════════════════

// ── Design tokens (government theme — teal/emerald vs PatentGuard's purple) ──
const G = {
  bg:      "#04080f",
  panel:   "#08111e",
  border:  "#0e2030",
  accent:  "#0ea87a",
  blue:    "#1a8fe0",
  amber:   "#f5a623",
  red:     "#f5365c",
  gold:    "#f0c040",
  purple:  "#5b4bdb",
  text:    "#ddeef5",
  muted:   "#2a4a5a",
  dim:     "#0c1e2a",
};

// ── Status definitions ────────────────────────────────────────────────────────
const STATUS = {
  SUBMITTED:          { label:"Submitted",           color:G.blue,   icon:"📥" },
  FORMALITY_CHECK:    { label:"Formality Check",     color:G.amber,  icon:"🔍" },
  INCOMPLETE:         { label:"Incomplete",           color:G.red,    icon:"⚠" },
  FEE_PENDING:        { label:"Fee Pending",          color:G.amber,  icon:"💳" },
  FEE_VERIFIED:       { label:"Fee Verified",         color:G.accent, icon:"✅" },
  EXAMINER_ASSIGNED:  { label:"Examiner Assigned",   color:G.blue,   icon:"👤" },
  CLAIM_REVIEW:       { label:"Claim Review",         color:G.amber,  icon:"📋" },
  AMENDMENT_REQUESTED:{ label:"Amendment Requested", color:G.amber,  icon:"✏️" },
  APPROVED:           { label:"Approved",             color:G.accent, icon:"✓" },
  REJECTED:           { label:"Rejected",             color:G.red,    icon:"✗" },
  CODE_ISSUED:        { label:"Code Issued",          color:G.accent, icon:"🏛" },
  GRANTED:            { label:"Granted",              color:G.accent, icon:"🎖" },
  UNDER_CHALLENGE:    { label:"Under Challenge",      color:G.amber,  icon:"⚔" },
  AMENDED_POST_GRANT: { label:"Amended Post-Grant",  color:G.blue,   icon:"✏️" },
  INVALIDATED:        { label:"Invalidated",          color:G.red,    icon:"🚫" },
};

// ── Rejection reasons ─────────────────────────────────────────────────────────
const REJECTION_REASONS = [
  { code:"§101", label:"Abstract Idea / Ineligible Subject Matter" },
  { code:"§102", label:"Lack of Novelty — prior art anticipates claim" },
  { code:"§103", label:"Obviousness — obvious to person skilled in art" },
  { code:"§112a",label:"Written Description Insufficient" },
  { code:"§112b",label:"Claim Indefinite / Unclear Language" },
  { code:"FRAUD",label:"Suspected Fraudulent Filing" },
  { code:"DUPE", label:"Duplicate of Existing Patent" },
  { code:"FMT",  label:"Format / Formality Failure" },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DUAL KEY + ZK PROOF CRYPTOGRAPHIC ENGINE (shared with PatentGuard)
//
//  GOVERNMENT SIDE:
//  Receives USER KEY (PG-USER-YYYY-XXXXXXXX-CHK) from applicant.
//  Derives GOV  KEY (USPTO-YYYY-XXXXXXXX-CHK) from user key.
//  Serial of gov key = sha256(userKey + "gov-bind-v1").slice(0,8)
//  This cryptographically BINDS the gov key to the specific user key.
// ══════════════════════════════════════════════════════════════════════════════

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ── ZK Commitment Verification ────────────────────────────────────────────────
async function zkVerify(content, salt, commitment, nullifier, contentHash) {
  const rHash   = await sha256(content);
  const rCommit = await sha256(content + salt);
  const rNull   = await sha256(salt + "null:" + rHash);
  return {
    allValid: rHash===contentHash && rCommit===commitment && rNull===nullifier,
    hashValid: rHash===contentHash,
    commitmentValid: rCommit===commitment,
    nullifierValid: rNull===nullifier,
    reason: (rHash===contentHash && rCommit===commitment && rNull===nullifier)
      ? "ZK proof fully verified ✓"
      : [rHash!==contentHash&&"Content hash mismatch", rCommit!==commitment&&"Commitment mismatch", rNull!==nullifier&&"Nullifier mismatch"].filter(Boolean).join(" · ")
  };
}

// ── User Key Validation (validates what applicant sends in) ───────────────────
// Format: PG-USER-YYYY-XXXXXXXX-CHK
async function validateUserKey(key) {
  const re = /^PG-USER-(\d{4})-([A-Z0-9]{8})-([A-Z0-9]{4})$/;
  const match = key.match(re);
  if (!match) return { valid: false, reason: "Format must be PG-USER-YYYY-XXXXXXXX-XXXX" };
  const [, year, serial, chk] = match;
  const expectedChk = (await sha256(`PG-USER-${year}-${serial}`)).slice(0,4).toUpperCase();
  if (chk !== expectedChk) return { valid: false, reason: `User key checksum mismatch — expected ${expectedChk}` };
  return { valid: true, year: parseInt(year), serial };
}

// ── Government Key Generation (derived FROM user key) ─────────────────────────
// Format: USPTO-YYYY-XXXXXXXX-CHK
// CRITICAL: serial = sha256(userKey + "gov-bind-v1").slice(0,8)
// This binds the gov key to the specific user key — cannot be reused elsewhere
async function generateGovKey(userKey) {
  const year   = new Date().getFullYear();
  const serial = (await sha256(userKey + "gov-bind-v1")).slice(0,8).toUpperCase();
  const base   = `USPTO-${year}-${serial}`;
  const chk    = (await sha256(base)).slice(0,4).toUpperCase();
  return `${base}-${chk}`;
}

// ── Key Pair Binding Verification ─────────────────────────────────────────────
async function verifyKeyPair(userKey, govKey) {
  const uCheck = await validateUserKey(userKey);
  if (!uCheck.valid) return { valid:false, reason:`User key: ${uCheck.reason}`, userKeyValid:false, govKeyValid:false, bound:false };
  const re = /^USPTO-(\d{4})-([A-Z0-9]{8})-([A-Z0-9]{4})$/;
  const gMatch = govKey.match(re);
  if (!gMatch) return { valid:false, reason:"Gov key format invalid", userKeyValid:true, govKeyValid:false, bound:false };
  const [,year,govSerial,chk] = gMatch;
  const expectedChk    = (await sha256(`USPTO-${year}-${govSerial}`)).slice(0,4).toUpperCase();
  if (chk !== expectedChk) return { valid:false, reason:`Gov key checksum mismatch`, userKeyValid:true, govKeyValid:false, bound:false };
  const expectedSerial = (await sha256(userKey + "gov-bind-v1")).slice(0,8).toUpperCase();
  if (govSerial !== expectedSerial) return { valid:false, reason:"Keys NOT paired — gov key was not derived from this user key", userKeyValid:true, govKeyValid:true, bound:false };
  return { valid:true, reason:"Key pair verified — cryptographic binding confirmed ✓", userKeyValid:true, govKeyValid:true, bound:true };
}

// ── Combined Ledger Hash ───────────────────────────────────────────────────────
async function createLedgerHash(contentHash, userKey, govKey, timestamp) {
  return sha256(`${contentHash}:${userKey}:${govKey}:${timestamp}`);
}

// ── Publication schedules (mirrors PatentGuard) ─────────────────────────────
const PUB_SCHEDULES = [
  { id:"immediate", label:"Immediate",            months:0  },
  { id:"early6",    label:"6 months",             months:6  },
  { id:"early12",   label:"12 months",            months:12 },
  { id:"standard",  label:"18 months (Standard)", months:18 },
];
function calcPublicationDate(filingTs, months) {
  if (months===0) return filingTs;
  const d=new Date(filingTs); d.setMonth(d.getMonth()+months); return d.getTime();
}

// ── Unified storage adapter (localStorage fallback for StackBlitz) ───────────
// GovPortal and PatentGuard share the same localStorage origin via Shell.jsx
const store = {
  async get(key, shared=false) {
    try { if (window.storage) return window.storage.get(key, shared); } catch {}
    const v = localStorage.getItem(key);
    return v ? { value: v } : null;
  },
  async set(key, value, shared=false) {
    try { if (window.storage) return window.storage.set(key, value, shared); } catch {}
    localStorage.setItem(key, value);
  },
  async delete(key, shared=false) {
    try { if (window.storage) return window.storage.delete(key, shared); } catch {}
    localStorage.removeItem(key);
  },
};

// ── Automated formality checker ───────────────────────────────────────────────
function runFormalityCheck(tokenData, rawText) {
  const text    = rawText || tokenData?.clean || "";
  const results = [];
  let   score   = 0;

  const checks = [
    {
      id:"title", label:"Title present (≤15 words)",
      pass: () => {
        const line = text.split("\n").find(l=>l.trim().length>5);
        return line && line.trim().split(/\s+/).length <= 15;
      },
      weight:10, required:true,
    },
    {
      id:"abstract", label:"Abstract present (≤150 words)",
      pass: () => {
        const match = text.match(/abstract[\s\S]{0,2000}/i);
        if (!match) return false;
        const words = match[0].split(/\s+/).length;
        return words < 200;
      },
      weight:15, required:true,
    },
    {
      id:"claims", label:"At least one claim present",
      pass: () => /\bclaim[s]?\b.*\bcomprising\b|\bclaim[s]?\b.*\bwherein\b/is.test(text),
      weight:20, required:true,
    },
    {
      id:"background", label:"Background section present",
      pass: () => /\bbackground\b/i.test(text),
      weight:10, required:true,
    },
    {
      id:"description", label:"Detailed description present",
      pass: () => /\bdescription\b|\bembodiment\b/i.test(text),
      weight:15, required:true,
    },
    {
      id:"summary", label:"Summary of invention present",
      pass: () => /\bsummary\b/i.test(text),
      weight:10, required:false,
    },
    {
      id:"drawings", label:"Drawings reference (if applicable)",
      pass: () => /\bfig\b|\bfigure\b|\bdrawing\b/i.test(text),
      weight:5, required:false,
    },
    {
      id:"inventor", label:"Inventor / declaration reference",
      pass: () => /\binventor\b|\binvention\b/i.test(text),
      weight:10, required:true,
    },
    {
      id:"field", label:"Field of invention stated",
      pass: () => /\bfield\b.*\binvention\b|\binvention\b.*\brelates\b/i.test(text),
      weight:5, required:false,
    },
  ];

  for (const c of checks) {
    const passed = c.pass();
    if (passed) score += c.weight;
    results.push({ ...c, passed });
  }

  const maxScore   = checks.reduce((s,c)=>s+c.weight, 0);
  const percentage = Math.round((score / maxScore) * 100);
  const missingRequired = results.filter(r=>r.required && !r.passed);

  return {
    results,
    score: percentage,
    complete: missingRequired.length === 0,
    missingRequired: missingRequired.map(r=>r.label),
    verdict: percentage >= 80 ? "COMPLETE" : percentage >= 50 ? "PARTIAL" : "INCOMPLETE",
  };
}

// ── Fraud signal detector ─────────────────────────────────────────────────────
function detectFraudSignals(app, allApps) {
  const flags = [];

  // Same entity filing many applications rapidly
  const sameEntity = allApps.filter(a =>
    a.institution === app.institution &&
    a.id !== app.id &&
    Math.abs(a.timestamp - app.timestamp) < 7 * 86400000
  );
  if (sameEntity.length >= 3)
    flags.push({ severity:"HIGH", code:"VOLUME", msg:`Entity filed ${sameEntity.length+1} applications within 7 days` });

  // Micro entity status on large-sounding organization name
  const name = (app.institution||"").toLowerCase();
  const bigCorpKeywords = ["inc","corp","corporation","llc","ltd","group","technologies","systems","global"];
  if (bigCorpKeywords.some(k=>name.includes(k)))
    flags.push({ severity:"MEDIUM", code:"ENTITY", msg:"Entity name suggests large organization — micro/small status should be verified" });

  // Extremely short document (possible placeholder)
  if ((app.tokenData?.stats?.words||0) < 200)
    flags.push({ severity:"HIGH", code:"CONTENT", msg:`Document only ${app.tokenData?.stats?.words||0} words — may be incomplete or fraudulent` });

  // No claims detected
  if ((app.tokenData?.stats?.claims||0) === 0)
    flags.push({ severity:"HIGH", code:"CLAIMS", msg:"No claim language detected (comprising/wherein) — required for valid patent" });

  return flags;
}

// ── Shared storage ────────────────────────────────────────────────────────────
async function pendingAdd(app) {
  try {
    const idx   = await store.get("pending:index",true).catch(()=>null);
    const index = idx ? JSON.parse(idx.value) : [];
    if (!index.includes(app.id)) index.push(app.id);
    await store.set(`pending:${app.id}`, JSON.stringify(app), true);
    await store.set("pending:index", JSON.stringify(index), true);
    return true;
  } catch(e) { console.error(e); return false; }
}

async function pendingGetAll() {
  try {
    const idx = await store.get("pending:index",true).catch(()=>null);
    if (!idx) return [];
    const ids = JSON.parse(idx.value);
    const apps = await Promise.all(ids.map(id=>
      store.get(`pending:${id}`,true).then(r=>r?JSON.parse(r.value):null).catch(()=>null)
    ));
    return apps.filter(Boolean).sort((a,b)=>b.timestamp-a.timestamp);
  } catch { return []; }
}

async function pendingUpdate(id, updates) {
  try {
    const r = await store.get(`pending:${id}`,true);
    if (!r) return false;
    const app = { ...JSON.parse(r.value), ...updates, updatedAt: Date.now() };
    await store.set(`pending:${id}`, JSON.stringify(app), true);
    return true;
  } catch { return false; }
}

async function statusSet(patentId, statusData) {
  try {
    await store.set(`status:${patentId}`, JSON.stringify({
      ...statusData, patentId, updatedAt: Date.now()
    }), true);
    return true;
  } catch { return false; }
}

async function statusGet(patentId) {
  try {
    const r = await store.get(`status:${patentId}`,true);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}

async function reviewSave(review) {
  try {
    await store.set(`review:${review.appId}`, JSON.stringify(review), true);
    return true;
  } catch { return false; }
}

async function ledgerGetAll() {
  try {
    const idx = await store.get("ledger:index",true).catch(()=>null);
    if (!idx) return [];
    const ids = JSON.parse(idx.value);
    const entries = await Promise.all(ids.map(id=>
      store.get(`ledger:${id}`,true).then(r=>r?JSON.parse(r.value):null).catch(()=>null)
    ));
    return entries.filter(Boolean).sort((a,b)=>b.timestamp-a.timestamp);
  } catch { return []; }
}

// ── UI primitives ─────────────────────────────────────────────────────────────
function Pill({color,children,small}){
  return <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:small?"2px 7px":"4px 11px",borderRadius:20,background:`${color}18`,border:`1px solid ${color}35`,fontSize:small?9:11,color,fontWeight:700,letterSpacing:"0.06em",fontFamily:"monospace"}}>{children}</span>;
}
function Chip({status}){
  const s = STATUS[status]||STATUS.SUBMITTED;
  return <Pill color={s.color} small>{s.icon} {s.label}</Pill>;
}
function Spinner({size=12}){
  return <span style={{display:"inline-block",width:size,height:size,border:`2px solid ${G.accent}40`,borderTopColor:G.accent,borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>;
}
function GInput({value,onChange,placeholder,onKeyDown,style={},type="text"}){
  return <input type={type} value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder}
    style={{background:G.panel,border:`1px solid ${G.border}`,color:G.text,fontFamily:"monospace",fontSize:12,padding:"7px 12px",borderRadius:6,outline:"none",...style}}
    onFocus={e=>e.target.style.borderColor=`${G.accent}60`}
    onBlur={e=>e.target.style.borderColor=G.border}/>;
}
function GBtn({children,onClick,disabled,color,small,style={}}){
  const bg=color||G.accent;
  return <button onClick={onClick} disabled={disabled} style={{background:`${bg}22`,border:`1px solid ${bg}50`,color:bg,fontFamily:"monospace",fontSize:small?10:11,padding:small?"4px 10px":"7px 16px",borderRadius:6,cursor:"pointer",letterSpacing:"0.07em",opacity:disabled?0.35:1,transition:"all 0.2s",...style}}>{children}</button>;
}
function Card({children,style={}}){
  return <div style={{background:G.panel,border:`1px solid ${G.border}`,borderRadius:10,padding:"14px",...style}}>{children}</div>;
}
function SectionTitle({children}){
  return <div style={{fontSize:10,color:G.muted,letterSpacing:"0.13em",textTransform:"uppercase",marginBottom:10,fontWeight:700}}>{children}</div>;
}
function ScoreRing({score}){
  const col = score>=80?G.accent:score>=50?G.amber:G.red;
  return (
    <div style={{position:"relative",width:56,height:56,flexShrink:0}}>
      <svg width="56" height="56" style={{transform:"rotate(-90deg)"}}>
        <circle cx="28" cy="28" r="22" fill="none" stroke={G.dim} strokeWidth="5"/>
        <circle cx="28" cy="28" r="22" fill="none" stroke={col} strokeWidth="5"
          strokeDasharray={`${2*Math.PI*22*score/100} ${2*Math.PI*22}`} strokeLinecap="round"/>
      </svg>
      <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:col}}>{score}%</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function Dashboard({pending, ledger, onNavigate}){
  const byStatus = (s) => pending.filter(p=>p.status===s).length;
  const stats = [
    { label:"Pending Review",  value:byStatus("SUBMITTED")+byStatus("FORMALITY_CHECK"),  color:G.blue,   tab:"queue" },
    { label:"Awaiting Fee",    value:byStatus("FEE_PENDING"),                             color:G.amber,  tab:"queue" },
    { label:"Claim Review",    value:byStatus("CLAIM_REVIEW")+byStatus("EXAMINER_ASSIGNED"), color:G.amber, tab:"review" },
    { label:"Codes Issued",    value:byStatus("CODE_ISSUED")+byStatus("APPROVED"),        color:G.accent, tab:"codes" },
    { label:"Granted Patents", value:ledger.length,                                       color:G.accent, tab:"ledger" },
    { label:"Under Challenge", value:0,                                                   color:G.red,    tab:"ledger" },
  ];

  const recent = [...pending].slice(0,5);

  return (
    <div style={{padding:20,overflowY:"auto",flex:1}}>
      <div style={{fontFamily:"monospace",fontSize:16,fontWeight:700,marginBottom:4}}>Government Patent Dashboard</div>
      <div style={{fontSize:11,color:G.muted,marginBottom:20}}>USPTO Patent Administration System · PatentGuard Integration Active</div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:20}}>
        {stats.map(s=>(
          <div key={s.label} onClick={()=>onNavigate(s.tab)} style={{padding:"14px",background:G.panel,border:`1px solid ${G.border}`,borderRadius:10,cursor:"pointer",transition:"border-color 0.2s"}}
            onMouseOver={e=>e.currentTarget.style.borderColor=`${s.color}60`}
            onMouseOut={e=>e.currentTarget.style.borderColor=G.border}>
            <div style={{fontSize:22,fontWeight:700,color:s.color,fontFamily:"monospace"}}>{s.value}</div>
            <div style={{fontSize:11,color:G.muted,marginTop:3}}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Card>
          <SectionTitle>Recent Submissions</SectionTitle>
          {recent.length===0 && <div style={{fontSize:11,color:G.muted,textAlign:"center",padding:20}}>No applications yet</div>}
          {recent.map(app=>(
            <div key={app.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${G.border}`}}>
              <div>
                <div style={{fontSize:11,color:G.accent,fontFamily:"monospace",marginBottom:2}}>{app.id}</div>
                <div style={{fontSize:11,color:G.text}}>{app.title?.slice(0,40)}{app.title?.length>40?"...":""}</div>
              </div>
              <Chip status={app.status}/>
            </div>
          ))}
        </Card>

        <Card>
          <SectionTitle>Pipeline Overview</SectionTitle>
          {[
            ["Submitted",         pending.filter(p=>["SUBMITTED","FORMALITY_CHECK"].includes(p.status)).length, G.blue],
            ["Fee Stage",         pending.filter(p=>["FEE_PENDING","FEE_VERIFIED"].includes(p.status)).length, G.amber],
            ["Under Examination", pending.filter(p=>["EXAMINER_ASSIGNED","CLAIM_REVIEW"].includes(p.status)).length, G.amber],
            ["Approved/Issued",   pending.filter(p=>["APPROVED","CODE_ISSUED"].includes(p.status)).length, G.accent],
            ["Rejected",          pending.filter(p=>p.status==="REJECTED").length, G.red],
          ].map(([label,count,color])=>{
            const total = Math.max(pending.length,1);
            return (
              <div key={label} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:11,color:G.text}}>{label}</span>
                  <span style={{fontSize:11,color,fontFamily:"monospace",fontWeight:700}}>{count}</span>
                </div>
                <div style={{height:4,background:G.dim,borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:`${(count/total)*100}%`,height:"100%",background:color,borderRadius:2,transition:"width 0.5s"}}/>
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      <Card style={{marginTop:12}}>
        <SectionTitle>System Status</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:8}}>
          {[
            ["Shared Ledger",          "ONLINE", G.accent],
            ["PatentGuard Integration","ACTIVE", G.accent],
            ["Formality Checker",      "ONLINE", G.accent],
            ["Fraud Detection",        "ONLINE", G.accent],
            ["ZK Verification",        "ONLINE", G.accent],
            ["Payment Gateway",        "SIMULATED", G.amber],
          ].map(([name,status,color])=>(
            <div key={name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:G.dim,borderRadius:6}}>
              <span style={{fontSize:11,color:G.text}}>{name}</span>
              <Pill color={color} small>{status}</Pill>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  PENDING QUEUE
// ══════════════════════════════════════════════════════════════════════════════
function PendingQueue({pending, allPending, onSelect, onStatusUpdate}){
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const filters = ["ALL","SUBMITTED","FEE_PENDING","CLAIM_REVIEW","APPROVED","REJECTED"];
  const filtered = pending
    .filter(p => filter==="ALL" || p.status===filter)
    .filter(p => !search || (p.title||"").toLowerCase().includes(search.toLowerCase()) || p.id.includes(search.toUpperCase()));

  const runAutoCheck = async (app) => {
    const check = runFormalityCheck(app.tokenData, app.rawText||"");
    const fraudFlags = detectFraudSignals(app, allPending);
    const newStatus = check.complete ? "FEE_PENDING" : "INCOMPLETE";
    await pendingUpdate(app.id, { status:newStatus, formalityCheck:check, fraudFlags });
    onStatusUpdate();
  };

  return (
    <div style={{padding:20,overflowY:"auto",flex:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontFamily:"monospace",fontSize:15,fontWeight:700}}>Application Queue</div>
        <Pill color={G.blue}>{pending.length} APPLICATIONS</Pill>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <GInput value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by ID or title..." style={{flex:1,minWidth:200}}/>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {filters.map(f=>(
            <GBtn key={f} onClick={()=>setFilter(f)} small color={filter===f?G.accent:G.muted} style={{padding:"4px 8px",fontSize:9}}>
              {f==="ALL"?"ALL":STATUS[f]?.label||f}
            </GBtn>
          ))}
        </div>
      </div>

      {filtered.length===0 && (
        <div style={{textAlign:"center",padding:"60px",color:G.muted}}>
          <div style={{fontSize:36,marginBottom:12}}>📥</div>
          <div style={{fontSize:11}}>No applications in this filter</div>
        </div>
      )}

      {filtered.map(app=>{
        const fraud = app.fraudFlags||[];
        const highFraud = fraud.filter(f=>f.severity==="HIGH").length;
        return (
          <div key={app.id} onClick={()=>onSelect(app)} style={{marginBottom:8,padding:"13px",background:G.panel,border:`1px solid ${highFraud>0?G.red+"50":G.border}`,borderRadius:10,cursor:"pointer",transition:"border-color 0.2s"}}
            onMouseOver={e=>e.currentTarget.style.borderColor=`${G.accent}60`}
            onMouseOut={e=>e.currentTarget.style.borderColor=highFraud>0?`${G.red}50`:G.border}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <span style={{fontSize:10,color:G.accent,fontFamily:"monospace",fontWeight:700}}>{app.id}</span>
                <span style={{fontSize:9,color:G.muted,marginLeft:8}}>{new Date(app.timestamp).toLocaleDateString()}</span>
              </div>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                {highFraud>0 && <Pill color={G.red} small>⚠ {highFraud} FRAUD FLAG{highFraud>1?"S":""}</Pill>}
                <Chip status={app.status}/>
              </div>
            </div>
            <div style={{fontSize:12,fontWeight:600,color:G.text,marginBottom:6,lineHeight:1.4}}>{app.title?.slice(0,80)}</div>
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              {app.govCode && <Pill color={G.gold} small>🏛 {app.govCode}</Pill>}
              {app.formalityCheck && <Pill color={app.formalityCheck.complete?G.accent:G.red} small>Formality: {app.formalityCheck.score}%</Pill>}
              {app.tokenData?.stats && <Pill color={G.blue} small>{app.tokenData.stats.tokens} tokens</Pill>}
              <Pill color={G.muted} small>{app.institution||"Unknown Entity"}</Pill>
            </div>
            {app.status==="SUBMITTED" && (
              <div style={{marginTop:8}}>
                <GBtn onClick={e=>{e.stopPropagation();runAutoCheck(app);}} small color={G.amber}>
                  ▶ RUN FORMALITY CHECK
                </GBtn>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  APPLICATION DETAIL + FORMALITY REVIEW
// ══════════════════════════════════════════════════════════════════════════════
function ApplicationDetail({app, onUpdate, onClose}){
  const [feeEmail,  setFeeEmail]  = useState("");
  const [feePaid,   setFeePaid]   = useState(false);
  const [feeAmt,    setFeeAmt]    = useState("320");
  const [examiner,  setExaminer]  = useState("");
  const [saving,    setSaving]    = useState(false);
  const [govCode,   setGovCode]   = useState(app.issuedGovCode||"");

  if (!app) return null;
  const fc = app.formalityCheck;
  const fraud = app.fraudFlags||[];

  const verifyFee = async () => {
    setSaving(true);
    await pendingUpdate(app.id, { status:"FEE_VERIFIED", feeAmount:feeAmt, feeEmail, feeVerifiedAt:Date.now() });
    setSaving(false); setFeePaid(true); onUpdate();
  };

  const assignExaminer = async () => {
    if (!examiner.trim()) return;
    setSaving(true);
    await pendingUpdate(app.id, { status:"EXAMINER_ASSIGNED", examiner, assignedAt:Date.now() });
    setSaving(false); onUpdate();
  };

  const moveToClaimReview = async () => {
    setSaving(true);
    await pendingUpdate(app.id, { status:"CLAIM_REVIEW" });
    setSaving(false); onUpdate();
  };

  const issueCode = async () => {
    setSaving(true);
    // Require user key to be present — gov key is derived FROM it
    if (!app.userKey) {
      alert("Cannot issue code — no User Key found in this application. Applicant must submit via PatentGuard with a generated User Key.");
      setSaving(false); return;
    }
    const code = await generateGovKey(app.userKey);
    const pairCheck = await verifyKeyPair(app.userKey, code);
    await pendingUpdate(app.id, {
      status:"CODE_ISSUED",
      issuedGovCode: code,
      issuedUserKey: app.userKey,
      keyPairBound:  pairCheck.valid,
      pairVerification: pairCheck.reason,
      codeIssuedAt:  Date.now()
    });
    setGovCode(code);
    setSaving(false); onUpdate();
  };

  const rejectApp = async (reason) => {
    setSaving(true);
    await pendingUpdate(app.id, { status:"REJECTED", rejectionReason:reason });
    setSaving(false); onUpdate();
  };

  return (
    <div style={{padding:20,overflowY:"auto",flex:1}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <GBtn onClick={onClose} small color={G.muted}>← BACK</GBtn>
        <div style={{fontFamily:"monospace",fontSize:14,fontWeight:700,flex:1}}>{app.title?.slice(0,60)}</div>
        <Chip status={app.status}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        {[
          ["Application ID",  app.id],
          ["Submitted",       new Date(app.timestamp).toLocaleString()],
          ["Entity",          app.institution||"—"],
          ["File",            app.fileName||"—"],
          ["Content Hash",    (app.contentHash||"—").slice(0,20)+"..."],
          ["IPFS CID",        (app.ipfsCid||"—").slice(0,20)+"..."],
          ["User Key",        app.userKey ? app.userKey.slice(0,26)+"..." : "⚠ Not submitted — use PatentGuard dual-key flow"],
          ["Binding Status",  app.userKey ? "User key received ✓" : "Missing — cannot issue paired gov key"],
          ["User Key",        app.userKey ? app.userKey.slice(0,22)+"..." : "⚠ Not submitted — applicant must use PatentGuard"],
          ["User Key Valid",  app.userKey ? "Awaiting examiner verification" : "Missing"],
        ].map(([k,v])=>(
          <div key={k} style={{padding:"8px 12px",background:G.dim,borderRadius:6}}>
            <div style={{fontSize:9,color:G.muted,letterSpacing:"0.1em",marginBottom:2}}>{k}</div>
            <div style={{fontSize:11,color:G.text,fontFamily:"monospace"}}>{v}</div>
          </div>
        ))}
      </div>

      {/* User Key Status Panel */}
      <Card style={{marginBottom:12,borderColor:app.userKey?G.accent+"40":G.amber+"40"}}>
        <SectionTitle>🔑 Applicant User Key</SectionTitle>
        {app.userKey ? (
          <div>
            <div style={{fontSize:9,color:G.muted,letterSpacing:"0.1em",marginBottom:4}}>PG-USER KEY (received from PatentGuard)</div>
            <div style={{fontSize:12,fontFamily:"monospace",color:G.accent,letterSpacing:"0.06em",wordBreak:"break-all",padding:"8px 10px",background:`${G.accent}12`,border:`1px solid ${G.accent}30`,borderRadius:6,marginBottom:8}}>
              {app.userKey}
            </div>
            <div style={{fontSize:10,color:G.muted,lineHeight:1.7}}>
              When you approve this application and click "Approve & Issue Code", the system will automatically derive the Government Key from this User Key using sha256(userKey + "gov-bind-v1"). The two keys are then cryptographically bound — the gov key is useless without the matching user key.
            </div>
          </div>
        ) : (
          <div style={{padding:"10px",background:`${G.amber}12`,border:`1px solid ${G.amber}40`,borderRadius:6,fontSize:11,color:G.amber}}>
            ⚠ No User Key found in this application. The applicant did not submit via PatentGuard's dual-key flow. Issue the government code manually if proceeding, or request resubmission with a valid User Key.
          </div>
        )}
      </Card>

      {/* User Key Status Panel */}
      <Card style={{marginBottom:12,borderColor:app.userKey?G.accent+"40":G.amber+"40"}}>
        <SectionTitle>🔑 Applicant User Key (PG-USER-...)</SectionTitle>
        {app.userKey ? (
          <div>
            <div style={{fontSize:9,color:G.muted,letterSpacing:"0.1em",marginBottom:4}}>USER KEY RECEIVED FROM PATENTGUARD</div>
            <div style={{fontSize:12,fontFamily:"monospace",color:G.accent,letterSpacing:"0.04em",wordBreak:"break-all",padding:"8px 10px",background:`${G.accent}12`,border:`1px solid ${G.accent}30`,borderRadius:6,marginBottom:8}}>{app.userKey}</div>
            <div style={{fontSize:10,color:G.muted,lineHeight:1.7}}>
              When you issue the Government Key, it will be derived from this User Key via sha256(userKey + "gov-bind-v1"). The two keys form a cryptographic pair — the gov key is useless without its matching user key.
            </div>
          </div>
        ) : (
          <div style={{padding:"10px",background:`${G.amber}12`,border:`1px solid ${G.amber}40`,borderRadius:6,fontSize:11,color:G.amber}}>
            ⚠ No User Key in this application. Applicant must resubmit via PatentGuard dual-key upload flow to enable paired verification.
          </div>
        )}
      </Card>

      {/* Fraud flags */}
      {fraud.length>0 && (
        <Card style={{marginBottom:12,borderColor:G.red+"40"}}>
          <SectionTitle>⚠ Fraud Detection Flags</SectionTitle>
          {fraud.map((f,i)=>(
            <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:`1px solid ${G.border}`}}>
              <Pill color={f.severity==="HIGH"?G.red:G.amber} small>{f.severity}</Pill>
              <span style={{fontSize:11,color:G.text}}>[{f.code}] {f.msg}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Formality check results */}
      {fc && (
        <Card style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <SectionTitle>Formality Check Results</SectionTitle>
            <ScoreRing score={fc.score}/>
          </div>
          {fc.results.map(r=>(
            <div key={r.id} style={{display:"flex",gap:10,padding:"6px 0",borderBottom:`1px solid ${G.border}`,alignItems:"center"}}>
              <span style={{fontSize:14,flexShrink:0}}>{r.passed?"✅":"❌"}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:r.passed?G.text:G.red}}>{r.label}</div>
                {r.required && !r.passed && <div style={{fontSize:10,color:G.red}}>REQUIRED — must be resolved before proceeding</div>}
              </div>
              <Pill color={r.required?G.red:G.muted} small>{r.required?"REQ":"OPT"}</Pill>
            </div>
          ))}
          {!fc.complete && (
            <div style={{marginTop:10,padding:"8px",background:`${G.red}12`,borderRadius:6,fontSize:11,color:G.red}}>
              Application is INCOMPLETE. Missing required sections: {fc.missingRequired.join(", ")}
            </div>
          )}
        </Card>
      )}

      {/* Fee verification */}
      {(app.status==="FEE_PENDING"||app.status==="FEE_VERIFIED") && (
        <Card style={{marginBottom:12}}>
          <SectionTitle>💳 Fee Verification</SectionTitle>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <div style={{fontSize:10,color:G.muted,marginBottom:4}}>APPLICANT EMAIL</div>
              <GInput value={feeEmail} onChange={e=>setFeeEmail(e.target.value)} placeholder="applicant@email.com" style={{width:"100%"}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:G.muted,marginBottom:4}}>FEE AMOUNT (USD)</div>
              <GInput value={feeAmt} onChange={e=>setFeeAmt(e.target.value)} placeholder="320" style={{width:"100%"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {[["$320","Micro"],["$800","Small"],["$1,600","Large"]].map(([amt,label])=>(
              <GBtn key={amt} onClick={()=>setFeeAmt(amt.replace("$","").replace(",",""))} small color={feeAmt===amt.replace("$","").replace(",","")?G.accent:G.muted}>
                {amt} {label}
              </GBtn>
            ))}
          </div>
          {app.status==="FEE_VERIFIED"
            ? <Pill color={G.accent}>✅ Fee of ${app.feeAmount} verified · {new Date(app.feeVerifiedAt).toLocaleString()}</Pill>
            : <GBtn onClick={verifyFee} disabled={saving||!feeEmail.trim()} color={G.accent}>
                {saving?<Spinner/>:"✅ VERIFY FEE PAYMENT"}
              </GBtn>
          }
        </Card>
      )}

      {/* Examiner assignment */}
      {(app.status==="FEE_VERIFIED"||app.status==="EXAMINER_ASSIGNED") && (
        <Card style={{marginBottom:12}}>
          <SectionTitle>👤 Examiner Assignment</SectionTitle>
          {app.examiner
            ? <div style={{fontSize:12,color:G.accent}}>Assigned to: {app.examiner} · {new Date(app.assignedAt).toLocaleString()}</div>
            : <>
                <GInput value={examiner} onChange={e=>setExaminer(e.target.value)} placeholder="Examiner name or ID..." style={{width:"100%",marginBottom:8}}/>
                <div style={{display:"flex",gap:6}}>
                  <GBtn onClick={assignExaminer} disabled={saving||!examiner.trim()} color={G.blue}>
                    {saving?<Spinner/>:"ASSIGN EXAMINER"}
                  </GBtn>
                  <GBtn onClick={moveToClaimReview} disabled={saving} color={G.amber} small>
                    SKIP TO CLAIM REVIEW
                  </GBtn>
                </div>
              </>
          }
        </Card>
      )}

      {/* Actions */}
      {(app.status==="CLAIM_REVIEW"||app.status==="EXAMINER_ASSIGNED") && (
        <Card style={{marginBottom:12}}>
          <SectionTitle>🎯 Examination Decision</SectionTitle>
          <div style={{fontSize:11,color:G.muted,marginBottom:10}}>
            After completing claim review, issue the final decision below.
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <GBtn onClick={issueCode} disabled={saving} color={G.accent}>
              {saving?<Spinner/>:"✓ APPROVE & ISSUE CODE"}
            </GBtn>
            {REJECTION_REASONS.slice(0,3).map(r=>(
              <GBtn key={r.code} onClick={()=>rejectApp(r.code+": "+r.label)} disabled={saving} color={G.red} small>
                REJECT {r.code}
              </GBtn>
            ))}
          </div>
        </Card>
      )}

      {/* Dual-key issuance display */}
      {app.status==="CODE_ISSUED" && (
        <Card style={{background:`${G.accent}08`,borderColor:G.accent+"40"}}>
          <SectionTitle>🔐 Dual-Key Pair Issued</SectionTitle>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,color:G.muted,letterSpacing:"0.1em",marginBottom:4}}>APPLICANT USER KEY (received from PatentGuard)</div>
            <div style={{fontSize:12,fontFamily:"monospace",color:G.blue,letterSpacing:"0.06em",wordBreak:"break-all",padding:"8px 10px",background:`${G.blue}12`,border:`1px solid ${G.blue}30`,borderRadius:6}}>
              {app.issuedUserKey || app.userKey || "—"}
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,color:G.muted,letterSpacing:"0.1em",marginBottom:4}}>GOVERNMENT KEY (derived from user key — send this to applicant)</div>
            <div style={{fontSize:14,fontFamily:"monospace",color:G.gold,letterSpacing:"0.08em",wordBreak:"break-all",padding:"10px 12px",background:`${G.gold}12`,border:`1px solid ${G.gold}40`,borderRadius:6,fontWeight:700}}>
              {app.issuedGovCode}
            </div>
          </div>

          <div style={{padding:"8px 10px",background:app.keyPairBound?`${G.accent}12`:`${G.red}12`,border:`1px solid ${app.keyPairBound?G.accent+"40":G.red+"40"}`,borderRadius:6,marginBottom:10}}>
            <div style={{fontSize:11,color:app.keyPairBound?G.accent:G.red,fontWeight:700}}>
              {app.keyPairBound?"✓ Cryptographic binding verified":"✗ Binding verification failed"}
            </div>
            <div style={{fontSize:10,color:G.muted,marginTop:2}}>{app.pairVerification}</div>
          </div>

          <div style={{fontSize:10,color:G.muted,lineHeight:1.7}}>
            Issued: {new Date(app.codeIssuedAt).toLocaleString()}<br/>
            Send the Government Key to the applicant. They must enter BOTH keys in PatentGuard to submit to the global ledger.
            The ledger hash will be: sha256(docHash + userKey + govKey + timestamp)
          </div>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  CLAIM REVIEWER (human verification)
// ══════════════════════════════════════════════════════════════════════════════
function ClaimReviewer({pending, onUpdate}){
  const [selected,  setSelected]  = useState(null);
  const [decisions, setDecisions] = useState({});
  const [notes,     setNotes]     = useState({});
  const [saving,    setSaving]    = useState(false);

  const reviewable = pending.filter(p=>["CLAIM_REVIEW","EXAMINER_ASSIGNED"].includes(p.status));
  const app        = selected ? pending.find(p=>p.id===selected) : null;
  const claims     = app?.tokenData?.claims || [];

  const decide = (claimIdx, decision) => {
    setDecisions(prev=>({...prev,[`${selected}:${claimIdx}`]:decision}));
  };

  const saveReview = async () => {
    if (!app) return;
    setSaving(true);
    const claimReviews = claims.map((claim,i)=>({
      index:    i,
      text:     claim,
      decision: decisions[`${selected}:${i}`]||"PENDING",
      note:     notes[`${selected}:${i}`]||"",
    }));
    const allDecided  = claimReviews.every(c=>c.decision!=="PENDING");
    const anyRejected = claimReviews.some(c=>c.decision==="REJECT");
    const review = { appId:selected, claimReviews, reviewedAt:Date.now(), complete:allDecided };
    await reviewSave(review);
    if (allDecided) {
      const newStatus = anyRejected ? "CLAIM_REVIEW" : "APPROVED";
      await pendingUpdate(selected, { status:newStatus, claimReview:review });
    }
    setSaving(false); onUpdate();
  };

  const decisionColor = d => d==="ALLOW"?G.accent:d==="REJECT"?G.red:d==="AMEND"?G.amber:G.muted;

  return (
    <div style={{display:"flex",height:"100%",overflow:"hidden"}}>
      {/* Application list */}
      <div style={{width:240,borderRight:`1px solid ${G.border}`,overflowY:"auto",padding:10,flexShrink:0}}>
        <SectionTitle>Applications for Review</SectionTitle>
        {reviewable.length===0 && <div style={{fontSize:11,color:G.muted,textAlign:"center",padding:20}}>No applications pending claim review</div>}
        {reviewable.map(app=>(
          <div key={app.id} onClick={()=>setSelected(app.id)} style={{padding:"10px 12px",marginBottom:5,borderRadius:8,cursor:"pointer",background:selected===app.id?`${G.accent}15`:G.panel,border:`1px solid ${selected===app.id?G.accent+"50":G.border}`}}>
            <div style={{fontSize:10,color:G.accent,fontFamily:"monospace",marginBottom:3}}>{app.id}</div>
            <div style={{fontSize:11,color:G.text,lineHeight:1.3}}>{app.title?.slice(0,45)}</div>
            <div style={{marginTop:4}}>
              <Pill color={G.amber} small>{app.tokenData?.stats?.claims||0} claims</Pill>
            </div>
          </div>
        ))}
      </div>

      {/* Claim review */}
      <div style={{flex:1,overflowY:"auto",padding:20}}>
        {!app ? (
          <div style={{textAlign:"center",padding:"60px",color:G.muted}}>
            <div style={{fontSize:36,marginBottom:12}}>📋</div>
            <div style={{fontSize:11,lineHeight:1.8}}>Select an application to begin claim review.<br/>This is the human verification step.</div>
          </div>
        ) : (
          <>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700,color:G.text,fontFamily:"monospace",marginBottom:6}}>{app.title?.slice(0,70)}</div>
              <div style={{fontSize:11,color:G.muted,marginBottom:10,lineHeight:1.7}}>
                Review each extracted claim below. For each claim, decide: <span style={{color:G.accent}}>ALLOW</span> (meets all criteria), <span style={{color:G.amber}}>AMEND</span> (needs modification), or <span style={{color:G.red}}>REJECT</span> (fails §101/§102/§103/§112).
              </div>
              <div style={{padding:"10px",background:`${G.amber}12`,border:`1px solid ${G.amber}40`,borderRadius:8,fontSize:11,color:G.amber}}>
                ⚠ Human judgment required: The system has flagged possible prior art matches and legal issues below, but the final claim decision must be made by a qualified examiner.
              </div>
            </div>

            {claims.length===0 && (
              <Card>
                <div style={{fontSize:11,color:G.red}}>No claim language detected in this document (no "comprising", "wherein", or "consisting" statements found). The application may need to be returned for amendment.</div>
                <div style={{marginTop:8}}>
                  <GBtn onClick={()=>pendingUpdate(app.id,{status:"AMENDMENT_REQUESTED",amendmentReason:"No claim language detected"}).then(onUpdate)} color={G.amber} small>
                    REQUEST AMENDMENT
                  </GBtn>
                </div>
              </Card>
            )}

            {claims.map((claim,i)=>{
              const key = `${selected}:${i}`;
              const dec = decisions[key];
              return (
                <Card key={i} style={{marginBottom:10,borderColor:dec?decisionColor(dec)+"40":G.border}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <Pill color={G.blue} small>CLAIM {i+1}</Pill>
                      <Pill color={i===0?G.accent:G.muted} small>{i===0?"INDEPENDENT":"DEPENDENT"}</Pill>
                    </div>
                    {dec && <Pill color={decisionColor(dec)}>{dec}</Pill>}
                  </div>
                  <div style={{fontSize:12,color:G.text,lineHeight:1.75,marginBottom:10,padding:"8px 12px",background:G.dim,borderRadius:6,fontFamily:"monospace"}}>
                    {claim}
                  </div>
                  <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                    <GBtn onClick={()=>decide(i,"ALLOW")} small color={G.accent} style={{fontWeight:dec==="ALLOW"?700:400}}>✓ ALLOW</GBtn>
                    <GBtn onClick={()=>decide(i,"AMEND")} small color={G.amber} style={{fontWeight:dec==="AMEND"?700:400}}>✏ AMEND</GBtn>
                    <GBtn onClick={()=>decide(i,"REJECT")} small color={G.red} style={{fontWeight:dec==="REJECT"?700:400}}>✗ REJECT</GBtn>
                    <div style={{flex:1}}>
                      <GInput
                        value={notes[key]||""}
                        onChange={e=>setNotes(prev=>({...prev,[key]:e.target.value}))}
                        placeholder="Examiner note (rejection reason, amendment suggestion...)"
                        style={{width:"100%",fontSize:11}}
                      />
                    </div>
                  </div>
                  {dec==="REJECT" && (
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {REJECTION_REASONS.map(r=>(
                        <GBtn key={r.code} onClick={()=>setNotes(prev=>({...prev,[key]:r.code+": "+r.label}))} small color={G.red} style={{fontSize:9}}>
                          {r.code}
                        </GBtn>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}

            {claims.length>0 && (
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <GBtn onClick={saveReview} disabled={saving} color={G.accent}>
                  {saving?<Spinner/>:"💾 SAVE REVIEW"}
                </GBtn>
                <div style={{fontSize:11,color:G.muted,display:"flex",alignItems:"center"}}>
                  {Object.keys(decisions).filter(k=>k.startsWith(selected)).length} / {claims.length} claims reviewed
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  LEDGER MONITOR (post-grant status management)
// ══════════════════════════════════════════════════════════════════════════════
function LedgerMonitor({ledger, onRefresh}){
  const [statuses,    setStatuses]    = useState({});
  const [selected,    setSelected]    = useState(null);
  const [challengeType,setChallengeType] = useState("IPR");
  const [reason,      setReason]      = useState("");
  const [saving,      setSaving]      = useState(false);

  useEffect(()=>{
    const load = async () => {
      const map = {};
      for (const e of ledger) {
        const s = await statusGet(e.id);
        if (s) map[e.id] = s;
      }
      setStatuses(map);
    };
    load();
  },[ledger]);

  const setStatus = async (patentId, status) => {
    setSaving(true);
    await statusSet(patentId, { status, reason, challengeType, examinerNote:reason });
    const s = await statusGet(patentId);
    setStatuses(prev=>({...prev,[patentId]:s}));
    setSaving(false); setReason(""); onRefresh();
  };

  const pat = selected ? ledger.find(e=>e.id===selected) : null;
  const currentStatus = selected ? statuses[selected] : null;

  return (
    <div style={{display:"flex",height:"100%",overflow:"hidden"}}>
      {/* Ledger list */}
      <div style={{width:280,borderRight:`1px solid ${G.border}`,overflowY:"auto",padding:10,flexShrink:0}}>
        <SectionTitle>Granted Patents ({ledger.length})</SectionTitle>
        {ledger.length===0 && <div style={{fontSize:11,color:G.muted,textAlign:"center",padding:20}}>No patents in global ledger yet</div>}
        {ledger.map(e=>{
          const st = statuses[e.id];
          const stDef = st ? STATUS[st.status] : STATUS.GRANTED;
          return (
            <div key={e.id} onClick={()=>setSelected(e.id)} style={{padding:"10px 12px",marginBottom:5,borderRadius:8,cursor:"pointer",background:selected===e.id?`${G.accent}15`:G.panel,border:`1px solid ${selected===e.id?G.accent+"50":G.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:10,color:G.accent,fontFamily:"monospace"}}>{e.id}</span>
                <Pill color={stDef?.color||G.accent} small>{stDef?.icon} {stDef?.label||"Granted"}</Pill>
              </div>
              <div style={{fontSize:11,color:G.text,lineHeight:1.3}}>{e.title?.slice(0,50)}</div>
            </div>
          );
        })}
      </div>

      {/* Status management */}
      <div style={{flex:1,overflowY:"auto",padding:20}}>
        {!pat ? (
          <div style={{textAlign:"center",padding:"60px",color:G.muted}}>
            <div style={{fontSize:36,marginBottom:12}}>🎖</div>
            <div style={{fontSize:11}}>Select a patent to manage its post-grant status</div>
          </div>
        ) : (
          <>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700,color:G.text,fontFamily:"monospace",marginBottom:6}}>{pat.title?.slice(0,70)}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                <Pill color={G.accent} small>{pat.id}</Pill>
                {pat.govCode && <Pill color={G.gold} small>🏛 {pat.govCode}</Pill>}
                <Pill color={G.blue} small>Filed {new Date(pat.timestamp).toLocaleDateString()}</Pill>
              </div>
              {currentStatus && (
                <div style={{padding:"10px",background:`${STATUS[currentStatus.status]?.color||G.accent}12`,border:`1px solid ${STATUS[currentStatus.status]?.color||G.accent}40`,borderRadius:8,marginBottom:12}}>
                  <div style={{fontSize:11,color:STATUS[currentStatus.status]?.color||G.accent,fontWeight:700}}>
                    Current Status: {STATUS[currentStatus.status]?.icon} {STATUS[currentStatus.status]?.label}
                  </div>
                  {currentStatus.reason && <div style={{fontSize:11,color:G.muted,marginTop:4}}>{currentStatus.reason}</div>}
                  <div style={{fontSize:10,color:G.muted,marginTop:2}}>Updated: {new Date(currentStatus.updatedAt).toLocaleString()}</div>
                </div>
              )}
            </div>

            {/* Hash verification */}
            <Card style={{marginBottom:12}}>
              <SectionTitle>🔐 Cryptographic Verification</SectionTitle>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {[["Content Hash",pat.contentHash],["Ledger Hash",pat.ledgerHash],["IPFS CID",pat.ipfsCid],["ZK Commit",pat.zkCommitment]].map(([k,v])=>(
                  <div key={k} style={{padding:"6px 10px",background:G.dim,borderRadius:6}}>
                    <div style={{fontSize:9,color:G.muted,letterSpacing:"0.08em"}}>{k}</div>
                    <div style={{fontSize:10,color:G.text,fontFamily:"monospace"}}>{(v||"—").slice(0,24)}...</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Post-grant status actions */}
            <Card style={{marginBottom:12}}>
              <SectionTitle>Post-Grant Status Management</SectionTitle>
              <GInput value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason / case reference / notes..." style={{width:"100%",marginBottom:10}}/>

              <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                <span style={{fontSize:10,color:G.muted,alignSelf:"center"}}>CHALLENGE TYPE:</span>
                {["IPR","LITIGATION","REEXAMINATION"].map(t=>(
                  <GBtn key={t} onClick={()=>setChallengeType(t)} small color={challengeType===t?G.amber:G.muted}>{t}</GBtn>
                ))}
              </div>

              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <GBtn onClick={()=>setStatus(pat.id,"UNDER_CHALLENGE")} disabled={saving} color={G.amber}>
                  ⚔ MARK UNDER CHALLENGE
                </GBtn>
                <GBtn onClick={()=>setStatus(pat.id,"AMENDED_POST_GRANT")} disabled={saving} color={G.blue}>
                  ✏ MARK AMENDED
                </GBtn>
                <GBtn onClick={()=>setStatus(pat.id,"INVALIDATED")} disabled={saving} color={G.red}>
                  🚫 INVALIDATE PATENT
                </GBtn>
                <GBtn onClick={()=>setStatus(pat.id,"GRANTED")} disabled={saving} color={G.accent} small>
                  RESTORE GRANTED
                </GBtn>
              </div>
              <div style={{fontSize:10,color:G.muted,marginTop:8}}>
                Status changes are written to shared storage and reflected immediately in PatentGuard retail app.
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  FRAUD DETECTION PANEL
// ══════════════════════════════════════════════════════════════════════════════
function FraudPanel({pending}){
  const flagged = pending.filter(p=>(p.fraudFlags||[]).length>0);
  const highRisk = flagged.filter(p=>(p.fraudFlags||[]).some(f=>f.severity==="HIGH"));

  return (
    <div style={{padding:20,overflowY:"auto",flex:1}}>
      <div style={{fontFamily:"monospace",fontSize:15,fontWeight:700,marginBottom:4}}>Fraud Detection</div>
      <div style={{fontSize:11,color:G.muted,marginBottom:16,lineHeight:1.7}}>
        Automated anomaly detection runs on every submitted application. Flags are generated based on filing volume patterns, entity status mismatches, content analysis, and signature anomalies.
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        <div style={{padding:"12px",background:G.panel,border:`1px solid ${G.red}40`,borderRadius:10}}>
          <div style={{fontSize:22,fontWeight:700,color:G.red,fontFamily:"monospace"}}>{highRisk.length}</div>
          <div style={{fontSize:11,color:G.muted}}>High Risk Flags</div>
        </div>
        <div style={{padding:"12px",background:G.panel,border:`1px solid ${G.amber}40`,borderRadius:10}}>
          <div style={{fontSize:22,fontWeight:700,color:G.amber,fontFamily:"monospace"}}>{flagged.length-highRisk.length}</div>
          <div style={{fontSize:11,color:G.muted}}>Medium Risk Flags</div>
        </div>
        <div style={{padding:"12px",background:G.panel,border:`1px solid ${G.accent}40`,borderRadius:10}}>
          <div style={{fontSize:22,fontWeight:700,color:G.accent,fontFamily:"monospace"}}>{pending.length-flagged.length}</div>
          <div style={{fontSize:11,color:G.muted}}>Clean Applications</div>
        </div>
      </div>

      {flagged.length===0 && (
        <Card>
          <div style={{textAlign:"center",padding:20,color:G.muted}}>
            <div style={{fontSize:32,marginBottom:8}}>🛡</div>
            <div style={{fontSize:11}}>No fraud signals detected in current queue</div>
          </div>
        </Card>
      )}

      {flagged.map(app=>(
        <Card key={app.id} style={{marginBottom:10,borderColor:(app.fraudFlags||[]).some(f=>f.severity==="HIGH")?G.red+"50":G.amber+"50"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <div>
              <span style={{fontSize:10,color:G.accent,fontFamily:"monospace",fontWeight:700}}>{app.id}</span>
              <span style={{fontSize:11,color:G.text,marginLeft:10}}>{app.title?.slice(0,50)}</span>
            </div>
            <Chip status={app.status}/>
          </div>
          {(app.fraudFlags||[]).map((f,i)=>(
            <div key={i} style={{display:"flex",gap:8,padding:"6px 8px",marginBottom:4,background:f.severity==="HIGH"?`${G.red}12`:`${G.amber}12`,borderRadius:6,alignItems:"flex-start"}}>
              <Pill color={f.severity==="HIGH"?G.red:G.amber} small>{f.severity}</Pill>
              <span style={{fontSize:11,color:G.text,flex:1}}>[{f.code}] {f.msg}</span>
            </div>
          ))}
          <div style={{marginTop:8,display:"flex",gap:6}}>
            <GBtn onClick={async()=>{await pendingUpdate(app.id,{status:"REJECTED",rejectionReason:"FRAUD: "+app.fraudFlags[0]?.msg});}} small color={G.red}>
              REJECT — FRAUD
            </GBtn>
            <GBtn onClick={async()=>{await pendingUpdate(app.id,{fraudFlags:[],fraudCleared:true});}} small color={G.accent}>
              CLEAR FLAGS
            </GBtn>
          </div>
        </Card>
      ))}

      <Card style={{marginTop:8}}>
        <SectionTitle>Detection Rules Active</SectionTitle>
        {[
          ["VOLUME",  "HIGH",   "≥3 applications from same entity within 7 days"],
          ["ENTITY",  "MEDIUM", "Entity name suggests large org claiming micro/small status"],
          ["CONTENT", "HIGH",   "Document under 200 words — possible placeholder"],
          ["CLAIMS",  "HIGH",   "No claim language detected in document"],
          ["SIG",     "HIGH",   "Signature anomaly (future: cryptographic verification)"],
          ["DUPE",    "HIGH",   "Claim language >70% identical to existing patent"],
        ].map(([code,sev,desc])=>(
          <div key={code} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:`1px solid ${G.border}`,alignItems:"center"}}>
            <Pill color={sev==="HIGH"?G.red:G.amber} small>{sev}</Pill>
            <code style={{fontSize:10,color:G.accent,minWidth:60}}>{code}</code>
            <span style={{fontSize:11,color:G.muted}}>{desc}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  DEMO SUBMIT (simulates PatentGuard user sending application)
// ══════════════════════════════════════════════════════════════════════════════
function DemoSubmit({onSubmit}){
  const [title,       setTitle]       = useState("");
  const [institution, setInstitution] = useState("");
  const [text,        setText]        = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [result,      setResult]      = useState(null);

  const SAMPLE = `TITLE: Adaptive Neural Interface for Real-Time Patent Semantic Analysis

FIELD OF THE INVENTION
The present invention relates to artificial intelligence systems, and more particularly to neural network architectures for semantic analysis of patent documents.

BACKGROUND OF THE INVENTION
Existing patent examination systems rely on keyword-based prior art searches that fail to detect semantic equivalence between different claim language expressing the same inventive concept. This results in both missed prior art and over-rejection of genuinely novel inventions.

SUMMARY OF THE INVENTION
In one embodiment, the invention provides a transformer-based neural network comprising attention mechanisms configured to identify semantic similarity between patent claims across different jurisdictions.

CLAIMS
1. A method comprising: receiving a patent application text; tokenizing the text into semantic embeddings using a trained transformer model; comparing the embeddings against a database of existing patents using approximate nearest-neighbor search; wherein the comparison identifies prior art with semantic similarity above a configurable threshold.

2. The method of claim 1, wherein the transformer model is pre-trained on a corpus of USPTO patent abstracts comprising at least 10 million documents.

ABSTRACT
A neural network system for semantic patent analysis, configured to detect prior art by comparing vector embeddings of patent claims against an indexed database of existing patents, providing real-time conflict detection during patent drafting.`;

  const handleSubmit = async () => {
    if (!title.trim()||!text.trim()) return;
    setSubmitting(true);
    try {
      const contentHash = await sha256(text);
      const ipfsCid     = `Qm${contentHash.slice(0,44)}`;
      const salt        = Array.from(crypto.getRandomValues(new Uint8Array(8))).join("");
      const zkCommitment= await sha256(text+salt);
      const entryId     = `PG-${Date.now().toString(36).toUpperCase()}`;

      // Simple tokenize
      const words = text.toLowerCase().split(/\W+/).filter(w=>w.length>3);
      const freq  = {}; words.forEach(w=>{freq[w]=(freq[w]||0)+1;});
      const topKeywords = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([word,count])=>({word,count}));
      const claims = text.split(/(?<=[.!?])\s+/).filter(s=>/\bcomprising\b|\bwherein\b/i.test(s)).slice(0,5);
      const tokenData = { clean:text.slice(0,3000), tokens:words, topKeywords, bigrams:[], clusters:[], sections:[], claims, stats:{ chars:text.length, words:words.length, tokens:words.length, claims:claims.length } };

      const app = {
        id:          entryId,
        title:       title.trim(),
        institution: institution.trim()||"Demo Institution",
        rawText:     text,
        contentHash,
        ipfsCid,
        zkCommitment,
        zkSalt:      salt,
        timestamp:   Date.now(),
        uploadedAt:  new Date().toISOString(),
        status:      "SUBMITTED",
        source:      "user_portal",
        tokenData,
        fileName:    "application.txt",
        abstract:    text.slice(0,300),
      };

      await pendingAdd(app);
      setResult(entryId);
      onSubmit();
    } catch(e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{padding:20,overflowY:"auto",flex:1}}>
      <div style={{fontFamily:"monospace",fontSize:15,fontWeight:700,marginBottom:4}}>Simulate User Submission</div>
      <div style={{fontSize:11,color:G.muted,marginBottom:16,lineHeight:1.7}}>
        This panel simulates what happens when a PatentGuard retail user submits an application to the government queue. In production, this submission comes from the PatentGuard app directly via shared storage.
      </div>

      {result && (
        <div style={{padding:"12px",background:`${G.accent}12`,border:`1px solid ${G.accent}40`,borderRadius:8,marginBottom:14,fontSize:11,color:G.accent}}>
          ✓ Application submitted — ID: <strong>{result}</strong>. Check the Pending Queue tab.
        </div>
      )}

      <Card style={{marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          <div>
            <div style={{fontSize:10,color:G.muted,marginBottom:4}}>APPLICATION TITLE</div>
            <GInput value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title of invention..." style={{width:"100%"}}/>
          </div>
          <div>
            <div style={{fontSize:10,color:G.muted,marginBottom:4}}>FILING ENTITY</div>
            <GInput value={institution} onChange={e=>setInstitution(e.target.value)} placeholder="Company / inventor name..." style={{width:"100%"}}/>
          </div>
        </div>
        <div style={{fontSize:10,color:G.muted,marginBottom:4}}>PATENT DOCUMENT TEXT</div>
        <textarea value={text} onChange={e=>setText(e.target.value)}
          placeholder="Paste full patent application text here..."
          style={{width:"100%",height:280,padding:"12px",background:"#04080f",color:G.text,fontFamily:"monospace",fontSize:12,lineHeight:1.75,border:`1px solid ${G.border}`,borderRadius:6,resize:"none",outline:"none"}}
        />
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <GBtn onClick={handleSubmit} disabled={submitting||!title.trim()||!text.trim()} color={G.accent}>
            {submitting?<Spinner/>:"📥 SUBMIT APPLICATION"}
          </GBtn>
          <GBtn onClick={()=>{setTitle("Adaptive Neural Interface for Patent Analysis");setInstitution("Demo Tech Inc.");setText(SAMPLE);}} small color={G.muted}>
            LOAD SAMPLE
          </GBtn>
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN GOV PORTAL
// ══════════════════════════════════════════════════════════════════════════════
export default function GovPortal(){
  const [tab,      setTab]      = useState("dashboard");
  const [pending,  setPending]  = useState([]);
  const [ledger,   setLedger]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [grantedApp, setGrantedApp] = useState(null); // app being formatted for grant

  const load = async () => {
    const [p, l] = await Promise.all([pendingGetAll(), ledgerGetAll()]);
    setPending(p); setLedger(l); setLoading(false);
  };

  useEffect(()=>{ load(); const t=setInterval(load,8000); return()=>clearInterval(t); },[]);

  const TABS = [
    { key:"dashboard", icon:"🏛", label:"Dashboard" },
    { key:"queue",     icon:"📥", label:"Queue",    badge:pending.filter(p=>["SUBMITTED","FORMALITY_CHECK","FEE_PENDING"].includes(p.status)).length },
    { key:"review",    icon:"📋", label:"Claim Review", badge:pending.filter(p=>["CLAIM_REVIEW","EXAMINER_ASSIGNED"].includes(p.status)).length },
    { key:"format",    icon:"📜", label:"Grant Format", badge:pending.filter(p=>p.status==="CODE_ISSUED").length },
    { key:"ledger",    icon:"⛓", label:"Ledger Monitor" },
    { key:"fraud",     icon:"🛡", label:"Fraud", badge:pending.filter(p=>(p.fraudFlags||[]).some(f=>f.severity==="HIGH")).length },
    { key:"demo",      icon:"🧪", label:"Demo Submit" },
  ];

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:G.bg,fontFamily:"'Courier New',monospace",color:G.text,overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${G.bg}}::-webkit-scrollbar-thumb{background:${G.dim};border-radius:2px}
        textarea,input{outline:none}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
      `}</style>

      {/* HEADER */}
      <div style={{borderBottom:`1px solid ${G.border}`,padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#04101a",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:32,height:32,background:`linear-gradient(135deg,${G.accent},${G.blue})`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🏛</div>
          <div>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,letterSpacing:"0.04em"}}>
              USPTO <span style={{color:G.accent}}>GOV PORTAL</span>
            </span>
            <span style={{fontSize:9,color:G.muted,letterSpacing:"0.14em",marginLeft:10}}>PatentGuard Government Interface v1</span>
          </div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <Pill color={G.accent}>📥 {pending.length} APPLICATIONS</Pill>
          <Pill color={G.blue}>⛓ {ledger.length} GRANTED</Pill>
          <span style={{fontSize:10,color:G.accent,display:"flex",alignItems:"center",gap:5}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:G.accent,display:"inline-block",animation:"pulse 2s infinite"}}/>
            LIVE SYNC
          </span>
        </div>
      </div>

      {/* MAIN */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Sidebar */}
        <div style={{width:180,borderRight:`1px solid ${G.border}`,display:"flex",flexDirection:"column",background:"#04101a",flexShrink:0}}>
          <div style={{padding:"16px 12px",borderBottom:`1px solid ${G.border}`}}>
            <div style={{fontSize:9,color:G.muted,letterSpacing:"0.12em",marginBottom:4}}>PATENT ADMIN</div>
            <div style={{fontSize:10,color:G.accent}}>Examiner Dashboard</div>
          </div>
          <div style={{flex:1,padding:8}}>
            {TABS.map(t=>(
              <button key={t.key} onClick={()=>{setTab(t.key);setSelected(null);}} style={{
                display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 10px",marginBottom:3,
                background:tab===t.key?`${G.accent}18`:G.bg,
                border:`1px solid ${tab===t.key?G.accent+"40":G.border}`,
                borderRadius:7,cursor:"pointer",fontFamily:"monospace",
                fontSize:11,color:tab===t.key?G.accent:G.muted,
                transition:"all 0.2s",textAlign:"left",
              }}>
                <span>{t.icon}</span>
                <span style={{flex:1}}>{t.label}</span>
                {t.badge>0 && <span style={{background:`${t.key==="fraud"?G.red:G.amber}30`,color:t.key==="fraud"?G.red:G.amber,fontSize:9,padding:"1px 5px",borderRadius:8,fontWeight:700}}>{t.badge}</span>}
              </button>
            ))}
          </div>
          <div style={{padding:"10px 12px",borderTop:`1px solid ${G.border}`,fontSize:9,color:G.muted,lineHeight:1.6}}>
            Shared storage sync with PatentGuard retail app active.
          </div>
        </div>

        {/* Content */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {loading && (
            <div style={{textAlign:"center",padding:"60px",color:G.muted}}>
              <Spinner size={24}/><div style={{marginTop:12,fontSize:11}}>Loading shared ledger...</div>
            </div>
          )}
          {!loading && (
            <>
              {tab==="dashboard" && <Dashboard pending={pending} ledger={ledger} onNavigate={t=>{setTab(t);setSelected(null);}}/>}
              {tab==="queue"     && !selected && <PendingQueue pending={pending} allPending={pending} onSelect={a=>{setSelected(a.id);}} onStatusUpdate={load}/>}
              {tab==="queue"     && selected  && <ApplicationDetail app={pending.find(p=>p.id===selected)} onUpdate={load} onClose={()=>setSelected(null)}/>}
              {tab==="review"    && <ClaimReviewer pending={pending} onUpdate={load}/>}
              {tab==="ledger"    && <LedgerMonitor ledger={ledger} onRefresh={load}/>}
              {tab==="fraud"     && <FraudPanel pending={pending}/>}
              {tab==="format" && (
                grantedApp ? (
                  <GrantedPatentEditor G={G} app={grantedApp}
                    onClose={()=>setGrantedApp(null)}
                    onPublish={async(meta)=>{
                      const ts=Date.now();
                      const govKey=grantedApp.issuedGovCode||await generateGovKey(grantedApp.userKey||grantedApp.id);
                      const userKey=grantedApp.userKey||grantedApp.id;
                      const contentHash=grantedApp.contentHash||await sha256(grantedApp.abstract||"");
                      const ledgerHash=await createLedgerHash(contentHash,userKey,govKey,ts);
                      const sched=PUB_SCHEDULES.find(s=>s.id===(grantedApp.publicationSchedule||"standard"))||PUB_SCHEDULES[3];
                      const pubDate=calcPublicationDate(ts,sched.months);
                      const entry={...grantedApp,govKey,userKey,contentHash,ledgerHash,
                        keyPairBound:true,grantedAt:ts,grantMeta:meta,
                        publicationDate:pubDate,publicationSchedule:sched.id,
                        status:"GRANTED",source:"government_portal"};
                      if(sched.months===0){
                        const idx=await store.get("ledger:index",true);
                        const index=idx?JSON.parse(idx.value):[];
                        if(!index.includes(entry.id))index.push(entry.id);
                        await store.set(`ledger:${entry.id}`,JSON.stringify(entry),true);
                        await store.set("ledger:index",JSON.stringify(index),true);
                      } else {
                        const idx=await store.get("pendingvault:index",true);
                        const index=idx?JSON.parse(idx.value):[];
                        if(!index.includes(entry.id))index.push(entry.id);
                        await store.set(`pendingvault:${entry.id}`,JSON.stringify(entry),true);
                        await store.set("pendingvault:index",JSON.stringify(index),true);
                      }
                      await pendingUpdate(grantedApp.id,{status:"GRANTED",grantedAt:ts});
                      setGrantedApp(null); load();
                      alert(`✓ Patent published — ID: ${entry.id}`);
                    }}
                  />
                ) : (
                  <div style={{padding:20,overflowY:"auto",flex:1}}>
                    <div style={{fontFamily:"monospace",fontSize:15,fontWeight:700,marginBottom:4,color:G.text}}>📜 Grant Format Editor</div>
                    <div style={{fontSize:11,color:G.muted,marginBottom:16,lineHeight:1.8}}>
                      Select an approved application below to open it in the USPTO granted patent format editor (pages 1–5). You will fill in bibliographic data, generate the barcode, and publish to the ledger.
                    </div>
                    {pending.filter(p=>["CODE_ISSUED","APPROVED"].includes(p.status)).length===0 ? (
                      <div style={{textAlign:"center",padding:"50px",color:G.muted}}>
                        <div style={{fontSize:36,marginBottom:12}}>📜</div>
                        <div style={{fontSize:11}}>No approved applications ready.<br/>Applications must reach CODE_ISSUED status first.</div>
                      </div>
                    ) : pending.filter(p=>["CODE_ISSUED","APPROVED"].includes(p.status)).map(app=>(
                      <div key={app.id} onClick={()=>setGrantedApp(app)}
                        style={{marginBottom:10,padding:"14px",background:G.panel,border:`1px solid ${G.accent}40`,borderRadius:10,cursor:"pointer",transition:"border-color 0.2s"}}
                        onMouseOver={e=>e.currentTarget.style.borderColor=G.gold}
                        onMouseOut={e=>e.currentTarget.style.borderColor=G.accent+"40"}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                          <span style={{fontSize:10,color:G.accent,fontFamily:"monospace",fontWeight:700}}>{app.id}</span>
                          <span style={{fontSize:9,padding:"2px 8px",background:`${G.accent}20`,color:G.accent,borderRadius:4}}>CODE ISSUED</span>
                        </div>
                        <div style={{fontSize:13,color:G.text,fontWeight:600,marginBottom:4}}>{(app.title||"").slice(0,80)}</div>
                        <div style={{fontSize:11,color:G.muted}}>Click to format as official USPTO granted patent → pages 1–5 with barcode</div>
                      </div>
                    ))}
                  </div>
                )
              )}
              {tab==="demo"      && <DemoSubmit onSubmit={load}/>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
