import React from "react";
import { ProductionStage } from "@shared/api";
import { useAuth } from "@/context/AuthContext";
import {
  Scissors,
  Sparkles,
  Layers,
  PackageCheck,
  CheckCircle,
  Truck,
  ShieldCheck,
  Boxes,
  Sliders,
  Check,
  Flame,
  ArrowRight,
  Info,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkstationStageBannerProps {
  stage: ProductionStage;
  totalItems: number;
  totalSqm: number;
  readyCount?: number;
  completedTodayCount?: number;
  onNavigateTab?: (tab: string) => void;
  className?: string;
}

interface StageMetadata {
  number: number;
  title: string;
  subtitle: string;
  icon: any;
  themeColor: {
    bg: string;
    border: string;
    text: string;
    badgeBg: string;
    gradient: string;
  };
  specs: { label: string; value: string; hint?: string }[];
  operatorFocus: string;
}

const STAGE_CONFIG: Record<string, StageMetadata> = {
  Cutting: {
    number: 1,
    title: "Cutting Workstation",
    subtitle: "Glass Cutting & Breaking Tables",
    icon: Scissors,
    themeColor: {
      bg: "bg-blue-50/70",
      border: "border-blue-200",
      text: "text-blue-900",
      badgeBg: "bg-blue-100 text-blue-800 border-blue-300",
      gradient: "from-blue-600 to-indigo-700",
    },
    specs: [
      { label: "Cut Tolerance", value: "±1.0 mm", hint: "CNC XY table precision" },
      { label: "Glass Routing", value: "Auto-Assigned", hint: "CUT ➔ POLISH / PAIRING" },
      { label: "Shape / Holes", value: "CAD & Taper Supported", hint: "Check sticker cutout specs" },
      { label: "Stillage Lot", value: "Assigned Rack No", hint: "Direct placement after break" },
    ],
    operatorFocus: "Scan barcode to confirm cut sheet. Verify glass code, thickness, and dimensions before breakout.",
  },
  Polishing: {
    number: 2,
    title: "Polishing Workstation",
    subtitle: "Edge Grinding & Polishing Line",
    icon: Sparkles,
    themeColor: {
      bg: "bg-cyan-50/70",
      border: "border-cyan-200",
      text: "text-cyan-900",
      badgeBg: "bg-cyan-100 text-cyan-800 border-cyan-300",
      gradient: "from-cyan-600 to-teal-700",
    },
    specs: [
      { label: "Edge Profiles", value: "Flat Polish / Arris / Bevel", hint: "Inspect edge roughness" },
      { label: "Edge Coverage", value: "All 4 Sides Required", hint: "Follow sticker edge specs" },
      { label: "Hole & Notches", value: "Hand & Machine Deburred", hint: "Check internal corners" },
      { label: "Coolant Flow", value: "Diamond Wheels 100%", hint: "Zero burn marks on edge" },
    ],
    operatorFocus: "Verify cut dimensions and edge grinding finish. Mark complete to route to Pairing Buffer or Lamination.",
  },
  Pairing: {
    number: 3,
    title: "Assembly & Buffer Pairing",
    subtitle: "Pane Matching & Stillage Holding Station",
    icon: Layers,
    themeColor: {
      bg: "bg-indigo-50/70",
      border: "border-indigo-200",
      text: "text-indigo-900",
      badgeBg: "bg-indigo-100 text-indigo-800 border-indigo-300",
      gradient: "from-indigo-600 to-purple-700",
    },
    specs: [
      { label: "Pane Matching", value: "Outer (OP) + Inner (IP)", hint: "Color & Clear matching" },
      { label: "Surface Coating", value: "Surface #2 / #3 Checked", hint: "Low-E detector verified" },
      { label: "Dimension Delta", value: "Δ ≤ 1.0 mm Tolerance", hint: "Reject pane if mismatch" },
      { label: "Buffer Slots", value: "Active Rack Allocation", hint: "Holds until partner pane cut" },
    ],
    operatorFocus: "Scan both partner panes to assemble the unit. Ensure coating side and dimensions match perfectly.",
  },
  DGU: {
    number: 4,
    title: "IGU / DGU Assembly",
    subtitle: "Insulated Double Glazing Line",
    icon: PackageCheck,
    themeColor: {
      bg: "bg-teal-50/70",
      border: "border-teal-200",
      text: "text-teal-900",
      badgeBg: "bg-teal-100 text-teal-800 border-teal-300",
      gradient: "from-teal-600 to-emerald-700",
    },
    specs: [
      { label: "Spacer Width", value: "12mm / 16mm / 20mm", hint: "Black Warm-Edge / Aluminum" },
      { label: "Desiccant Fill", value: "3Å Molecular Sieve", hint: "Auto-injected spacer bar" },
      { label: "Gas Injection", value: "Argon Gas Fill 90%+", hint: "Primary butyl barrier sealed" },
      { label: "Secondary Seal", value: "Structural Silicone", hint: "Continuous uniform bead depth" },
    ],
    operatorFocus: "Inspect internal pane cleanliness, spacer alignment, and gas injection before structural sealing.",
  },
  Lamination: {
    number: 5,
    title: "Lamination Cleanroom Line",
    subtitle: "PVB / EVA Autoclave Line",
    icon: Flame,
    themeColor: {
      bg: "bg-amber-50/70",
      border: "border-amber-200",
      text: "text-amber-900",
      badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
      gradient: "from-amber-600 to-orange-700",
    },
    specs: [
      { label: "Interlayer Type", value: "0.76 / 1.52mm PVB / SGP", hint: "Acoustic, Tinted & Clear" },
      { label: "De-Airing", value: "Calender Nip Rollers", hint: "Heated vacuum pre-lamination" },
      { label: "Autoclave Cycle", value: "135°C @ 12.5 Bar", hint: "High pressure curing recipe" },
      { label: "Quality Check", value: "Zero Bubble / Optical Inspection", hint: "Edge delamination check" },
    ],
    operatorFocus: "Assemble glass sandwich in cleanroom, apply vacuum de-airing, and record autoclave batch cycle.",
  },
  Finished: {
    number: 6,
    title: "Finished Warehouse & Dispatch",
    subtitle: "Quality Inspection, Staging & Truck Loading",
    icon: Truck,
    themeColor: {
      bg: "bg-emerald-50/70",
      border: "border-emerald-200",
      text: "text-emerald-900",
      badgeBg: "bg-emerald-100 text-emerald-900 border-emerald-300",
      gradient: "from-emerald-600 to-teal-800",
    },
    specs: [
      { label: "Warehouse Staging", value: "A-Frame Stillage Slots", hint: "Secure padding & strapping" },
      { label: "Delivery Location", value: "Site vs. Factory Gate", hint: "Verify project address" },
      { label: "Dispatch Docs", value: "Delivery Challan & Packing List", hint: "Auto-generated on scan" },
      { label: "Vehicle Log", value: "Truck No & Driver Recorded", hint: "Gate pass verification" },
    ],
    operatorFocus: "Final visual inspection, rack verification, and dispatch note generation upon truck loading.",
  },
};

export const WorkstationStageBanner: React.FC<WorkstationStageBannerProps> = ({
  stage,
  totalItems,
  totalSqm,
  readyCount,
  completedTodayCount,
  onNavigateTab,
  className,
}) => {
  const { user, role, isAdmin, isSupervisor, isOperator } = useAuth();
  const config = STAGE_CONFIG[stage] || STAGE_CONFIG["Cutting"];
  const Icon = config.icon;

  // Workstation tabs for cross-stage jump (Supervisors and Admins only)
  const allStages: { id: string; label: string; stageName: ProductionStage }[] = [
    { id: "cutting", label: "1. Cutting", stageName: "Cutting" },
    { id: "polishing", label: "2. Polishing", stageName: "Polishing" },
    { id: "pairing", label: "3. Pairing", stageName: "Pairing" },
    { id: "dgu", label: "4. DGU / IGU", stageName: "DGU" },
    { id: "lamination", label: "5. Lamination", stageName: "Lamination" },
    { id: "finished", label: "6. Dispatch", stageName: "Finished" },
  ];

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm transition-all duration-200 relative overflow-hidden",
        config.themeColor.bg,
        config.themeColor.border,
        className
      )}
    >
      {/* Decorative gradient corner accent */}
      <div
        className={cn(
          "absolute top-0 right-0 w-48 h-48 opacity-10 blur-2xl pointer-events-none rounded-full bg-gradient-to-br",
          config.themeColor.gradient
        )}
      />

      {/* Top Header Row: Stage Title, Role Badge, and Stage Jump (for Admin/Supervisor) */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-200/60">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-md bg-gradient-to-br",
              config.themeColor.gradient
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Stage {config.number} of 6
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-black border",
                  config.themeColor.badgeBg
                )}
              >
                {config.title}
              </span>
            </div>
            <h1 className="text-base font-black text-slate-900 leading-tight flex items-center gap-2">
              {config.subtitle}
            </h1>
          </div>
        </div>

        {/* User Role and Workstation Status */}
        <div className="flex items-center gap-2 flex-wrap">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab("overview")}
              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 text-xs font-extrabold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title="Return to Main Dashboard"
            >
              <Home className="w-3.5 h-3.5 text-blue-600" />
              <span>Dashboard</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold",
                isAdmin
                  ? "bg-purple-100 text-purple-900 border border-purple-200"
                  : isSupervisor
                  ? "bg-blue-100 text-blue-900 border border-blue-200"
                  : "bg-emerald-100 text-emerald-900 border border-emerald-200"
              )}
            >
              <ShieldCheck className="w-3 h-3" />
              {isAdmin
                ? "👑 Administrator"
                : isSupervisor
                ? "👔 Production Supervisor"
                : `👷 Workstation Operator`}
            </span>
            <span className="text-xs font-bold text-slate-800">
              {user?.name || `${role} Console`}
            </span>
          </div>

          {/* Quick Line Switcher for Supervisors & Admins */}
          {(isAdmin || isSupervisor) && onNavigateTab && (
            <div className="hidden lg:flex items-center gap-1 p-1 bg-white/80 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 px-1.5">Jump Line:</span>
              {allStages.map((s) => {
                const isCurrent = s.stageName === stage;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onNavigateTab(s.id)}
                    className={cn(
                      "px-2 py-1 rounded-lg text-[10.5px] font-extrabold transition-all cursor-pointer",
                      isCurrent
                        ? "bg-slate-900 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Middle Row: Workstation Technical Specs Grid (By-Default Visible Data) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-3">
        {config.specs.map((spec, i) => (
          <div
            key={i}
            className="bg-white/90 backdrop-blur-sm border border-slate-200/80 rounded-xl p-2.5 shadow-2xs"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {spec.label}
            </div>
            <div className="text-xs font-black text-slate-900 truncate mt-0.5">
              {spec.value}
            </div>
            {spec.hint && (
              <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                {spec.hint}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom Row: Workstation WIP Stats & Operational Role Guidance */}
      <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between flex-wrap gap-2 text-xs">
        {/* Left: Role Focus Guidance */}
        <div className="flex items-center gap-2 text-slate-600">
          <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="text-[11.5px] font-medium leading-tight">
            {isOperator
              ? config.operatorFocus
              : isSupervisor
              ? `Supervisor Console: Full operational control of ${config.title}. Batch release, quality reject/rework & analytics active.`
              : `Administrator Console: Complete master database management, sticker configuration, and user permissions.`}
          </span>
        </div>

        {/* Right: Quick Stage Live Counters */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <span className="text-slate-400 font-medium">Queue WIP:</span>
            <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-900 font-mono">
              {totalItems} pcs
            </span>
            <span className="text-slate-400 font-mono text-[11px]">({totalSqm.toFixed(2)} m²)</span>
          </div>

          {readyCount !== undefined && readyCount > 0 && (
            <div className="flex items-center gap-1.5 font-bold text-emerald-700">
              <span className="text-emerald-600 font-medium">Ready:</span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-200 text-emerald-900 font-mono">
                {readyCount} pcs
              </span>
            </div>
          )}

          {completedTodayCount !== undefined && completedTodayCount > 0 && (
            <div className="flex items-center gap-1.5 font-bold text-blue-700">
              <span className="text-blue-600 font-medium">Scanned Today:</span>
              <span className="px-2 py-0.5 rounded-md bg-blue-100 border border-blue-200 text-blue-900 font-mono">
                {completedTodayCount}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
