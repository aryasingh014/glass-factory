import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  FileEdit,
  Layers,
  PackageCheck,
  Gauge,
  Home,
  CheckCircle,
  History,
  Boxes,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DashboardStats } from "@shared/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface SubNavItem {
  id: string;
  label: string;
  icon: any;
  badge?: number;
  isRoute?: boolean;
  href?: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: any;
  badge?: number;
  isRoute?: boolean;
  href?: string;
  children?: SubNavItem[];
}

interface AppSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen?: (open: boolean) => void;
  activeTab: string;
  setActiveTab?: (tab: string) => void;
  stats?: DashboardStats | null;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  sidebarOpen,
  setSidebarOpen,
  activeTab,
  setActiveTab,
  stats,
}) => {
  const navigate = useNavigate();
  const { role, user, canAccessTab, isOnline } = useAuth();

  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({
    cutting: true,
  });

  const toggleDropdown = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setOpenDropdowns((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  React.useEffect(() => {
    if (activeTab === "cutting" || activeTab === "pairing") {
      setOpenDropdowns((prev) => ({ ...prev, cutting: true }));
    }
  }, [activeTab]);

  interface NavGroup {
    title: string;
    items: NavItem[];
  }

  const rawNavGroups: NavGroup[] = [
    {
      title: "",
      items: [
        { id: "overview", label: "Dashboard", icon: Home },
        { id: "production-overview", label: "Production Overview", icon: BarChart3 },
        { id: "dispatched-history", label: "Dispatched History", icon: History },
        { id: "pis", label: "Sticker & Batch", icon: Boxes },
      ],
    },
    {
      title: "FACTORY WORKSTATIONS",
      items: [
        {
          id: "cutting",
          label: "Cutting Workstation",
          icon: FileEdit,
          badge: stats?.pendingCutting ?? 0,
          children: [
            { id: "pairing", label: "Glass Pairing", icon: Layers, badge: stats?.pendingPairing ?? 0 },
          ],
        },
        { id: "polishing", label: "Polishing Workstation", icon: Sparkles, badge: stats?.pendingPolishing ?? 0 },
        { id: "dgu", label: "DGU/IGU Assembly", icon: PackageCheck, badge: stats?.pendingDGU ?? 0 },
        { id: "lamination", label: "Lamination Line", icon: Layers, badge: stats?.pendingLamination ?? 0 },
        { id: "finished", label: "Finished Warehouse", icon: CheckCircle, badge: stats?.finishedItems ?? 0 },
      ],
    },
    {
      title: "INTELLIGENCE & AUDIT",
      items: [
        { id: "reports", label: "Reports & Analytics", icon: BarChart3 },
        { id: "analytics", label: "Performance Analytics", icon: Gauge },
        { id: "settings", label: "System Settings", icon: FileEdit },
      ],
    },
  ];

  // Role-based filtered navigation groups
  const navGroups: NavGroup[] = rawNavGroups
    .map((group) => {
      const filteredItems: NavItem[] = group.items
        .filter((item) => {
          if (item.children && item.children.length > 0) {
            const allowedChildren = item.children.filter((sub) => canAccessTab(sub.id));
            return canAccessTab(item.id) || allowedChildren.length > 0;
          }
          return canAccessTab(item.id);
        })
        .map((item) => {
          if (item.children) {
            return {
              ...item,
              children: item.children.filter((sub) => canAccessTab(sub.id)),
            };
          }
          return item;
        });
      return {
        ...group,
        items: filteredItems,
      };
    })
    .filter((group) => group.items.length > 0);

  const handleItemClick = (item: NavItem | SubNavItem | string) => {
    if (typeof item === "string") {
      if (setActiveTab) setActiveTab(item);
      else navigate(`/?tab=${item}`);
    } else if (item.isRoute && item.href) {
      navigate(item.href);
    } else if (setActiveTab) {
      setActiveTab(item.id);
    } else {
      navigate(`/?tab=${item.id}`);
    }
    // Auto-close drawer on mobile after clicking
    if (typeof window !== "undefined" && window.innerWidth < 768 && setSidebarOpen) {
      setSidebarOpen(false);
    }
  };

  return (
    <aside
      className={cn(
        "shrink-0 overflow-hidden flex flex-col justify-between transition-all duration-300 ease-in-out select-none shadow-2xl z-20 relative bg-gradient-to-b from-[#0a1e3f] to-[#061836]",
        sidebarOpen ? "w-[260px]" : "w-16 items-center"
      )}
    >
      {/* ─── Sidebar Brand Header (STABLE) ─── */}
      <div className="shrink-0 pb-1 relative z-10">
        {sidebarOpen ? (
          <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
            <img
              src="/sejal-glass-logo.png"
              alt="Sejal Glass"
              className="h-9 w-auto object-contain"
            />
            <div className="min-w-0">
              <div className="text-[16px] font-black text-white tracking-wide leading-none">
                SEJAL GLASS
              </div>
              <div className="text-[6.5px] font-bold text-white uppercase tracking-[0.14em] leading-tight mt-1 opacity-90">
                Glass | Architectural | Solutions
              </div>
            </div>
          </div>
        ) : (
          <div className="pt-3.5 pb-2 flex justify-center">
            <img src="/sejal-glass-logo.png" alt="Logo" className="h-7 w-auto" />
          </div>
        )}
      </div>

      {/* ─── Navigation Groups (COMPACT) ─── */}
      <div className="flex-1 overflow-y-auto w-full pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative z-10">
        <div className="flex flex-col space-y-1 w-full">
          {navGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="w-full">
              {/* Divider / Title */}
              {group.title && sidebarOpen && (
                <div className="mt-2 mb-1 px-4">
                  <div className="h-[1px] w-full bg-white/10 mb-1.5" />
                  <div className="text-[8.5px] font-bold text-blue-200/60 uppercase tracking-widest leading-none">
                    {group.title}
                  </div>
                </div>
              )}
              {group.title && !sidebarOpen && (
                <div className="w-6 h-[1px] bg-white/10 my-1.5 mx-auto" />
              )}

              {/* Items */}
              <nav className={cn("w-full", !sidebarOpen && "flex flex-col items-center space-y-1")}>
                {group.items.map((item) => {
                  const hasChildren = item.children && item.children.length > 0;
                  const isParentActive = activeTab === item.id;
                  const isDropdownOpen = !!openDropdowns[item.id];

                  if (!sidebarOpen) {
                    return (
                      <TooltipProvider key={item.id} delayDuration={50}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleItemClick(item)}
                              className={cn(
                                "w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 relative",
                                isParentActive || (hasChildren && item.children!.some((c) => c.id === activeTab))
                                  ? "bg-[#1680f5] text-white shadow-[0_0_12px_rgba(22,128,245,0.5)]"
                                  : "text-white/80 hover:bg-white/10"
                              )}
                            >
                              <item.icon className="w-4 h-4" />
                              {item.badge !== undefined && item.badge > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-400/25 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold flex items-center justify-center shadow-xs">
                                  {item.badge > 99 ? "99+" : item.badge}
                                </span>
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            {hasChildren ? `${item.label} (Sub-stage: Glass Pairing)` : item.label}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  }

                  if (hasChildren) {
                    return (
                      <div key={item.id} className="w-full">
                        {/* Parent Item (Cutting Workstation) */}
                        <div
                          onClick={() => {
                            handleItemClick(item);
                            setOpenDropdowns((prev) => ({ ...prev, [item.id]: true }));
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-1.5 relative transition-all duration-200 cursor-pointer select-none group",
                            isParentActive
                              ? "bg-[#1680f5]/15 text-[#1680f5] font-black border-r-2 border-[#1680f5]"
                              : "text-slate-300 hover:bg-white/5 font-medium"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={cn(
                                "flex items-center justify-center shrink-0 rounded-full transition-all duration-200",
                                isParentActive ? "w-[24px] h-[24px] bg-[#1680f5]" : "w-[24px] h-[24px] bg-[#1c2a42]"
                              )}
                            >
                              <item.icon
                                className={cn(
                                  isParentActive ? "w-3.5 h-3.5 text-white" : "w-3.5 h-3.5 text-slate-300"
                                )}
                              />
                            </div>
                            <span className="truncate tracking-wide text-[12.5px]">
                              {item.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {item.badge !== undefined && item.badge > 0 && (
                              <span className="min-w-[22px] h-[20px] px-1.5 rounded-full bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 text-[11px] font-bold flex items-center justify-center shrink-0 shadow-xs">
                                {item.badge}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => toggleDropdown(item.id, e)}
                              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                              title={isDropdownOpen ? "Collapse sub-stages" : "Expand sub-stages"}
                            >
                              {isDropdownOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 text-blue-300" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Dropdown Sub-Module (Glass Pairing) */}
                        {isDropdownOpen && (
                          <div className="flex flex-col space-y-0.5 py-1 pl-6 pr-2 relative animate-in fade-in duration-200">
                            <div className="absolute left-[31px] top-1.5 bottom-1.5 w-[1px] bg-white/10 pointer-events-none" />
                            {item.children!.map((sub) => {
                              const isSubActive = activeTab === sub.id;
                              return (
                                <div
                                  key={sub.id}
                                  onClick={() => handleItemClick(sub)}
                                  className={cn(
                                    "flex items-center justify-between pl-6 pr-3 py-1.5 rounded-lg text-xs transition-all duration-150 cursor-pointer select-none relative group",
                                    isSubActive
                                      ? "bg-[#1680f5] text-white font-bold shadow-xs"
                                      : "text-slate-300 hover:text-white hover:bg-white/10 font-medium"
                                  )}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <sub.icon
                                      className={cn(
                                        "w-3.5 h-3.5 shrink-0",
                                        isSubActive ? "text-white" : "text-blue-300/80 group-hover:text-blue-300"
                                      )}
                                    />
                                    <span className="truncate text-[12px]">{sub.label}</span>
                                  </div>
                                  {sub.badge !== undefined && sub.badge > 0 && (
                                    <span
                                      className={cn(
                                        "min-w-[20px] h-[18px] px-1 rounded-full text-[10.5px] font-bold flex items-center justify-center shrink-0 ml-1.5 shadow-xs",
                                        isSubActive
                                          ? "bg-white text-blue-700 font-extrabold"
                                          : "bg-emerald-400/20 border border-emerald-400/40 text-emerald-300"
                                      )}
                                    >
                                      {sub.badge}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const isActive = activeTab === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-1.5 relative transition-all duration-200 cursor-pointer select-none",
                        isActive
                          ? "bg-[#1680f5]/15 text-[#1680f5] font-black border-r-2 border-[#1680f5]"
                          : "text-slate-300 hover:bg-white/5 font-medium"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "flex items-center justify-center shrink-0 rounded-full transition-all duration-200",
                            isActive ? "w-[24px] h-[24px] bg-[#1680f5]" : "w-[24px] h-[24px] bg-[#1c2a42]"
                          )}
                        >
                          <item.icon
                            className={cn(
                              isActive ? "w-3.5 h-3.5 text-white" : "w-3.5 h-3.5 text-slate-300"
                            )}
                          />
                        </div>
                        <span className="truncate tracking-wide text-[12.5px]">
                          {item.label}
                        </span>
                      </div>

                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="min-w-[22px] h-[20px] px-1.5 rounded-full bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 text-[11px] font-bold flex items-center justify-center shrink-0 ml-2 shadow-xs">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </div>



      {/* ─── Bottom Background Image (STABLE) ─── */}
      {sidebarOpen && (
        <div className="absolute bottom-0 inset-x-0 z-0 pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#061836] to-transparent z-10" />
          <img
            src="/image copy 6.png"
            alt="Quality Precision Excellence"
            className="w-full h-auto object-cover opacity-90"
            style={{
              maskImage: "linear-gradient(to bottom, transparent 0%, black 15%, black 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 15%, black 100%)",
            }}
          />
        </div>
      )}
    </aside>
  );
};
