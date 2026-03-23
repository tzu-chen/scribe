export interface ViewerPrefs {
  zoom: number;
  fitWidth: boolean;
  currentPage: number;
  twoPageView?: boolean;
  scrollOffsetTop?: number;
}

const STORAGE_KEY = 'scribe_viewer_prefs';

type PrefsMap = Record<string, ViewerPrefs>;

export const viewerPrefsStorage = {
  get(attachmentId: string): ViewerPrefs | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const map: PrefsMap = JSON.parse(raw);
      return map[attachmentId] ?? null;
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
      return {
        zoom: data.zoom,
        fitWidth: data.fitWidth,
        currentPage: data.currentPage,
        twoPageView: data.twoPageView ?? false,
        scrollOffsetTop: data.scrollOffsetTop ?? 0,
      };
    } catch {
      return null;
    }
  },

  async saveToServer(attachmentId: string, prefs: ViewerPrefs): Promise<void> {
    await fetch(`/api/viewer-prefs/${encodeURIComponent(attachmentId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zoom: prefs.zoom,
        fitWidth: prefs.fitWidth,
        currentPage: prefs.currentPage,
        twoPageView: prefs.twoPageView ?? false,
        scrollOffsetTop: prefs.scrollOffsetTop ?? 0,
      }),
    });
  },
};
