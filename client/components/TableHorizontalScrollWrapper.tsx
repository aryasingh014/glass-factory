import React, { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TableHorizontalScrollWrapperProps {
  children: React.ReactNode;
  className?: string;
  showButtons?: boolean;
}

export const TableHorizontalScrollWrapper: React.FC<TableHorizontalScrollWrapperProps> = ({
  children,
  className = "",
  showButtons = true,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState<number>(0); // 0 to 1
  const [thumbWidthPct, setThumbWidthPct] = useState<number>(30); // in percent
  const [hasOverflow, setHasOverflow] = useState<boolean>(false);
  const isDragging = useRef<boolean>(false);
  const startDragX = useRef<number>(0);
  const startScrollLeft = useRef<number>(0);

  const updateMetrics = useCallback(() => {
    if (!bottomScrollRef.current) return;
    const { scrollWidth, clientWidth, scrollLeft } = bottomScrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    
    if (maxScroll > 5) {
      setHasOverflow(true);
      const ratio = Math.min(1, Math.max(0, scrollLeft / maxScroll));
      setScrollProgress(ratio);
      
      // Compute visible viewport ratio for thumb width
      const visibleRatio = clientWidth / scrollWidth;
      const computedThumbPct = Math.min(80, Math.max(15, visibleRatio * 100));
      setThumbWidthPct(computedThumbPct);
    } else {
      setHasOverflow(false);
      setScrollProgress(0);
    }
  }, []);

  useEffect(() => {
    updateMetrics();

    const ro = new ResizeObserver(() => {
      updateMetrics();
    });

    if (bottomScrollRef.current) {
      ro.observe(bottomScrollRef.current);
      if (bottomScrollRef.current.firstElementChild) {
        ro.observe(bottomScrollRef.current.firstElementChild);
      }
    }

    window.addEventListener("resize", updateMetrics);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, [updateMetrics]);

  const handleTableScroll = () => {
    if (!bottomScrollRef.current) return;
    const { scrollWidth, clientWidth, scrollLeft } = bottomScrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    if (maxScroll > 0) {
      const ratio = Math.min(1, Math.max(0, scrollLeft / maxScroll));
      setScrollProgress(ratio);
    }
  };

  const scrollToRatio = (targetRatio: number) => {
    if (!bottomScrollRef.current) return;
    const { scrollWidth, clientWidth } = bottomScrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    const clampedRatio = Math.min(1, Math.max(0, targetRatio));
    bottomScrollRef.current.scrollLeft = clampedRatio * maxScroll;
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current || !bottomScrollRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const trackWidth = rect.width;
    if (trackWidth <= 0) return;

    // Calculate ratio so that thumb centers on click, or if clicked at far ends goes to 0 or 1
    const targetRatio = clickX / trackWidth;
    scrollToRatio(targetRatio);

    // Prepare drag
    isDragging.current = true;
    startDragX.current = e.clientX;
    startScrollLeft.current = bottomScrollRef.current.scrollLeft;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !trackRef.current || !bottomScrollRef.current) return;
    const deltaX = e.clientX - startDragX.current;
    const rect = trackRef.current.getBoundingClientRect();
    const trackWidth = rect.width;
    if (trackWidth <= 0) return;

    const { scrollWidth, clientWidth } = bottomScrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    
    // Scale delta based on track length vs scrollable length
    const effectiveTravel = trackWidth * (1 - thumbWidthPct / 100);
    const scrollDelta = effectiveTravel > 0 ? (deltaX / effectiveTravel) * maxScroll : 0;
    
    bottomScrollRef.current.scrollLeft = Math.min(maxScroll, Math.max(0, startScrollLeft.current + scrollDelta));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  const nudgeLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bottomScrollRef.current) return;
    bottomScrollRef.current.scrollBy({ left: -250, behavior: "smooth" });
  };

  const nudgeRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bottomScrollRef.current) return;
    bottomScrollRef.current.scrollBy({ left: 250, behavior: "smooth" });
  };

  // Calculate thumb left offset in percent
  const maxThumbLeft = 100 - thumbWidthPct;
  const thumbLeftPct = scrollProgress * maxThumbLeft;

  return (
    <div className={`relative w-full flex flex-col ${className}`}>
      {/* Top Synchronized Scrollbar Bar */}
      {hasOverflow && (
        <div className="w-full flex justify-end items-center bg-slate-50/90 border-b border-slate-200/90 px-3 py-1.5 shrink-0 select-none">
          <div className="flex items-center gap-2 w-1/2 max-w-xl">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">↔ Scroll</span>
            
            {showButtons && (
              <button
                type="button"
                onClick={nudgeLeft}
                className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-purple-700 hover:bg-slate-200/80 transition-colors cursor-pointer shrink-0"
                title="Scroll Left"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}

            <div
              ref={trackRef}
              onPointerDown={handleTrackPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative h-2.5 w-full rounded-full bg-slate-200/80 hover:bg-slate-200 transition-colors cursor-pointer touch-none"
              title="Drag or click to scroll table horizontally"
            >
              <div
                className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 shadow-sm hover:from-purple-600 hover:to-indigo-700 transition-colors cursor-grab active:cursor-grabbing"
                style={{
                  width: `${thumbWidthPct}%`,
                  left: `${thumbLeftPct}%`,
                }}
              />
            </div>

            {showButtons && (
              <button
                type="button"
                onClick={nudgeRight}
                className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-purple-700 hover:bg-slate-200/80 transition-colors cursor-pointer shrink-0"
                title="Scroll Right"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Table Body Container */}
      <div
        ref={bottomScrollRef}
        onScroll={handleTableScroll}
        className="table-scrollbar-bottom overflow-x-auto w-full"
      >
        {children}
      </div>
    </div>
  );
};
