import React, { useRef, useState, useEffect, useCallback } from "react";

interface TableHorizontalScrollWrapperProps {
  children: React.ReactNode;
  className?: string;
  showButtons?: boolean;
}

export const TableHorizontalScrollWrapper: React.FC<TableHorizontalScrollWrapperProps> = ({
  children,
  className = "",
}) => {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState<number>(0);
  const [clientWidth, setClientWidth] = useState<number>(0);
  const [topSpacerWidth, setTopSpacerWidth] = useState<number>(0);
  const isSyncingTop = useRef<boolean>(false);
  const isSyncingBottom = useRef<boolean>(false);

  const updateMetrics = useCallback(() => {
    if (!bottomScrollRef.current) return;
    const { scrollWidth: sw, clientWidth: cw, scrollLeft: sl } = bottomScrollRef.current;
    setScrollWidth(sw);
    setClientWidth(cw);

    const topCw = topScrollRef.current ? topScrollRef.current.clientWidth : Math.round(cw / 2);
    const maxScroll = Math.max(0, sw - cw);
    setTopSpacerWidth(topCw + maxScroll);

    // Keep top scroll in sync
    if (topScrollRef.current && Math.abs(topScrollRef.current.scrollLeft - sl) > 2) {
      topScrollRef.current.scrollLeft = sl;
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
    if (topScrollRef.current) {
      ro.observe(topScrollRef.current);
    }

    window.addEventListener("resize", updateMetrics);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, [updateMetrics]);

  // Sync scroll from Top to Bottom
  const handleTopScroll = () => {
    if (isSyncingTop.current) {
      isSyncingTop.current = false;
      return;
    }
    if (topScrollRef.current && bottomScrollRef.current) {
      isSyncingBottom.current = true;
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  // Sync scroll from Bottom to Top
  const handleBottomScroll = () => {
    if (isSyncingBottom.current) {
      isSyncingBottom.current = false;
      return;
    }
    if (topScrollRef.current && bottomScrollRef.current) {
      isSyncingTop.current = true;
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  };

  const hasOverflow = scrollWidth > clientWidth + 5;

  return (
    <div className={`relative w-full flex flex-col ${className}`}>
      {/* Top Synchronized Scrollbar (half-width 50%, aligned to the right directly above column headers) */}
      {hasOverflow && (
        <div className="w-full flex justify-end items-center bg-slate-50/80 border-b border-slate-200/90 px-3 py-1 shrink-0">
          <div className="flex items-center gap-2 w-1/2 max-w-xl">
            <span className="text-[10px] font-bold text-slate-400 select-none whitespace-nowrap">↔ Scroll</span>
            <div
              ref={topScrollRef}
              onScroll={handleTopScroll}
              className="horizontal-scrollbar-sync overflow-x-auto overflow-y-hidden h-2 w-full rounded-full bg-slate-200/70"
            >
              <div style={{ width: `${topSpacerWidth}px`, height: "1px" }} />
            </div>
          </div>
        </div>
      )}

      {/* Main Table Body Container */}
      <div
        ref={bottomScrollRef}
        onScroll={handleBottomScroll}
        className="table-scrollbar-bottom overflow-x-auto w-full"
      >
        {children}
      </div>
    </div>
  );
};
