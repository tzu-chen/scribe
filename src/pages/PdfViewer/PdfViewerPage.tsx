import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { attachmentStorage } from '../../services/attachmentStorage';
import { viewerPrefsStorage } from '../../services/viewerPrefsStorage';
import { usePdfDocument } from '../../hooks/usePdfDocument';
import { usePdfAnnotations } from '../../hooks/usePdfAnnotations';
import { useNotes } from '../../hooks/useNotes';
import { ArrowLeftIcon } from '../../components/Icons/Icons';
import { PdfToolbar } from '../../components/PdfViewer/PdfToolbar';
import { PdfSidebar } from '../../components/PdfViewer/PdfSidebar';
import { PdfRightPanel } from '../../components/PdfViewer/PdfRightPanel';
import { PdfDocumentView, type PdfDocumentViewHandle } from '../../components/PdfViewer/PdfDocumentView';
import { PdfSelectionToolbar } from '../../components/PdfViewer/PdfSelectionToolbar';
import { PdfCommentPopover } from '../../components/PdfViewer/PdfCommentPopover';
import { PdfNoteEditorPanel } from '../../components/PdfViewer/PdfNoteEditorPanel';
import type { TextSelection } from '../../components/PdfViewer/PdfPageView';
import { useReadingTimeTracker } from '../../hooks/useReadingTimeTracker';
import styles from './PdfViewerPage.module.css';

const DEFAULT_EDITOR_WIDTH = 450;

export function PdfViewerPage() {
  const { attachmentId } = useParams<{ attachmentId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const subject = searchParams.get('subject') || '';
  const flowchartId = searchParams.get('flowchart') || '';

  const [blob, setBlob] = useState<Blob | null>(null);
  const [filename, setFilename] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useReadingTimeTracker(attachmentId, filename);

  const { pdfDoc, numPages, pageWidth, pageHeight, outline, loading, error: pdfError } = usePdfDocument(blob);
  const annotations = usePdfAnnotations(attachmentId || '');
  const { notes, saveNote } = useNotes();

  const savedPrefs = attachmentId ? viewerPrefsStorage.get(attachmentId) : null;

  const [zoom, setZoom] = useState(savedPrefs?.zoom ?? 1.0);
  const [fitWidth, setFitWidth] = useState(savedPrefs?.fitWidth ?? false);
  const [twoPageView, setTwoPageView] = useState(savedPrefs?.twoPageView ?? false);
  const [showToc, setShowToc] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [currentPage, setCurrentPage] = useState(savedPrefs?.currentPage ?? 1);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editorPanelWidth, setEditorPanelWidth] = useState(DEFAULT_EDITOR_WIDTH);

  const [textSelection, setTextSelection] = useState<TextSelection | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<{
    highlightId: string;
    anchorRect: DOMRect;
  } | null>(null);

  const docViewRef = useRef<PdfDocumentViewHandle>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const scrollPositionToRestoreRef = useRef<{ page: number; offsetTop: number } | null>(null);
  const prevEffectiveZoomRef = useRef<number>(0);
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
  }, [attachmentId]);

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
        scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdfDoc, loading]);

  // Load the attachment blob
  useEffect(() => {
    if (!attachmentId) return;
    setBlob(null);
    setLoadError(null);
    let cancelled = false;

    const load = async () => {
      try {
        const b = await attachmentStorage.getBlob(attachmentId);
        if (cancelled) return;
        if (!b) {
          setLoadError('Attachment not found.');
          return;
        }
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
    if (!pdfDoc || !attachmentId || scrolledForAttachmentRef.current === attachmentId) return;
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
  }, [pdfDoc, attachmentId]);

  // Wrap onPageChange to also capture the precise scroll offset into a ref
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
    };
  }, [zoom, fitWidth, currentPage, twoPageView]);

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

  // Immediate save on tab close
  useEffect(() => {
    if (!attachmentId) return;

    const handleBeforeUnload = () => {
      viewerPrefsStorage.save(attachmentId, buildPrefs());
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [attachmentId, buildPrefs]);

  const handleReturnToFlowchart = useCallback(() => {
    navigate(`/flowcharts${flowchartId ? `?view=${flowchartId}` : ''}`);
  }, [navigate, flowchartId]);

  const handleCreateNote = useCallback(() => {
    if (subject) {
      navigate(`/note/new?subject=${encodeURIComponent(subject)}`);
    } else {
      navigate('/note/new');
    }
  }, [navigate, subject]);

  const handleOpenInNewTab = useCallback(() => {
    if (!attachmentId) return;
    const url = `/pdf/${attachmentId}${window.location.search}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [attachmentId]);

  const handleZoomChange = useCallback((newZoom: number) => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setFitWidth(false);
    setZoom(newZoom);
  }, []);

  const handleFitWidthToggle = useCallback(() => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setFitWidth(prev => !prev);
  }, []);

  const handleTwoPageViewToggle = useCallback(() => {
    setTwoPageView(prev => !prev);
  }, []);

  const handleTocToggle = useCallback(() => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setShowToc(prev => !prev);
  }, []);

  const handleRightPanelToggle = useCallback(() => {
    scrollPositionToRestoreRef.current = docViewRef.current?.getScrollPosition() ?? null;
    setShowRightPanel(prev => !prev);
  }, []);

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
      - (editingNoteId ? editorPanelWidth : 0)
      - 40
    : 0;
  // In two-page view, two pages sit side by side with an 8px gap between them.
  const fitWidthPageSpan = twoPageView ? pageWidth * 2 + 8 : pageWidth;
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
      docViewRef.current?.scrollToPage(pos.page, pos.offsetTop, 'instant');
    }
  }, [effectiveZoom]);

  const errorMessage = loadError || pdfError;

  if (errorMessage) {
    return (
      <div className={styles.page}>
        <div className={styles.errorContainer}>
          <p className={styles.error}>{errorMessage}</p>
          <button className={styles.backBtn} onClick={handleReturnToFlowchart}>
            <ArrowLeftIcon size={14} /> Return to Flowchart
          </button>
        </div>
      </div>
    );
  }

  if (loading || !pdfDoc) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingContainer}>
          <p className={styles.loading}>Loading PDF...</p>
        </div>
      </div>
    );
  }

  const activeHl = activeHighlight
    ? annotations.highlights.find(h => h.id === activeHighlight.highlightId)
    : null;

  return (
    <div className={styles.page}>
      <PdfToolbar
        filename={filename}
        currentPage={currentPage}
        numPages={numPages}
        onPageJump={handleToolbarPageJump}
        zoom={effectiveZoom}
        fitWidth={fitWidth}
        showToc={showToc}
        hasOutline={outline.length > 0}
        twoPageView={twoPageView}
        onZoomChange={handleZoomChange}
        onFitWidthToggle={handleFitWidthToggle}
        onTwoPageViewToggle={handleTwoPageViewToggle}
        onTocToggle={handleTocToggle}
        showRightPanel={showRightPanel}
        onRightPanelToggle={handleRightPanelToggle}
        onReturnToFlowchart={handleReturnToFlowchart}
        onCreateNote={handleCreateNote}
        onOpenInNewTab={handleOpenInNewTab}
      />
      <div ref={bodyRef} className={styles.body}>
        {showToc && (
          <PdfSidebar outline={outline} onNavigate={handleTocNavigate} />
        )}
        <PdfDocumentView
          ref={docViewRef}
          pdfDoc={pdfDoc}
          numPages={numPages}
          scale={effectiveZoom}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          highlights={annotations.highlights}
          twoPageView={twoPageView}
          onTextSelected={handleTextSelected}
          onSelectionCleared={handleSelectionCleared}
          onHighlightClick={handleHighlightClick}
          onPageChange={handlePageChange}
        />
        {showRightPanel && (
          <PdfRightPanel
            highlights={annotations.highlights}
            comments={annotations.comments}
            notes={notes}
            subject={subject}
            onScrollToPage={handlePanelScrollToPage}
            onNavigateToNote={handleNavigateToNote}
            onEditNote={handleEditNote}
          />
        )}
        {editingNoteId && (
          <PdfNoteEditorPanel
            noteId={editingNoteId}
            notes={notes}
            saveNote={saveNote}
            onClose={handleCloseEditor}
            width={editorPanelWidth}
            onWidthChange={setEditorPanelWidth}
          />
        )}
      </div>

      {textSelection && (
        <PdfSelectionToolbar
          position={textSelection.anchorPosition}
          onHighlight={handleHighlight}
          onHighlightAndComment={handleHighlightAndComment}
        />
      )}

      {activeHl && activeHighlight && (
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
