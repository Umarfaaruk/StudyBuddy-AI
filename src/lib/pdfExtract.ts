/**
 * pdfExtract.ts — Shared PDF text extraction utility
 *
 * FIX Bug 13: AITutor.tsx and MaterialUpload.tsx both contained identical
 * 15-line PDF extraction functions, each independently fetching the PDF.js
 * worker from the unpkg CDN. Extracted here as a single shared utility so:
 *   - Bug fixes only need to happen once
 *   - CDN worker script is fetched once per component tree, not twice
 *
 * Usage:
 *   import { extractPdfText } from "@/lib/pdfExtract";
 *   const text = await extractPdfText(file);
 */

import * as pdfjsLib from "pdfjs-dist";

let workerInitialized = false;

function ensureWorker() {
  if (workerInitialized) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
  workerInitialized = true;
}

/**
 * Extracts all text content from a PDF File object.
 * Returns concatenated text from all pages, separated by newlines.
 */
export async function extractPdfText(file: File): Promise<string> {
  ensureWorker();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(" ");
    pageTexts.push(pageText);
  }

  return pageTexts.join("\n\n");
}
