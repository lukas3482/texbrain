import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { base64 } from './base64';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// more pixels than this on the long side is only bytes nobody looks at
const MAX_SIDE = 3000;

// one page of the compiled pdf as a png. rendered with the print intent,
// which does not wait for animation frames, so it also finishes while the
// tab sits in the background
export async function renderPdfPage(pdf: Uint8Array, page: number, scale: number) {
  const doc = await pdfjsLib.getDocument({ data: pdf.slice() }).promise;
  try {
    const pages = doc.numPages;
    if (!Number.isInteger(page) || page < 1 || page > pages) throw new Error(`page must be between 1 and ${pages}`);
    const p = await doc.getPage(page);
    const base = p.getViewport({ scale: 1 });
    const fit = Math.min(scale, MAX_SIDE / Math.max(base.width, base.height));
    const viewport = p.getViewport({ scale: fit });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get a drawing context');
    await p.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The browser could not encode the page');
    return { png: base64(new Uint8Array(await blob.arrayBuffer())), pages, w: canvas.width, h: canvas.height, scale: fit };
  } finally {
    void doc.destroy();
  }
}
