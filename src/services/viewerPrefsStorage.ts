export interface ViewerPrefs {
  zoom: number;
  fitWidth: boolean;
  currentPage: number;
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
  },
};
