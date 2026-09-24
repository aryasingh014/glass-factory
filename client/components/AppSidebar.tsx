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
  PackageCheck,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DashboardStats } from "@shared/api";
import { cn } from "@/lib/utils";

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

  const navGroups: { title: string; subtitle?: string; items: NavItem[] }[] = [
    {
      title: "CORE & DASHBOARD",
      items: [
        {
          id: "overview",
          label: "Executive Dashboard",
          icon: LayoutDashboard,
          iconColor: "text-blue-400",
          activeBg: "bg-gradient-to-r from-blue-900/50 via-blue-900/30 to-transparent text-white border border-blue-500/40 font-bold",
          activeColor: "text-blue-300",
        },
        {
          id: "production-overview",
          label: "Production Overview",
          icon: Factory,
          iconColor: "text-indigo-400",
          activeBg: "bg-gradient-to-r from-indigo-900/50 via-indigo-900/30 to-transparent text-white border border-indigo-500/40 font-bold",
          activeColor: "text-indigo-300",
        },
        {
          id: "dispatched-history",
          label: "Dispatched History",
          icon: PackageCheck,
          iconColor: "text-teal-400",
          badge: stats?.dispatchedItems ?? 0,
          badgeBg: "bg-teal-950/80 text-teal-300 border border-teal-800/70",
          activeBg: "bg-gradient-to-r from-teal-900/50 via-teal-900/30 to-transparent text-white border border-teal-500/40 font-bold",
          activeColor: "text-teal-300",
        },
        {
          id: "pis",
          label: "Stickers & Batches",
          icon: FileText,
          iconColor: "text-sky-400",
          badge: stats?.totalPI,
          badgeBg: "bg-sky-950/80 text-sky-300 border border-sky-800/70",
          activeBg: "bg-gradient-to-r from-sky-900/50 via-sky-900/30 to-transparent text-white border border-sky-500/40 font-bold",
          activeColor: "text-sky-300",
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
          iconColor: "text-indigo-400",
          badge: stats?.pendingCutting ?? 0,
          badgeBg: "bg-indigo-950/80 text-indigo-300 border border-indigo-800/70",
          activeBg: "bg-gradient-to-r from-indigo-900/50 via-indigo-900/30 to-transparent text-white border border-indigo-500/40 font-bold",
          activeColor: "text-indigo-300",
          children: [
            {
              id: "pairing",
              label: "Glass Pairing",
              icon: Link2,
              iconColor: "text-sky-400",
              badge: stats?.pendingPairing ?? 0,
              badgeBg: "bg-sky-950/80 text-sky-300 border border-sky-800/70",
              activeBg: "bg-gradient-to-r from-sky-900/50 via-sky-900/30 to-transparent text-white border border-sky-500/40 font-bold",
              activeColor: "text-sky-300",
            },
          ],
        },
        {
          id: "dgu",
          label: "DLGU / IGU Assembly",
          icon: Boxes,
          iconColor: "text-teal-400",
          badge: stats?.pendingDGU ?? 0,
          badgeBg: "bg-teal-950/80 text-teal-300 border border-teal-800/70",
          activeBg: "bg-gradient-to-r from-teal-900/50 via-teal-900/30 to-transparent text-white border border-teal-500/40 font-bold",
          activeColor: "text-teal-300",
        },
        {
          id: "lamination",
          label: "Lamination Line",
          icon: Layers,
          iconColor: "text-amber-400",
          badge: stats?.pendingLamination ?? 0,
          badgeBg: "bg-amber-950/80 text-amber-300 border border-amber-800/70",
          activeBg: "bg-gradient-to-r from-amber-900/50 via-amber-900/30 to-transparent text-white border border-amber-500/40 font-bold",
          activeColor: "text-amber-300",
        },
        {
          id: "finished",
          label: "Dispatch & Shipping",
          icon: Truck,
          iconColor: "text-emerald-400",
          badge: stats?.finishedItems ?? 0,
          badgeBg: "bg-emerald-950/80 text-emerald-300 border border-emerald-800/70",
          activeBg: "bg-gradient-to-r from-emerald-900/50 via-emerald-900/30 to-transparent text-white border border-emerald-500/40 font-bold",
          activeColor: "text-emerald-300",
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
          iconColor: "text-slate-400",
          activeBg: "bg-gradient-to-r from-slate-800/80 via-slate-800/50 to-transparent text-white border border-slate-600/60 font-bold",
          activeColor: "text-slate-200",
        },
        {
          id: "analytics",
          label: "Performance Analytics",
          icon: BarChart3,
          iconColor: "text-blue-400",
          activeBg: "bg-gradient-to-r from-blue-900/50 via-blue-900/30 to-transparent text-white border border-blue-500/40 font-bold",
          activeColor: "text-blue-300",
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
                "w-10 h-10 rounded-xl flex items-center justify-center relative transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-blue-500/40 shrink-0 cursor-pointer",
                isActive
                  ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/40"
                  : "text-slate-400 hover:bg-slate-800/80 hover:text-white border border-transparent"
              )}
              aria-label={item.label}
            >
              <Icon
                className={cn(
                  "w-4.5 h-4.5 transition-transform group-hover:scale-110 shrink-0",
                  isActive ? "text-white" : item.iconColor || "text-slate-400"
                )}
              />

              {/* Badge Indicator for Collapsed Mode */}
              {hasBadge && (
                <span
                  className={cn(
                    "absolute -top-1 -right-1 min-w-[17px] h-[17px] rounded-full text-[9px] font-black flex items-center justify-center px-1 border-2 border-[#0a1120] shadow-xs group-hover:scale-110 transition-transform",
                    isActive
                      ? "bg-amber-400 text-slate-950 font-bold"
                      : "bg-blue-600 text-white font-bold"
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
            className="text-xs font-bold bg-[#0f172a] text-white px-3 py-1.5 z-50 shadow-2xl rounded-lg border border-slate-700/80"
          >
            <div className="flex items-center gap-2">
              <span>{item.label}</span>
              {hasBadge && (
                <span className="text-blue-300 font-extrabold bg-blue-950/90 border border-blue-800/60 px-1.5 py-0.5 rounded text-[10px]">
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
              ? item.activeBg || "bg-gradient-to-r from-blue-900/50 via-blue-900/30 to-transparent text-white font-bold border border-blue-500/40 shadow-sm shadow-blue-500/10"
              : isChild
              ? "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 font-medium hover:translate-x-0.5"
              : "text-slate-300 hover:bg-slate-800/60 hover:text-white font-medium hover:translate-x-0.5"
          )}
        >
          {/* Active Accent Left Glowing Indicator */}
          {isActive && (
            <span
              className={cn(
                "absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full shadow-[0_0_8px_rgba(96,165,250,0.8)]",
                isChild ? "bg-cyan-400" : "bg-blue-400"
              )}
            />
          )}

          <span className="flex items-center gap-2.5 min-w-0 flex-1 mr-1">
            <span
              className={cn(
                "p-1.5 rounded-lg transition-all duration-200 shrink-0 border",
                isActive
                  ? "bg-blue-500/20 border-blue-400/40 shadow-inner"
                  : "bg-slate-800/60 border-slate-700/40 group-hover:bg-slate-700/70 group-hover:border-slate-600/60"
              )}
            >
              <Icon
                className={cn(
                  "shrink-0 group-hover:scale-110 transition-transform duration-200",
                  isChild ? "w-3.5 h-3.5" : "w-4 h-4",
                  isActive
                    ? item.activeColor || "text-blue-300"
                    : item.iconColor || "text-slate-400 group-hover:text-blue-300"
                )}
              />
            </span>

            <span
              className={cn(
                "truncate tracking-tight",
                isActive ? "font-bold text-white" : "font-medium text-slate-300 group-hover:text-white",
                isChild ? "text-[11.5px]" : "text-[12.5px]"
              )}
              title={item.label}
            >
              {item.label}
            </span>
          </span>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {hasBadge && (
              <span
                className={cn(
                  "min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 whitespace-nowrap group-hover:scale-105 transition-transform duration-200 shadow-2xs",
                  item.badgeBg || "bg-slate-800 text-slate-300 border border-slate-700/70"
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
                className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-slate-700/80 text-slate-400 hover:text-white transition-colors focus:outline-none"
                title={isDropdownOpen ? "Collapse sub-modules" : "Expand sub-modules"}
              >
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 transition-transform duration-200",
                    isDropdownOpen ? "rotate-180 text-blue-400" : ""
                  )}
                />
              </button>
            )}
          </div>
        </div>

        {/* Dropdown Sub-modules connected branch list */}
        {hasChildren && isDropdownOpen && (
          <div className="ml-5 pl-2.5 border-l border-slate-800 my-1 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
            {item.children!.map((child) => renderExpandedItem(child, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={cn(
        "shrink-0 bg-[#0a1120] border-r border-slate-800/80 overflow-y-auto flex flex-col justify-between transition-all duration-300 ease-in-out select-none shadow-2xl z-20",
        sidebarOpen ? "w-[270px] p-3.5 space-y-4" : "w-16 py-4 px-2 items-center space-y-4"
      )}
    >
      <div className={cn("w-full", sidebarOpen ? "space-y-4" : "space-y-4 flex flex-col items-center")}>
        {navGroups.map((group, idx) => (
          <div key={group.title} className="w-full">
            {sidebarOpen ? (
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400/80 mb-1.5 px-2.5 flex items-center justify-between">
                <span>{group.title}</span>
                <span className="w-1 h-1 rounded-full bg-slate-700" />
              </div>
            ) : (
              idx > 0 && <div className="w-8 h-[1px] bg-slate-800 my-2 mx-auto" />
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
    </aside>
  );
};
