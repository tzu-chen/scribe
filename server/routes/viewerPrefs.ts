import { Router } from 'express';
import { db } from '../db.ts';

const router = Router();

interface ViewerPrefsRow {
  attachment_id: string;
  zoom: number;
  fit_width: number;
  current_page: number;
  two_page_view: number;
  scroll_offset_top: number;
  crop_top: number;
  crop_right: number;
  crop_bottom: number;
  crop_left: number;
  crop_top_even: number;
  crop_right_even: number;
  crop_bottom_even: number;
  crop_left_even: number;
  updated_at: string;
}

function rowToPrefs(row: ViewerPrefsRow) {
  return {
    zoom: row.zoom,
    fitWidth: row.fit_width === 1,
    currentPage: row.current_page,
    twoPageView: row.two_page_view === 1,
    scrollOffsetTop: row.scroll_offset_top,
    cropTop: row.crop_top,
    cropRight: row.crop_right,
    cropBottom: row.crop_bottom,
    cropLeft: row.crop_left,
    cropTopEven: row.crop_top_even,
    cropRightEven: row.crop_right_even,
    cropBottomEven: row.crop_bottom_even,
    cropLeftEven: row.crop_left_even,
  };
}

// GET /api/viewer-prefs/:attachmentId
router.get('/:attachmentId', (req, res) => {
  const { attachmentId } = req.params;
  const row = db
    .prepare('SELECT * FROM viewer_prefs WHERE attachment_id = ?')
    .get(attachmentId) as ViewerPrefsRow | undefined;

  if (!row) {
    res.status(404).json({ error: 'No saved preferences for this attachment' });
    return;
  }

  res.json(rowToPrefs(row));
});

// PUT /api/viewer-prefs/:attachmentId
router.put('/:attachmentId', (req, res) => {
  const { attachmentId } = req.params;
  const {
    zoom,
    fitWidth,
    currentPage,
    twoPageView,
    scrollOffsetTop,
    cropTop,
    cropRight,
    cropBottom,
    cropLeft,
    cropTopEven,
    cropRightEven,
    cropBottomEven,
    cropLeftEven,
  } = req.body as {
    zoom: number;
    fitWidth: boolean;
    currentPage: number;
    twoPageView?: boolean;
    scrollOffsetTop?: number;
    cropTop?: number;
    cropRight?: number;
    cropBottom?: number;
    cropLeft?: number;
    cropTopEven?: number;
    cropRightEven?: number;
    cropBottomEven?: number;
    cropLeftEven?: number;
  };

  if (typeof zoom !== 'number' || typeof currentPage !== 'number') {
    res.status(400).json({ error: 'zoom and currentPage are required' });
    return;
  }

  const now = new Date().toISOString();

  // If the client didn't send even-page values, fall back to odd-page values so
  // older clients continue to apply one crop to every page.
  const oddT = cropTop ?? 0;
  const oddR = cropRight ?? 0;
  const oddB = cropBottom ?? 0;
  const oddL = cropLeft ?? 0;

  db.prepare(`
    INSERT INTO viewer_prefs (attachment_id, zoom, fit_width, current_page, two_page_view, scroll_offset_top, crop_top, crop_right, crop_bottom, crop_left, crop_top_even, crop_right_even, crop_bottom_even, crop_left_even, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(attachment_id) DO UPDATE SET
      zoom = excluded.zoom,
      fit_width = excluded.fit_width,
      current_page = excluded.current_page,
      two_page_view = excluded.two_page_view,
      scroll_offset_top = excluded.scroll_offset_top,
      crop_top = excluded.crop_top,
      crop_right = excluded.crop_right,
      crop_bottom = excluded.crop_bottom,
      crop_left = excluded.crop_left,
      crop_top_even = excluded.crop_top_even,
      crop_right_even = excluded.crop_right_even,
      crop_bottom_even = excluded.crop_bottom_even,
      crop_left_even = excluded.crop_left_even,
      updated_at = excluded.updated_at
  `).run(
    attachmentId,
    zoom,
    fitWidth ? 1 : 0,
    currentPage,
    twoPageView ? 1 : 0,
    scrollOffsetTop ?? 0,
    oddT,
    oddR,
    oddB,
    oddL,
    cropTopEven ?? oddT,
    cropRightEven ?? oddR,
    cropBottomEven ?? oddB,
    cropLeftEven ?? oddL,
    now,
  );

  res.json({ ok: true });
});

export default router;
