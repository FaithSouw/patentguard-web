import { useState, useEffect, useRef } from "react";

// ══════════════════════════════════════════════════════════════════════════════
//  GRANTED PATENT EDITOR — Pages 1-5 USPTO Format
//  Used in GovPortal after examiner approves an application.
//  Renders the official granted patent document with:
//    • Code 128 barcode (via JsBarcode CDN)
//    • Two-column specification layout
//    • Full USPTO bibliographic header
//    • References cited table
//    • Line numbers every 5 lines per column
// ══════════════════════════════════════════════════════════════════════════════

// ── Format patent number: e.g. "8150480" → "8,150,480" ───────────────────────
function formatPatentNum(raw) {
  const digits = String(raw).replace(/\D/g, "").padStart(7, "0");
  return digits.replace(/(\d)(\d{3})(\d{3})$/, "$1,$2,$3");
}

// ── Format date: timestamp → "Apr. 3, 2012" ──────────────────────────────────
function fmtDate(ts) {
  if (!ts) return "___________";
  const months = ["Jan.","Feb.","Mar.","Apr.","May","Jun.","Jul.","Aug.","Sep.","Oct.","Nov.","Dec."];
  const d = new Date(ts);
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ── Split text into two roughly equal columns ─────────────────────────────────
function splitColumns(text) {
  if (!text) return ["", ""];
  const lines = text.split("\n");
  const mid   = Math.ceil(lines.length / 2);
  return [lines.slice(0, mid).join("\n"), lines.slice(mid).join("\n")];
}

// ── Render column with line numbers every 5 lines ────────────────────────────
function ColumnText({ text, startLine = 1 }) {
  if (!text) return null;
  const lines  = text.split("\n");
  let lineNum  = startLine;
  return (
    <div style={{ position: "relative" }}>
      {lines.map((line, i) => {
        const show = lineNum % 5 === 0;
        const el = (
          <div key={i} style={{ display: "flex", lineHeight: "18pt", fontSize: "9pt" }}>
            <span style={{ width: 20, flexShrink: 0, color: "#000", fontFamily: "Courier New, monospace", fontSize: "8pt", paddingTop: 1 }}>
              {show ? lineNum : ""}
            </span>
            <span style={{ flex: 1, wordBreak: "break-word" }}>{line || "\u00A0"}</span>
          </div>
        );
        lineNum++;
        return el;
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export function GrantedPatentEditor({ G, app, onPublish, onClose }) {
  // Metadata fields editable by examiner before publishing
  const [meta, setMeta] = useState({
    patentNum:      app?.id?.replace(/[^A-Z0-9]/g, "").slice(0, 9).padStart(9, "0") || "008150480",
    kindCode:       "B2",
    grantDate:      Date.now(),
    filingDate:     app?.timestamp || Date.now(),
    inventorName:   "",
    inventorCity:   "",
    inventorCountry:"US",
    assignee:       "",
    appNumber:      app?.id || "",
    intlClass:      "",
    usClass:        "",
    fieldSearch:    "",
    examinerName:   "",
    attorneyFirm:   "",
    claimCount:     app?.tokenData?.stats?.claims || 1,
    drawingSheets:  1,
    priorPubNumber: "",
    priorPubDate:   "",
    notice:         "Subject to any disclaimer, the term of this patent is extended or adjusted under 35 U.S.C. 154(b).",
    references:     [
      { num: "", kind: "A", date: "", inventor: "" },
    ],
  });
  const [showMeta, setShowMeta]     = useState(true);
  const [publishing, setPublishing] = useState(false);
  const barcodeRef = useRef(null);
  const printRef   = useRef(null);

  const setM = (k, v) => setMeta(p => ({ ...p, [k]: v }));
  const addRef = () => setMeta(p => ({ ...p, references: [...p.references, { num: "", kind: "A", date: "", inventor: "" }] }));
  const setRef = (idx, field, val) => setMeta(p => ({ ...p, references: p.references.map((r, i) => i === idx ? { ...r, [field]: val } : r) }));
  const removeRef = (idx) => setMeta(p => ({ ...p, references: p.references.filter((_, i) => i !== idx) }));

  // Full patent number string for barcode + header
  const patentNumFormatted = `US ${formatPatentNum(meta.patentNum)} ${meta.kindCode}`;
  const patentNumBarcode   = `US${meta.patentNum.replace(/,/g, "")}${meta.kindCode}`;

  // Load JsBarcode from CDN and generate barcode
  useEffect(() => {
    if (!barcodeRef.current) return;
    const scriptId = "jsbarcode-cdn";
    const generate = () => {
      if (window.JsBarcode && barcodeRef.current) {
        try {
          window.JsBarcode(barcodeRef.current, patentNumBarcode, {
            format:       "CODE128",
            width:        1.8,
            height:       50,
            displayValue: false,
            margin:       0,
            background:   "#ffffff",
            lineColor:    "#000000",
          });
        } catch(e) { console.warn("Barcode generation error:", e); }
      }
    };
    if (document.getElementById(scriptId)) { generate(); return; }
    const script = document.createElement("script");
    script.id    = scriptId;
    script.src   = "https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js";
    script.onload = generate;
    document.head.appendChild(script);
  }, [patentNumBarcode, showMeta]);

  // Application text sections
  const title       = app?.title      || "[TITLE OF INVENTION]";
  const abstract    = app?.abstract   || "[Abstract of the disclosure]";
  const description = app?.tokenData?.clean || "[Detailed description]";
  const [col1, col2] = splitColumns(description);

  const handlePublish = async () => {
    setPublishing(true);
    await onPublish(meta);
    setPublishing(false);
  };

  // ── METADATA EDITOR ──────────────────────────────────────────────────────
  const iStyle = {
    background: G.panel, border: `1px solid ${G.border}`, color: G.text,
    fontFamily: "monospace", fontSize: 11, outline: "none",
    padding: "6px 8px", borderRadius: 4, width: "100%",
  };

  if (showMeta) {
    return (
      <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: G.text, marginBottom: 2 }}>
              Format Granted Patent — Enter Bibliographic Data
            </div>
            <div style={{ fontSize: 11, color: G.muted }}>
              Fill in all required fields. This will generate the official USPTO pages 1-5 format.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowMeta(false)} style={{ padding: "8px 16px", background: `${G.accent}22`, border: `1px solid ${G.accent}50`, color: G.accent, fontFamily: "monospace", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer" }}>
              PREVIEW DOCUMENT →
            </button>
            <button onClick={onClose} style={{ padding: "8px 12px", background: `${G.muted}20`, border: `1px solid ${G.border}`, color: G.muted, fontFamily: "monospace", fontSize: 11, borderRadius: 6, cursor: "pointer" }}>
              ← BACK
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* Patent Number */}
          <div style={{ padding: "12px", background: G.panel, border: `1px solid ${G.border}`, borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: G.gold, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 700 }}>PATENT NUMBER & KIND CODE</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>7-digit serial (e.g. 8150480)</div>
                <input value={meta.patentNum} onChange={e => setM("patentNum", e.target.value)} style={iStyle} placeholder="8150480" />
              </div>
              <div>
                <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>Kind Code</div>
                <select value={meta.kindCode} onChange={e => setM("kindCode", e.target.value)} style={{ ...iStyle, width: 60 }}>
                  {["B1","B2","A1","A2"].map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 10, color: G.gold, marginTop: 8, fontFamily: "monospace" }}>→ {patentNumFormatted}</div>
          </div>

          {/* Dates */}
          <div style={{ padding: "12px", background: G.panel, border: `1px solid ${G.border}`, borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: G.gold, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 700 }}>DATES</div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>(45) Date of Patent</div>
              <input type="date" value={new Date(meta.grantDate).toISOString().slice(0,10)} onChange={e => setM("grantDate", new Date(e.target.value).getTime())} style={iStyle} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>(22) Filed</div>
              <input type="date" value={new Date(meta.filingDate).toISOString().slice(0,10)} onChange={e => setM("filingDate", new Date(e.target.value).getTime())} style={iStyle} />
            </div>
          </div>

          {/* Inventor */}
          <div style={{ padding: "12px", background: G.panel, border: `1px solid ${G.border}`, borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: G.accent, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 700 }}>(75) INVENTOR</div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>Full Name</div>
              <input value={meta.inventorName} onChange={e => setM("inventorName", e.target.value)} style={iStyle} placeholder="Panu Mårten Jesper Johansson" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 6 }}>
              <div>
                <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>City</div>
                <input value={meta.inventorCity} onChange={e => setM("inventorCity", e.target.value)} style={iStyle} placeholder="Tampere" />
              </div>
              <div>
                <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>Country</div>
                <input value={meta.inventorCountry} onChange={e => setM("inventorCountry", e.target.value)} style={iStyle} placeholder="FI" />
              </div>
            </div>
          </div>

          {/* Assignee */}
          <div style={{ padding: "12px", background: G.panel, border: `1px solid ${G.border}`, borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: G.accent, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 700 }}>(73) ASSIGNEE & APPLICATION</div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>Assignee (company/individual)</div>
              <input value={meta.assignee} onChange={e => setM("assignee", e.target.value)} style={iStyle} placeholder="Nokia Corporation, Espoo (FI)" />
            </div>
            <div>
              <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>(21) Application Number</div>
              <input value={meta.appNumber} onChange={e => setM("appNumber", e.target.value)} style={iStyle} placeholder="12/331,934" />
            </div>
          </div>

          {/* Classification */}
          <div style={{ padding: "12px", background: G.panel, border: `1px solid ${G.border}`, borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: G.blue, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 700 }}>CLASSIFICATION CODES</div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>(51) Int. Cl.</div>
              <input value={meta.intlClass} onChange={e => setM("intlClass", e.target.value)} style={iStyle} placeholder="H04M 1/00 (2006.01)" />
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>(52) U.S. Cl.</div>
              <input value={meta.usClass} onChange={e => setM("usClass", e.target.value)} style={iStyle} placeholder="455/575.1; 455/575.4" />
            </div>
            <div>
              <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>(58) Field of Classification Search</div>
              <input value={meta.fieldSearch} onChange={e => setM("fieldSearch", e.target.value)} style={iStyle} placeholder="455/575.4, 565, 550.1, 575.1" />
            </div>
          </div>

          {/* Examiner / Attorney */}
          <div style={{ padding: "12px", background: G.panel, border: `1px solid ${G.border}`, borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: G.amber, letterSpacing: "0.1em", marginBottom: 8, fontWeight: 700 }}>EXAMINER & ATTORNEY</div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>Primary Examiner</div>
              <input value={meta.examinerName} onChange={e => setM("examinerName", e.target.value)} style={iStyle} placeholder="Jean B Jeanglaude" />
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>(74) Attorney, Agent, or Firm</div>
              <input value={meta.attorneyFirm} onChange={e => setM("attorneyFirm", e.target.value)} style={iStyle} placeholder="Hollingsworth & Funk, LLC" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div>
                <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>Total Claims</div>
                <input type="number" value={meta.claimCount} onChange={e => setM("claimCount", parseInt(e.target.value) || 1)} style={iStyle} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: G.muted, marginBottom: 3 }}>Drawing Sheets</div>
                <input type="number" value={meta.drawingSheets} onChange={e => setM("drawingSheets", parseInt(e.target.value) || 0)} style={iStyle} />
              </div>
            </div>
          </div>

        </div>

        {/* References Cited */}
        <div style={{ marginTop: 12, padding: "12px", background: G.panel, border: `1px solid ${G.border}`, borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: G.muted, letterSpacing: "0.1em", marginBottom: 10, fontWeight: 700 }}>
            (56) REFERENCES CITED — U.S. PATENT DOCUMENTS
          </div>
          {meta.references.map((ref, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 60px 100px 1fr 30px", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <input value={ref.num} onChange={e => setRef(idx, "num", e.target.value)} style={{ ...iStyle, fontSize: 10 }} placeholder="Patent number" />
              <select value={ref.kind} onChange={e => setRef(idx, "kind", e.target.value)} style={{ ...iStyle, fontSize: 10 }}>
                {["A","A1","A2","B1","B2","B3","S"].map(k => <option key={k}>{k}</option>)}
              </select>
              <input value={ref.date} onChange={e => setRef(idx, "date", e.target.value)} style={{ ...iStyle, fontSize: 10 }} placeholder="MM/YYYY" />
              <input value={ref.inventor} onChange={e => setRef(idx, "inventor", e.target.value)} style={{ ...iStyle, fontSize: 10 }} placeholder="Inventor name" />
              <button onClick={() => removeRef(idx)} style={{ background: "transparent", border: "none", color: G.red, cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          ))}
          <button onClick={addRef} style={{ padding: "5px 12px", background: `${G.muted}20`, border: `1px solid ${G.border}`, color: G.muted, fontFamily: "monospace", fontSize: 10, borderRadius: 5, cursor: "pointer", marginTop: 4 }}>
            + ADD REFERENCE
          </button>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <button onClick={() => setShowMeta(false)} style={{ padding: "10px 20px", background: `${G.accent}22`, border: `1px solid ${G.accent}50`, color: G.accent, fontFamily: "monospace", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer" }}>
            PREVIEW DOCUMENT →
          </button>
        </div>
      </div>
    );
  }

  // ── DOCUMENT PREVIEW ──────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Toolbar */}
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${G.border}`, display: "flex", gap: 8, alignItems: "center", flexShrink: 0, background: G.panel }}>
        <button onClick={() => setShowMeta(true)} style={{ padding: "5px 12px", background: `${G.muted}20`, border: `1px solid ${G.border}`, color: G.muted, fontFamily: "monospace", fontSize: 10, borderRadius: 5, cursor: "pointer" }}>
          ← EDIT METADATA
        </button>
        <div style={{ fontSize: 11, color: G.accent, fontWeight: 700, fontFamily: "monospace", flex: 1 }}>
          GRANTED PATENT FORMAT — USPTO Pages 1–5
        </div>
        <button onClick={() => window.print()} style={{ padding: "5px 12px", background: `${G.blue}20`, border: `1px solid ${G.blue}40`, color: G.blue, fontFamily: "monospace", fontSize: 10, borderRadius: 5, cursor: "pointer" }}>
          🖨 PRINT / PDF
        </button>
        <button onClick={handlePublish} disabled={publishing} style={{ padding: "6px 16px", background: `${G.accent}22`, border: `1px solid ${G.accent}50`, color: G.accent, fontFamily: "monospace", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer" }}>
          {publishing ? "PUBLISHING..." : "⛓ PUBLISH TO LEDGER →"}
        </button>
      </div>

      {/* Document */}
      <div style={{ flex: 1, overflowY: "auto", background: "#a0a0a0", padding: "20px" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap');
          .gp-doc { font-family: 'Libre Baskerville', 'Times New Roman', Times, serif; font-size: 9pt; color: #000; }
          .gp-page { background: white; width: 8.5in; margin: 0 auto 20px; padding: 0.5in 0.6in; box-sizing: border-box; box-shadow: 0 2px 12px rgba(0,0,0,0.4); }
          .gp-hdr-row { display: flex; justify-content: space-between; align-items: flex-start; font-size: 8pt; color: #666; margin-bottom: 4pt; font-family: Arial, sans-serif; }
          .gp-main-title { font-size: 20pt; font-weight: bold; margin: 4pt 0 0 0; }
          .gp-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16pt; font-size: 9pt; }
          .gp-meta-row { display: flex; gap: 6pt; padding: 1pt 0; border-bottom: 0.5pt solid #ddd; }
          .gp-meta-num { color: #000; font-weight: bold; flex-shrink: 0; }
          .gp-sec-hdr { text-align: center; font-weight: bold; font-size: 9pt; margin: 12pt 0 4pt; }
          .gp-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16pt; }
          .gp-col-hdr { text-align: center; font-weight: bold; font-size: 9pt; border-bottom: 0.5pt solid #000; margin-bottom: 4pt; }
          .gp-abstract-box { border: 0.5pt solid #000; padding: 6pt 8pt; font-size: 8.5pt; line-height: 1.4; }
          .gp-refs-table { width: 100%; font-size: 8pt; border-collapse: collapse; }
          .gp-refs-table td { padding: 1pt 4pt; vertical-align: top; }
          .gp-drawing-page { min-height: 9in; display: flex; flex-direction: column; }
          @media print {
            body * { visibility: hidden; }
            .gp-print-area, .gp-print-area * { visibility: visible; }
            .gp-print-area { position: absolute; left: 0; top: 0; width: 100%; }
            .gp-page { box-shadow: none; margin: 0; page-break-after: always; }
          }
        `}</style>

        <div className="gp-print-area" ref={printRef}>
        <div className="gp-doc">

          {/* ═══ PAGE 1: Bibliographic data ═══ */}
          <div className="gp-page">
            <div className="gp-hdr-row">
              <span>{fmtDate(Date.now())}, EAST Version: 3.2.0.1</span>
            </div>

            {/* Barcode + patent number row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <svg ref={barcodeRef} style={{ display: "block" }} />
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: "10pt", fontWeight: "bold", letterSpacing: "0.04em" }}>{patentNumBarcode}</div>
              </div>
            </div>

            {/* Header block */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16pt", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: "10pt", fontFamily: "Arial, sans-serif" }}>(12) <strong style={{ fontSize: "18pt" }}>United States Patent</strong></div>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: "11pt", marginTop: 3 }}>{meta.inventorName.split(" ").pop() || "Inventor"}</div>
              </div>
              <div style={{ fontFamily: "Arial, sans-serif" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: "9pt" }}>(10) <strong>Patent No.:</strong></span>
                  <span style={{ fontSize: "11pt", fontWeight: "bold" }}>{patentNumFormatted}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: "9pt" }}>(45) <strong>Date of Patent:</strong></span>
                  <span style={{ fontSize: "9pt", fontWeight: "bold" }}>{fmtDate(meta.grantDate)}</span>
                </div>
              </div>
            </div>

            {/* Two-column metadata + abstract */}
            <div className="gp-meta-grid">
              {/* Left column — bibliographic */}
              <div>
                <div className="gp-meta-row"><span className="gp-meta-num">(54)</span><span style={{ fontWeight: "bold", textTransform: "uppercase" }}>{title}</span></div>
                <div className="gp-meta-row"><span className="gp-meta-num">(75)</span><span><strong>Inventor:</strong> {meta.inventorName}{meta.inventorCity ? `, ${meta.inventorCity}` : ""}{meta.inventorCountry && meta.inventorCountry !== "US" ? ` (${meta.inventorCountry})` : ""}</span></div>
                {meta.assignee && <div className="gp-meta-row"><span className="gp-meta-num">(73)</span><span><strong>Assignee:</strong> {meta.assignee}</span></div>}
                {meta.notice && <div className="gp-meta-row"><span className="gp-meta-num">(*)</span><span><strong>Notice:</strong> {meta.notice}</span></div>}
                <div className="gp-meta-row"><span className="gp-meta-num">(21)</span><span><strong>Appl. No.:</strong> {meta.appNumber || app?.id}</span></div>
                <div className="gp-meta-row"><span className="gp-meta-num">(22)</span><span><strong>Filed:</strong> {fmtDate(meta.filingDate)}</span></div>
                {meta.intlClass && <div className="gp-meta-row"><span className="gp-meta-num">(51)</span><span><strong>Int. Cl.</strong><br/>{meta.intlClass}</span></div>}
                {meta.usClass && <div className="gp-meta-row"><span className="gp-meta-num">(52)</span><span><strong>U.S. Cl.</strong> ................. {meta.usClass}</span></div>}
                {meta.fieldSearch && <div className="gp-meta-row"><span className="gp-meta-num">(58)</span><span><strong>Field of Classification Search</strong> ............. {meta.fieldSearch}</span></div>}

                {/* References */}
                {meta.references.some(r => r.num) && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontWeight: "bold", fontSize: "8.5pt", marginBottom: 3 }}>(56) References Cited</div>
                    <div style={{ fontWeight: "bold", fontSize: "8pt", marginBottom: 2, textAlign: "center" }}>U.S. PATENT DOCUMENTS</div>
                    <table className="gp-refs-table">
                      <tbody>
                        {meta.references.filter(r => r.num).map((ref, i) => (
                          <tr key={i}>
                            <td>{ref.num} {ref.kind}</td>
                            <td>{ref.date}</td>
                            <td>{ref.inventor}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {meta.examinerName && <div style={{ marginTop: 6, fontSize: "8.5pt" }}><em>Primary Examiner</em> — {meta.examinerName}</div>}
                {meta.attorneyFirm && <div style={{ fontSize: "8.5pt" }}>(74) <em>Attorney, Agent, or Firm</em> — {meta.attorneyFirm}</div>}
              </div>

              {/* Right column — abstract */}
              <div>
                <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "9pt", marginBottom: 6 }}>(57) ABSTRACT</div>
                <div className="gp-abstract-box">
                  <p style={{ margin: 0, lineHeight: 1.5, fontSize: "8.5pt" }}>{abstract}</p>
                </div>
                <div style={{ marginTop: 8, textAlign: "center", fontWeight: "bold", fontSize: "9pt" }}>
                  {meta.claimCount} Claim{meta.claimCount !== 1 ? "s" : ""}{meta.drawingSheets > 0 ? `, ${meta.drawingSheets} Drawing Sheet${meta.drawingSheets !== 1 ? "s" : ""}` : ""}
                </div>
              </div>
            </div>

            <div className="gp-hdr-row" style={{ marginTop: 16, borderTop: "0.5pt solid #ccc", paddingTop: 4 }}>
              <span>{fmtDate(Date.now())}, EAST Version: 3.2.0.1</span>
            </div>
          </div>

          {/* ═══ PAGE 2+: Specification in two columns ═══ */}
          <div className="gp-page">
            <div className="gp-hdr-row">
              <span style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold" }}>US {formatPatentNum(meta.patentNum)} {meta.kindCode}</span>
            </div>

            {/* Two-column layout */}
            <div className="gp-two-col">
              <div>
                <div className="gp-col-hdr">1</div>
                <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "9pt", textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
                <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "8.5pt", textDecoration: "underline", margin: "8pt 0 4pt" }}>FIELD</div>
                <ColumnText text={col1} startLine={1} />
              </div>
              <div>
                <div className="gp-col-hdr">2</div>
                <ColumnText text={col2} startLine={Math.ceil((col1.split("\n").length + 1) / 5) * 5 + 1} />
              </div>
            </div>

            <div className="gp-hdr-row" style={{ marginTop: 12, borderTop: "0.5pt solid #ccc", paddingTop: 4 }}>
              <span style={{ fontFamily: "Arial, sans-serif", fontWeight: "bold" }}>US {formatPatentNum(meta.patentNum)} {meta.kindCode}</span>
            </div>
          </div>

        </div>
        </div>
      </div>
    </div>
  );
}
