import { useEffect, useRef, useState } from 'react';
import type { DjvuDocument } from '../../services/documentLoader';
import type { CropBox } from '../../types/crop';
import styles from './DjvuPageView.module.css';

// Mobile momentum scrolls last 500–1500 ms; 50 ms rarely coalesces mid-flick.
const IS_TOUCH = typeof window !== 'undefined'
  && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
const RENDER_DEBOUNCE_MS = IS_TOUCH ? 180 : 50;

interface Props {
  djvuDoc: DjvuDocument;
  pageNumber: number;
  scale: number;
  expectedWidth: number;
  expectedHeight: number;
  crop?: CropBox;
  priority?: boolean;
}

export function DjvuPageView({
  djvuDoc,
  pageNumber,
  scale,
  expectedWidth,
  expectedHeight,
  crop,
  priority,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const priorityRef = useRef(priority);
  priorityRef.current = priority;
  const [, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const renderPage = () => {
      const page = djvuDoc.pages[pageNumber - 1];
      if (!page) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      // Release old backing buffer
      canvas.width = 0;
      canvas.height = 0;

      try {
        const imageData = page.getImageData();
        if (cancelled) return;

        const nativeW = imageData.width;
        const nativeH = imageData.height;
        const dpi = page.getDpi() || 300;

        // Display dimensions: normalized to 72 DPI, then scaled
        const displayW = Math.floor(nativeW * (72 / dpi) * scale);
        const displayH = Math.floor(nativeH * (72 / dpi) * scale);

        // Draw native-res ImageData to canvas, then CSS-scale for display
        canvas.width = nativeW;
        canvas.height = nativeH;
        canvas.style.width = `${displayW}px`;
        canvas.style.height = `${displayH}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.putImageData(imageData, 0, 0);
        setRendered(true);
      } catch (err) {
        console.error(`Failed to render DjVu page ${pageNumber}:`, err);
      }
    };

    const delay = priorityRef.current ? 0 : RENDER_DEBOUNCE_MS;
    const timeoutId = setTimeout(() => {
      if (!cancelled) renderPage();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [djvuDoc, pageNumber, scale]);

  const cropT = crop?.top ?? 0;
  const cropR = crop?.right ?? 0;
  const cropB = crop?.bottom ?? 0;
  const cropL = crop?.left ?? 0;
  const isCropped = cropT > 0 || cropR > 0 || cropB > 0 || cropL > 0;

  const fullW = Math.floor(expectedWidth * scale);
  const fullH = Math.floor(expectedHeight * scale);
  const croppedW = isCropped ? Math.floor(expectedWidth * (1 - cropL - cropR) * scale) : fullW;
  const croppedH = isCropped ? Math.floor(expectedHeight * (1 - cropT - cropB) * scale) : fullH;

  return (
    <div
      className={styles.page}
      style={{ width: croppedW, height: croppedH }}
    >
      <div
        style={{
          position: 'relative',
          width: fullW,
          height: fullH,
          ...(isCropped ? {
            marginLeft: -Math.floor(cropL * expectedWidth * scale),
            marginTop: -Math.floor(cropT * expectedHeight * scale),
          } : undefined),
        }}
      >
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
    </div>
  );
}
