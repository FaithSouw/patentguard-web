// Extract readable text from an uploaded file.
// PDFs are binary — FileReader.readAsText() returns gibberish, so we use pdf.js
// to pull the actual text layer. Text-like files are read directly.
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractFileText(file) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) return await file.text();

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Join text items; insert a newline at the end of each page.
    out += content.items.map((it) => (it && "str" in it ? it.str : "")).join(" ") + "\n";
  }
  return out.trim();
}
