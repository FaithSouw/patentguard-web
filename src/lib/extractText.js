// Extract readable text from an uploaded file.
// PDFs are binary — FileReader.readAsText() returns gibberish, so we use pdf.js
// to pull the actual text layer. Text-like files are read directly.
//
// Scanned / image-based PDFs have no text layer, so the pdf.js pass returns
// almost nothing. When that happens we fall back to OCR (tesseract.js): each
// page is rendered to a canvas and the image is read back as text. OCR is heavy
// (a few MB of wasm + a language model), so tesseract is loaded lazily — only
// when a PDF actually needs it.
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Below this many extracted characters per page we treat the text layer as
// missing/insufficient and fall back to OCR.
const MIN_CHARS_PER_PAGE = 100;
// Render scale for OCR — larger images give tesseract more to work with.
const OCR_RENDER_SCALE = 2;

export async function extractFileText(file, { onProgress } = {}) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) return await file.text();

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  // ── Fast path: pull the embedded text layer ──────────────────────────────
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Join text items; insert a newline at the end of each page.
    out += content.items.map((it) => (it && "str" in it ? it.str : "")).join(" ") + "\n";
  }
  out = out.trim();

  // ── Fallback: scanned/image PDF with little or no text layer → OCR ────────
  if (out.length < MIN_CHARS_PER_PAGE * pdf.numPages) {
    try {
      const ocrText = await ocrPdf(pdf, onProgress);
      // Keep whichever pass produced more usable text.
      if (ocrText.trim().length > out.length) return ocrText.trim();
    } catch (err) {
      // OCR is best-effort; if it fails, return whatever the text layer gave us.
      console.warn("OCR fallback failed:", err);
    }
  }

  return out;
}

// Render every page of a pdf.js document to a canvas and OCR it.
async function ocrPdf(pdf, onProgress) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.({ stage: "ocr", page: i, pages: pdf.numPages });
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const canvasContext = canvas.getContext("2d");

      await page.render({ canvasContext, viewport }).promise;

      const { data } = await worker.recognize(canvas);
      out += (data?.text || "") + "\n";

      // Free the canvas before moving on to the next page.
      canvas.width = 0;
      canvas.height = 0;
    }
    return out;
  } finally {
    await worker.terminate();
  }
}
