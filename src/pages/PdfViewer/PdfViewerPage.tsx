import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { viewerPrefsStorage } from '../../services/viewerPrefsStorage';
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
import { useTabDocument } from '../../contexts/OpenBooksContext';
import { BookTabs } from '../../components/BookTabs/BookTabs';
import styles from './PdfViewerPage.module.css';

import { v4 as uuidv4 } from 'uuid';
import { exportCroppedPdf } from '../../utils/exportCroppedPdf';

export interface PdfViewerInstanceProps {
  attachmentId: string;
  filename: string;
  /** The subject from the URL when this tab was last activated. Inactive
   *  instances cache the last value so the right panel filter and new-note
   *  default stay stable across deactivation. */
  subject: string;
  /** True iff this is the tab currently being viewed. Inactive instances skip
   *  global side effects (reading time, doc-level attrs, keyboard shortcuts). */
  isActive: boolean;
}

export function PdfViewerInstance({ attachmentId, filename, subject: subjectFromHost, isActive }: PdfViewerInstanceProps) {
  const navigate = useNavigate();

  // Subject is captured at activation time so inactive tabs don't lose theirs
  // when the URL changes (e.g., switching to another tab strips the param).
  const [subject, setSubject] = useState(subjectFromHost);
  useEffect(() => {
    if (isActive) setSubject(subjectFromHost);
  }, [isActive, subjectFromHost]);

  // Reading time only accrues while this tab is visible.
  useReadingTimeTracker(isActive ? attachmentId : undefined, filename);

  const doc = useTabDocument(attachmentId);
  const { isDjvu, pdfDoc, djvuDoc, numPages, pageWidth, pageHeight, pageDimensions, outline } = doc;
  const docError = doc.error;
  const loading = doc.status === 'idle' || doc.status === 'loading';
  const annotations = usePdfAnnotations(attachmentId);
  const customOutline = useCustomOutline(attachmentId, outline);
  const { notes, saveNote } = useNotes();

  const savedPrefs = viewerPrefsStorage.get(attachmentId);

  const [zoom, setZoom] = useState(savedPrefs?.zoom ?? 1.0);
  const [fitWidth, setFitWidth] = useState(savedPrefs?.fitWidth ?? false);
  const [twoPageView, setTwoPageView] = useState(savedPrefs?.twoPageView ?? false);
  const [showToc, setShowToc] = useState(savedPrefs?.showToc ?? false);
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
  const [lockedOrientation, setLockedOrientation] = useState<'portrait' | 'landscape' | null>(null);
  const [exportingCropped, setExportingCropped] = useState(false);
  const [actualOrientation, setActualOrientation] = useState<'portrait' | 'landscape'>(
    () => (typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait')
  );

  const [textSelection, setTextSelection] = useState<TextSelection | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<{
    highlightId: string;
    anchorRect: DOMRect;
  } | null>(null);

  const docViewRef = useRef<PdfDocumentViewHandle>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pdfContainerWidth, setPdfContainerWidth] = useState(0);
  const scrollPositionToRestoreRef = useRef<{ page: number; offsetTop: number } | null>(null);
  const prevEffectiveZoomRef = useRef<number>(0);
  const fitWidthRefPageWidth = useRef<number>(pageWidth);
  const isZoomResizeRef = useRef(false);
  const prevTwoPageViewRef = useRef(twoPageView);
  const currentPageRef = useRef(currentPage);
  const lastScrollPosRef = useRef<{ page: number; offsetTop: number }>({
    page: savedPrefs?.currentPage ?? 1,
    offsetTop: savedPrefs?.scrollOffsetTop ?? 0,
  });

  // Immersive mode: only the active instance writes the document attribute,
  // and removes it when becoming inactive (so a switch to a non-immersive tab
  // re-shows the layout header).
  useEffect(() => {
    if (!isActive) return;
    if (immersiveMode) {
      document.documentElement.setAttribute('data-immersive', 'true');
    } else {
      document.documentElement.removeAttribute('data-immersive');
    }
    return () => {
      document.documentElement.removeAttribute('data-immersive');
    };
  }, [immersiveMode, isActive]);

  useEffect(() => {
    if (!isActive || !immersiveMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImmersiveMode(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [immersiveMode, isActive]);

  useEffect(() => {
    const update = () => {
      setActualOrientation(window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  const needsRotation = lockedOrientation !== null && lockedOrientation !== actualOrientation;

  useEffect(() => {
    if (!isActive) return;
    if (needsRotation) {
      document.documentElement.setAttribute('data-orientation-rotated', 'true');
    } else {
      document.documentElement.removeAttribute('data-orientation-rotated');
    }
    return () => {
      document.documentElement.removeAttribute('data-orientation-rotated');
    };
  }, [needsRotation, isActive]);

  const handleOrientationLockToggle = useCallback(() => {
    setLockedOrientation(prev =>
      prev === null
        ? (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait')
        : null
    );
  }, []);

  // Capture scroll position before sidebar/immersive resizes so layout
  // changes don't lose the user's place. Read from the continuously-tracked
  // lastScrollPosRef instead of getScrollPosition() because this RO also
  // fires on tab hide/show: at that moment effectiveZoom is mid-transition
  // (still on the `zoom` fallback because the container's RO hasn't yet
  // updated pdfContainerWidth), so a live measurement maps the preserved
  // scrollTop through the wrong scale and returns a page far ahead — which
  // then gets restored as the "real" position, jumping the user toward the
  // end of the document.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!isZoomResizeRef.current) {
        scrollPositionToRestoreRef.current = lastScrollPosRef.current;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdfDoc, djvuDoc, loading]);

  // Sync server-side viewer prefs once on mount (the instance is per-tab,
  // so attachmentId is fixed). Local prefs are the source of truth; only
  // fall back to server when this device has never seen the book.
  useEffect(() => {
    const localPrefs = viewerPrefsStorage.get(attachmentId);
    if (localPrefs) return;
    let cancelled = false;
    (async () => {
      const serverPrefs = await viewerPrefsStorage.fetchFromServer(attachmentId);
      if (cancelled || !serverPrefs) return;
      const raw = localStorage.getItem('scribe_viewer_prefs');
      let map: Record<string, typeof serverPrefs> = {};
      if (raw) { try { map = JSON.parse(raw); } catch { /* start fresh */ } }
      map[attachmentId] = serverPrefs;
      localStorage.setItem('scribe_viewer_prefs', JSON.stringify(map));

      setZoom(serverPrefs.zoom ?? 1.0);
      setFitWidth(serverPrefs.fitWidth ?? false);
      setTwoPageView(serverPrefs.twoPageView ?? false);
      setCurrentPage(serverPrefs.currentPage ?? 1);
      setShowToc(serverPrefs.showToc ?? false);
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
    })();
    return () => { cancelled = true; };
  }, [attachmentId]);

  // Scroll to saved page once the PDF is loaded — only once per instance.
  const scrolledForAttachmentRef = useRef<string | null>(null);

  useEffect(() => {
    const docReady = isDjvu ? !!djvuDoc : !!pdfDoc;
    if (!docReady || loading || scrolledForAttachmentRef.current === attachmentId) return;
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
    scrolledForAttachmentRef.current = attachmentId;
  }, [pdfDoc, djvuDoc, isDjvu, loading, attachmentId]);

  useEffect(() => {
    if (pageDimensions.length === 0 || !fitWidth) return;
    fitWidthRefPageWidth.current = pageDimensions[currentPage - 1]?.width ?? pageWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-runs only when dimensions change
  }, [pageDimensions]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    const pos = docViewRef.current?.getScrollPosition();
    if (pos) lastScrollPosRef.current = pos;
  }, []);

  // Updated by PdfDocumentView on every scroll while visible. Hidden tabs
  // can't be measured via getBoundingClientRect (display:none collapses
  // rects to zero), so buildPrefs must read from this cache rather than
  // calling getScrollPosition() directly — otherwise tab deactivation and
  // pending debounced saves would persist { page: 1, offsetTop: 0 }.
  const handleScrollPositionChange = useCallback((pos: { page: number; offsetTop: number }) => {
    lastScrollPosRef.current = pos;
  }, []);

  const buildPrefs = useCallback(() => {
    const pos = lastScrollPosRef.current;
    return {
      zoom,
      fitWidth,
      currentPage: pos.page,
      twoPageView,
      scrollOffsetTop: pos.offsetTop,
      showToc,
      cropTop: crop.top,
      cropRight: crop.right,
      cropBottom: crop.bottom,
      cropLeft: crop.left,
      cropTopEven: cropEven.top,
      cropRightEven: cropEven.right,
      cropBottomEven: cropEven.bottom,
      cropLeftEven: cropEven.left,
    };
  }, [zoom, fitWidth, twoPageView, showToc, crop, cropEven]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!scrolledForAttachmentRef.current) return;

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
  }, [attachmentId, zoom, fitWidth, currentPage, twoPageView, showToc, buildPrefs]);

  // Save prefs on unmount (tab closed via closeBook).
  useLayoutEffect(() => {
    return () => {
      viewerPrefsStorage.save(attachmentId, buildPrefs());
    };
  }, [attachmentId, buildPrefs]);

  // Immediate save on window unload / tab hide — only registered for the
  // active instance so we don't issue N parallel saves for N open books.
  useEffect(() => {
    if (!isActive) return;

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
  }, [attachmentId, buildPrefs, isActive]);

  // Save when this tab is deactivated (user switched to another book/route).
  // Catches the case where the unmount handler doesn't run because the tab
  // remains mounted in the persistent host.
  useEffect(() => {
    if (isActive) return;
    if (!scrolledForAttachmentRef.current) return;
    viewerPrefsStorage.save(attachmentId, buildPrefs());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only fires on the isActive→false edge
  }, [isActive]);

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

  const handleExportCropped = useCallback(async () => {
    if (!doc.blob || isDjvu || exportingCropped) return;
    setExportingCropped(true);
    try {
      await exportCroppedPdf(doc.blob, filename || 'document.pdf', crop, cropEven);
    } catch (err) {
      console.error('Failed to export cropped PDF:', err);
      alert('Failed to export PDF. See console for details.');
    } finally {
      setExportingCropped(false);
    }
  }, [doc.blob, isDjvu, exportingCropped, filename, crop, cropEven]);

  const handleTocToggle = useCallback(() => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setShowToc(prev => !prev);
  }, []);

  const handleRightPanelToggle = useCallback(() => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setShowRightPanel(prev => !prev);
  }, []);

  // Keyboard shortcuts: only the active instance binds, so inactive tabs don't
  // race the active one for the same keys.
  const shortcutsEnabled = isActive && !cropMode;
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

  const handlePdfContainerResize = useCallback((width: number) => {
    setPdfContainerWidth(width);
  }, []);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    if (prevTwoPageViewRef.current === twoPageView) return;
    prevTwoPageViewRef.current = twoPageView;
    if (!scrolledForAttachmentRef.current) return;
    const page = currentPageRef.current;
    requestAnimationFrame(() => {
      docViewRef.current?.scrollToPage(page, null, 'instant');
    });
  }, [twoPageView]);

  const availableWidth = pdfContainerWidth;
  const currentPageWidth = fitWidth ? fitWidthRefPageWidth.current : pageWidth;
  const minHorizCropFactor = Math.min(
    1 - crop.left - crop.right,
    1 - cropEven.left - cropEven.right,
  );
  const croppedPageWidth = currentPageWidth * minHorizCropFactor;
  const fitWidthPageSpan = twoPageView ? croppedPageWidth * 2 + 8 : croppedPageWidth;
  const effectiveZoom = fitWidth && availableWidth > 0 ? Math.max(0.5, availableWidth / fitWidthPageSpan) : zoom;

  useLayoutEffect(() => {
    if (prevEffectiveZoomRef.current === effectiveZoom) return;
    prevEffectiveZoomRef.current = effectiveZoom;
    if (!scrolledForAttachmentRef.current) return;
    const pos = scrollPositionToRestoreRef.current;
    scrollPositionToRestoreRef.current = null;
    if (pos) {
      isZoomResizeRef.current = true;
      docViewRef.current?.scrollToPage(pos.page, pos.offsetTop, 'instant');
      requestAnimationFrame(() => {
        isZoomResizeRef.current = false;
      });
    }
  }, [effectiveZoom]);

  const errorMessage = docError;

  if (errorMessage) {
    return (
      <div className={styles.page}>
        <BookTabs activeId={attachmentId} />
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
        <BookTabs activeId={attachmentId} />
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
    <div className={`${styles.page} ${immersiveMode ? styles.immersive : ''} ${needsRotation ? styles.rotated : ''}`}>
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
        onExportCropped={isDjvu ? undefined : handleExportCropped}
        exportingCropped={exportingCropped}
        orientationLocked={lockedOrientation !== null}
        onOrientationLockToggle={handleOrientationLockToggle}
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
          onScrollPositionChange={handleScrollPositionChange}
          onContainerResize={handlePdfContainerResize}
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
        {isActive && editingNoteId && (
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

      {isActive && !isDjvu && cropMode && (
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

      {isActive && !isDjvu && textSelection && (
        <PdfSelectionToolbar
          position={textSelection.anchorPosition}
          onHighlight={handleHighlight}
          onHighlightAndComment={handleHighlightAndComment}
        />
      )}

      {isActive && !isDjvu && activeHl && activeHighlight && (
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

// Route placeholder. The actual viewer instances are mounted persistently by
// PersistentPdfHost inside Layout, so the /pdf/:attachmentId route only needs
// a no-op element to register as matched.
export function PdfViewerPage() {
  return null;
}
