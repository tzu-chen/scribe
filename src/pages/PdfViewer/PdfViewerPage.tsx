import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { attachmentStorage } from '../../services/attachmentStorage';
import { viewerPrefsStorage, type ViewerPrefs } from '../../services/viewerPrefsStorage';
import { usePdfDocument } from '../../hooks/usePdfDocument';
import { useDjvuDocument } from '../../hooks/useDjvuDocument';
import { usePdfAnnotations } from '../../hooks/usePdfAnnotations';
import { useCustomOutline } from '../../hooks/useCustomOutline';
import { useNotes } from '../../hooks/useNotes';
import type { CropBox } from '../../types/crop';
import { NO_CROP, hasCrop } from '../../types/crop';
import { ExpandIcon, CollapseIcon, SidebarLeftIcon, SidebarRightIcon } from '../../components/Icons/Icons';
import { PdfToolbar } from '../../components/PdfViewer/PdfToolbar';
import { PdfSidebar } from '../../components/PdfViewer/PdfSidebar';
import { PdfRightPanel } from '../../components/PdfViewer/PdfRightPanel';
import { PdfDocumentView, type PdfDocumentViewHandle } from '../../components/PdfViewer/PdfDocumentView';
import { PdfSelectionToolbar } from '../../components/PdfViewer/PdfSelectionToolbar';
import { PdfCommentPopover } from '../../components/PdfViewer/PdfCommentPopover';
import { PdfCropOverlay } from '../../components/PdfViewer/PdfCropOverlay';
import { PdfPostItNote } from '../../components/PdfViewer/PdfPostItNote';
import { DjvuPageView } from '../../components/PdfViewer/DjvuPageView';
import type { TextSelection } from '../../components/PdfViewer/PdfPageView';
import { useReadingTimeTracker } from '../../hooks/useReadingTimeTracker';
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut';
import { useOpenBooks } from '../../contexts/OpenBooksContext';
import { BookTabs } from '../../components/BookTabs/BookTabs';
import styles from './PdfViewerPage.module.css';

import { v4 as uuidv4 } from 'uuid';

function isDjvuBlob(blob: Blob | null, filename: string): boolean {
  if (!blob) return false;
  return blob.type === 'image/vnd.djvu'
    || blob.type === 'image/x-djvu'
    || filename.toLowerCase().endsWith('.djvu');
}

export function PdfViewerPage() {
  const { attachmentId } = useParams<{ attachmentId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const subject = searchParams.get('subject') || '';

  const [blob, setBlob] = useState<Blob | null>(null);
  const [filename, setFilename] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useReadingTimeTracker(attachmentId, filename);

  const { openBook } = useOpenBooks();
  useEffect(() => {
    if (attachmentId && filename) openBook(attachmentId, filename);
  }, [attachmentId, filename, openBook]);

  const isDjvu = isDjvuBlob(blob, filename);
  const pdfResult = usePdfDocument(isDjvu ? null : blob);
  const djvuResult = useDjvuDocument(isDjvu ? blob : null);
  const { numPages, pageWidth, pageHeight, pageDimensions, outline, loading, error: docError } =
    isDjvu ? djvuResult : pdfResult;
  const pdfDoc = pdfResult.pdfDoc;
  const djvuDoc = djvuResult.djvuDoc;
  const annotations = usePdfAnnotations(attachmentId || '');
  const customOutline = useCustomOutline(attachmentId, outline);
  const { notes, saveNote } = useNotes();

  const savedPrefs = attachmentId ? viewerPrefsStorage.get(attachmentId) : null;

  const [zoom, setZoom] = useState(savedPrefs?.zoom ?? 1.0);
  const [fitWidth, setFitWidth] = useState(savedPrefs?.fitWidth ?? false);
  const [twoPageView, setTwoPageView] = useState(savedPrefs?.twoPageView ?? false);
  const [showToc, setShowToc] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [currentPage, setCurrentPage] = useState(savedPrefs?.currentPage ?? 1);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [crop, setCrop] = useState<CropBox>({
    top: savedPrefs?.cropTop ?? 0,
    right: savedPrefs?.cropRight ?? 0,
    bottom: savedPrefs?.cropBottom ?? 0,
    left: savedPrefs?.cropLeft ?? 0,
  });
  const [cropEven, setCropEven] = useState<CropBox>({
    top: savedPrefs?.cropTopEven ?? savedPrefs?.cropTop ?? 0,
    right: savedPrefs?.cropRightEven ?? savedPrefs?.cropRight ?? 0,
    bottom: savedPrefs?.cropBottomEven ?? savedPrefs?.cropBottom ?? 0,
    left: savedPrefs?.cropLeftEven ?? savedPrefs?.cropLeft ?? 0,
  });
  const [cropMode, setCropMode] = useState(false);

  const [textSelection, setTextSelection] = useState<TextSelection | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<{
    highlightId: string;
    anchorRect: DOMRect;
  } | null>(null);

  const docViewRef = useRef<PdfDocumentViewHandle>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Tracks which attachmentId the currently loaded blob/pdfDoc belongs to.
  // Without this, on a tab switch the scroll-to-saved-page effect runs while
  // pdfDoc still references the previous tab's document, marks the scroll as
  // "done" against the new attachmentId, and then no-ops when the actual
  // document loads — leaving the new tab stuck on page 1.
  const loadedAttachmentIdRef = useRef<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const scrollPositionToRestoreRef = useRef<{ page: number; offsetTop: number } | null>(null);
  const prevEffectiveZoomRef = useRef<number>(0);
  // Locked page width used for fit-width zoom — captured at toggle time so
  // effectiveZoom doesn't change as the user scrolls across pages.
  const fitWidthRefPageWidth = useRef<number>(pageWidth);
  // Flag to suppress ResizeObserver scroll-position saves during zoom-induced resizes
  const isZoomResizeRef = useRef(false);
  const prevTwoPageViewRef = useRef(twoPageView);
  const currentPageRef = useRef(currentPage);
  // Cached scroll position, updated on page changes — used as fallback when
  // docViewRef is unavailable (e.g. during unmount).
  const lastScrollPosRef = useRef<{ page: number; offsetTop: number }>({
    page: savedPrefs?.currentPage ?? 1,
    offsetTop: savedPrefs?.scrollOffsetTop ?? 0,
  });

  // Reset all viewer state when switching attachments
  useEffect(() => {
    const prefs = attachmentId ? viewerPrefsStorage.get(attachmentId) : null;
    setZoom(prefs?.zoom ?? 1.0);
    setFitWidth(prefs?.fitWidth ?? false);
    setTwoPageView(prefs?.twoPageView ?? false);
    setCurrentPage(prefs?.currentPage ?? 1);
    setCrop({
      top: prefs?.cropTop ?? 0,
      right: prefs?.cropRight ?? 0,
      bottom: prefs?.cropBottom ?? 0,
      left: prefs?.cropLeft ?? 0,
    });
    setCropEven({
      top: prefs?.cropTopEven ?? prefs?.cropTop ?? 0,
      right: prefs?.cropRightEven ?? prefs?.cropRight ?? 0,
      bottom: prefs?.cropBottomEven ?? prefs?.cropBottom ?? 0,
      left: prefs?.cropLeftEven ?? prefs?.cropLeft ?? 0,
    });
    setCropMode(false);
    setShowToc(false);
    setShowRightPanel(false);
    setEditingNoteId(null);
    setTextSelection(null);
    setActiveHighlight(null);
    scrolledForAttachmentRef.current = null;
    lastScrollPosRef.current = {
      page: prefs?.currentPage ?? 1,
      offsetTop: prefs?.scrollOffsetTop ?? 0,
    };
    prevEffectiveZoomRef.current = 0;
    // fitWidthRefPageWidth will be set once pageDimensions are available
  }, [attachmentId]);

  // Sync immersive mode with document attribute (hides Layout header via global CSS)
  useEffect(() => {
    if (immersiveMode) {
      document.documentElement.setAttribute('data-immersive', 'true');
    } else {
      document.documentElement.removeAttribute('data-immersive');
    }
    return () => {
      document.documentElement.removeAttribute('data-immersive');
    };
  }, [immersiveMode]);

  // Escape key exits immersive mode
  useEffect(() => {
    if (!immersiveMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImmersiveMode(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [immersiveMode]);

  // Track the document area width for fit-width calculation.
  // The body div is conditionally rendered (only when !loading && pdfDoc),
  // so we depend on both pdfDoc and loading to re-run the effect once the
  // body div is actually in the DOM.  pdfDoc is set before loading becomes
  // false (they're in separate React batches due to awaits in the hook),
  // so depending on pdfDoc alone would fire too early.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        // Don't capture scroll position during zoom-induced resizes — the
        // position would be stale and feed back into the restoration loop.
        if (!isZoomResizeRef.current) {
          scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
        }
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdfDoc, djvuDoc, loading]);

  // Load the attachment blob and sync server-side viewer prefs
  useEffect(() => {
    if (!attachmentId) return;
    setBlob(null);
    setLoadError(null);
    loadedAttachmentIdRef.current = null;
    let cancelled = false;

    const load = async () => {
      try {
        // Local prefs are the source of truth on this device — they're updated
        // continuously and survive tab switches. Only fall back to the server
        // when this device has never seen the book (true cross-device sync),
        // otherwise an in-flight server PUT can race a tab switch and the
        // fetched data clobbers the just-saved local position.
        const localPrefs = viewerPrefsStorage.get(attachmentId);
        const [b, serverPrefs] = await Promise.all([
          attachmentStorage.getBlob(attachmentId),
          localPrefs ? Promise.resolve(null) : viewerPrefsStorage.fetchFromServer(attachmentId),
        ]);
        if (cancelled) return;
        if (!b) {
          setLoadError('Attachment not found.');
          return;
        }

        if (serverPrefs) {
          viewerPrefsStorage.get(attachmentId); // ensure localStorage is read
          // Write server prefs to localStorage cache (skip the server save
          // since data already came from the server)
          const raw = localStorage.getItem('scribe_viewer_prefs');
          let map: Record<string, ViewerPrefs> = {};
          if (raw) { try { map = JSON.parse(raw); } catch { /* start fresh */ } }
          map[attachmentId] = serverPrefs;
          localStorage.setItem('scribe_viewer_prefs', JSON.stringify(map));

          setZoom(serverPrefs.zoom ?? 1.0);
          setFitWidth(serverPrefs.fitWidth ?? false);
          setTwoPageView(serverPrefs.twoPageView ?? false);
          setCurrentPage(serverPrefs.currentPage ?? 1);
          setCrop({
            top: serverPrefs.cropTop ?? 0,
            right: serverPrefs.cropRight ?? 0,
            bottom: serverPrefs.cropBottom ?? 0,
            left: serverPrefs.cropLeft ?? 0,
          });
          setCropEven({
            top: serverPrefs.cropTopEven ?? serverPrefs.cropTop ?? 0,
            right: serverPrefs.cropRightEven ?? serverPrefs.cropRight ?? 0,
            bottom: serverPrefs.cropBottomEven ?? serverPrefs.cropBottom ?? 0,
            left: serverPrefs.cropLeftEven ?? serverPrefs.cropLeft ?? 0,
          });
          lastScrollPosRef.current = {
            page: serverPrefs.currentPage ?? 1,
            offsetTop: serverPrefs.scrollOffsetTop ?? 0,
          };
        }

        loadedAttachmentIdRef.current = attachmentId;
        setBlob(b);

        // Mark as recently opened so Library "last opened" stays current
        attachmentStorage.markOpened(attachmentId).catch(() => {});

        // Get filename from metadata
        const allMeta = await attachmentStorage.getAll();
        const meta = allMeta.find(f => f.id === attachmentId);
        if (meta) setFilename(meta.filename);
      } catch {
        if (!cancelled) setLoadError('Failed to load attachment.');
      }
    };

    load();
    return () => { cancelled = true; };
  }, [attachmentId, subject]);

  // Scroll to saved page once the PDF is loaded.
  // Tracks which attachment we already scrolled for to avoid repeating.
  const scrolledForAttachmentRef = useRef<string | null>(null);

  useEffect(() => {
    const docReady = isDjvu ? !!djvuDoc : !!pdfDoc;
    if (!docReady || loading || !attachmentId || scrolledForAttachmentRef.current === attachmentId) return;
    // Guard against the previous tab's pdfDoc still being live in this render
    // — only scroll once the loaded document actually corresponds to attachmentId.
    if (loadedAttachmentIdRef.current !== attachmentId) return;
    // Read prefs directly to avoid stale closure
    const prefs = viewerPrefsStorage.get(attachmentId);
    const hasPosition = prefs && (prefs.currentPage > 1 || (prefs.scrollOffsetTop && prefs.scrollOffsetTop > 0));
    if (hasPosition) {
      requestAnimationFrame(() => {
        docViewRef.current?.scrollToPage(
          prefs.currentPage,
          prefs.scrollOffsetTop ?? null,
          'instant',
        );
      });
    }
    scrolledForAttachmentRef.current = attachmentId; // eslint-disable-line react-hooks/immutability
  }, [pdfDoc, djvuDoc, isDjvu, loading, attachmentId]);

  // Once pageDimensions are available, initialize the fit-width reference width
  // based on the saved/current page so restored fit-width prefs work correctly.
  useEffect(() => {
    if (pageDimensions.length === 0 || !fitWidth) return;
    fitWidthRefPageWidth.current = pageDimensions[currentPage - 1]?.width ?? pageWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when dimensions first load
  }, [pageDimensions.length > 0]);

  // Wrap onPageChange to also capture the precise scroll offset into a ref.
  // NOTE: Do NOT save scrollPositionToRestoreRef here — that ref is reserved
  // for explicit user actions (panel toggles, zoom changes, etc.).  Saving it
  // on every scroll-triggered page change creates an infinite loop when
  // fit-width is on and adjacent pages have different widths: page change →
  // effectiveZoom change → scroll restore → different page detected → repeat.
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    const pos = docViewRef.current?.getScrollPosition();
    if (pos) lastScrollPosRef.current = pos;
  }, []);

  // Helper to build current prefs including precise scroll offset
  const buildPrefs = useCallback(() => {
    // Try live DOM first; fall back to cached position (needed during unmount
    // when React has already cleared the imperative handle ref).
    const pos = docViewRef.current?.getScrollPosition() ?? lastScrollPosRef.current;
    return {
      zoom,
      fitWidth,
      currentPage: pos.page,
      twoPageView,
      scrollOffsetTop: pos.offsetTop,
      cropTop: crop.top,
      cropRight: crop.right,
      cropBottom: crop.bottom,
      cropLeft: crop.left,
      cropTopEven: cropEven.top,
      cropRightEven: cropEven.right,
      cropBottomEven: cropEven.bottom,
      cropLeftEven: cropEven.left,
    };
  }, [zoom, fitWidth, currentPage, twoPageView, crop, cropEven]);

  // Debounced save of viewer preferences
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!attachmentId || !scrolledForAttachmentRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      viewerPrefsStorage.save(attachmentId, buildPrefs());
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [attachmentId, zoom, fitWidth, currentPage, twoPageView, buildPrefs]);

  // Save prefs on component unmount (navigating away from PDF view).
  // useLayoutEffect cleanup runs synchronously before React clears refs,
  // so docViewRef.current is still available for getScrollPosition().
  useLayoutEffect(() => {
    if (!attachmentId) return;
    return () => {
      viewerPrefsStorage.save(attachmentId, buildPrefs());
    };
  }, [attachmentId, buildPrefs]);

  // Immediate save on tab close or tab hide (mobile may not fire beforeunload)
  useEffect(() => {
    if (!attachmentId) return;

    const handleBeforeUnload = () => {
      viewerPrefsStorage.save(attachmentId, buildPrefs());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        viewerPrefsStorage.save(attachmentId, buildPrefs());
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [attachmentId, buildPrefs]);

  const handleImmersiveToggle = useCallback(() => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setImmersiveMode(prev => !prev);
  }, []);

  const handleCreateNote = useCallback(async () => {
    const now = new Date().toISOString();
    const newNote = {
      id: uuidv4(),
      title: '',
      content: '',
      tags: [] as string[],
      status: 'draft' as const,
      subject: subject || undefined,
      attachmentId: attachmentId || undefined,
      page: currentPage || undefined,
      createdAt: now,
      updatedAt: now,
    };
    await saveNote(newNote);
    setEditingNoteId(newNote.id);
  }, [subject, attachmentId, currentPage, saveNote]);

  const handleZoomChange = useCallback((newZoom: number) => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setFitWidth(false);
    setZoom(newZoom);
  }, []);

  const handleFitWidthToggle = useCallback(() => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setFitWidth(prev => {
      const next = !prev;
      if (next) {
        fitWidthRefPageWidth.current = pageDimensions[currentPage - 1]?.width ?? pageWidth;
      }
      return next;
    });
  }, [pageDimensions, currentPage, pageWidth]);

  const handleTwoPageViewToggle = useCallback(() => {
    setTwoPageView(prev => !prev);
  }, []);

  const handleCropModeToggle = useCallback(() => {
    setCropMode(prev => !prev);
  }, []);

  const handleCropApply = useCallback((newCropOdd: CropBox, newCropEven: CropBox) => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setCrop(newCropOdd);
    setCropEven(newCropEven);
    setCropMode(false);
  }, []);

  const handleCropReset = useCallback(() => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setCrop(NO_CROP);
    setCropEven(NO_CROP);
    setCropMode(false);
  }, []);

  const handleCropCancel = useCallback(() => {
    setCropMode(false);
  }, []);

  const handleTocToggle = useCallback(() => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setShowToc(prev => !prev);
  }, []);

  const handleRightPanelToggle = useCallback(() => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setShowRightPanel(prev => !prev);
  }, []);

  // Disable shortcuts while crop-mode dialog is open so its own controls
  // (Esc/Enter and free-form input) aren't intercepted.
  const shortcutsEnabled = !cropMode;
  useKeyboardShortcut('pdfTocToggle', handleTocToggle, shortcutsEnabled);
  useKeyboardShortcut('pdfFitWidthToggle', handleFitWidthToggle, shortcutsEnabled);
  useKeyboardShortcut('pdfPanelToggle', handleRightPanelToggle, shortcutsEnabled);
  useKeyboardShortcut('pdfImmersiveToggle', handleImmersiveToggle, shortcutsEnabled);

  const handlePanelScrollToPage = useCallback((page: number) => {
    docViewRef.current?.scrollToPage(page);
  }, []);

  const handleToolbarPageJump = useCallback((page: number) => {
    docViewRef.current?.scrollToPage(page, null, 'instant');
  }, []);

  const handleNavigateToNote = useCallback((noteId: string) => {
    navigate(`/note/${noteId}`);
  }, [navigate]);

  const handleEditNote = useCallback((noteId: string) => {
    setEditingNoteId(noteId);
    setShowRightPanel(false);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditingNoteId(null);
  }, []);

  const handleTextSelected = useCallback((selection: TextSelection) => {
    setTextSelection(selection);
    setActiveHighlight(null);
  }, []);

  const handleSelectionCleared = useCallback(() => {
    setTextSelection(null);
  }, []);

  const handleHighlightClick = useCallback((highlightId: string, anchorRect: DOMRect) => {
    setActiveHighlight({ highlightId, anchorRect });
    setTextSelection(null);
  }, []);

  const handleHighlight = useCallback(async () => {
    if (!textSelection) return;
    await annotations.addHighlight(
      textSelection.pageNumber,
      textSelection.rects,
      textSelection.text,
    );
    window.getSelection()?.removeAllRanges();
    setTextSelection(null);
  }, [textSelection, annotations]);

  const handleHighlightAndComment = useCallback(async () => {
    if (!textSelection) return;
    const hl = await annotations.addHighlight(
      textSelection.pageNumber,
      textSelection.rects,
      textSelection.text,
    );
    window.getSelection()?.removeAllRanges();
    setTextSelection(null);
    // Open comment popover for the new highlight
    setActiveHighlight({
      highlightId: hl.id,
      anchorRect: new DOMRect(
        textSelection.anchorPosition.x,
        textSelection.anchorPosition.y,
        0,
        0,
      ),
    });
  }, [textSelection, annotations]);

  const handleClosePopover = useCallback(() => {
    setActiveHighlight(null);
  }, []);

  const handleTocNavigate = useCallback((page: number, destTop: number | null) => {
    docViewRef.current?.scrollToPage(page, destTop, 'instant');
  }, []);

  // Keep currentPageRef in sync for use in the two-page toggle effect
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // When twoPageView toggles, restore scroll position to the current page so
  // the user stays on the same content after the layout reflows.
  useEffect(() => {
    if (prevTwoPageViewRef.current === twoPageView) return;
    prevTwoPageViewRef.current = twoPageView;
    if (!scrolledForAttachmentRef.current) return;
    const page = currentPageRef.current;
    requestAnimationFrame(() => {
      docViewRef.current?.scrollToPage(page, null, 'instant');
    });
  }, [twoPageView]);

  // Compute fit-width scale using actual container width and PDF page width
  const availableWidth = containerWidth > 0
    ? containerWidth
      - (showToc ? 280 : 0)
      - (showRightPanel ? 300 : 0)
      - 40
    : 0;
  // Use the locked page width captured at fit-width toggle time so
  // effectiveZoom doesn't change as the user scrolls across pages.
  const currentPageWidth = fitWidth ? fitWidthRefPageWidth.current : pageWidth;
  // Use the widest of the two crops so the fit-width scale accommodates whichever
  // page parity needs the most horizontal space — otherwise the narrower-cropped
  // pages would overflow.
  const minHorizCropFactor = Math.min(
    1 - crop.left - crop.right,
    1 - cropEven.left - cropEven.right,
  );
  const croppedPageWidth = currentPageWidth * minHorizCropFactor;
  // In two-page view, two pages sit side by side with an 8px gap between them.
  const fitWidthPageSpan = twoPageView ? croppedPageWidth * 2 + 8 : croppedPageWidth;
  const effectiveZoom = fitWidth && availableWidth > 0 ? Math.max(0.5, availableWidth / fitWidthPageSpan) : zoom;

  // When effectiveZoom changes, restore the scroll position that was saved before the change.
  // useLayoutEffect fires after DOM mutations but before the browser paints, preventing a visible jump.
  useLayoutEffect(() => {
    if (prevEffectiveZoomRef.current === effectiveZoom) return;
    prevEffectiveZoomRef.current = effectiveZoom;
    // Don't interfere with the initial page scroll restoration
    if (!scrolledForAttachmentRef.current) return;
    const pos = scrollPositionToRestoreRef.current;
    scrollPositionToRestoreRef.current = null;
    if (pos) {
      // Suppress ResizeObserver scroll-position saves while zoom-induced
      // layout changes propagate, to prevent a stale-position feedback loop.
      isZoomResizeRef.current = true;
      docViewRef.current?.scrollToPage(pos.page, pos.offsetTop, 'instant');
      requestAnimationFrame(() => {
        isZoomResizeRef.current = false;
      });
    }
  }, [effectiveZoom]);

  const errorMessage = loadError || docError;

  if (errorMessage) {
    return (
      <div className={styles.page}>
        <div className={styles.errorContainer}>
          <p className={styles.error}>{errorMessage}</p>
        </div>
      </div>
    );
  }

  const docReady = isDjvu ? !!djvuDoc : !!pdfDoc;
  if (loading || !docReady) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingContainer}>
          <p className={styles.loading}>Loading{isDjvu ? ' DjVu' : ' PDF'}...</p>
        </div>
      </div>
    );
  }

  const activeHl = activeHighlight
    ? annotations.highlights.find(h => h.id === activeHighlight.highlightId)
    : null;

  return (
    <div className={`${styles.page} ${immersiveMode ? styles.immersive : ''}`}>
      <PdfToolbar
        filename={filename}
        currentPage={currentPage}
        numPages={numPages}
        onPageJump={handleToolbarPageJump}
        zoom={effectiveZoom}
        fitWidth={fitWidth}
        twoPageView={twoPageView}
        onZoomChange={handleZoomChange}
        onFitWidthToggle={handleFitWidthToggle}
        onTwoPageViewToggle={handleTwoPageViewToggle}
        onCreateNote={handleCreateNote}
        immersiveMode={immersiveMode}
        cropActive={hasCrop(crop) || hasCrop(cropEven)}
        onCropToggle={handleCropModeToggle}
        fileType={isDjvu ? 'djvu' : 'pdf'}
      />
      {!immersiveMode && <BookTabs activeId={attachmentId} />}
      <div ref={bodyRef} className={styles.body}>
        {showToc && (
          <PdfSidebar
            outline={customOutline.outline}
            onNavigate={handleTocNavigate}
            onAddItem={customOutline.addItem}
            onRenameItem={customOutline.renameItem}
            onDeleteItem={customOutline.deleteItem}
            onReorderItems={customOutline.reorderItems}
            onResetOutline={customOutline.resetToOriginal}
            hasCustomOutline={customOutline.hasCustomOutline}
            getScrollPosition={() => docViewRef.current?.getScrollPosition() ?? null}
          />
        )}
        <div className={styles.pdfArea}>
        <PdfDocumentView
          ref={docViewRef}
          pdfDoc={isDjvu ? undefined : pdfDoc!}
          numPages={numPages}
          scale={effectiveZoom}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          pageDimensions={pageDimensions}
          highlights={isDjvu ? undefined : annotations.highlights}
          crop={hasCrop(crop) ? crop : undefined}
          cropEven={hasCrop(cropEven) ? cropEven : undefined}
          twoPageView={twoPageView}
          onTextSelected={isDjvu ? undefined : handleTextSelected}
          onSelectionCleared={isDjvu ? undefined : handleSelectionCleared}
          onHighlightClick={isDjvu ? undefined : handleHighlightClick}
          onPageChange={handlePageChange}
          renderVisiblePage={isDjvu && djvuDoc ? (pageNum, dims, scale, cropBox, priority) => (
            <DjvuPageView
              djvuDoc={djvuDoc}
              pageNumber={pageNum}
              scale={scale}
              expectedWidth={dims.width}
              expectedHeight={dims.height}
              crop={cropBox}
              priority={priority}
            />
          ) : undefined}
        />
        <div className={styles.immersiveZone}>
          <button
            className={styles.immersiveToggle}
            onClick={handleImmersiveToggle}
            title={immersiveMode ? 'Exit immersive mode (Esc)' : 'Enter immersive mode'}
          >
            {immersiveMode ? <CollapseIcon size={18} /> : <ExpandIcon size={18} />}
          </button>
        </div>
        <div className={styles.tocZone}>
          <button
            className={`${styles.floatingToggle} ${showToc ? styles.floatingToggleActive : ''}`}
            onClick={handleTocToggle}
            title="Table of contents"
          >
            <SidebarLeftIcon size={18} />
          </button>
        </div>
        <div className={styles.panelZone}>
          <button
            className={`${styles.floatingToggle} ${showRightPanel ? styles.floatingToggleActive : ''}`}
            onClick={handleRightPanelToggle}
            title="Comments & Notes panel"
          >
            <SidebarRightIcon size={18} />
          </button>
        </div>
        {editingNoteId && (
          <PdfPostItNote
            noteId={editingNoteId}
            notes={notes}
            saveNote={saveNote}
            onClose={handleCloseEditor}
          />
        )}
        </div>
        {showRightPanel && (
          <PdfRightPanel
            highlights={annotations.highlights}
            comments={annotations.comments}
            notes={notes}
            subject={subject}
            attachmentId={attachmentId}
            onScrollToPage={handlePanelScrollToPage}
            onNavigateToNote={handleNavigateToNote}
            onEditNote={handleEditNote}
          />
        )}
      </div>

      {!isDjvu && cropMode && (
        <PdfCropOverlay
          pdfDoc={pdfDoc!}
          pageNumber={currentPage}
          numPages={numPages}
          pageWidth={pageDimensions[currentPage - 1]?.width ?? pageWidth}
          pageHeight={pageDimensions[currentPage - 1]?.height ?? pageHeight}
          currentCropOdd={crop}
          currentCropEven={cropEven}
          onApply={handleCropApply}
          onReset={handleCropReset}
          onCancel={handleCropCancel}
        />
      )}

      {!isDjvu && textSelection && (
        <PdfSelectionToolbar
          position={textSelection.anchorPosition}
          onHighlight={handleHighlight}
          onHighlightAndComment={handleHighlightAndComment}
        />
      )}

      {!isDjvu && activeHl && activeHighlight && (
        <PdfCommentPopover
          highlight={activeHl}
          comments={annotations.comments[activeHl.id] || []}
          anchorRect={activeHighlight.anchorRect}
          onAddComment={annotations.addComment}
          onUpdateComment={annotations.updateComment}
          onDeleteComment={annotations.deleteComment}
          onDeleteHighlight={(id) => {
            annotations.deleteHighlight(id);
            setActiveHighlight(null);
          }}
          onClose={handleClosePopover}
        />
      )}
    </div>
  );
}
