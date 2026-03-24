export interface CropBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_CROP: CropBox = { top: 0, right: 0, bottom: 0, left: 0 };

export function hasCrop(crop: CropBox): boolean {
  return crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;
}
