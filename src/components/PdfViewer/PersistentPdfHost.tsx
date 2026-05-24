import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { attachmentStorage } from '../../services/attachmentStorage';
import { useOpenBooks } from '../../contexts/OpenBooksContext';
import { PdfViewerInstance } from '../../pages/PdfViewer/PdfViewerPage';
import styles from './PersistentPdfHost.module.css';

function extractAttachmentId(pathname: string): string | null {
  // /pdf/:attachmentId  or  /view/:attachmentId
  const m = pathname.match(/^\/(?:pdf|view)\/([^/]+)/);
  return m ? m[1] : null;
}

/**
 * Renders one PdfViewerInstance per open book and keeps them all mounted across
 * navigations, so switching between tabs (or returning from /notes etc.) is
 * instant. Only the tab matching the current URL is shown; the rest are hidden
 * with the HTML `hidden` attribute (display:none) and `inert` to block focus
 * and pointer events.
 *
 * The host itself is hidden when the user navigates to a non-PDF route, but
 * its descendant viewers stay mounted so their state survives.
 */
export function PersistentPdfHost() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { tabs, openBook, touchTab } = useOpenBooks();

  const isPdfRoute = location.pathname.startsWith('/pdf/') || location.pathname.startsWith('/view/');
  const urlAttachmentId = isPdfRoute ? extractAttachmentId(location.pathname) : null;
  const subjectFromUrl = searchParams.get('subject') ?? '';

  // Keep the LRU order in sync with which tab the user is currently looking at,
  // so eviction never targets the active tab and prefers genuinely stale ones.
  useEffect(() => {
    if (isPdfRoute && urlAttachmentId) touchTab(urlAttachmentId);
  }, [isPdfRoute, urlAttachmentId, touchTab]);

  // If the user navigated to a /pdf URL for an attachment that isn't in the
  // open tabs yet, look up its filename and register it. The provider's load
  // effect then kicks off the blob fetch + PDF parse.
  const knownTab = urlAttachmentId ? tabs.some(t => t.id === urlAttachmentId) : true;
  const needsRegister = isPdfRoute && urlAttachmentId && !knownTab ? urlAttachmentId : null;
  useEffect(() => {
    if (!needsRegister) return;
    let cancelled = false;
    (async () => {
      const all = await attachmentStorage.getAll();
      if (cancelled) return;
      const meta = all.find(m => m.id === needsRegister);
      if (meta) {
        openBook(needsRegister, meta.filename);
        attachmentStorage.markOpened(needsRegister).catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [needsRegister, openBook]);

  return (
    <div className={styles.host} hidden={!isPdfRoute}>
      {tabs.map(tab => {
        const isActive = isPdfRoute && tab.id === urlAttachmentId;
        return (
          <div
            key={tab.id}
            className={styles.tabInstance}
            hidden={!isActive}
            inert={!isActive}
          >
            <PdfViewerInstance
              attachmentId={tab.id}
              filename={tab.filename}
              subject={subjectFromUrl}
              isActive={isActive}
            />
          </div>
        );
      })}
    </div>
  );
}
