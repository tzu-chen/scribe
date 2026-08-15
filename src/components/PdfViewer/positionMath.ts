import type { CropBox } from '../../types/crop';

export interface ViewerPosition {
  /** 1-indexed page number. */
  pageIndex: number;
  /** Pixels from the top of that page at scale 1. */
  withinPageOffset: number;
}

export interface LayoutConstants {
  /** Container padding-top in pixels. Does not scale with zoom. */
  paddingTopPx: number;
  /** Inter-page margin in pixels. Does not scale with zoom. */
  marginPx: number;
}

export interface LayoutModel {
  /** pageTops[i] (1-indexed) = vertical offset in scaled CSS pixels from the
   *  start of pages to the top of page i (margins excluded). Index 0 is
   *  unused. In two-page mode, paired pages share the same offset. Built from
   *  per-page floored heights so it matches the DOM exactly — see
   *  pageEffectiveHeight. */
  pageTops: number[];
  /** marginsBeforePage[i] = number of inter-page margin gaps that precede page i.
   *  Margins do not scale, so they're applied separately at math time. */
  marginsBeforePage: number[];
  numPages: number;
}

export const DEFAULT_LAYOUT_CONSTANTS: LayoutConstants = {
  paddingTopPx: 16,
  marginPx: 8,
};

/** Resolves the crop applied to a given 1-indexed page. Manual cropping keys it
 *  on page parity; auto-trim measures each page individually. */
export type CropForPage = (pageIndex: number) => CropBox | undefined;

function pageEffectiveHeight(
  pageIndex: number,
  pageDimensions: { width: number; height: number }[],
  scale: number,
  cropForPage: CropForPage | undefined,
): number {
  const dim = pageDimensions[pageIndex - 1];
  if (!dim) return 0;
  const cropBox = cropForPage?.(pageIndex);
  const cropT = cropBox?.top ?? 0;
  const cropB = cropBox?.bottom ?? 0;
  const factor = Math.max(0, 1 - cropT - cropB);
  // Floor per page to match the DOM: placeholders and rendered pages both set
  // Math.floor(height * factor * scale) as their CSS height. Summing exact
  // heights and scaling afterwards instead would drift from the real layout by
  // the fractional remainder of every page — several hundred px near the end
  // of a long book at fractional (fit-width) zooms, sending jumps off-target.
  return Math.floor(dim.height * factor * scale);
}

export function buildLayoutModel(
  pageDimensions: { width: number; height: number }[],
  scale: number,
  twoPageView: boolean,
  cropForPage?: CropForPage,
): LayoutModel {
  const numPages = pageDimensions.length;
  const pageTops = new Array<number>(numPages + 1).fill(0);
  const marginsBeforePage = new Array<number>(numPages + 1).fill(0);

  if (numPages === 0) {
    return { pageTops, marginsBeforePage, numPages };
  }

  const heightAt = (i: number) => pageEffectiveHeight(i, pageDimensions, scale, cropForPage);

  if (!twoPageView || numPages === 1) {
    let acc = 0;
    for (let i = 1; i <= numPages; i++) {
      pageTops[i] = acc;
      marginsBeforePage[i] = i - 1;
      acc += heightAt(i);
    }
  } else {
    // Page 1 alone (cover), then pages 2-3, 4-5, ... share rows.
    pageTops[1] = 0;
    marginsBeforePage[1] = 0;
    let acc = heightAt(1);
    let rowIdx = 1;
    for (let i = 2; i <= numPages; i += 2) {
      const left = i;
      const right = i + 1 <= numPages ? i + 1 : null;
      const rowHeight = right
        ? Math.max(heightAt(left), heightAt(right))
        : heightAt(left);
      pageTops[left] = acc;
      marginsBeforePage[left] = rowIdx;
      if (right !== null) {
        pageTops[right] = acc;
        marginsBeforePage[right] = rowIdx;
      }
      acc += rowHeight;
      rowIdx += 1;
    }
  }

  return { pageTops, marginsBeforePage, numPages };
}

export function positionToScrollTop(
  position: ViewerPosition,
  scale: number,
  model: LayoutModel,
  constants: LayoutConstants = DEFAULT_LAYOUT_CONSTANTS,
): number {
  if (model.numPages === 0) return 0;
  const pageIndex = Math.min(Math.max(1, position.pageIndex), model.numPages);
  const withinPageOffset = Math.max(0, position.withinPageOffset);
  return (
    constants.paddingTopPx
    + model.pageTops[pageIndex]
    + model.marginsBeforePage[pageIndex] * constants.marginPx
    + withinPageOffset * scale
  );
}

export function scrollTopToPosition(
  scrollTop: number,
  scale: number,
  model: LayoutModel,
  constants: LayoutConstants = DEFAULT_LAYOUT_CONSTANTS,
): ViewerPosition {
  if (model.numPages === 0) return { pageIndex: 1, withinPageOffset: 0 };

  const topOf = (i: number) =>
    constants.paddingTopPx
    + model.pageTops[i]
    + model.marginsBeforePage[i] * constants.marginPx;

  if (scrollTop <= topOf(1)) {
    return { pageIndex: 1, withinPageOffset: 0 };
  }

  // Binary search for the largest pageIndex whose top is <= scrollTop.
  let lo = 1;
  let hi = model.numPages;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (topOf(mid) <= scrollTop) lo = mid;
    else hi = mid - 1;
  }
  const top = topOf(lo);
  const withinPageOffset = Math.max(0, (scrollTop - top) / scale);
  return { pageIndex: lo, withinPageOffset };
}
