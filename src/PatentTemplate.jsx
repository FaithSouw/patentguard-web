import { useState, useRef } from "react";

// ══════════════════════════════════════════════════════════════════════════════
//  USPTO PATENT APPLICATION TEMPLATE — Pages 6-17 Format
//  Two components exported:
//    1. TemplatePanel   — guided section-by-section form
//    2. ApplicationEditorView — formatted application preview (print-ready)
// ══════════════════════════════════════════════════════════════════════════════

// ── Section definitions (all requirements from USPTO document) ────────────────
const SECTIONS = [
  {
    id: "title", label: "TITLE OF INVENTION", heading: "TITLE",
    required: true, type: "text", maxWords: 15, newPage: false,
    guidance: [
      "Must appear as the heading on the first page — centered, ALL CAPS",
      "As short and specific as possible (ideally under 15 words)",
      "No tradenames, trademarks, or proprietary terms",
    ],
    placeholder: "DEVICE WITH RETRACTED FRONT FACE",
  },
  {
    id: "crossRef", label: "CROSS-REFERENCE TO RELATED APPLICATIONS", heading: "CROSS-REFERENCE TO RELATED APPLICATIONS",
    required: false, type: "textarea", newPage: false,
    guidance: [
      "Required if application claims benefit of any prior-filed application",
      "Reference must be in Application Data Sheet per 37 CFR § 1.76",
      "If none: write 'Not Applicable'",
    ],
    placeholder: "Not Applicable",
  },
  {
    id: "field", label: "FIELD OF THE INVENTION", heading: "FIELD",
    required: true, type: "textarea", newPage: false,
    guidance: [
      "Brief statement of the technical field",
      "Start with: 'The present invention relates to...'",
    ],
    placeholder: "The present invention relates to a device with a front face, in particular with front face that is an operating face that is provided with user-interface elements.",
  },
  {
    id: "background", label: "BACKGROUND OF THE INVENTION", heading: "BACKGROUND",
    required: true, type: "textarea", newPage: false,
    guidance: [
      "Include field of endeavor to which invention pertains",
      "Describe prior art and its deficiencies",
      "End with the problem your invention solves",
      "Do NOT admit that prior art anticipates your invention",
    ],
    placeholder: "Mobile electronic devices, such as mobile phones, media players and personal digital assistants are products that sometimes are used and handled roughly...",
  },
  {
    id: "summary", label: "SUMMARY OF THE INVENTION", heading: "SUMMARY",
    required: true, type: "textarea", newPage: false,
    guidance: [
      "Present the substance or general idea of the claimed invention in summarized form",
      "Mirror your broadest independent claim",
      "Start with: 'By providing...' or 'In one embodiment, the invention provides...'",
    ],
    placeholder: "By providing a device having a concave front face the risk of the front face being scratched by other objects is reduced.",
  },
  {
    id: "drawingsDesc", label: "BRIEF DESCRIPTION OF THE DRAWINGS", heading: "BRIEF DESCRIPTION OF THE DRAWINGS",
    required: false, type: "figures", newPage: false,
    guidance: [
      "Required when drawings are submitted",
      "List all figures by number with description of what each depicts",
      "Format: 'FIG. 1 is an isometric view of a device according to a first embodiment,'",
      "Black and white drawings required — India ink or equivalent",
      "Drawing sheets numbered 1/2, 2/2 etc. centered at TOP of sheet (not in margin)",
      "Same part must use same reference numeral across ALL figures",
      "Reference numerals in description MUST appear in drawings and vice versa",
      "Reference numerals must NOT be enclosed in brackets, circles, or quotes",
    ],
  },
  {
    id: "description", label: "DETAILED DESCRIPTION OF THE INVENTION", heading: "DETAILED DESCRIPTION",
    required: true, type: "textarea", newPage: false,
    guidance: [
      "Explain invention in full, clear, concise, and exact terms",
      "Must enable a Person Having Ordinary Skill In The Art (PHOSITA) to make and use the invention",
      "Disclose the best mode contemplated by the inventor",
      "Distinguish invention from prior art",
      "Reference all drawing figures — every element shown must be mentioned",
      "Reference chars mentioned here MUST appear in drawings",
    ],
    placeholder: "In the following detailed description, the device according to the teachings for this application will be described by the embodiments...",
  },
  {
    id: "claims", label: "CLAIMS", heading: "CLAIMS",
    required: true, type: "claims", newPage: true,
    guidance: [
      "MUST begin on a separate physical page",
      "Numbered consecutively in Arabic numerals",
      "Each claim must be ONE complete sentence ending with a period",
      "At least one independent claim required",
      "Independent claim: 'A [device] comprising: [elements]...'",
      "Dependent claim: 'A [device] according to claim X, wherein...'",
      "Group dependent claims with their parent claim",
      "Each element/step separated by a line indentation",
      "The term 'comprising' does not exclude other elements or steps",
    ],
  },
  {
    id: "abstract", label: "ABSTRACT OF THE DISCLOSURE", heading: "ABSTRACT",
    required: true, type: "textarea", maxWords: 150, newPage: true,
    guidance: [
      "MUST begin on a separate page",
      "Single paragraph — narrative form, NOT a list",
      "MAXIMUM 150 words (strictly enforced by USPTO)",
      "Points out what is new in the art",
      "Start with: 'A [device/method/system]...'",
      "Do NOT reference drawing figures (no 'as shown in FIG. 1')",
    ],
    placeholder: "A device with a front face such as an operating face, including elements of the user interface of the device is provided. A major part of the front face is concave so that the front face is retracted and thereby protected from being scratched.",
  },
];

// ── Utilities ─────────────────────────────────────────────────────────────────
const wc = (t) => (t || "").trim() ? t.trim().split(/\s+/).length : 0;
const validateClaim = (text) => {
  const issues = [];
  if (!text.trim()) return [];
  const sentences = text.split(/[.]+/).filter(s => s.trim().length > 3);
  if (sentences.length > 1) issues.push("Must be a single sentence");
  if (!text.trim().endsWith(".")) issues.push("Must end with a period");
  return issues;
};

// ══════════════════════════════════════════════════════════════════════════════
//  1. TEMPLATE PANEL — guided form
// ══════════════════════════════════════════════════════════════════════════════
export function TemplatePanel({ C, onExportToEditor }) {
  const [vals, setVals] = useState({
    title: "", crossRef: "Not Applicable", field: "", background: "",
    summary: "", description: "", abstract: "",
    claims: [{ id: 1, type: "independent", text: "", dependsOn: 1 }],
  });
  const [figures, setFigures] = useState([{ id: 1, figNum: 1, description: "", imageUrl: null, imageFile: null }]);
  const [active, setActive] = useState("title");
  const [showErrors, setShowErrors] = useState(false);

  const set = (k, v) => setVals(p => ({ ...p, [k]: v }));

  // Section completion check
  const done = (sec) => {
    if (!sec.required) return true;
    if (sec.type === "claims") return vals.claims.length > 0 && vals.claims.some(c => c.text.trim());
    return (vals[sec.id] || "").trim().length > 0;
  };

  const allDone = SECTIONS.filter(s => s.required).every(done);
  const incomplete = SECTIONS.filter(s => s.required && !done(s)).length;

  // Errors for active section
  const getErrors = (sec) => {
    const errs = [];
    const v = vals[sec.id] || "";
    if (sec.required && !v.trim() && sec.type !== "claims" && sec.type !== "figures") errs.push(`${sec.label} is required`);
    if (sec.maxWords && wc(v) > sec.maxWords) errs.push(`Must be ≤${sec.maxWords} words (currently ${wc(v)})`);
    if (sec.type === "claims") {
      if (!vals.claims.some(c => c.type === "independent")) errs.push("At least one independent claim is required");
      vals.claims.forEach((c, i) => {
        validateClaim(c.text).forEach(e => errs.push(`Claim ${i + 1}: ${e}`));
      });
    }
    return errs;
  };

  // Claims management
  const addClaim = (type) => setVals(p => ({
    ...p,
    claims: [...p.claims, { id: p.claims.length + 1, type, text: "", dependsOn: p.claims[0]?.id || 1 }],
  }));
  const setClaim = (idx, field, val) => setVals(p => ({
    ...p,
    claims: p.claims.map((c, i) => i === idx ? { ...c, [field]: val } : c),
  }));
  const removeClaim = (idx) => setVals(p => ({
    ...p,
    claims: p.claims.filter((_, i) => i !== idx).map((c, i) => ({ ...c, id: i + 1 })),
  }));

  // Figures management
  const addFig = () => setFigures(p => [...p, { id: p.length + 1, figNum: p.length + 1, description: "", imageUrl: null }]);
  const setFig = (idx, field, val) => setFigures(p => p.map((f, i) => i === idx ? { ...f, [field]: val } : f));
  const removeFig = (idx) => setFigures(p => p.filter((_, i) => i !== idx).map((f, i) => ({ ...f, id: i + 1, figNum: i + 1 })));
  const handleFigFile = (idx, file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setFigures(p => p.map((f, i) => i === idx ? { ...f, imageUrl: url, imageFile: file } : f));
  };

  const cur = SECTIONS.find(s => s.id === active);
  const errs = cur ? getErrors(cur) : [];

  const handleExport = () => {
    if (!allDone) { setShowErrors(true); return; }
    onExportToEditor({ vals, figures });
  };

  // ── Shared input style ─────────────────────────────────────────────────────
  const inputStyle = { background: C.panel, border: `1px solid ${C.border}`, color: C.text, fontFamily: "monospace", fontSize: 12, outline: "none", width: "100%" };
  const btnStyle = (col) => ({ padding: "7px 14px", background: `${col}20`, border: `1px solid ${col}50`, color: col, fontFamily: "monospace", fontSize: 11, borderRadius: 6, cursor: "pointer" });

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Section nav ───────────────────────────────────────────────── */}
      <div style={{ width: 210, borderRight: `1px solid ${C.border}`, overflowY: "auto", flexShrink: 0 }}>
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: `${C.accent}10` }}>
          <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: "0.1em" }}>USPTO APPLICATION</div>
          <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>Pages 6–17 Format · {incomplete > 0 ? `${incomplete} required section${incomplete > 1 ? "s" : ""} incomplete` : "All required sections complete ✓"}</div>
        </div>
        {SECTIONS.map(sec => {
          const complete = done(sec);
          const isActive = active === sec.id;
          return (
            <div key={sec.id} onClick={() => setActive(sec.id)} style={{
              padding: "9px 12px", cursor: "pointer", borderBottom: `1px solid ${C.border}`,
              background: isActive ? `${C.accent}18` : "transparent",
              borderLeft: `3px solid ${isActive ? C.accent : complete ? C.green : sec.required ? C.red + "50" : C.border}`,
            }}>
              <div style={{ fontSize: 10, color: isActive ? C.accent : C.text, fontWeight: isActive ? 700 : 400, fontFamily: "monospace", marginBottom: 3, lineHeight: 1.3 }}>
                {sec.label.length > 26 ? sec.label.slice(0, 26) + "…" : sec.label}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {sec.required && <span style={{ fontSize: 8, color: C.red, fontFamily: "monospace", background: `${C.red}15`, padding: "1px 4px", borderRadius: 2 }}>REQ</span>}
                {complete && <span style={{ fontSize: 9, color: C.green }}>✓</span>}
                {sec.newPage && <span style={{ fontSize: 8, color: C.amber, background: `${C.amber}15`, padding: "1px 4px", borderRadius: 2 }}>NEW PG</span>}
                {sec.maxWords && <span style={{ fontSize: 8, color: C.cyan, background: `${C.cyan}15`, padding: "1px 4px", borderRadius: 2 }}>≤{sec.maxWords}w</span>}
              </div>
            </div>
          );
        })}
        <div style={{ padding: "12px" }}>
          <button onClick={handleExport} style={{
            width: "100%", padding: "10px", borderRadius: 8, cursor: "pointer",
            background: allDone ? `${C.green}22` : `${C.muted}15`,
            border: `1px solid ${allDone ? C.green + "50" : C.border}`,
            color: allDone ? C.green : C.muted,
            fontFamily: "monospace", fontSize: 11, fontWeight: 700,
          }}>
            {allDone ? "EXPORT TO EDITOR →" : `${incomplete} REQUIRED MISSING`}
          </button>
        </div>
      </div>

      {/* ── Section editor ────────────────────────────────────────────── */}
      {cur && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Header + guidance */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: C.accent, fontWeight: 700, fontFamily: "monospace" }}>{cur.label}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {cur.required && <span style={{ fontSize: 9, padding: "2px 7px", background: `${C.red}20`, color: C.red, borderRadius: 3, fontFamily: "monospace" }}>REQUIRED</span>}
                {cur.newPage && <span style={{ fontSize: 9, padding: "2px 7px", background: `${C.amber}20`, color: C.amber, borderRadius: 3, fontFamily: "monospace" }}>STARTS ON NEW PAGE</span>}
              </div>
            </div>
            <div style={{ background: `${C.accent}08`, border: `1px solid ${C.accent}25`, borderRadius: 6, padding: "8px 12px", marginBottom: errs.length ? 8 : 0 }}>
              <div style={{ fontSize: 9, color: C.accent, letterSpacing: "0.1em", marginBottom: 5, fontWeight: 700 }}>USPTO REQUIREMENTS</div>
              {cur.guidance.map((g, i) => (
                <div key={i} style={{ fontSize: 11, color: C.muted, lineHeight: 1.7, paddingLeft: 8, borderLeft: `2px solid ${C.accent}30`, marginBottom: 2 }}>• {g}</div>
              ))}
            </div>
            {(showErrors && errs.length > 0) && (
              <div style={{ padding: "8px 10px", background: `${C.red}12`, border: `1px solid ${C.red}30`, borderRadius: 6 }}>
                {errs.map((e, i) => <div key={i} style={{ fontSize: 11, color: C.red }}>✗ {e}</div>)}
              </div>
            )}
          </div>

          {/* Input area */}
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>

            {/* Plain text (title) */}
            {cur.type === "text" && (
              <>
                <input value={vals[cur.id]} onChange={e => set(cur.id, e.target.value.toUpperCase())}
                  placeholder={cur.placeholder}
                  style={{ ...inputStyle, padding: "10px 12px", borderRadius: 6, textTransform: "uppercase", fontSize: 13, letterSpacing: "0.04em" }} />
                <div style={{ fontSize: 10, marginTop: 5, color: wc(vals[cur.id]) > (cur.maxWords || 999) ? C.red : C.green }}>
                  {wc(vals[cur.id])} words {cur.maxWords ? `— recommended ≤${cur.maxWords}` : ""}
                </div>
              </>
            )}

            {/* Textarea */}
            {cur.type === "textarea" && (
              <>
                <textarea value={vals[cur.id]} onChange={e => set(cur.id, e.target.value)}
                  placeholder={cur.placeholder}
                  style={{ ...inputStyle, padding: "12px", borderRadius: 6, minHeight: 240, lineHeight: 1.8, resize: "vertical" }} />
                {cur.maxWords && (
                  <div style={{ fontSize: 10, marginTop: 5, color: wc(vals[cur.id]) > cur.maxWords ? C.red : C.green, fontWeight: wc(vals[cur.id]) > cur.maxWords ? 700 : 400 }}>
                    {wc(vals[cur.id])} / {cur.maxWords} words
                    {wc(vals[cur.id]) > cur.maxWords && " — EXCEEDS LIMIT — MUST REDUCE"}
                  </div>
                )}
              </>
            )}

            {/* Claims builder */}
            {cur.type === "claims" && (
              <div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 14, lineHeight: 1.7 }}>
                  Each claim must be one complete sentence ending with a period. Independent claims define the broadest scope. Dependent claims narrow a parent claim. Claim 1 must always be independent.
                </div>
                {vals.claims.map((claim, idx) => (
                  <div key={claim.id} style={{ marginBottom: 12, padding: "12px", background: C.panel, border: `1px solid ${claim.type === "independent" ? C.accent + "50" : C.border}`, borderRadius: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: C.accent, fontFamily: "monospace", fontWeight: 700 }}>CLAIM {idx + 1}</span>
                      <select value={claim.type} onChange={e => setClaim(idx, "type", e.target.value)}
                        style={{ ...inputStyle, width: "auto", padding: "3px 8px", borderRadius: 4, fontSize: 11 }}>
                        <option value="independent">Independent</option>
                        <option value="dependent">Dependent</option>
                      </select>
                      {claim.type === "dependent" && vals.claims.length > 1 && (
                        <select value={claim.dependsOn} onChange={e => setClaim(idx, "dependsOn", parseInt(e.target.value))}
                          style={{ ...inputStyle, width: "auto", padding: "3px 8px", borderRadius: 4, fontSize: 11 }}>
                          {vals.claims.filter((_, i) => i !== idx).map(c => (
                            <option key={c.id} value={c.id}>depends on Claim {c.id}</option>
                          ))}
                        </select>
                      )}
                      <div style={{ flex: 1 }} />
                      {vals.claims.length > 1 && (
                        <button onClick={() => removeClaim(idx)} style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", fontSize: 14, padding: "2px 6px" }}>✕</button>
                      )}
                    </div>
                    <textarea value={claim.text} onChange={e => setClaim(idx, "text", e.target.value)}
                      placeholder={claim.type === "independent"
                        ? `${idx + 1}. A device comprising an operating face, wherein at least a substantial portion of the front face has a concave shape.`
                        : `${idx + 1}. A device according to claim ${claim.dependsOn || 1}, wherein the front face has a first extent and a second extent.`}
                      style={{ ...inputStyle, padding: "8px 10px", borderRadius: 6, minHeight: 80, lineHeight: 1.7, resize: "vertical" }} />
                    {claim.text.trim() && validateClaim(claim.text).map((e, i) => (
                      <div key={i} style={{ fontSize: 10, color: C.amber, marginTop: 3 }}>⚠ {e}</div>
                    ))}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button onClick={() => addClaim("independent")} style={btnStyle(C.accent)}>+ INDEPENDENT CLAIM</button>
                  <button onClick={() => addClaim("dependent")} style={btnStyle(C.muted)}>+ DEPENDENT CLAIM</button>
                </div>
              </div>
            )}

            {/* Figures builder */}
            {cur.type === "figures" && (
              <div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 12, lineHeight: 1.7 }}>
                  Add figures submitted with the application. Each figure needs a number and a one-line description. Upload the drawing image (black and white preferred). Reference numerals must be consistent across all figures.
                </div>
                {figures.map((fig, idx) => (
                  <div key={fig.id} style={{ marginBottom: 10, padding: "12px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: C.cyan, fontFamily: "monospace", fontWeight: 700 }}>FIG. {fig.figNum}</span>
                      {figures.length > 0 && <button onClick={() => removeFig(idx)} style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", fontSize: 13 }}>✕</button>}
                    </div>
                    <input value={fig.description} onChange={e => setFig(idx, "description", e.target.value)}
                      placeholder={`FIG. ${fig.figNum} is an isometric view of a device according to a first embodiment,`}
                      style={{ ...inputStyle, padding: "8px 10px", borderRadius: 6, marginBottom: 8 }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <label style={{ fontSize: 11, color: C.muted, cursor: "pointer" }}>
                        📁 Upload drawing
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFigFile(idx, e.target.files[0])} />
                      </label>
                      {fig.imageUrl && <img src={fig.imageUrl} alt={`FIG ${fig.figNum}`} style={{ height: 60, border: `1px solid ${C.border}`, borderRadius: 4, objectFit: "contain" }} />}
                    </div>
                  </div>
                ))}
                <button onClick={addFig} style={btnStyle(C.cyan)}>+ ADD FIGURE</button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  2. APPLICATION EDITOR VIEW — pages 6-17 format, print-ready
// ══════════════════════════════════════════════════════════════════════════════
export function ApplicationEditorView({ C, data, onSendToGov }) {
  const { vals, figures } = data;
  const printRef = useRef();
  const [lineNums, setLineNums] = useState(false);

  const imgFigures = figures.filter(f => f.imageUrl);
  const hasFigs    = figures.some(f => f.description.trim());

  // Build body text with optional line numbers (every 5 lines)
  const renderBody = (text, startLine = 1) => {
    if (!text) return null;
    const lines = text.split("\n");
    let lineNum = startLine;
    return lines.map((line, i) => {
      const show = lineNums && lineNum % 5 === 0;
      const el = (
        <div key={i} style={{ position: "relative", paddingLeft: lineNums ? 40 : 0, marginBottom: 0 }}>
          {show && <span style={{ position: "absolute", left: 0, top: 0, fontFamily: "Courier New, monospace", fontSize: "10pt", color: "#000" }}>{lineNum}</span>}
          {line || "\u00A0"}
        </div>
      );
      lineNum++;
      return el;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Toolbar */}
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "center", flexShrink: 0, background: C.panel }}>
        <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, fontFamily: "monospace", flex: 1 }}>
          APPLICATION EDITOR — USPTO FORMAT (Pages 6–17)
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: C.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={lineNums} onChange={e => setLineNums(e.target.checked)} />
          Line numbers (every 5)
        </label>
        <button onClick={() => window.print()} style={{ padding: "6px 12px", background: `${C.cyan}20`, border: `1px solid ${C.cyan}40`, color: C.cyan, fontFamily: "monospace", fontSize: 10, borderRadius: 6, cursor: "pointer" }}>
          🖨 PRINT / EXPORT PDF
        </button>
        {onSendToGov && (
          <button onClick={onSendToGov} style={{ padding: "6px 14px", background: `${C.accent}20`, border: `1px solid ${C.accent}50`, color: C.accent, fontFamily: "monospace", fontSize: 10, fontWeight: 700, borderRadius: 6, cursor: "pointer" }}>
            📤 SEND TO GOVERNMENT →
          </button>
        )}
      </div>

      {/* Document */}
      <div style={{ flex: 1, overflowY: "auto", background: "#b0b0b0", padding: "24px 20px" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap');
          .pg-doc { font-family: 'Libre Baskerville', 'Times New Roman', Times, serif; font-size: 12pt; color: #000; }
          .pg-page { background: white; width: 8.5in; min-height: 11in; margin: 0 auto 20px; padding: 1in 1.25in 1in 1.5in; box-sizing: border-box; box-shadow: 0 2px 12px rgba(0,0,0,0.35); position: relative; }
          .pg-page-num { text-align: center; font-size: 12pt; margin-bottom: 16pt; }
          .pg-title-hdr { text-align: center; font-weight: bold; text-transform: uppercase; font-size: 12pt; margin-bottom: 24pt; letter-spacing: 0.02em; }
          .pg-sec-hdr { text-align: left; font-weight: bold; text-decoration: underline; text-transform: uppercase; font-size: 12pt; margin: 20pt 0 8pt 0; display: block; }
          .pg-body { font-size: 12pt; line-height: 1.5; margin-bottom: 10pt; text-align: justify; white-space: pre-wrap; word-wrap: break-word; }
          .pg-claim { font-size: 12pt; line-height: 1.5; margin-bottom: 8pt; padding-left: 0.3in; }
          .pg-claim-num { font-weight: normal; }
          .pg-fig-page { text-align: center; }
          .pg-fig-sheet { text-align: center; font-size: 11pt; margin-bottom: 8pt; }
          @media print {
            body * { visibility: hidden; }
            .pg-print-area, .pg-print-area * { visibility: visible; }
            .pg-print-area { position: absolute; left: 0; top: 0; width: 100%; }
            .pg-page { box-shadow: none; margin: 0; page-break-after: always; }
          }
        `}</style>

        <div className="pg-print-area" ref={printRef}>
          <div className="pg-doc">

            {/* ── PAGE 1: Title, Cross-Ref, Field, Background, Summary ── */}
            <div className="pg-page">
              <div className="pg-page-num">1</div>
              <div className="pg-title-hdr">{vals.title || "[TITLE OF INVENTION]"}</div>

              {vals.crossRef && vals.crossRef.trim() !== "Not Applicable" && (
                <>
                  <span className="pg-sec-hdr">CROSS-REFERENCE TO RELATED APPLICATIONS</span>
                  <div className="pg-body">{vals.crossRef}</div>
                </>
              )}

              <span className="pg-sec-hdr">FIELD</span>
              <div className="pg-body">{vals.field || "[Field of the invention]"}</div>

              <span className="pg-sec-hdr">BACKGROUND</span>
              <div className="pg-body">{vals.background || "[Background of the invention]"}</div>

              <span className="pg-sec-hdr">SUMMARY</span>
              <div className="pg-body">{vals.summary || "[Summary of the invention]"}</div>
            </div>

            {/* ── PAGE 2: Drawings desc + Detailed Description ── */}
            <div className="pg-page">
              <div className="pg-page-num">2</div>

              {hasFigs && (
                <>
                  <span className="pg-sec-hdr">BRIEF DESCRIPTION OF THE DRAWINGS</span>
                  <div className="pg-body">In the following detailed portion of the present description, the teachings of the present application will be explained in more detail with reference to the example embodiments shown in the drawings, in which:</div>
                  {figures.filter(f => f.description.trim()).map(fig => (
                    <div key={fig.id} className="pg-body" style={{ marginBottom: 4 }}>
                      {fig.description.endsWith(",") || fig.description.endsWith(".") ? fig.description : fig.description + ","}
                    </div>
                  ))}
                </>
              )}

              <span className="pg-sec-hdr">DETAILED DESCRIPTION</span>
              <div className="pg-body" style={{ whiteSpace: "pre-wrap" }}>
                {lineNums ? renderBody(vals.description) : vals.description || "[Detailed description of the invention]"}
              </div>
            </div>

            {/* ── DRAWING PAGES ── */}
            {imgFigures.map((fig, idx) => (
              <div key={fig.id} className="pg-page pg-fig-page">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "Arial, sans-serif", fontSize: "10pt", marginBottom: 12 }}>
                  <span style={{ fontWeight: "bold" }}>U.S. Patent Application</span>
                  <span style={{ fontWeight: "bold" }}>Sheet {idx + 1} of {imgFigures.length}</span>
                  <span style={{ fontWeight: "bold" }}>Application No.</span>
                </div>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, minHeight: "7in" }}>
                  <img src={fig.imageUrl} alt={`FIG. ${fig.figNum}`} style={{ maxWidth: "100%", maxHeight: "7in", objectFit: "contain" }} />
                </div>
                <div style={{ textAlign: "right", fontFamily: "Arial, sans-serif", fontSize: "10pt", marginTop: 12 }}>
                  <div>Fig {fig.figNum}</div>
                </div>
              </div>
            ))}

            {/* ── CLAIMS PAGE — must start on new page ── */}
            <div className="pg-page" style={{ pageBreakBefore: "always" }}>
              <div className="pg-page-num">{imgFigures.length + 3}</div>
              <span className="pg-sec-hdr">CLAIMS:</span>
              {vals.claims.map((claim, idx) => (
                <div key={claim.id} className="pg-claim">
                  <span className="pg-claim-num">{idx + 1}. </span>
                  {claim.text || `[Claim ${idx + 1} text]`}
                  {claim.type === "dependent" && !claim.text && (
                    <span style={{ color: "#888" }}> — A device according to claim {claim.dependsOn}, wherein...</span>
                  )}
                </div>
              ))}
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: "9pt", marginTop: 24, color: "#333" }}>
                * * * * *
              </div>
            </div>

            {/* ── ABSTRACT PAGE — must start on new page ── */}
            <div className="pg-page" style={{ pageBreakBefore: "always" }}>
              <div className="pg-page-num">{imgFigures.length + 4}</div>
              <span className="pg-sec-hdr">ABSTRACT</span>
              <div className="pg-body">{vals.abstract || "[Abstract — single paragraph, max 150 words]"}</div>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: "9pt", color: "#555", marginTop: 8 }}>
                Word count: {wc(vals.abstract)} / 150
                {wc(vals.abstract) > 150 && <span style={{ color: "red", fontWeight: "bold" }}> — EXCEEDS LIMIT — MUST REDUCE</span>}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
