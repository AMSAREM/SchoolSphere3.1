import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer as RechartsResponsiveContainer } from 'recharts';

export interface SafeResponsiveContainerProps {
  width?: string | number;
  height?: string | number;
  minWidth?: number;
  minHeight?: number;
  aspect?: number;
  className?: string;
  children: React.ReactElement;
}

/**
 * Drop-in replacement for Recharts ResponsiveContainer that measures its host DOM
 * container via ResizeObserver and only mounts Recharts with verified positive
 * numeric pixel dimensions (width > 0 && height > 0), completely preventing the
 * "width(0) and height(0) of chart should be greater than 0" error during initial
 * layout, hidden tab rendering, or AnimatePresence transitions.
 */
export function SafeResponsiveContainer({
  width = '100%',
  height = '100%',
  minWidth = 1,
  minHeight = 1,
  aspect,
  className = '',
  children,
}: SafeResponsiveContainerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>(() => {
    const initialW = typeof width === 'number' && width > 0 ? width : 0;
    const initialH = typeof height === 'number' && height > 0 ? height : 0;
    return { width: initialW, height: initialH };
  });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    let rafId: number | null = null;

    const updateSize = () => {
      if (!hostRef.current) return;
      const rect = hostRef.current.getBoundingClientRect();
      const measuredW =
        typeof width === 'number' && width > 0
          ? width
          : Math.floor(rect.width || hostRef.current.clientWidth || 0);
      let measuredH =
        typeof height === 'number' && height > 0
          ? height
          : Math.floor(rect.height || hostRef.current.clientHeight || 0);

      if (aspect && aspect > 0 && measuredW > 0) {
        measuredH = Math.floor(measuredW / aspect);
      }

      if (measuredW > 0 && measuredH > 0) {
        setDimensions((prev) =>
          prev.width === measuredW && prev.height === measuredH
            ? prev
            : { width: measuredW, height: measuredH }
        );
      }
    };

    updateSize();
    rafId = window.requestAnimationFrame(updateSize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          const w =
            typeof width === 'number' && width > 0 ? width : Math.floor(cr.width);
          let h =
            typeof height === 'number' && height > 0 ? height : Math.floor(cr.height);
          if (aspect && aspect > 0 && w > 0) {
            h = Math.floor(w / aspect);
          }
          if (w > 0 && h > 0) {
            setDimensions((prev) =>
              prev.width === w && prev.height === h ? prev : { width: w, height: h }
            );
          }
        }
      });
      observer.observe(el);
    }

    window.addEventListener('resize', updateSize);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (observer) {
        observer.disconnect();
      }
      window.removeEventListener('resize', updateSize);
    };
  }, [width, height, aspect]);

  const isReady = dimensions.width > 0 && dimensions.height > 0;

  return (
    <div
      ref={hostRef}
      className={`w-full h-full min-w-0 ${className}`.trim()}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        minWidth: `${Math.max(1, minWidth)}px`,
        minHeight: `${Math.max(1, minHeight)}px`,
      }}
    >
      {isReady ? (
        <RechartsResponsiveContainer
          width={dimensions.width}
          height={dimensions.height}
          minWidth={Math.max(1, minWidth)}
          minHeight={Math.max(1, minHeight)}
        >
          {children}
        </RechartsResponsiveContainer>
      ) : null}
    </div>
  );
}

export default SafeResponsiveContainer;
