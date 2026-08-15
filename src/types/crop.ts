export interface CropBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_CROP: CropBox = { top: 0, right: 0, bottom: 0, left: 0 };

/** How pages are trimmed.
 *  - `off`     — the manual CropBoxes apply (or nothing, if unset)
 *  - `uniform` — one automatically measured box for the whole document
 *  - `page`    — each page trimmed to its own measured content box */
export type TrimMode = 'off' | 'uniform' | 'page';

export function hasCrop(crop: CropBox): boolean {
  return crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;
}
