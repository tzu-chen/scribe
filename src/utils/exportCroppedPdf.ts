import { PDFDocument } from 'pdf-lib';
import type { CropBox } from '../types/crop';

// Map a viewer-space crop (fractions measured against the rotated page the
// user sees) into a CropBox rect in the page's unrotated user space, which is
// what pdf-lib's setCropBox expects.
function viewerCropToUserSpaceRect(
  mediaW: number,
  mediaH: number,
  rotation: number,
  crop: CropBox,
): { x: number; y: number; width: number; height: number } {
  const { top: T, right: R, bottom: B, left: L } = crop;
  const norm = ((rotation % 360) + 360) % 360;
  let llL: number, llB: number, urR: number, urT: number;
  switch (norm) {
    case 90:
      llL = T; llB = R; urR = B; urT = L; break;
    case 180:
      llL = R; llB = T; urR = L; urT = B; break;
    case 270:
      llL = B; llB = L; urR = T; urT = R; break;
    default:
      llL = L; llB = B; urR = R; urT = T;
  }
  const x = mediaW * llL;
  const y = mediaH * llB;
  const width = mediaW * (1 - llL - urR);
  const height = mediaH * (1 - llB - urT);
  return { x, y, width, height };
}

function hasAnyCrop(c: CropBox): boolean {
  return c.top > 0 || c.right > 0 || c.bottom > 0 || c.left > 0;
}

export async function exportCroppedPdf(
  sourceBlob: Blob,
  filename: string,
  cropOdd: CropBox,
  cropEven: CropBox,
): Promise<void> {
  const bytes = new Uint8Array(await sourceBlob.arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();

  pages.forEach((page, idx) => {
    const isOdd = idx % 2 === 0;
    const crop = isOdd ? cropOdd : cropEven;
    if (!hasAnyCrop(crop)) return;
    const { width: mediaW, height: mediaH } = page.getSize();
    const rotation = page.getRotation().angle;
    const rect = viewerCropToUserSpaceRect(mediaW, mediaH, rotation, crop);
    page.setCropBox(rect.x, rect.y, rect.width, rect.height);
  });

  const out = await pdf.save();
  // Wrap the buffer in a fresh ArrayBuffer to satisfy Blob's BlobPart typing
  // (Uint8Array<ArrayBufferLike> isn't assignable in strict TS).
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  const blob = new Blob([ab], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const base = filename.replace(/\.pdf$/i, '');
  a.download = `${base} (cropped).pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
