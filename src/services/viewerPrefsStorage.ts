import type { ViewerPosition } from '../components/PdfViewer/positionMath';
import type { TrimMode } from '../types/crop';

export type { ViewerPosition };

export interface ViewerPrefs {
  zoom: number;
  fitWidth: boolean;
  position: ViewerPosition;
  twoPageView?: boolean;
  showToc?: boolean;
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  cropTopEven?: number;
  cropRightEven?: number;
  cropBottomEven?: number;
  cropLeftEven?: number;
  /** Automatic margin trimming. Overrides the manual crop unless 'off'. */
  trimMode?: TrimMode;
}

const STORAGE_KEY = 'scribe_viewer_prefs';

type PrefsMap = Record<string, ViewerPrefs>;

// Accepts both the new {position} shape and the legacy {currentPage, scrollOffsetTop}
// shape so existing localStorage entries and server rows continue to work.
function coerceToPosition(raw: {
  position?: { pageIndex?: number; withinPageOffset?: number } | null;
  currentPage?: number;
  scrollOffsetTop?: number;
}): ViewerPosition {
  if (raw.position && typeof raw.position.pageIndex === 'number') {
    return {
      pageIndex: raw.position.pageIndex,
      withinPageOffset: raw.position.withinPageOffset ?? 0,
    };
  }
  return {
    pageIndex: raw.currentPage ?? 1,
    withinPageOffset: raw.scrollOffsetTop ?? 0,
  };
}

function normalizePrefs(raw: ViewerPrefs & { currentPage?: number; scrollOffsetTop?: number }): ViewerPrefs {
  const oddT = raw.cropTop ?? 0;
  const oddR = raw.cropRight ?? 0;
  const oddB = raw.cropBottom ?? 0;
  const oddL = raw.cropLeft ?? 0;
  return {
    zoom: raw.zoom,
    fitWidth: raw.fitWidth,
    position: coerceToPosition(raw),
    twoPageView: raw.twoPageView ?? false,
    showToc: raw.showToc ?? false,
    cropTop: oddT,
    cropRight: oddR,
    cropBottom: oddB,
    cropLeft: oddL,
    cropTopEven: raw.cropTopEven ?? oddT,
    cropRightEven: raw.cropRightEven ?? oddR,
    cropBottomEven: raw.cropBottomEven ?? oddB,
    cropLeftEven: raw.cropLeftEven ?? oddL,
    trimMode: raw.trimMode ?? 'off',
  };
}

function toWireBody(prefs: ViewerPrefs) {
  const oddT = prefs.cropTop ?? 0;
  const oddR = prefs.cropRight ?? 0;
  const oddB = prefs.cropBottom ?? 0;
  const oddL = prefs.cropLeft ?? 0;
  return {
    zoom: prefs.zoom,
    fitWidth: prefs.fitWidth,
    position: prefs.position,
    // Mirror to legacy columns so older clients reading this row still work.
    currentPage: prefs.position.pageIndex,
    scrollOffsetTop: prefs.position.withinPageOffset,
    twoPageView: prefs.twoPageView ?? false,
    showToc: prefs.showToc ?? false,
    cropTop: oddT,
    cropRight: oddR,
    cropBottom: oddB,
    cropLeft: oddL,
    cropTopEven: prefs.cropTopEven ?? oddT,
    cropRightEven: prefs.cropRightEven ?? oddR,
    cropBottomEven: prefs.cropBottomEven ?? oddB,
    cropLeftEven: prefs.cropLeftEven ?? oddL,
    trimMode: prefs.trimMode ?? 'off',
  };
}

export const viewerPrefsStorage = {
  get(attachmentId: string): ViewerPrefs | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const map: Record<string, ViewerPrefs & { currentPage?: number; scrollOffsetTop?: number }> = JSON.parse(raw);
      const entry = map[attachmentId];
      return entry ? normalizePrefs(entry) : null;
    } catch {
      return null;
    }
  },

  save(attachmentId: string, prefs: ViewerPrefs): void {
    let map: PrefsMap = {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        map = JSON.parse(raw);
      } catch {
        // corrupted data, start fresh
      }
    }
    map[attachmentId] = prefs;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));

    // Fire-and-forget save to server for cross-device sync
    this.saveToServer(attachmentId, prefs).catch(() => {});
  },

  async fetchFromServer(attachmentId: string): Promise<ViewerPrefs | null> {
    try {
      const res = await fetch(`/api/viewer-prefs/${encodeURIComponent(attachmentId)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return normalizePrefs(data);
    } catch {
      return null;
    }
  },

  async saveToServer(attachmentId: string, prefs: ViewerPrefs): Promise<void> {
    await fetch(`/api/viewer-prefs/${encodeURIComponent(attachmentId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toWireBody(prefs)),
    });
  },
};
