import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Boxes,
  Layers,
  Link2,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Clock,
  ClipboardList,
  Sparkles,
  Zap,
  Scissors,
  Truck,
  ShieldCheck,
  Flame,
  Factory,
  ArrowRight,
  Gauge,
  Activity,
  ChevronLeft,
  CircleDot,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DashboardStats } from "@shared/api";
import { cn, formatPlatformTime } from "@/lib/utils";

interface NavItem {
  id: string;
  label: string;
  icon: any;
  iconColor?: string;
  badge?: number;
  badgeBg?: string;
  activeBg?: string;
  activeColor?: string;
  isRoute?: boolean;
  href?: string;
  tag?: string;
  children?: NavItem[];
}

interface AppSidebarProps {
  sidebarOpen: boolean;
  activeTab: string;
  setActiveTab?: (tab: string) => void;
  stats?: DashboardStats | null;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  sidebarOpen,
  activeTab,
  setActiveTab,
  stats,
}) => {
  const navigate = useNavigate();

  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({
    cutting: true,
  });

  // Automatically keep dropdown open if child tab (like pairing) is active
  useEffect(() => {
    if (activeTab === "cutting" || activeTab === "pairing") {
      setOpenDropdowns((prev) => ({ ...prev, cutting: true }));
    }
  }, [activeTab]);

  const toggleDropdown = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setOpenDropdowns((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const navGroups: { title: string; subtitle?: string; items: NavItem[] }[] = [
    {
      title: "CORE & DASHBOARD",
      items: [
        {
          id: "overview",
          label: "Executive Dashboard",
          icon: LayoutDashboard,
          iconColor: "text-indigo-600",
          activeBg: "bg-indigo-50/80 text-indigo-700 border-indigo-200/80",
          activeColor: "text-indigo-700",
        },
        {
          id: "production-overview",
          label: "Production Overview",
          icon: Factory,
          iconColor: "text-violet-600",
          activeBg: "bg-violet-50/80 text-violet-700 border-violet-200/80",
          activeColor: "text-violet-700",
        },
        {
          id: "pis",
          label: "Stickers & Batches",
          icon: FileText,
          iconColor: "text-purple-600",
          badge: stats?.totalPI,
          badgeBg: "bg-purple-100/90 text-purple-700 border border-purple-200",
          activeBg: "bg-purple-50/80 text-purple-700 border-purple-200/80",
          activeColor: "text-purple-700",
        },
      ],
    },
    {
      title: "FACTORY WORKSTATIONS",
      items: [
        {
          id: "cutting",
          label: "Cutting Workstation",
          icon: Scissors,
          iconColor: "text-blue-600",
          badge: stats?.pendingCutting ?? 0,
          badgeBg: "bg-blue-100/90 text-blue-700 border border-blue-200",
          activeBg: "bg-blue-50/80 text-blue-700 border-blue-200/80",
          activeColor: "text-blue-700",
          children: [
            {
              id: "pairing",
              label: "Glass Pairing & Buffer",
              icon: Link2,
              iconColor: "text-cyan-600",
              badge: stats?.pendingPairing ?? 0,
              badgeBg: "bg-cyan-100/90 text-cyan-700 border border-cyan-200",
              activeBg: "bg-cyan-50/90 text-cyan-800 border-cyan-300/80 font-bold",
              activeColor: "text-cyan-700",
            },
          ],
        },
        {
          id: "dgu",
          label: "DGU / IGU Assembly",
          icon: Boxes,
          iconColor: "text-teal-600",
          badge: stats?.pendingDGU ?? 0,
          badgeBg: "bg-teal-100/90 text-teal-700 border border-teal-200",
          activeBg: "bg-teal-50/80 text-teal-700 border-teal-200/80",
          activeColor: "text-teal-700",
        },
        {
          id: "lamination",
          label: "Lamination Line",
          icon: Layers,
          iconColor: "text-amber-600",
          badge: stats?.pendingLamination ?? 0,
          badgeBg: "bg-amber-100/90 text-amber-700 border border-amber-200",
          activeBg: "bg-amber-50/80 text-amber-700 border-amber-200/80",
          activeColor: "text-amber-700",
        },
        {
          id: "finished",
          label: "Dispatch & Shipping",
          icon: Truck,
          iconColor: "text-emerald-600",
          badge: stats?.finishedItems ?? 0,
          badgeBg: "bg-emerald-100/90 text-emerald-700 border border-emerald-200",
          activeBg: "bg-emerald-50/80 text-emerald-700 border-emerald-200/80",
          activeColor: "text-emerald-700",
        },
      ],
    },
    {
      title: "INTELLIGENCE & AUDIT",
      items: [
        {
          id: "reports",
          label: "Live Audit & Reports",
          icon: ClipboardList,
          iconColor: "text-slate-600",
          activeBg: "bg-slate-100/90 text-slate-900 border-slate-300/80",
          activeColor: "text-slate-900",
        },
        {
          id: "analytics",
          label: "Performance Analytics",
          icon: BarChart3,
          iconColor: "text-indigo-600",
          activeBg: "bg-indigo-50/80 text-indigo-700 border-indigo-200/80",
          activeColor: "text-indigo-700",
        },
      ],
    },
  ];

  const handleItemClick = (item: NavItem | string) => {
    if (typeof item === "string") {
      if (setActiveTab) {
        setActiveTab(item);
      } else {
        navigate(`/?tab=${item}`);
      }
      return;
    }

    if (item.children && item.children.length > 0) {
      setOpenDropdowns((prev) => ({ ...prev, [item.id]: true }));
    }
    if (item.isRoute && item.href) {
      navigate(item.href);
    } else if (setActiveTab) {
      setActiveTab(item.id);
    } else {
      navigate(`/?tab=${item.id}`);
    }
  };

  const renderCollapsedItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    const hasBadge = item.badge !== undefined && item.badge !== null;

    return (
      <TooltipProvider key={item.id} delayDuration={50}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => handleItemClick(item)}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center relative transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-indigo-400 shrink-0 cursor-pointer",
                isActive
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
              aria-label={item.label}
            >
              <Icon
                className={cn(
                  "w-4.5 h-4.5 transition-transform group-hover:scale-110 shrink-0",
                  isActive ? "text-white" : item.iconColor
                )}
              />

              {/* Badge Indicator for Collapsed Mode */}
              {hasBadge && (
                <span
                  className={cn(
                    "absolute -top-1 -right-1 min-w-[17px] h-[17px] rounded-full text-[9px] font-black flex items-center justify-center px-1 border-2 border-white shadow-xs group-hover:scale-110 transition-transform",
                    isActive
                      ? "bg-slate-900 text-white"
                      : "bg-indigo-600 text-white"
                  )}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            sideOffset={8}
            className="text-xs font-bold bg-slate-900 text-white px-3 py-1.5 z-50 shadow-xl rounded-lg border border-slate-800"
          >
            <div className="flex items-center gap-2">
              <span>{item.label}</span>
              {hasBadge && (
                <span className="text-indigo-300 font-extrabold bg-indigo-950 px-1.5 py-0.5 rounded text-[10px]">
                  {item.badge}
                </span>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const renderExpandedItem = (item: NavItem, isChild = false) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    const hasBadge = item.badge !== undefined && item.badge !== null;
    const hasChildren = item.children && item.children.length > 0;
    const isDropdownOpen = !!openDropdowns[item.id];

    return (
      <div key={item.id} className="w-full">
        <div
          onClick={() => handleItemClick(item)}
          className={cn(
            "w-full flex items-center justify-between px-3 rounded-xl relative transition-all duration-200 group text-left cursor-pointer select-none",
            isChild ? "py-2 text-[11.5px]" : "py-2.5 text-xs",
            isActive
              ? item.activeBg || "bg-indigo-50/90 text-indigo-700 font-bold border border-indigo-200/80 shadow-2xs"
              : isChild
              ? "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 font-medium hover:translate-x-0.5"
              : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 font-medium hover:translate-x-0.5"
          )}
        >
          {/* Active Accent Left Glowing Indicator */}
          {isActive && (
            <span
              className={cn(
                "absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full shadow-sm",
                isChild ? "bg-cyan-600" : "bg-indigo-600"
              )}
            />
          )}

          <span className="flex items-center gap-2.5 min-w-0">
            <span
              className={cn(
                "p-1.5 rounded-lg transition-all duration-200 shrink-0",
                isActive
                  ? "bg-white shadow-2xs"
                  : "bg-slate-50 group-hover:bg-white group-hover:shadow-2xs"
              )}
            >
              <Icon
                className={cn(
                  "shrink-0 group-hover:scale-110 transition-transform duration-200",
                  isChild ? "w-3.5 h-3.5" : "w-4 h-4",
                  isActive
                    ? item.activeColor || "text-indigo-600"
                    : item.iconColor || "text-slate-500"
                )}
              />
            </span>

            <span
              className={cn(
                "whitespace-nowrap tracking-tight",
                isActive ? "font-bold text-slate-900" : "font-semibold text-slate-700 group-hover:text-slate-900",
                isChild ? "text-[11.5px]" : "text-[12.5px]"
              )}
            >
              {item.label}
            </span>
          </span>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto pl-1">
            {hasBadge && (
              <span
                className={cn(
                  "min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 whitespace-nowrap group-hover:scale-105 transition-transform duration-200 shadow-2xs",
                  item.badgeBg || "bg-slate-100 text-slate-700"
                )}
              >
                {item.badge}
              </span>
            )}

            {/* Dropdown Chevron Toggle Button */}
            {hasChildren && (
              <button
                type="button"
                onClick={(e) => toggleDropdown(item.id, e)}
                className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors focus:outline-none"
                title={isDropdownOpen ? "Collapse sub-modules" : "Expand sub-modules"}
              >
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 transition-transform duration-200",
                    isDropdownOpen ? "rotate-180 text-indigo-600" : ""
                  )}
                />
              </button>
            )}
          </div>
        </div>

        {/* Dropdown Sub-modules connected branch list */}
        {hasChildren && isDropdownOpen && (
          <div className="ml-5 pl-2.5 border-l-2 border-slate-200 my-1 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
            {item.children!.map((child) => renderExpandedItem(child, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={cn(
        "shrink-0 bg-white border-r border-slate-200/90 overflow-y-auto flex flex-col justify-between transition-all duration-300 ease-in-out select-none shadow-2xs z-20",
        sidebarOpen ? "w-64 p-3.5 space-y-4" : "w-16 py-4 px-2 items-center space-y-4"
      )}
    >
      <div className={cn("w-full", sidebarOpen ? "space-y-4" : "space-y-4 flex flex-col items-center")}>
        {navGroups.map((group, idx) => (
          <div key={group.title} className="w-full">
            {sidebarOpen ? (
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 px-2.5 flex items-center justify-between">
                <span>{group.title}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
              </div>
            ) : (
              idx > 0 && <div className="w-8 h-[1px] bg-slate-200/80 my-2 mx-auto" />
            )}

            <nav className={cn("space-y-1", !sidebarOpen && "flex flex-col items-center space-y-2")}>
              {group.items.map((item) => {
                if (!sidebarOpen) {
                  return (
                    <React.Fragment key={item.id}>
                      {renderCollapsedItem(item)}
                      {item.children?.map((child) => renderCollapsedItem(child))}
                    </React.Fragment>
                  );
                }

                return renderExpandedItem(item);
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* ── BOTTOM ENTERPRISE PRODUCTION STATUS WIDGET ── */}
      {sidebarOpen && (
        <div className="space-y-2 shrink-0 pt-2 border-t border-slate-100">
          {/* Glass Manufacturing Hero Widget */}
          <div className="relative rounded-2xl overflow-hidden border border-slate-200/90 shadow-2xs h-24 group select-none">
            <img
              src="/glass-building-hero.jpg"
              alt="Precision Architectural Glass"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/60 to-transparent" />

            <div className="absolute inset-0 p-3 flex flex-col justify-end">
              <div className="flex items-end justify-between">
                <div>
                  <span className="block text-[8px] uppercase tracking-wider text-indigo-300 font-extrabold flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-indigo-300" />
                    SEJAL GLASS SYSTEM
                  </span>
                  <span className="block text-[11px] font-black text-white leading-tight mt-0.5">
                    Architectural Glass<br />Manufacturing
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleItemClick("production-overview")}
                  className="w-6.5 h-6.5 rounded-full bg-white/95 hover:bg-white text-slate-900 flex items-center justify-center shadow-xs transition-transform group-hover:translate-x-0.5 cursor-pointer"
                  title="Explore Production Overview"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-indigo-700" />
                </button>
              </div>
            </div>
          </div>

          {/* Live System Clock & Status Pill */}
          <div className="bg-slate-50 p-2 rounded-xl border border-slate-200/80 flex items-center justify-between text-[10px] text-slate-600">
            <div className="flex items-center gap-1.5 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Plant Online (GST)</span>
            </div>
            <div className="font-mono font-bold text-slate-800">
              {formatPlatformTime(currentTime)}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
