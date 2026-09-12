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
      icon: LayoutDashboard,
      color: "text-purple-600",
      activeBg: "bg-purple-600 text-white shadow-xs ring-1 ring-purple-400",
      badge: null,
    },
    {
      id: "pis",
      label: "Sticker & Batch Status",
      icon: FileText,
      color: "text-blue-600",
      activeBg: "bg-blue-600 text-white shadow-xs ring-1 ring-blue-400",
      badge: null,
    },
    {
      id: "production-overview",
      label: "Production Overview",
      icon: Layers,
      color: "text-indigo-600",
      activeBg: "bg-indigo-600 text-white shadow-xs ring-1 ring-indigo-400",
      badge: null,
    },
    {
      id: "cutting",
      label: "Cutting Workstation",
      icon: Box,
      color: "text-purple-500",
      activeBg: "bg-purple-600 text-white shadow-xs ring-1 ring-purple-400",
      badge: stats?.pendingCutting ?? 0,
      badgeBg: "bg-purple-100 text-purple-700 font-bold",
    },
    {
      id: "pairing",
      label: "Glass Pairing & Buffer",
      icon: Link2,
      color: "text-indigo-500",
      activeBg: "bg-indigo-600 text-white shadow-xs ring-1 ring-indigo-400",
      badge: stats?.pendingPairing ?? 0,
      badgeBg: "bg-indigo-100 text-indigo-700 font-bold",
    },
    {
      id: "dgu",
      label: "DGU / IGU Workstation",
      icon: ClipboardList,
      color: "text-teal-500",
      activeBg: "bg-teal-600 text-white shadow-xs ring-1 ring-teal-400",
      badge: stats?.pendingDGU ?? 0,
      badgeBg: "bg-teal-100 text-teal-700 font-bold",
    },
    {
      id: "lamination",
      label: "Lamination Workstation",
      icon: Layers,
      color: "text-amber-500",
      activeBg: "bg-amber-600 text-white shadow-xs ring-1 ring-amber-400",
      badge: stats?.pendingLamination ?? 0,
      badgeBg: "bg-amber-100 text-amber-700 font-bold",
    },
    {
      id: "finished",
      label: "Dispatch",
      icon: CheckCircle,
      color: "text-emerald-500",
      activeBg: "bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-400",
      badge: stats?.finishedItems ?? 0,
      badgeBg: "bg-emerald-100 text-emerald-700 font-bold",
    },
    {
      id: "reports",
      label: "Reports & Audit Log",
      icon: ClipboardList,
      color: "text-slate-600",
      activeBg: "bg-slate-800 text-white shadow-xs ring-1 ring-slate-600",
      badge: null,
    },
    {
      id: "analytics",
      label: "Performance Analytics",
      icon: BarChart3,
      color: "text-purple-600",
      activeBg: "bg-purple-600 text-white shadow-xs ring-1 ring-purple-400",
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
        <div className="hidden sm:flex items-center gap-2 bg-purple-50/80 px-2.5 py-1 rounded-lg border border-purple-200 shrink-0">
          {React.createElement(activeModule.icon, {
            className: cn("w-4 h-4", activeModule.color),
          })}
          <span className="text-xs font-bold text-purple-900 tracking-tight">
            {activeModule.label}
          </span>
        </div>
      )}

      {/* Module Icons Navigation Bar */}
      <div
        className={cn(
          "flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200 shadow-inner overflow-x-auto transition-all duration-300",
          sidebarOpen
            ? "hidden md:flex opacity-80 scale-95"
            : "flex animate-in fade-in zoom-in-95"
        )}
      >
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1.5 shrink-0 hidden lg:block">
          Modules:
        </div>
        {modules.map((mod) => {
          const Icon = mod.icon;
          const isActive = currentTab === mod.id;
          const hasBadge = mod.badge !== null && mod.badge !== undefined;

          return (
            <TooltipProvider key={mod.id} delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleModuleClick(mod)}
                    className={cn(
                      "relative px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 group focus:outline-none focus:ring-1 focus:ring-purple-400",
                      isActive
                        ? mod.activeBg
                        : "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-2xs border border-transparent"
                    )}
                    aria-label={mod.label}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4 transition-transform group-hover:scale-110 shrink-0",
                        isActive ? "text-white" : mod.color
                      )}
                    />

                    {/* Show label text on active module */}
                    {isActive && (
                      <span className="text-xs font-bold whitespace-nowrap">
                        {mod.label}
                      </span>
                    )}

                    {/* Badge Count or Tag */}
                    {hasBadge && (
                      <span
                        className={cn(
                          "text-[9px] font-extrabold rounded-full px-1.5 py-0.2 min-w-[16px] text-center leading-none shrink-0",
                          isActive
                            ? "bg-white text-slate-900 shadow-2xs"
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
                  className="text-xs font-semibold bg-slate-900 text-white px-2.5 py-1 z-50 shadow-md"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold">{mod.label}</span>
                    {hasBadge && typeof mod.badge === "number" && (
                      <span className="text-[10px] text-slate-300">
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
