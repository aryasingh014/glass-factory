import React from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Grid,
  Layers,
  Box,
  Flame,
  ClipboardList,
  CheckCircle,
  BarChart3,
  Link2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DashboardStats } from "@shared/api";
import { cn } from "@/lib/utils";

interface NavbarModuleBarProps {
  currentTab: string;
  onSelectTab?: (tab: string) => void;
  stats?: DashboardStats | null;
  sidebarOpen: boolean;
}

export const NavbarModuleBar: React.FC<NavbarModuleBarProps> = ({
  currentTab,
  onSelectTab,
  stats,
  sidebarOpen,
}) => {
  const navigate = useNavigate();

  const modules = [
    {
      id: "overview",
      label: "Dashboard",
      activeBg: "bg-slate-900 text-white shadow-xs ring-1 ring-slate-800",
      indicatorBg: "bg-slate-50 border-slate-200 text-slate-900",
      badge: null,
    },
    {
      id: "pis",
      label: "PI & Batches",
      activeBg: "bg-blue-700 text-white shadow-xs ring-1 ring-blue-600",
      indicatorBg: "bg-blue-50/90 border-blue-200 text-blue-900",
      badge: null,
    },
    {
      id: "production-overview",
      label: "Production Overview",
      activeBg: "bg-indigo-700 text-white shadow-xs ring-1 ring-indigo-600",
      indicatorBg: "bg-indigo-50/90 border-indigo-200 text-indigo-950",
      badge: null,
    },
    {
      id: "cutting",
      label: "Cutting",
      activeBg: "bg-indigo-700 text-white shadow-xs ring-1 ring-indigo-600",
      indicatorBg: "bg-indigo-50/90 border-indigo-200 text-indigo-900",
      badge: stats?.pendingCutting ?? 0,
      badgeBg: "bg-indigo-100 text-indigo-800 font-bold",
    },
    {
      id: "pairing",
      label: "Pairing Buffer",
      activeBg: "bg-amber-700 text-white shadow-xs ring-1 ring-amber-600",
      indicatorBg: "bg-amber-50/90 border-amber-200 text-amber-900",
      badge: stats?.pendingPairing ?? 0,
      badgeBg: "bg-amber-100 text-amber-900 font-bold",
    },
    {
      id: "lamination",
      label: "Lamination",
      activeBg: "bg-purple-700 text-white shadow-xs ring-1 ring-purple-600",
      indicatorBg: "bg-purple-50/90 border-purple-200 text-purple-900",
      badge: stats?.pendingLamination ?? 0,
      badgeBg: "bg-purple-100 text-purple-900 font-bold",
    },
    {
      id: "dgu",
      label: "DGU / IGU",
      activeBg: "bg-teal-700 text-white shadow-xs ring-1 ring-teal-600",
      indicatorBg: "bg-teal-50/90 border-teal-200 text-teal-900",
      badge: stats?.pendingDGU ?? 0,
      badgeBg: "bg-teal-100 text-teal-900 font-bold",
    },
    {
      id: "finished",
      label: "Dispatch",
      activeBg: "bg-emerald-700 text-white shadow-xs ring-1 ring-emerald-600",
      indicatorBg: "bg-emerald-50/90 border-emerald-200 text-emerald-900",
      badge: stats?.finishedItems ?? 0,
      badgeBg: "bg-emerald-100 text-emerald-900 font-bold",
    },
    {
      id: "reports",
      label: "Reports",
      activeBg: "bg-slate-800 text-white shadow-xs ring-1 ring-slate-700",
      indicatorBg: "bg-slate-100/90 border-slate-300 text-slate-900",
      badge: null,
    },
    {
      id: "analytics",
      label: "Analytics",
      activeBg: "bg-[#1a3a6b] text-white shadow-xs ring-1 ring-blue-900",
      indicatorBg: "bg-blue-50/90 border-blue-200 text-blue-950",
      badge: null,
    },
  ];

  const handleModuleClick = (mod: (typeof modules)[number]) => {
    if (onSelectTab) {
      onSelectTab(mod.id);
    } else {
      navigate(`/?tab=${mod.id}`);
    }
  };

  // Find active module for title label
  const activeModule = modules.find((m) => m.id === currentTab) || modules[0];

  return (
    <div className="flex items-center gap-2 max-w-full">
      {/* Active Module Indicator (Always visible on Navbar when sidebar is hidden) */}
      {!sidebarOpen && (
        <div className={cn("hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border shrink-0 shadow-xs", activeModule.indicatorBg)}>
          <span className="text-xs font-bold tracking-tight">
            {activeModule.label}
          </span>
        </div>
      )}

      {/* Module Navigation Bar (Clean Text & Badges) */}
      <div
        className={cn(
          "flex items-center gap-1 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 shadow-xs overflow-x-auto transition-all duration-300",
          sidebarOpen
            ? "hidden md:flex opacity-90 scale-95"
            : "flex animate-in fade-in zoom-in-95"
        )}
      >
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 shrink-0 hidden lg:block">
          Modules:
        </div>
        {modules.map((mod) => {
          const isActive = currentTab === mod.id;
          const hasBadge = mod.badge !== null && mod.badge !== undefined;

          return (
            <TooltipProvider key={mod.id} delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleModuleClick(mod)}
                    className={cn(
                      "relative px-3 py-1.5 rounded-xl transition-all duration-150 flex items-center gap-1.5 shrink-0 group focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-bold",
                      isActive
                        ? mod.activeBg
                        : "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-xs border border-transparent"
                    )}
                    aria-label={mod.label}
                  >
                    <span>{mod.label}</span>

                    {/* Badge Count or Tag */}
                    {hasBadge && (
                      <span
                        className={cn(
                          "text-[10px] font-extrabold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none shrink-0 shadow-2xs font-mono",
                          isActive
                            ? "bg-white text-slate-900"
                            : mod.badgeBg || "bg-slate-200 text-slate-700"
                        )}
                      >
                        {mod.badge}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg z-50 shadow-lg border border-slate-800"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{mod.label}</span>
                    {hasBadge && typeof mod.badge === "number" && (
                      <span className="text-[10px] text-slate-300 font-mono">
                        ({mod.badge} queued)
                      </span>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    </div>
  );
};
