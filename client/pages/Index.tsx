import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ReactDOM from "react-dom";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Upload,
  ScanLine,
  Search,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Check,
  Box,
  Layers,
  Flame,
  Building2,
  Briefcase,
  ShieldCheck,
  ClipboardList,
  Trash2,
  Grid,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Menu,
  Bell,
  Sun,
  ArrowRight,
  ArrowLeft,
  Plus,
  Eye,
  Printer,
  Sparkles,
  RotateCw,
  Clock,
  Activity,
  TrendingUp,
  X,
  Gauge,
  Zap,
  Workflow,
  Factory,
  Percent,
  SlidersHorizontal,
  Timer,
  CheckSquare,
  Boxes,
  Truck,
  Scissors,
  Radio,
  Filter,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Calendar,
  FolderOpen,
  Folder,
  ExternalLink,
  LogOut,
  Users,
  Globe,
  MapPin,
  Settings,
  FileSpreadsheet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PIMaster, GlassItem, DashboardStats, UserRole, ProductionStage, SystemNotification } from "@shared/api";
import { TableHorizontalScrollWrapper } from "@/components/TableHorizontalScrollWrapper";
import { ProductionStageView } from "@/components/ProductionStageView";
import { SettingsView } from "@/components/SettingsView";
import { ProductionOverviewView } from "@/components/ProductionOverviewView";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "sonner";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/context/AuthContext";
import { formatBatchNumber, formatPlatformDate, formatPlatformTime, getItemFinish, isDguGlass, isLaminatedGlass, isDlguGlass, isDispatchedItem, calculateAssembledUnits } from "@/lib/utils";
import { exportStageWipToExcel, exportBatchProgressMatrixToExcel } from "@/lib/excelExport";

import { StickerUploaderModal } from "@/components/StickerUploaderModal";
import { UploadedPdfsModal } from "@/components/UploadedPdfsModal";
import { ScannerStatusWidget } from "@/components/ScannerStatusWidget";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { scannerAudio } from "@/lib/audioBeep";
import { findBestMatchingItem, cleanScannedBarcode, evaluateScanStatus } from "@/lib/barcode";
// Lazy-load heavy modals and sub-views to keep initial page bundle ultra-fast over ngrok/tunnels
const ManualPIModal = React.lazy(() =>
  import("@/components/ManualPIModal").then((m) => ({ default: m.ManualPIModal }))
);
const PIDocumentModal = React.lazy(() =>
  import("@/components/PIDocumentModal").then((m) => ({ default: m.PIDocumentModal }))
);
const BarcodeStickerModal = React.lazy(() =>
  import("@/components/BarcodeStickerModal").then((m) => ({ default: m.BarcodeStickerModal }))
);
const ScanLookupModal = React.lazy(() =>
  import("@/components/ScanLookupModal").then((m) => ({ default: m.ScanLookupModal }))
);
const RejectReworkModal = React.lazy(() =>
  import("@/components/RejectReworkModal").then((m) => ({ default: m.RejectReworkModal }))
);
const ReportsView = React.lazy(() =>
  import("@/components/ReportsView").then((m) => ({ default: m.ReportsView }))
);
const PerformanceAnalyticsView = React.lazy(() =>
  import("@/components/PerformanceAnalyticsView").then((m) => ({ default: m.PerformanceAnalyticsView }))
);
const DispatchedHistoryView = React.lazy(() =>
  import("@/components/DispatchedHistoryView").then((m) => ({ default: m.DispatchedHistoryView }))
);

// Standalone Dubai Live Clock to avoid re-rendering entire Index component every 1 second
const DubaiClock: React.FC = React.memo(() => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(now);

  const dateStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(now);

  return (
    <div className="flex flex-col leading-none text-right select-none">
      <span className="text-[11px] font-black text-slate-800">{dateStr}</span>
      <span className="text-[11px] font-mono font-bold text-slate-500">{timeStr}</span>
    </div>
  );
});

export default function Index() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const validTabs = ["overview", "production-overview", "pis", "cutting", "polishing", "pairing", "dgu", "lamination", "finished", "dispatched-history", "reports", "analytics", "settings"] as const;
  type TabType = typeof validTabs[number];

  const currentTabFromUrl = searchParams.get("tab") as TabType | null;
  // ponytail: Preserve user's active module across hard refreshes and page reloads
  const initialTab = (currentTabFromUrl && validTabs.includes(currentTabFromUrl))
    ? currentTabFromUrl
    : (() => {
      try {
        const saved = localStorage.getItem("sejal_active_module") as TabType;
        if (saved && validTabs.includes(saved)) return saved;
      } catch { }
      return "overview";
    })();

  const [activeTab, setActiveTabState] = useState<TabType>(initialTab);

  // Sync tab from URL params when user navigates with browser back/forward buttons
  useEffect(() => {
    const urlTab = searchParams.get("tab") as TabType | null;
    if (urlTab && validTabs.includes(urlTab)) {
      if (urlTab !== activeTab) {
        setActiveTabState(urlTab);
      }
    } else if (!urlTab && activeTab !== "overview") {
      setActiveTabState("overview");
    }
  }, [searchParams]);

  const { user, role: userRole, logout, getAuthHeaders, canAccessTab, canPerformAction, isOnline } = useAuth();

  // Current active workstation stage (locks to assigned stage for station operators, or follows activeTab)
  const currentWorkstationStage: ProductionStage | undefined = useMemo(() => {
    const tabToStageMap: Record<string, ProductionStage> = {
      cutting: "Cutting",
      polishing: "Polishing",
      pairing: "Pairing",
      dgu: "DGU",
      lamination: "Lamination",
      finished: "Finished",
    };

    const activeStage = tabToStageMap[activeTab];

    // If Operator is assigned to specific workstation stages:
    if (user?.role === "Operator" && user.assignedStages && user.assignedStages.length > 0) {
      // 1. If current active tab matches ANY of the operator's assigned stages, use that active stage!
      if (activeStage && user.assignedStages.includes(activeStage)) {
        return activeStage;
      }
      // 2. If operator has a single assigned stage, lock to it
      if (user.assignedStages.length === 1) {
        return user.assignedStages[0];
      }
      // 3. For multi-stage operators viewing non-workstation tabs (e.g. overview), default to primary stage
      return user.assignedStages[0];
    }

    // For Admin, Supervisor, or unassigned users: follows active workstation tab directly
    return activeStage;
  }, [activeTab, user]);

  // Set active tab and update browser history URL so back/forward works naturally
  const setActiveTab = useCallback((newTab: TabType | string, replace: boolean = false) => {
    const targetTab = validTabs.includes(newTab as TabType) ? (newTab as TabType) : "overview";
    setActiveTabState(targetTab);
    try {
      localStorage.setItem("sejal_active_module", targetTab);
    } catch { }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (targetTab === "overview") {
        next.delete("tab");
      } else {
        next.set("tab", targetTab);
      }
      return next;
    }, { replace });
  }, [setSearchParams]);

  const [reportsInitialTab, setReportsInitialTab] = useState<"pis" | "items" | "history" | "rejects" | "reworks">(() => {
    try {
      const saved = localStorage.getItem("sejal_reports_active_tab") as any;
      if (saved && ["pis", "items", "history", "rejects", "reworks"].includes(saved)) return saved;
    } catch { }
    return "pis";
  });

  useEffect(() => {
    try {
      localStorage.setItem("sejal_active_module", activeTab);
    } catch { }
  }, [activeTab]);

  // Enforce role-based module access: Dashboard first for all roles
  useEffect(() => {
    if (!canAccessTab(activeTab)) {
      setActiveTab("overview", true);
      toast.info(`Switched to Dashboard based on access permissions.`);
    }
  }, [userRole, user, activeTab, canAccessTab, setActiveTab]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Interactive UI states
  const notificationsRef = React.useRef<HTMLDivElement>(null);
  const userMenuRef = React.useRef<HTMLDivElement>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<"all" | "unread" | "alerts">("all");
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const recentLocalScansRef = React.useRef<Map<string, number>>(new Map());

  const unreadNotifications = notifications.filter((n) => !n.read).length;
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [activeSummarySlice, setActiveSummarySlice] = useState<"all" | "completed" | "inProgress" | "pending" | "rejected">("all");

  // Auto-hide popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Data states
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pis, setPis] = useState<PIMaster[]>([]);
  const [items, setItems] = useState<GlassItem[]>([]);
  // Sticker & Batch export dropdown
  const [isBatchExportOpen, setIsBatchExportOpen] = useState(false);
  const batchExportBtnRef = useRef<HTMLButtonElement>(null);
  const [batchExportPos, setBatchExportPos] = useState<{ top: number; right: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Search, Sort & Filter
  const [piSearchTerm, setPiSearchTerm] = useState("");
  const [piFinishFilter, setPiFinishFilter] = useState<"ALL" | "CLEAR" | "COLOUR">("ALL");
  const [sortField, setSortField] = useState<"piNumber" | "customerName" | "projectName" | "itemsCount" | "totalSqm" | "status" | "createdAt">("piNumber");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modal states
  const [stickerUploadModalOpen, setStickerUploadModalOpen] = useState(false);
  const [uploadedPdfsModalOpen, setUploadedPdfsModalOpen] = useState(false);
  const [selectedPdfFilter, setSelectedPdfFilter] = useState<string>("ALL");
  const [manualPIModalOpen, setManualPIModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanInitialCode, setScanInitialCode] = useState<string>("");
  const [autoAdvanceMode, setAutoAdvanceMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("sejal_scanner_auto_advance");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [lastScannedTime, setLastScannedTime] = useState<Date | null>(null);
  const isGlobalScanningRef = useRef<boolean>(false);
  const lastGlobalScanRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });

  const handleToggleAutoAdvance = (val: boolean) => {
    setAutoAdvanceMode(val);
    try {
      localStorage.setItem("sejal_scanner_auto_advance", String(val));
    } catch { }
  };

  const [selectedPI, setSelectedPI] = useState<PIMaster | null>(null);
  const [overviewThroughputStage, setOverviewThroughputStage] = useState<string>("Cutting");
  const [selectedPIItems, setSelectedPIItems] = useState<GlassItem[]>([]);
  const [piModalOpen, setPiModalOpen] = useState(false);

  const [selectedStickerItem, setSelectedStickerItem] = useState<GlassItem | null>(null);
  const [stickerModalOpen, setStickerModalOpen] = useState(false);

  const [rejectReworkItem, setRejectReworkItem] = useState<GlassItem | null>(null);
  const [rejectReworkMode, setRejectReworkMode] = useState<"reject" | "rework">("reject");
  const [rejectReworkModalOpen, setRejectReworkModalOpen] = useState(false);
  const [summaryTimeFilter, setSummaryTimeFilter] = useState<"Today" | "Week" | "Month" | "All">("Today");
  const [summaryFilterDropdownOpen, setSummaryFilterDropdownOpen] = useState(false);

  // Standard back navigation that respects browser history step by step
  const handleGoBack = useCallback(() => {
    // 1. If any overlay modal is open, step back by closing the modal first
    if (rejectReworkModalOpen) {
      setRejectReworkModalOpen(false);
      setRejectReworkItem(null);
      return;
    }
    if (stickerModalOpen) {
      setStickerModalOpen(false);
      setSelectedStickerItem(null);
      return;
    }
    if (piModalOpen) {
      setPiModalOpen(false);
      setSelectedPI(null);
      return;
    }
    if (manualPIModalOpen) {
      setManualPIModalOpen(false);
      return;
    }
    if (uploadedPdfsModalOpen) {
      setUploadedPdfsModalOpen(false);
      return;
    }
    if (stickerUploadModalOpen) {
      setStickerUploadModalOpen(false);
      return;
    }
    if (scanModalOpen) {
      setScanModalOpen(false);
      return;
    }

    // 2. Otherwise navigate one step back in history (sub-tabs, batches, or modules)
    if (window.history.state && typeof window.history.state.idx === "number" && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      setActiveTab("overview");
    }
  }, [
    rejectReworkModalOpen,
    stickerModalOpen,
    piModalOpen,
    manualPIModalOpen,
    uploadedPdfsModalOpen,
    stickerUploadModalOpen,
    scanModalOpen,
    navigate,
    setActiveTab,
  ]);

  const isFetchingRef = useRef(false);
  const pendingFetchRef = useRef(false);
  const streamDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = async (silent = false) => {
    if (isFetchingRef.current) {
      pendingFetchRef.current = true;
      return;
    }
    isFetchingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const [dashRes, piRes, notifRes] = await Promise.all([
        fetch("/api/production/dashboard"),
        fetch("/api/pi"),
        fetch("/api/notifications"),
      ]);

      if (dashRes.ok) {
        const dashData = await dashRes.json();
        const freshItems: GlassItem[] = dashData.items || [];
        setItems(freshItems);
        setStats(dashData);
        if (selectedPI) {
          const updatedPIItems = freshItems.filter((i) => i.piId === selectedPI.id || i.piNumber === selectedPI.piNumber);
          if (updatedPIItems.length > 0) {
            setSelectedPIItems(updatedPIItems);
          }
        }
      }
      if (piRes.ok) setPis(await piRes.json());
      if (notifRes.ok) {
        const serverNotifs = await notifRes.json();
        if (Array.isArray(serverNotifs)) {
          setNotifications(serverNotifs);
        }
      }
      setLastUpdated(new Date());
      if (!silent) toast.success("Dashboard data refreshed");
    } catch (err: any) {
      if (!silent) toast.error("Error connecting to server database");
    } finally {
      if (!silent) setLoading(false);
      isFetchingRef.current = false;
      if (pendingFetchRef.current) {
        pendingFetchRef.current = false;
        fetchData(true);
      }
    }
  };

  const formatNotificationTime = (timestamp?: string) => {
    if (!timestamp) return "Recently";
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return timestamp;
      const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSecs < 10) return "Just now";
      if (diffSecs < 60) return `${diffSecs}s ago`;
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Dubai",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(date);
    } catch {
      return timestamp;
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      await fetch("/api/notifications/read-all", { method: "PATCH" });
    } catch (err) {
      console.error("Failed to mark all notifications read", err);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    } catch (err) {
      console.error("Failed to mark notification read", err);
    }
  };

  const handleDeleteNotification = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to delete notification", err);
    }
  };

  const handleClearAllNotifications = async () => {
    try {
      setNotifications([]);
      await fetch("/api/notifications", { method: "DELETE" });
    } catch (err) {
      console.error("Failed to clear notifications", err);
    }
  };

  const handleOptimisticAdvance = (serialNumbers: string[], fromStage: ProductionStage) => {
    serialNumbers.forEach((s) => recentLocalScansRef.current.set(s, Date.now()));
    const serialSet = new Set(serialNumbers.map((s) => String(s).toLowerCase().trim()));
    setItems((prev) =>
      prev.map((item) => {
        const itemSerial = String(item.serialNumber || "").toLowerCase().trim();
        const itemId = String(item.id || "").toLowerCase().trim();
        if ((serialSet.has(itemSerial) || serialSet.has(itemId)) && item.currentStage === fromStage) {
          const route = item.processRoute || [];
          let idx = -1;
          if (fromStage === "Pairing" && item.completedStages?.includes("Lamination")) {
            idx = route.lastIndexOf("Pairing");
          } else {
            idx = route.indexOf(fromStage);
          }
          const nextStage: ProductionStage = idx >= 0 && idx < route.length - 1 ? route[idx + 1] : "Finished";
          return {
            ...item,
            currentStage: nextStage,
            completedStages: Array.from(new Set([...(item.completedStages || []), fromStage])),
            status: nextStage === "Finished" ? "Completed" : "In Production",
          };
        }
        return item;
      })
    );
  };

  useEffect(() => {
    fetchData(true);
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/production/events");
      const handleStreamUpdate = () => {
        if (streamDebounceRef.current) clearTimeout(streamDebounceRef.current);
        streamDebounceRef.current = setTimeout(() => {
          fetchData(true);
        }, 400);
      };

      eventSource.addEventListener("system_notification", (e: any) => {
        try {
          const notif: SystemNotification = JSON.parse(e.data);
          if (notif && notif.id) {
            setNotifications((prev) => {
              const exists = prev.some((n) => n.id === notif.id);
              if (exists) return prev;
              return [notif, ...prev.slice(0, 49)];
            });
            if (notif.type === "destructive") {
              toast.error(`${notif.title}: ${notif.message}`);
            } else if (notif.type === "warning") {
              toast.warning(`${notif.title}: ${notif.message}`);
            } else if (notif.type === "success") {
              const lastLocalTime = notif.serialNumber ? recentLocalScansRef.current.get(notif.serialNumber) : undefined;
              const isRecentLocalAction = lastLocalTime && (Date.now() - lastLocalTime < 3500);
              if (!isRecentLocalAction) {
                toast.success(notif.message || notif.title);
              }
            }
          }
        } catch (err) {
          console.error("Error receiving system notification:", err);
        }
      });

      eventSource.addEventListener("notifications_updated", () => {
        fetch("/api/notifications")
          .then((r) => (r.ok ? r.json() : null))
          .then((notifs) => {
            if (Array.isArray(notifs)) setNotifications(notifs);
          })
          .catch(() => { });
      });

      eventSource.addEventListener("stage_advanced", handleStreamUpdate);
      eventSource.addEventListener("item_rejected", handleStreamUpdate);
      eventSource.addEventListener("item_reworked", handleStreamUpdate);
      eventSource.addEventListener("excel_uploaded", handleStreamUpdate);
      eventSource.addEventListener("sticker_batch_uploaded", handleStreamUpdate);
      eventSource.addEventListener("pi_released", handleStreamUpdate);
      eventSource.addEventListener("pi_deleted", handleStreamUpdate);
      eventSource.addEventListener("database_cleared", handleStreamUpdate);

      eventSource.addEventListener("session_revoked", (e: any) => {
        try {
          const data = JSON.parse(e.data);
          if (
            data &&
            (data.userId === user?.id ||
              (data.username && user?.username && data.username.toLowerCase() === user.username.toLowerCase()))
          ) {
            toast.error("Your account has been deleted by an administrator. Logging out...");
            setTimeout(() => {
              logout();
            }, 300);
          }
        } catch {}
      });

      eventSource.addEventListener("user_deleted", (e: any) => {
        try {
          const data = JSON.parse(e.data);
          if (
            data &&
            (data.userId === user?.id ||
              (data.username && user?.username && data.username.toLowerCase() === user.username.toLowerCase()))
          ) {
            toast.error("Your account has been deleted by an administrator. Logging out...");
            setTimeout(() => {
              logout();
            }, 300);
          }
        } catch {}
      });

      eventSource.onmessage = handleStreamUpdate;
    } catch (err) {
      console.error("SSE connection error:", err);
    }

    const timer = setInterval(() => fetchData(true), 60000);
    return () => {
      eventSource?.close();
      clearInterval(timer);
    };
  }, []);

  const openPIDetails = async (pi: PIMaster) => {
    try {
      const res = await fetch(`/api/pi/${pi.id}`);
      if (!res.ok) throw new Error("Failed to fetch PI details");
      const data = await res.json();
      setSelectedPI(data.pi);
      setSelectedPIItems(data.items);
      setPiModalOpen(true);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleOpenSticker = (item: GlassItem) => {
    setSelectedStickerItem(item);
    setStickerModalOpen(true);
  };

  const handleOpenReject = (item: GlassItem) => {
    setRejectReworkItem(item);
    setRejectReworkMode("reject");
    setRejectReworkModalOpen(true);
  };

  const handleOpenRework = (item: GlassItem) => {
    setRejectReworkItem(item);
    setRejectReworkMode("rework");
    setRejectReworkModalOpen(true);
  };

  const handleDeletePI = async (piId: string) => {
    const targetPI = pis.find((p) => p.id === piId || p.piNumber === piId);
    const batchNumber = targetPI ? formatBatchNumber(targetPI.batchNo || targetPI.piNumber) : piId;

    if (userRole === "Operator") {
      toast.error(`You do not have permission to delete batches`);
      return;
    }
    if (!window.confirm(`Are you sure you want to delete Batch ${batchNumber} and all its glass items?`)) return;
    try {
      const res = await fetch(`/api/pi/${piId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to delete Batch ${batchNumber}`);
      }
      toast.success(`Batch ${batchNumber} deleted successfully!`);
      if (selectedPI && (selectedPI.id === piId || selectedPI.piNumber === piId)) {
        setSelectedPI(null);
        setSelectedPIItems([]);
      }
      fetchData(true);
    } catch (err: any) {
      toast.error(err.message || `Error deleting Batch ${batchNumber}`);
    }
  };

  const handleReleaseToProduction = async (piId: string) => {
    const targetPI = pis.find((p) => p.id === piId || p.piNumber === piId);
    const isSticker =
      targetPI?.piNumber?.startsWith("STK-") ||
      targetPI?.piNumber?.startsWith("SFO-") ||
      targetPI?.id?.startsWith("stk-") ||
      targetPI?.proformaInvNo?.startsWith("STK-") ||
      targetPI?.piNumber?.includes("STK-");
    const docLabel = isSticker ? "Sticker batch" : "PI document";

    if (userRole === "Operator") {
      toast.error(`You do not have permission to release ${docLabel.toLowerCase()}s to production`);
      return;
    }
    try {
      const res = await fetch(`/api/pi/${piId}/release`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to release ${docLabel.toLowerCase()} to production`);
      }
      toast.success(`${docLabel} released to production successfully!`);
      fetchData(true);
    } catch (err: any) {
      toast.error(err.message || `Error releasing ${docLabel.toLowerCase()} to production`);
    }
  };

  const handleClearDatabase = async () => {
    if (userRole !== "Admin") {
      toast.error("Only Admin role can clear the database");
      return;
    }
    const confirmationText = window.prompt(
      "WARNING: This action will permanently erase ALL Proforma Invoices (PIs), Glass Items, Audit History, Rejects, and Rework logs.\n\nType 'CLEAR DATABASE' to confirm destruction:"
    );
    if (confirmationText !== "CLEAR DATABASE") {
      if (confirmationText !== null) {
        toast.error("Confirmation text did not match. Database clear cancelled.");
      }
      return;
    }
    try {
      const res = await fetch("/api/production/clear-db", {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to clear database");
      }
      toast.success("Database cleared successfully!");
      fetchData(true);
    } catch (err: any) {
      toast.error(err.message || "Error clearing database");
    }
  };

  const handleCompleteStageFromScan = async (item: GlassItem) => {
    const currentStage = item.currentStage;
    const route = item.processRoute || [];
    let currentIndex = -1;
    if (currentStage === "Pairing") {
      if (item.completedStages?.includes("Lamination")) {
        currentIndex = route.lastIndexOf("Pairing");
      } else {
        currentIndex = route.indexOf("Pairing");
      }
    } else {
      currentIndex = route.indexOf(currentStage);
    }
    const nextStage: ProductionStage = currentIndex >= 0 && currentIndex < route.length - 1 ? route[currentIndex + 1] : "Finished";

    handleOptimisticAdvance([item.serialNumber, item.id], currentStage);
    try {
      const res = await fetch("/api/production/stage-complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          serialNumbers: [item.serialNumber],
          itemIds: [item.id],
          stage: currentStage,
          currentStage: currentStage,
          advanceQty: 1,
          advanceAll: false,
          operator: user?.name || user?.username || (userRole === "Admin" ? "Administrator" : "Staff"),
          remarks: `Advanced via Barcode Scanner from ${currentStage}`,
        }),
      });
      if (res.ok) {
        scannerAudio.playSuccess();
        const data = await res.json().catch(() => ({}));
        toast.success(data.message || `Advanced POS #${item.posNo || item.itemCode} from ${currentStage} ➔ ${nextStage}!`);
        fetchData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        scannerAudio.playWarning();
        toast.warning(err.message || `Could not advance POS #${item.posNo || item.itemCode}`);
        fetchData(true);
      }
    } catch (err: any) {
      scannerAudio.playError();
      toast.error(err.message || "Failed to advance stage");
      fetchData(true);
    }
  };

  const handleGlobalScan = useCallback(
    async (code: string) => {
      const cleanCode = cleanScannedBarcode(code);
      if (!cleanCode) return;

      // Debounce rapid repeat triggers for the exact same code (<1800ms) with sliding cooldown window
      const now = Date.now();
      if (lastGlobalScanRef.current.code === cleanCode && now - lastGlobalScanRef.current.time < 1800) {
        lastGlobalScanRef.current.time = now;
        return;
      }
      // Concurrency lock: prevent multiple scans running at the exact same moment
      if (isGlobalScanningRef.current) {
        lastGlobalScanRef.current = { code: cleanCode, time: now };
        return;
      }
      lastGlobalScanRef.current = { code: cleanCode, time: now };
      isGlobalScanningRef.current = true;

      try {
        setLastScannedCode(cleanCode);
        setLastScannedTime(new Date());

        // If Scan Lookup Modal or any dialog/modal is already open, do not trigger background global scan
        if (scanModalOpen || (typeof document !== "undefined" && Boolean(document.querySelector('[role="dialog"]')))) return;

        // 1. Evaluate scan status against active production state & current workstation stage
        const scanEval = evaluateScanStatus(items, cleanCode, currentWorkstationStage);

      // Handle duplicate scan in the same stage (all stickers have completed this stage)
      if (scanEval.status === "already_scanned") {
        scannerAudio.playWarning();
        toast.warning(scanEval.message, { duration: 5500 });
        return;
      }

      // Handle wrong stage (upstream piece that hasn't reached this station yet)
      if (scanEval.status === "wrong_stage") {
        scannerAudio.playWarning();
        toast.warning(scanEval.message, { duration: 5500 });
        return;
      }

      // Handle rejected piece
      if (scanEval.status === "rejected") {
        scannerAudio.playError();
        toast.error(scanEval.message);
        return;
      }

      // Handle all finished pieces
      if (scanEval.status === "all_finished") {
        scannerAudio.playSuccess();
        toast.info(scanEval.message);
        if (scanEval.item) {
          setScanInitialCode(cleanCode);
          setScanModalOpen(true);
        }
        return;
      }

      let matchedItem: GlassItem | null = scanEval.status === "can_advance" ? scanEval.item : null;

      // 2. If not found locally, query backend scan endpoint with stage hint
      if (!matchedItem) {
        try {
          const res = await fetch("/api/production/scan", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getAuthHeaders(),
            },
            body: JSON.stringify({ code: cleanCode, stage: currentWorkstationStage }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.status === "already_scanned") {
              scannerAudio.playWarning();
              toast.warning(data.message || `Sticker already scanned at ${currentWorkstationStage}!`, { duration: 5500 });
              return;
            }
            matchedItem = data.item;
          }
        } catch { }
      }

      if (!matchedItem) {
        scannerAudio.playError();
        toast.error(`Barcode not recognized: ${cleanCode}`);
        return;
      }

      // If not currently inside an active workstation tab (e.g. Dashboard Overview, Batches, Reports, Analytics),
      // OR in Preview / Lookup mode, OR item is already Finished / Rejected:
      // Open the Lookup & Preview modal rather than blindly advancing the item across arbitrary stages!
      if (!currentWorkstationStage || !autoAdvanceMode || matchedItem.currentStage === "Finished" || matchedItem.status === "Rejected") {
        scannerAudio.playSuccess();
        setScanInitialCode(cleanCode);
        setScanModalOpen(true);
        if (!currentWorkstationStage) {
          toast.info(
            `📍 POS #${matchedItem.posNo || matchedItem.itemCode} is currently at ${matchedItem.currentStage}. Open the ${matchedItem.currentStage} workstation tab to scan & advance.`,
            { duration: 5500 }
          );
        }
        return;
      }

      // In Auto-Advance mode: advance item to next stage
      const currentStage = matchedItem.currentStage;
      const route = matchedItem.processRoute || [];
      let currentIndex = -1;
      if (currentStage === "Pairing") {
        if (matchedItem.completedStages?.includes("Lamination")) {
          currentIndex = route.lastIndexOf("Pairing");
        } else {
          currentIndex = route.indexOf("Pairing");
        }
      } else {
        currentIndex = route.indexOf(currentStage);
      }
      const nextStage: ProductionStage = currentIndex >= 0 && currentIndex < route.length - 1 ? route[currentIndex + 1] : "Finished";

      // Calculate sticker piece progression notes for multi-sticker positions (e.g. Glass1.pdf POS 17, Glass2.pdf POS 15)
      const currentQty = parseInt(String(matchedItem.qty || 1), 10) || 1;
      const totalMatching = Math.max(scanEval.totalMatching || 1, currentQty);
      const remainingBeforeAdvance = Math.max(scanEval.remainingInStage || 1, currentQty);
      const remainingAfter = Math.max(0, remainingBeforeAdvance - 1);
      const stickerIndex = totalMatching > 1 ? totalMatching - remainingAfter : 1;

      const stickerLabel = totalMatching > 1
        ? ` (${stickerIndex} of ${totalMatching} scanned)`
        : "";

      const remainingNote = remainingAfter > 0
        ? ` (${remainingAfter} piece${remainingAfter > 1 ? "s" : ""} remaining in ${currentStage})`
        : totalMatching > 1
          ? ` (All ${totalMatching} pieces completed in ${currentStage})`
          : "";

      // ── Pairing Guard: Cannot advance from Pairing without partner pane ──
      let partnerToPair: GlassItem | undefined = undefined;
      if (currentStage === "Pairing") {
        const isComposite = matchedItem.glassCategory === "DLGU" || isDlguGlass(matchedItem) || matchedItem.glassCategory === "DGU" || isDguGlass(matchedItem) || matchedItem.glassCategory === "Lamination" || isLaminatedGlass(matchedItem) || route.includes("DGU") || route.includes("Lamination");
        if (isComposite) {
          // Check if item already has a partner in buffer
          const existingPairId = (matchedItem as any).dguPairId || (matchedItem as any).lamPairId;
          if (existingPairId) {
            partnerToPair = items.find(
              (other) =>
                other.id !== matchedItem.id &&
                ((other as any).dguPairId === existingPairId || (other as any).lamPairId === existingPairId) &&
                other.status !== "Completed" &&
                other.status !== "Rejected"
            );
          }

          if (!partnerToPair) {
            partnerToPair = items.find((other) => {
              if (other.id === matchedItem.id) return false;
              if (other.currentStage !== "Pairing" || other.status === "Rejected" || other.status === "Completed") return false;
              const isOtherCol = getItemFinish(other) === "Colour";
              const isMatchCol = getItemFinish(matchedItem) === "Colour";
              // For DGU: must be opposite finish
              if ((matchedItem.glassCategory === "DGU" || isDguGlass(matchedItem) || route.includes("DGU")) && !route.includes("Lamination")) {
                if (isOtherCol === isMatchCol) return false;
              }
              if (other.posNo && matchedItem.posNo && String(other.posNo).trim() !== String(matchedItem.posNo).trim()) return false;
              if (Math.abs((other.width || 0) - (matchedItem.width || 0)) >= 2) return false;
              if (Math.abs((other.height || 0) - (matchedItem.height || 0)) >= 2) return false;
              const samePi = (matchedItem.piId && other.piId === matchedItem.piId) || (matchedItem.piNumber && other.piNumber === matchedItem.piNumber);
              const sameOrder = matchedItem.orderNo && other.orderNo && String(matchedItem.orderNo).toLowerCase() === String(other.orderNo).toLowerCase();
              const sameOb = matchedItem.obNo && other.obNo && String(matchedItem.obNo).toLowerCase() === String(other.obNo).toLowerCase();
              const sameProj = matchedItem.projectName && other.projectName && String(matchedItem.projectName).toLowerCase() === String(other.projectName).toLowerCase();
              return samePi || sameOrder || sameOb || sameProj;
            });
          }

          if (!partnerToPair) {
            scannerAudio.playWarning();
            const isColour = getItemFinish(matchedItem) === "Colour";
            const neededFinish = isColour ? "Clear" : "Colour";
            toast.warning(
              `⚠️ Cannot advance from Pairing: Glass pane POS #${matchedItem.posNo || matchedItem.itemCode} is waiting for its ${neededFinish} partner pane to be cut in Cutting Workstation. Both panes must be in Pairing Buffer before advancing to ${nextStage}.`,
              { duration: 6500 }
            );
            return;
          }
        }
      }

      // ── DGU Guard: Cannot advance to Finished without partner pane ──
      if (currentStage === "DGU" && nextStage === "Finished") {
        const isDgu = matchedItem.glassCategory === "DGU" || isDguGlass(matchedItem) || matchedItem.glassCategory === "DLGU" || isDlguGlass(matchedItem) || route.includes("DGU");
        if (isDgu) {
          const partnerInDgu = items.find((other) => {
            if (other.id === matchedItem.id) return false;
            if (other.currentStage !== "DGU" || other.status === "Rejected") return false;
            if ((matchedItem as any).dguPairId && (other as any).dguPairId === (matchedItem as any).dguPairId) return true;
            const isOtherCol = getItemFinish(other) === "Colour";
            const isMatchCol = getItemFinish(matchedItem) === "Colour";
            if (isOtherCol === isMatchCol) return false;
            if (other.posNo && matchedItem.posNo && String(other.posNo).trim() !== String(matchedItem.posNo).trim()) return false;
            return Math.abs((other.width || 0) - (matchedItem.width || 0)) < 2 && Math.abs((other.height || 0) - (matchedItem.height || 0)) < 2;
          });
          if (!partnerInDgu) {
            scannerAudio.playWarning();
            toast.warning(
              `⚠️ Cannot complete DGU: Glass pane POS #${matchedItem.posNo || matchedItem.itemCode} is missing its assembled partner pane in DGU Assembly. Both Colour + Clear panes must be present before completing to Finished.`,
              { duration: 6500 }
            );
            return;
          }
        }
      }

      // Collect IDs to advance (advancing both panes if paired in Pairing)
      const serialsToAdvance = partnerToPair ? [matchedItem.serialNumber, partnerToPair.serialNumber] : [matchedItem.serialNumber];
      const idsToAdvance = partnerToPair ? [matchedItem.id, partnerToPair.id] : [matchedItem.id];

      // Optimistic UI update
      handleOptimisticAdvance(idsToAdvance, currentStage);
      idsToAdvance.forEach((id) => recentLocalScansRef.current.set(id, Date.now()));
      serialsToAdvance.forEach((s) => recentLocalScansRef.current.set(s, Date.now()));

      const res = await fetch("/api/production/stage-complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            serialNumbers: serialsToAdvance,
            itemIds: idsToAdvance,
            stage: currentStage,
            currentStage: currentStage,
            advanceQty: 1,
            advanceAll: false,
            operator: user?.name || user?.username || (userRole === "Admin" ? "Administrator" : "Staff"),
            remarks: partnerToPair
              ? `Paired & Advanced via Scanner Gun (${matchedItem.serialNumber} + ${partnerToPair.serialNumber}) at ${currentStage}`
              : `Scanned by Hardware Scanner Gun at ${currentStage}${stickerLabel}`,
          }),
        });

        if (res.ok) {
          if (partnerToPair) {
            scannerAudio.playPairSuccess();
            toast.success(
              `✨ Paired & Advanced POS #${matchedItem.posNo || matchedItem.itemCode} from Pairing ➔ ${nextStage}!`
            );
          } else {
            if (matchedItem.glassCategory === "DGU" || isDguGlass(matchedItem)) {
              scannerAudio.playPairSuccess();
            } else {
              scannerAudio.playSuccess();
            }
            const nextStageLabel = nextStage === "Pairing"
              ? "➔ Glass Pairing Buffer (Queued for 1+1 pairing before DGU/Lamination)"
              : nextStage === "Finished"
                ? "➔ Finished Warehouse (Quality Inspected)"
                : `➔ ${nextStage}`;
            const posDisplay = matchedItem.posNo ? `POS #${matchedItem.posNo}` : (matchedItem.itemCode || "Glass Unit");
            toast.success(
              `🔫 Advanced ${posDisplay}${stickerLabel} from ${currentStage} ${nextStageLabel}!${remainingNote}`
            );
          }
          fetchData(true);
        } else {
          const err = await res.json().catch(() => ({}));
          scannerAudio.playWarning();
          toast.warning(err.message || `Could not advance POS #${matchedItem.posNo || matchedItem.itemCode}`);
          fetchData(true);
        }
      } catch (err: any) {
        scannerAudio.playError();
        toast.error(err.message || `Error advancing scanned item`);
        fetchData(true);
      } finally {
        isGlobalScanningRef.current = false;
      }
    },
    [scanModalOpen, items, autoAdvanceMode, user, userRole, currentWorkstationStage, getAuthHeaders, handleOptimisticAdvance, fetchData]
  );

  useBarcodeScanner({
    enabled: true,
    duplicateCooldownMs: 1800,
    onScan: handleGlobalScan,
  });

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const clearBatchesCount = useMemo(() => pis.filter((p) => p.colorOrClear !== "Colour").length, [pis]);
  const colourBatchesCount = useMemo(() => pis.filter((p) => p.colorOrClear === "Colour").length, [pis]);

  // ponytail: Pre-index items strictly by batch identifier (piId / piNumber) without duplicates
  const batchItemsLookup = useMemo(() => {
    const map = new Map<string, GlassItem[]>();
    items.forEach((item) => {
      const keys = new Set<string>();
      if (item.piId) {
        keys.add(item.piId.toLowerCase().trim());
        keys.add(item.piId.replace(/^STK-/i, "").toLowerCase().trim());
      }
      if (item.piNumber) {
        keys.add(item.piNumber.toLowerCase().trim());
        keys.add(item.piNumber.replace(/^STK-/i, "").toLowerCase().trim());
      }

      keys.forEach((k) => {
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(item);
      });
    });
    return map;
  }, [items]);

  const getBatchMetrics = useCallback((pi: PIMaster) => {
    const cleanId = (pi.id || "").replace(/^STK-/i, "").toLowerCase().trim();
    const cleanPiNo = (pi.piNumber || "").replace(/^STK-/i, "").toLowerCase().trim();
    const piIdLower = (pi.id || "").toLowerCase().trim();
    const piNoLower = (pi.piNumber || "").toLowerCase().trim();

    const batchItems =
      (piIdLower && batchItemsLookup.get(piIdLower)) ||
      (cleanId && batchItemsLookup.get(cleanId)) ||
      (piNoLower && batchItemsLookup.get(piNoLower)) ||
      (cleanPiNo && batchItemsLookup.get(cleanPiNo)) ||
      [];

    if (batchItems.length > 0) {
      const totalPieces = batchItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const completedPieces = batchItems
        .filter((i) => i.status === "Completed" || i.currentStage === "Finished" || isDispatchedItem(i))
        .reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const totalSqm = batchItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);

      const inCutting = batchItems.filter((i) => i.currentStage === "Cutting" && !i.completedStages?.includes("Cutting")).length;
      const inPolishing = batchItems.filter((i) => i.currentStage?.toLowerCase() === "polishing").length;
      const inPairing = batchItems.filter((i) => i.currentStage === "Pairing").length;
      const inLamination = batchItems.filter((i) => i.currentStage === "Lamination").length;
      const inDgu = batchItems.filter((i) => i.currentStage === "DGU").length;
      const inFinished = completedPieces;

      const isCompleted = totalPieces > 0 && completedPieces >= totalPieces;
      const isPending = completedPieces === 0 && batchItems.every((i) => i.currentStage === "Cutting" && !i.completedStages?.length);
      const status = isCompleted ? "Completed" : isPending ? (pi.status === "Pending" ? "Pending" : "In Production") : "In Production";

      // Calculate primary active stage
      let activeStageName = "Cutting Workstation";
      let activeStageTab: "cutting" | "polishing" | "pairing" | "lamination" | "dgu" | "finished" = "cutting";
      let activeStageBadgeClass = "bg-purple-100 text-purple-800 border-purple-200";

      if (inFinished > 0 && inFinished === totalPieces) {
        const allDispatched = batchItems.every((i) => isDispatchedItem(i));
        activeStageName = allDispatched ? "Dispatched" : "Finished Warehouse";
        activeStageTab = "finished";
        activeStageBadgeClass = allDispatched ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-emerald-100 text-emerald-800 border-emerald-200";
      } else if (inDgu > 0) {
        activeStageName = `DLGU / IGU (${inDgu} pcs)`;
        activeStageTab = "dgu";
        activeStageBadgeClass = "bg-teal-100 text-teal-800 border-teal-200";
      } else if (inLamination > 0) {
        activeStageName = `Lamination (${inLamination} pcs)`;
        activeStageTab = "lamination";
        activeStageBadgeClass = "bg-amber-100 text-amber-800 border-amber-200";
      } else if (inPairing > 0) {
        activeStageName = `Pairing Buffer (${inPairing} pcs)`;
        activeStageTab = "pairing";
        activeStageBadgeClass = "bg-blue-100 text-blue-800 border-blue-200";
      } else if (inPolishing > 0) {
        activeStageName = `Polishing (${inPolishing} pcs)`;
        activeStageTab = "polishing";
        activeStageBadgeClass = "bg-cyan-100 text-cyan-800 border-cyan-200";
      } else {
        activeStageName = `Cutting (${inCutting || totalPieces} pcs)`;
        activeStageTab = "cutting";
        activeStageBadgeClass = "bg-purple-100 text-purple-800 border-purple-200";
      }

      const progressPct = totalPieces > 0 ? Math.round((completedPieces / totalPieces) * 100) : 0;

      return {
        totalPieces,
        completedPieces,
        totalSqm,
        status,
        inCutting,
        inPolishing,
        inPairing,
        inLamination,
        inDgu,
        inFinished,
        activeStageName,
        activeStageTab,
        activeStageBadgeClass,
        progressPct,
      };
    }

    const isCompleted = (pi.completedItemsCount || 0) >= (pi.totalQty || pi.itemsCount || 1) && (pi.itemsCount || 0) > 0;
    return {
      totalPieces: pi.totalQty || pi.itemsCount || 0,
      completedPieces: pi.completedItemsCount || 0,
      totalSqm: pi.totalSqm || 0,
      status: isCompleted ? "Completed" : (pi.status || "Pending"),
      inCutting: 0,
      inPolishing: 0,
      inPairing: 0,
      inLamination: 0,
      inDgu: 0,
      inFinished: 0,
      activeStageName: "Cutting Workstation",
      activeStageTab: "cutting" as const,
      activeStageBadgeClass: "bg-purple-100 text-purple-800 border-purple-200",
      progressPct: 0,
    };
  }, [batchItemsLookup]);

  const uploadedPdfsSummary = React.useMemo(() => {
    const map = new Map<string, {
      fileName: string;
      batches: PIMaster[];
      totalPieces: number;
      completedPieces: number;
      totalSqm: number;
      customers: string[];
      projects: string[];
      uploadedAt: string;
      finish: "Clear" | "Colour" | "Mixed";
    }>();

    pis.forEach((pi) => {
      const rawFileName = pi.fileName || (pi.jobOrderNumber ? `${pi.jobOrderNumber}.pdf` : `${pi.piNumber}.pdf`);
      const key = rawFileName.trim().toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          fileName: pi.fileName || rawFileName,
          batches: [],
          totalPieces: 0,
          completedPieces: 0,
          totalSqm: 0,
          customers: [],
          projects: [],
          uploadedAt: pi.createdAt || pi.issueDate || "",
          finish: pi.colorOrClear === "Colour" ? "Colour" : "Clear",
        });
      }

      const entry = map.get(key)!;
      entry.batches.push(pi);
      const metrics = getBatchMetrics(pi);
      entry.totalPieces += metrics.totalPieces;
      entry.completedPieces += metrics.completedPieces;
      entry.totalSqm += metrics.totalSqm;

      const cust = (pi.customerName || "").trim();
      if (cust && !entry.customers.includes(cust)) {
        entry.customers.push(cust);
      }
      const proj = (pi.projectName || "").trim();
      if (proj && !entry.projects.includes(proj)) {
        entry.projects.push(proj);
      }

      if (entry.finish !== "Mixed") {
        if ((pi.colorOrClear === "Colour" && entry.finish === "Clear") || (pi.colorOrClear !== "Colour" && entry.finish === "Colour")) {
          entry.finish = "Mixed";
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { sensitivity: "base" }));
  }, [pis, getBatchMetrics]);

  const totalUploadedPdfs = uploadedPdfsSummary.length;
  const clearPdfCount = uploadedPdfsSummary.filter((p) => p.finish === "Clear").length;
  const colourPdfCount = uploadedPdfsSummary.filter((p) => p.finish === "Colour" || p.finish === "Mixed").length;

  const sortedAndFilteredPIs = useMemo(() => {
    return [...pis]
      .filter((pi) => {
        if (piFinishFilter === "CLEAR" && pi.colorOrClear === "Colour") return false;
        if (piFinishFilter === "COLOUR" && pi.colorOrClear !== "Colour") return false;

        if (selectedPdfFilter !== "ALL") {
          const pFileName = (pi.fileName || (pi.jobOrderNumber ? `${pi.jobOrderNumber}.pdf` : `${pi.piNumber}.pdf`)).trim().toLowerCase();
          if (pFileName !== selectedPdfFilter.trim().toLowerCase()) return false;
        }

        if (!piSearchTerm.trim()) return true;
        const rawQuery = piSearchTerm.toLowerCase().trim();
        const terms = rawQuery.split(/\s+/).filter(Boolean);
        return terms.every((term) => {
          const cleanTerm = term
            .replace(/^[#]/, "")
            .replace(/^pi[-_ ]?/i, "")
            .replace(/^batch[-_ ]?/i, "");

          return (
            (pi.piNumber && pi.piNumber.toLowerCase().includes(term)) ||
            (pi.proformaInvNo && pi.proformaInvNo.toLowerCase().includes(term)) ||
            (Boolean(cleanTerm) && pi.piNumber && pi.piNumber.toLowerCase().includes(cleanTerm)) ||
            (pi.customerName && pi.customerName.toLowerCase().includes(term)) ||
            (pi.projectName && pi.projectName.toLowerCase().includes(term)) ||
            (pi.batchNo && pi.batchNo.toLowerCase().includes(term)) ||
            (Boolean(cleanTerm) && pi.batchNo && pi.batchNo.toLowerCase().includes(cleanTerm)) ||
            (pi.glassDescription && pi.glassDescription.toLowerCase().includes(term)) ||
            (pi.jobOrderNumber && pi.jobOrderNumber.toLowerCase().includes(term)) ||
            (pi.colorOrClear && pi.colorOrClear.toLowerCase() === term)
          );
        });
      })
      .sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();
        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return String(a.id || "").localeCompare(String(b.id || ""));
      });
  }, [pis, piFinishFilter, selectedPdfFilter, piSearchTerm, sortField, sortOrder]);

  const totalPages = Math.ceil(sortedAndFilteredPIs.length / pageSize) || 1;
  const paginatedPIs = sortedAndFilteredPIs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Customer Grouped View States & Memoization (Separated by Customer & Project)
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});

  const toggleCustomerExpanded = (key: string) => {
    setExpandedCustomers((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isCustomerExpanded = (key: string) => {
    return Boolean(expandedCustomers[key]);
  };

  const setAllCustomersExpanded = (expand: boolean) => {
    const newState: Record<string, boolean> = {};
    groupedCustomerData.forEach((g) => {
      newState[g.groupKey] = expand;
    });
    setExpandedCustomers(newState);
  };

  const groupedCustomerData = React.useMemo(() => {
    const map = new Map<string, { customerName: string; projectName: string; batches: PIMaster[] }>();

    sortedAndFilteredPIs.forEach((pi) => {
      const cust = (pi.customerName || "Unassigned Customer").trim();
      const proj = (pi.projectName || "").trim();
      // Separate batches by Customer AND Project so distinct projects are never mixed together
      const groupKey = proj ? `${cust}:::${proj}` : `${cust}:::(No Project)`;
      if (!map.has(groupKey)) {
        map.set(groupKey, { customerName: cust, projectName: proj, batches: [] });
      }
      map.get(groupKey)!.batches.push(pi);
    });

    const groups: Array<{
      groupKey: string;
      customerName: string;
      projectName: string;
      batches: PIMaster[];
      totalBatches: number;
      totalUnits: number;
      completedUnits: number;
      totalPieces: number;
      completedPieces: number;
      totalSqm: number;
      inCutting: number;
      inPolishing: number;
      inPairing: number;
      inLamination: number;
      inDgu: number;
      inFinished: number;
      progressPct: number;
      hasColour: boolean;
      hasClear: boolean;
      projects: string[];
      pdfFiles: string[];
      status: "Completed" | "In Production" | "Pending";
      earliestDate: string;
      latestDate: string;
    }> = [];

    map.forEach(({ customerName, projectName, batches }, groupKey) => {
      let totalPieces = 0;
      let completedPieces = 0;
      let totalSqm = 0;
      let inCutting = 0;
      let inPolishing = 0;
      let inPairing = 0;
      let inLamination = 0;
      let inDgu = 0;
      let inFinished = 0;
      let hasColour = false;
      let hasClear = false;
      const projectsSet = new Set<string>();
      const pdfFilesSet = new Set<string>();
      if (projectName) projectsSet.add(projectName);

      const customerItems: GlassItem[] = [];

      batches.forEach((pi) => {
        const rawFileName = pi.fileName || (pi.jobOrderNumber ? `${pi.jobOrderNumber}.pdf` : `${pi.piNumber}.pdf`);
        if (rawFileName) pdfFilesSet.add(rawFileName);

        const cleanId = (pi.id || "").replace(/^STK-/i, "").toLowerCase().trim();
        const cleanPiNo = (pi.piNumber || "").replace(/^STK-/i, "").toLowerCase().trim();
        const piIdLower = (pi.id || "").toLowerCase().trim();
        const piNoLower = (pi.piNumber || "").toLowerCase().trim();

        const bItems =
          (piIdLower && batchItemsLookup.get(piIdLower)) ||
          (cleanId && batchItemsLookup.get(cleanId)) ||
          (piNoLower && batchItemsLookup.get(piNoLower)) ||
          (cleanPiNo && batchItemsLookup.get(cleanPiNo)) ||
          [];
        customerItems.push(...bItems);

        const metrics = getBatchMetrics(pi);
        totalPieces += metrics.totalPieces;
        completedPieces += metrics.completedPieces;
        totalSqm += metrics.totalSqm;

        const isCol = pi.colorOrClear === "Colour" || pi.finish === "Colour";
        if (isCol) hasColour = true;
        else hasClear = true;

        inCutting += metrics.inCutting;
        inPolishing += metrics.inPolishing;
        inPairing += metrics.inPairing;
        inLamination += metrics.inLamination;
        inDgu += metrics.inDgu;
        inFinished += metrics.inFinished;

        if (pi.projectName) projectsSet.add(pi.projectName);
      });

      const uniqueCustItems = Array.from(new Map(customerItems.map((i) => [i.id, i])).values());
      const custUnitMetrics = calculateAssembledUnits(uniqueCustItems);
      const totalUnits = custUnitMetrics.totalUnits > 0 ? custUnitMetrics.totalUnits : totalPieces;
      const completedCustItems = uniqueCustItems.filter(
        (i) => i.status === "Completed" || i.currentStage === "Finished" || isDispatchedItem(i)
      );
      const completedUnits = calculateAssembledUnits(completedCustItems).totalUnits;

      const progressPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : (totalPieces > 0 ? Math.round((completedPieces / totalPieces) * 100) : 0);
      const isCompleted = (totalUnits > 0 && completedUnits >= totalUnits) || (totalPieces > 0 && completedPieces >= totalPieces);
      const isPending = completedPieces === 0 && inCutting === totalPieces;
      const status: "Completed" | "In Production" | "Pending" = isCompleted ? "Completed" : isPending ? "Pending" : "In Production";

      groups.push({
        groupKey,
        customerName,
        projectName,
        batches,
        pdfFiles: Array.from(pdfFilesSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
        totalBatches: batches.length,
        totalUnits,
        completedUnits,
        totalPieces,
        completedPieces,
        totalSqm,
        inCutting,
        inPolishing,
        inPairing,
        inLamination,
        inDgu,
        inFinished,
        progressPct,
        hasColour,
        hasClear,
        projects: Array.from(projectsSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
        status,
        earliestDate: batches[batches.length - 1]?.createdAt || batches[batches.length - 1]?.issueDate || "",
        latestDate: batches[0]?.createdAt || batches[0]?.issueDate || "",
      });
    });

    // Stable sort customer groups so they NEVER jump or change positions when batches are deleted
    groups.sort((a, b) => {
      const cComp = a.customerName.localeCompare(b.customerName, undefined, { sensitivity: "base" });
      if (cComp !== 0) return cComp;
      return a.projectName.localeCompare(b.projectName, undefined, { sensitivity: "base" });
    });

    // Stable sort batches inside each customer group by numeric batch number descending (newest batch first)
    groups.forEach((g) => {
      g.batches.sort((a, b) => {
        const numA = parseInt(String(a.batchNo || a.piNumber || "").replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(String(b.batchNo || b.piNumber || "").replace(/\D/g, ""), 10) || 0;
        if (numA !== numB) return numB - numA;
        return String(b.piNumber || "").localeCompare(String(a.piNumber || ""));
      });
    });

    return groups;
  }, [sortedAndFilteredPIs, items]);

  const renderSortIcon = (field: typeof sortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 inline" />;
    return sortOrder === "asc" ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-purple-600 inline font-bold" /> : <ChevronDown className="w-3.5 h-3.5 ml-1 text-purple-600 inline font-bold" />;
  };

  // Pipeline Overview States & Computations
  const [pipelineBatchSearch, setPipelineBatchSearch] = useState("");
  const [pipelineStageFilter, setPipelineStageFilter] = useState<"ALL" | "Cutting" | "Polishing" | "Pairing" | "DGU" | "Lamination" | "Finished">("ALL");

  const pipelineMetrics = React.useMemo(() => {
    const isColour = (i: GlassItem) => getItemFinish(i) === "Colour";

    const cuttingItems = items.filter((i) => !isDispatchedItem(i) && (i.currentStage?.toLowerCase() === "cutting" || (!i.currentStage && i.status !== "Rejected")) && i.status !== "Rejected");
    const polishingItems = items.filter((i) => !isDispatchedItem(i) && i.currentStage?.toLowerCase() === "polishing" && i.status !== "Rejected");
    const pairingItems = items.filter((i) => !isDispatchedItem(i) && i.currentStage?.toLowerCase() === "pairing" && i.status !== "Rejected");
    const dguItems = items.filter((i) => !isDispatchedItem(i) && i.currentStage?.toLowerCase() === "dgu" && i.status !== "Rejected" && i.status !== "Completed");
    const laminationItems = items.filter((i) => !isDispatchedItem(i) && i.currentStage?.toLowerCase() === "lamination" && i.status !== "Rejected");
    const finishedItems = items.filter((i) => !isDispatchedItem(i) && i.currentStage?.toLowerCase() === "finished" && i.status !== "Rejected");
    const dispatchedList = items.filter((i) => isDispatchedItem(i) && i.status !== "Rejected");
    const rejectedItems = items.filter((i) => i.status === "Rejected");
    const reworkItems = items.filter((i) => i.status === "Reworking");

    const totalItems = items.reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const cuttingCount = cuttingItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const polishingCount = polishingItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const dlguPhase2ClearPairingCount = Math.ceil(
      pairingItems.filter((i) => isDlguGlass(i) && !isColour(i) && (i.completedStages?.includes("Lamination") || i.dlguPhase === "DguPairing"))
        .reduce((acc, curr) => acc + (curr.qty || 1), 0) / 2
    );
    const otherPairingCount = pairingItems
      .filter((i) => !(isDlguGlass(i) && !isColour(i) && (i.completedStages?.includes("Lamination") || i.dlguPhase === "DguPairing")))
      .reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const pairingCount = dlguPhase2ClearPairingCount + otherPairingCount;
    const dguCount = dguItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const laminationCount = laminationItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const finishedCount = finishedItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const rejectedCount = rejectedItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const reworkCount = reworkItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);

    const totalSqm = items.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
    const cuttingSqm = cuttingItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
    const polishingSqm = polishingItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
    const pairingSqm = pairingItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
    const dguSqm = dguItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
    const laminationSqm = laminationItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
    const finishedSqm = finishedItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);

    const distinctCuttingSheets = new Set(cuttingItems.map((i) => i.rackNo || "1")).size;

    const cuttingColour = cuttingItems.filter(isColour).reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const cuttingClear = cuttingCount - cuttingColour;
    const polishingColour = polishingItems.filter(isColour).reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const polishingClear = polishingCount - polishingColour;

    const dguPairingItems = pairingItems.filter((i) => isDguGlass(i));
    const lamPairingItems = pairingItems.filter((i) => isLaminatedGlass(i));
    const dlguPairingItems = pairingItems.filter((i) => isDlguGlass(i));

    const pairingColour = dguPairingItems.filter(isColour).reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const pairingClear = dguPairingItems.filter((i) => !isColour(i)).reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const dguPairingPairs = Math.min(pairingColour, pairingClear);
    const lamPairingPairs = Math.floor(lamPairingItems.reduce((acc, curr) => acc + (curr.qty || 1), 0) / 2);
    const dlguPairingColour = dlguPairingItems.filter(isColour).reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const dlguPairingClearUnits = Math.ceil(
      dlguPairingItems.filter((i) => !isColour(i) && (i.completedStages?.includes("Lamination") || i.dlguPhase === "DguPairing"))
        .reduce((acc, curr) => acc + (curr.qty || 1), 0) / 2
    );
    const dlguPairingPairs = Math.min(dlguPairingColour, dlguPairingClearUnits);
    const pairingPairs = dguPairingPairs + lamPairingPairs + dlguPairingPairs;

    const dguColour = dguItems.filter(isColour).reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const dguClear = dguItems.filter((i) => !isColour(i)).reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const dguPairs = Math.min(dguColour, dguClear);

    // Helper to calculate assembled units for a list of items
    const calculateAssembledUnits = (itemList: typeof items) => {
      const dlguList = itemList.filter((i) => isDlguGlass(i));
      const pureDguList = itemList.filter((i) => isDguGlass(i) && !isDlguGlass(i));
      const nonDguList = itemList.filter((i) => !isDguGlass(i) && !isDlguGlass(i));

      const dlguCol = dlguList.filter(isColour).reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const dlguClr = dlguList.filter((i) => !isColour(i)).reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const dlguU = dlguCol > 0 && dlguClr > 0 ? Math.min(dlguCol, Math.floor(dlguClr / 2)) : Math.floor((dlguCol + dlguClr) / 3);

      const dguColPanes = pureDguList.filter(isColour).reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const dguClrPanes = pureDguList.filter((i) => !isColour(i)).reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const pureDguU = dguColPanes > 0 && dguClrPanes > 0 ? Math.min(dguColPanes, dguClrPanes) : (dguColPanes > 0 ? dguColPanes : Math.ceil(pureDguList.reduce((acc, curr) => acc + (curr.qty || 1), 0) / 2));

      const lamList = nonDguList.filter((i) => isLaminatedGlass(i) || i.glassCategory === "Lamination" || i.processRoute?.includes("Lamination"));
      const monoList = nonDguList.filter((i) => !isLaminatedGlass(i) && i.glassCategory !== "Lamination" && !i.processRoute?.includes("Lamination"));
      const lamU = Math.ceil(lamList.reduce((acc, curr) => acc + (curr.qty || 1), 0) / 2);
      const monoU = monoList.reduce((acc, curr) => acc + (curr.qty || 1), 0);

      const dguSqmTotal = dlguList.filter(isColour).reduce((acc, curr) => acc + (curr.sqm || 0), 0) +
        pureDguList.filter(isColour).reduce((acc, curr) => acc + (curr.sqm || 0), 0);
      const nonDguSqmTotal = nonDguList.reduce((acc, curr) => acc + (curr.sqm || 0), 0);

      return {
        totalUnits: dlguU + pureDguU + lamU + monoU,
        totalSqm: parseFloat((dguSqmTotal + nonDguSqmTotal).toFixed(2)),
      };
    };

    const allUnitsMetrics = calculateAssembledUnits(items);
    const totalUnits = allUnitsMetrics.totalUnits;
    const effectiveTotalSqm = allUnitsMetrics.totalSqm;

    const finishedMetrics = calculateAssembledUnits(finishedItems);
    const dispatchedMetrics = calculateAssembledUnits(dispatchedList);

    const finishedUnits = finishedMetrics.totalUnits;
    const effectiveFinishedSqm = finishedMetrics.totalSqm;
    const dispatchedUnits = dispatchedMetrics.totalUnits;

    const laminationUnits = Math.ceil(laminationCount / 2);
    const totalActive = cuttingCount + polishingCount + pairingCount + dguCount + laminationUnits + finishedUnits;
    const completionRate = totalActive > 0 ? Math.round((finishedUnits / totalActive) * 100) : 0;
    const yieldRate = totalItems > 0 ? (((totalItems - rejectedCount) / totalItems) * 100).toFixed(1) : "100.0";

    return {
      totalItems,
      totalUnits,
      effectiveTotalSqm,
      totalSqm,
      cuttingItems: cuttingCount,
      cuttingSqm,
      cuttingColour,
      cuttingClear,
      distinctCuttingSheets,
      polishingItems: polishingCount,
      polishingSqm,
      polishingColour,
      polishingClear,
      pairingItems: pairingCount,
      pairingSqm,
      pairingColour,
      pairingClear,
      pairingPairs,
      dguItems: dguCount,
      dguSqm,
      dguUnits: dguCount,
      dguColour,
      dguClear,
      dguPairs,
      laminationItems: laminationUnits,
      laminationPanes: laminationCount,
      laminationSqm,
      finishedItems: finishedUnits,
      finishedSqm: effectiveFinishedSqm,
      dispatchedItems: dispatchedUnits,
      rejectedItems: rejectedCount,
      reworkItems: reworkCount,
      completionRate,
      yieldRate,
    };
  }, [items]);

  const effectiveStats = React.useMemo(() => {
    const dguUnitsCount =
      pipelineMetrics.dguColour > 0
        ? pipelineMetrics.dguColour
        : pipelineMetrics.dguPairs;

    const uniqueStickerUploads = new Set(
      pis.map((p) => (p.customerName || "Unassigned Customer").trim()).filter(Boolean)
    ).size;

    return {
      totalPI: pis.length || (stats?.totalPI ?? 0),
      stickerUploadCount: pis.length > 0 ? uniqueStickerUploads : (stats?.stickerUploadCount ?? 0),
      pendingPI: pis.filter((p) => p.status === "Pending" || p.status === "In Production").length || (stats?.pendingPI ?? 0),
      completedPI: pis.filter((p) => p.status === "Completed").length || (stats?.completedPI ?? 0),
      pendingCutting: pipelineMetrics.cuttingItems,
      pendingPolishing: pipelineMetrics.polishingItems !== undefined ? pipelineMetrics.polishingItems : (stats?.pendingPolishing ?? 0),
      pendingPairing: pipelineMetrics.pairingItems,
      pendingDGU: dguUnitsCount,
      pendingLamination: pipelineMetrics.laminationItems,
      finishedItems: pipelineMetrics.finishedItems,
      dispatchedItems: stats?.dispatchedItems !== undefined ? stats.dispatchedItems : pipelineMetrics.dispatchedItems,
      totalCompletedItems: pipelineMetrics.finishedItems + (stats?.dispatchedItems !== undefined ? stats.dispatchedItems : pipelineMetrics.dispatchedItems),
      rejectItems: pipelineMetrics.rejectedItems,
      reworkItems: pipelineMetrics.reworkItems,
    };
  }, [stats, pis, pipelineMetrics]);

  const pipelineBatches = React.useMemo(() => {
    const map = new Map<string, {
      id: string;
      piNumber: string;
      customerName: string;
      projectName: string;
      jobOrderNumber: string;
      sfoNo: string;
      items: GlassItem[];
      cuttingCount: number;
      polishingCount: number;
      pairingCount: number;
      dguCount: number;
      laminationCount: number;
      finishedCount: number;
      totalSqm: number;
      finish: "Clear" | "Colour";
      primaryStage: "Cutting" | "Polishing" | "Pairing" | "DGU" | "Lamination" | "Finished";
      progress: number;
    }>();

    items.forEach((item) => {
      const key = item.piId || item.piNumber || item.batchNo || "default";
      const parentPI = pis.find((p) => p.id === item.piId || p.piNumber === item.piNumber);
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          piNumber: (item.piNumber || parentPI?.piNumber || `BATCH-${item.batchNo || "1"}`).replace(/^STK-/i, ""),
          customerName: parentPI?.customerName || (item as any).customerName || (item as any).clientName || "Customer",
          projectName: parentPI?.projectName || (item as any).projectName || item.sectionName || "Project",
          jobOrderNumber: parentPI?.jobOrderNumber || item.orderNo || item.sfoNo || "",
          sfoNo: item.sfoNo || parentPI?.sfoNo || "",
          items: [],
          cuttingCount: 0,
          polishingCount: 0,
          pairingCount: 0,
          dguCount: 0,
          laminationCount: 0,
          finishedCount: 0,
          totalSqm: 0,
          finish: "Clear",
          primaryStage: "Cutting",
          progress: 0,
        });
      }
      const b = map.get(key)!;
      b.items.push(item);
      b.totalSqm += (item.sqm || 0);

      const st = item.currentStage?.toLowerCase();
      const itemPieces = item.qty || 1;
      if (isDispatchedItem(item)) {
        // Dispatched items belong strictly in Dispatched History
      } else if (st === "cutting" || (!item.currentStage && item.status !== "Rejected")) b.cuttingCount += itemPieces;
      else if (st === "polishing") b.polishingCount += itemPieces;
      else if (st === "pairing") b.pairingCount += itemPieces;
      else if (st === "dgu") b.dguCount += itemPieces;
      else if (st === "lamination") b.laminationCount += itemPieces;
      else if (st === "finished") b.finishedCount += itemPieces;
    });

    // Also include any PIs without direct items
    pis.forEach((p) => {
      if (!map.has(p.id) && !map.has(p.piNumber)) {
        map.set(p.id, {
          id: p.id,
          piNumber: (p.piNumber || "").replace(/^STK-/i, ""),
          customerName: p.customerName || "Customer",
          projectName: p.projectName || "Project",
          jobOrderNumber: p.jobOrderNumber || p.sfoNo || "",
          sfoNo: p.sfoNo || "",
          items: [],
          cuttingCount: p.totalQty || p.itemsCount || 0,
          polishingCount: 0,
          pairingCount: 0,
          dguCount: 0,
          laminationCount: 0,
          finishedCount: p.completedItemsCount || 0,
          totalSqm: p.totalSqm || 0,
          finish: p.colorOrClear === "Colour" ? "Colour" : "Clear",
          primaryStage: "Cutting",
          progress: (p.totalQty || p.itemsCount) ? Math.round(((p.completedItemsCount || 0) / (p.totalQty || p.itemsCount)) * 100) : 0,
        });
      }
    });

    return Array.from(map.values()).map((b) => {
      const parentPI = pis.find((p) => p.id === b.id || p.piNumber === b.piNumber);
      const clearCount = b.items.filter((i) => getItemFinish(i) === "Clear").reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const colourCount = b.items.filter((i) => getItemFinish(i) === "Colour").reduce((acc, curr) => acc + (curr.qty || 1), 0);

      const isColour =
        parentPI?.colorOrClear === "Colour" ||
        (parentPI as any)?.category?.toLowerCase().includes("colour") ||
        (parentPI as any)?.category?.toLowerCase().includes("color") ||
        colourCount > 0 ||
        b.items.some((i) => i.colorOrClear === "Colour" || getItemFinish(i) === "Colour");

      const finish: "Clear" | "Colour" = isColour ? "Colour" : "Clear";

      let primaryStage: "Cutting" | "Polishing" | "Pairing" | "DGU" | "Lamination" | "Finished" = "Cutting";
      if (b.cuttingCount > 0) primaryStage = "Cutting";
      else if (b.polishingCount > 0) primaryStage = "Polishing";
      else if (b.pairingCount > 0) primaryStage = "Pairing";
      else if (b.dguCount > 0) primaryStage = "DGU";
      else if (b.laminationCount > 0) primaryStage = "Lamination";
      else if (b.finishedCount > 0) primaryStage = "Finished";

      const totalPieces = b.items.reduce((acc, curr) => acc + (curr.qty || 1), 0) || parentPI?.totalQty || parentPI?.itemsCount || 1;
      const progress = Math.round((b.finishedCount / totalPieces) * 100);

      return {
        ...b,
        finish,
        primaryStage,
        progress,
      };
    });
  }, [items, pis]);

  const filteredPipelineBatches = React.useMemo(() => {
    return pipelineBatches.filter((b) => {
      if (pipelineStageFilter !== "ALL" && b.primaryStage !== pipelineStageFilter) {
        if (pipelineStageFilter === "Cutting" && b.cuttingCount === 0) return false;
        if (pipelineStageFilter === "Polishing" && b.polishingCount === 0) return false;
        if (pipelineStageFilter === "DGU" && b.dguCount === 0) return false;
        if (pipelineStageFilter === "Lamination" && b.laminationCount === 0) return false;
        if (pipelineStageFilter === "Finished" && b.finishedCount === 0) return false;
      }
      const q = pipelineBatchSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        b.piNumber.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        b.projectName.toLowerCase().includes(q) ||
        b.jobOrderNumber.toLowerCase().includes(q) ||
        b.sfoNo.toLowerCase().includes(q)
      );
    });
  }, [pipelineBatches, pipelineStageFilter, pipelineBatchSearch]);


  return (
    <div className="h-screen bg-[#f8fafc] text-slate-900 flex font-sans overflow-hidden">
      {/* Left Navigation Sidebar (Full Height & Responsive Mobile Drawer) */}
      <AppSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activeTab={activeTab}
        setActiveTab={(tab) => setActiveTab(tab as any)}
        stats={effectiveStats}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="shrink-0 bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between z-30 shadow-xs relative">
          {/* Left Side: Menu Toggle & Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Toggle Sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="hidden md:block pl-2 border-l border-slate-200 ml-1">
              <h1 className="font-extrabold text-sm tracking-tight text-slate-900 leading-none uppercase">
                SEJAL GLASS PRODUCTION OPERATIONS
              </h1>
              <p className="text-[11px] text-slate-500 font-medium leading-tight">
                Architectural Glass Processing & Shop Floor Execution System
              </p>
            </div>
          </div>

          {/* Right Side: Scanner Gun Status, Weather, Notifications & User Profile */}
          <div className="flex items-center gap-3">
            {/* Hardware Barcode Scanner Gun Status Controller */}
            <ScannerStatusWidget
              autoAdvance={autoAdvanceMode}
              onToggleAutoAdvance={handleToggleAutoAdvance}
              lastScannedCode={lastScannedCode}
              lastScannedTime={lastScannedTime}
              currentStage={currentWorkstationStage}
              onOpenScanModal={() => {
                setScanInitialCode("");
                setScanModalOpen(true);
              }}
              onSimulateScan={(testCode) => {
                handleGlobalScan(testCode);
              }}
            />

            {/* Weather & Clock Chip: two-line stacked matching reference */}
            <div className="hidden lg:flex items-center gap-3">
              {/* Weather */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs font-semibold text-amber-800 shadow-2xs select-none">
                <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <div className="flex flex-col leading-none">
                  <span className="font-black text-slate-800 text-[12px]">36°C</span>
                  <span className="text-[9.5px] text-slate-500 font-medium">Dubai, UAE</span>
                </div>
              </div>
              {/* Date & Time */}
              <DubaiClock />
            </div>

            <div className="flex items-center gap-3 relative">
              {/* Notifications Popover */}
              <div className="relative" ref={notificationsRef}>
                <button
                  onClick={() => {
                    setNotificationsOpen((prev) => !prev);
                    setUserMenuOpen(false);
                  }}
                  className="relative p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer flex items-center justify-center border border-slate-200/80 bg-white shadow-2xs"
                  title="Notifications"
                >
                  <Bell className="w-5 h-5 text-slate-700" strokeWidth={2.2} />
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-[#e31e24] text-white text-[10px] font-black flex items-center justify-center shadow-xs border-2 border-white pointer-events-none">
                      {unreadNotifications}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-88 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="font-extrabold text-xs text-slate-900 tracking-tight">System Notifications</div>
                        <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Live
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {unreadNotifications > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAllNotificationsRead();
                            }}
                            className="text-[10.5px] text-blue-700 font-bold hover:text-blue-900 transition-colors"
                          >
                            Mark all read
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearAllNotifications();
                            }}
                            className="text-[10.5px] text-slate-400 font-bold hover:text-rose-500 transition-colors"
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Filter chips */}
                    <div className="flex items-center gap-1 mb-2.5 pb-2 border-b border-slate-100">
                      <button
                        onClick={() => setNotificationFilter("all")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${notificationFilter === "all"
                            ? "bg-[#1a3a6b] text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                      >
                        All ({notifications.length})
                      </button>
                      <button
                        onClick={() => setNotificationFilter("unread")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${notificationFilter === "unread"
                            ? "bg-[#1a3a6b] text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                      >
                        Unread ({unreadNotifications})
                      </button>
                      <button
                        onClick={() => setNotificationFilter("alerts")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${notificationFilter === "alerts"
                            ? "bg-[#1a3a6b] text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                      >
                        Alerts ({notifications.filter((n) => n.type === "warning" || n.type === "destructive").length})
                      </button>
                    </div>

                    <div className="space-y-2 text-xs max-h-80 overflow-y-auto pr-0.5">
                      {(() => {
                        const filtered = notifications.filter((n) => {
                          if (notificationFilter === "unread") return !n.read;
                          if (notificationFilter === "alerts") return n.type === "warning" || n.type === "destructive";
                          return true;
                        });

                        if (filtered.length === 0) {
                          return (
                            <div className="py-8 text-center text-[11px] text-slate-400 font-medium flex flex-col items-center justify-center gap-1.5">
                              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
                                <Bell className="w-4 h-4" />
                              </div>
                              <span className="font-semibold text-slate-600">No {notificationFilter !== "all" ? `${notificationFilter} ` : ""}notifications</span>
                              <span className="text-[10px] text-slate-400 max-w-[200px]">Live shop floor actions will appear here automatically in real time.</span>
                            </div>
                          );
                        }

                        return filtered.map((n) => {
                          const isDestructive = n.type === "destructive";
                          const isWarning = n.type === "warning";
                          const isSuccess = n.type === "success";

                          return (
                            <div
                              key={n.id}
                              onClick={() => handleMarkNotificationRead(n.id)}
                              className={`relative p-2.5 pl-3 pr-7 rounded-xl border transition-all cursor-pointer ${isDestructive
                                  ? "bg-rose-50/70 border-rose-200 hover:bg-rose-50"
                                  : isWarning
                                    ? "bg-amber-50/70 border-amber-200 hover:bg-amber-50"
                                    : isSuccess
                                      ? "bg-emerald-50/70 border-emerald-200 hover:bg-emerald-50"
                                      : "bg-blue-50/70 border-blue-200 hover:bg-blue-50"
                                } ${!n.read ? "ring-2 ring-blue-500/20 shadow-xs" : "opacity-85"}`}
                            >
                              {/* Dismiss button */}
                              <button
                                onClick={(e) => handleDeleteNotification(n.id, e)}
                                className="absolute top-2 right-2 text-slate-400 hover:text-slate-700 transition-colors rounded p-0.5 hover:bg-white/80"
                                title="Dismiss"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>

                              <div className="flex items-start gap-2">
                                <div className="mt-0.5 shrink-0">
                                  {isDestructive && <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                                  {isWarning && <AlertCircle className="w-3.5 h-3.5 text-amber-600" />}
                                  {isSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                                  {!isDestructive && !isWarning && !isSuccess && <Sparkles className="w-3.5 h-3.5 text-[#1a3a6b]" />}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <div
                                      className={`font-bold text-[11px] truncate ${isDestructive
                                          ? "text-rose-950"
                                          : isWarning
                                            ? "text-amber-950"
                                            : isSuccess
                                              ? "text-emerald-950"
                                              : "text-blue-950"
                                        }`}
                                    >
                                      {n.title}
                                    </div>
                                    {!n.read && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#1a3a6b] shrink-0" />
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                                    {n.message}
                                  </div>
                                  <div className="text-[9px] text-slate-400 mt-1 font-mono flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5 text-slate-400" />
                                    {formatNotificationTime(n.timestamp || n.createdAt)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* User Profile Popover */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => {
                    setUserMenuOpen((prev) => !prev);
                    setNotificationsOpen(false);
                  }}
                  className="flex items-center gap-2 pl-2 border-l border-slate-200 hover:opacity-80 transition-opacity text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-[#1a3a6b] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                    {user?.name ? user.name.charAt(0).toUpperCase() : userRole === "Admin" ? "A" : "U"}
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-xs font-bold text-slate-900 leading-tight flex items-center gap-1">
                      {user?.name || (userRole === "Admin" ? "Administrator" : "User")} <ChevronDown className="w-3 h-3 text-slate-400" />
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium leading-tight">
                      {userRole === "Admin"
                        ? "Administrator"
                        : user?.assignedStages && user.assignedStages.length > 0
                        ? user.assignedStages.join(", ")
                        : userRole === "Supervisor"
                        ? "Plant Floor Access"
                        : "Workstation Access"}
                    </div>
                  </div>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/60 rounded-lg mb-1">
                      <div className="font-bold text-xs text-slate-900">{user?.name || (userRole === "Admin" ? "Administrator" : "User")}</div>
                      <div className="text-[11px] text-slate-500 truncate">{user?.email || (userRole === "Admin" ? "admin@sejalglass.com" : user?.username ? `${user.username}@sejalglass.com` : "user@sejalglass.com")}</div>
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        {userRole === "Admin" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            Administrator Account
                          </span>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              Assigned Access
                            </span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {user?.assignedStages && user.assignedStages.length > 0
                                ? user.assignedStages.join(" • ")
                                : userRole === "Supervisor"
                                ? "Full Plant Access"
                                : "All Workstations"}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="py-1 text-xs space-y-0.5">
                      {userRole === "Admin" && (
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            handleClearDatabase();
                          }}
                          className="w-full text-left px-3 py-1.5 rounded-lg text-amber-700 hover:bg-amber-50 font-medium flex items-center gap-2 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-amber-600" /> Clear System Database
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          window.open("https://sejalglass.com", "_blank", "noopener,noreferrer");
                        }}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 font-medium flex items-center justify-between transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-blue-600" /> Sejal Glass Website
                        </div>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </button>

                      <button
                        onClick={async () => {
                          setUserMenuOpen(false);
                          await logout();
                          toast.success("Signed out successfully");
                          navigate("/login");
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 font-bold flex items-center gap-2 transition-all border-t border-slate-100 mt-1 pt-2"
                      >
                        <LogOut className="w-3.5 h-3.5 text-red-600" /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Layout Container */}
        <div className="flex-1 flex overflow-hidden">

          {/* Main Workspace Body */}
          <main className={`flex-1 overflow-y-auto bg-[#f8fafc] ${activeTab === "overview" ? "" : activeTab === "settings" ? "p-2 sm:p-3 space-y-2" : "p-4 sm:p-5 space-y-4"}`}>
            {/* TAB: OVERVIEW DASHBOARD */}
            {activeTab === "overview" && (() => {
              const now = new Date();
              const todayDubaiStr = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
              const todayIsoDubai = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

              const filteredSummaryItems = items.filter((item) => {
                if (summaryTimeFilter === "All") return true;

                const rawDate = item.optDate || item.delDate || item.updatedAt || (item as any).createdAt || "";
                const formattedItemDate = item.updatedAt ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(item.updatedAt)) : "";
                const isoItemDate = item.updatedAt ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.updatedAt)) : "";

                const isToday =
                  rawDate.includes(todayDubaiStr) ||
                  rawDate.includes(todayIsoDubai) ||
                  formattedItemDate === todayDubaiStr ||
                  isoItemDate === todayIsoDubai ||
                  Boolean(item.dispatchedAt && item.dispatchedAt.startsWith(todayIsoDubai));

                if (summaryTimeFilter === "Today") {
                  return isToday || (!isDispatchedItem(item) && item.currentStage !== "Finished");
                }

                if (summaryTimeFilter === "Week") {
                  const itemTime = item.updatedAt ? new Date(item.updatedAt).getTime() : now.getTime();
                  const diffDays = Math.abs(now.getTime() - itemTime) / (1000 * 60 * 60 * 24);
                  return diffDays <= 7 || (!isDispatchedItem(item) && item.currentStage !== "Finished");
                }

                if (summaryTimeFilter === "Month") {
                  const itemTime = item.updatedAt ? new Date(item.updatedAt).getTime() : now.getTime();
                  const diffDays = Math.abs(now.getTime() - itemTime) / (1000 * 60 * 60 * 24);
                  return diffDays <= 30 || (!isDispatchedItem(item) && item.currentStage !== "Finished");
                }

                return true;
              });

              const rejectedSummaryItems = filteredSummaryItems.filter((i) => i.status === "Rejected");
              const completedSummaryItems = filteredSummaryItems.filter(
                (i) => i.status !== "Rejected" && (i.status === "Completed" || i.currentStage === "Finished" || isDispatchedItem(i))
              );
              const inProgressSummaryItems = filteredSummaryItems.filter(
                (i) =>
                  i.status !== "Rejected" &&
                  !completedSummaryItems.some((c) => c.id === i.id) &&
                  (i.status === "In Production" ||
                    i.status === "Reworking" ||
                    (i.completedStages && i.completedStages.length > 0) ||
                    (i.currentStage && i.currentStage !== "Cutting"))
              );
              const pendingSummaryItems = filteredSummaryItems.filter(
                (i) =>
                  i.status !== "Rejected" &&
                  !completedSummaryItems.some((c) => c.id === i.id) &&
                  !inProgressSummaryItems.some((p) => p.id === i.id)
              );

              const totalItems = filteredSummaryItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
              const completedItems = completedSummaryItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
              const inProgressItems = inProgressSummaryItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
              const pendingItems = pendingSummaryItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
              const rejectedItems = rejectedSummaryItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);

              const grandTotal = Math.max(1, totalItems);
              const completedPct = totalItems > 0 ? Math.round((completedItems / grandTotal) * 100) : 0;
              const inProgressPct = totalItems > 0 ? Math.round((inProgressItems / grandTotal) * 100) : 0;
              const pendingPct = totalItems > 0 ? Math.round((pendingItems / grandTotal) * 100) : 0;
              const rejectedPct = totalItems > 0 ? Math.round((rejectedItems / grandTotal) * 100) : 0;
              // Real dynamic Production Efficiency:
              // Measures actual progress across factory process routes:
              // Items finished/dispatched = 100% completed
              // Items in active stages = proportional to completed stages along their route
              const stageCompletedWork = filteredSummaryItems.reduce((acc, item) => {
                if (item.status === "Rejected") return acc;
                if (item.status === "Completed" || item.currentStage === "Finished" || isDispatchedItem(item)) {
                  return acc + (item.qty || 1);
                }
                const totalStages = Math.max(1, item.processRoute?.length || 2);
                const doneStages = item.completedStages?.length || (item.currentStage && item.currentStage !== "Cutting" ? 1 : 0);
                const progressFraction = Math.min(0.95, doneStages / totalStages);
                return acc + (item.qty || 1) * progressFraction;
              }, 0);

              const efficiencyRate = totalItems > 0
                ? Math.min(100, Math.max(0, Math.round((stageCompletedWork / totalItems) * 100)))
                : (completedItems > 0 ? 100 : 0);

              // Real dynamic On-Time Delivery:
              // Evaluates customer order deadlines vs current production fulfillment
              let onTimeCount = 0;
              let evaluatedCount = 0;

              filteredSummaryItems.forEach((item) => {
                const qty = item.qty || 1;
                evaluatedCount += qty;

                const targetDateStr = item.delDate || pis.find((p) => p.id === item.piId || p.piNumber === item.piNumber)?.deliveryDate;
                if (!targetDateStr) {
                  if (item.status !== "Rejected") {
                    onTimeCount += qty;
                  }
                  return;
                }

                const isOverdue = (() => {
                  try {
                    const parts = targetDateStr.split(/[\/\-\.]/);
                    let dueDate = null;
                    if (parts.length === 3) {
                      if (parts[0].length === 4) {
                        dueDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59);
                      } else {
                        dueDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), 23, 59, 59);
                      }
                    } else {
                      dueDate = new Date(targetDateStr);
                    }
                    if (dueDate && !isNaN(dueDate.getTime())) {
                      return now.getTime() > dueDate.getTime();
                    }
                  } catch { }
                  return false;
                })();

                const isDone = item.status === "Completed" || item.currentStage === "Finished" || isDispatchedItem(item);
                if (isDone || !isOverdue) {
                  onTimeCount += qty;
                }
              });

              const onTimeRate = evaluatedCount > 0
                ? Math.min(100, Math.max(0, Math.round((onTimeCount / evaluatedCount) * 100)))
                : 100;

              let donutGrad = "#e2e8f0";
              if (totalItems > 0) {
                if (completedPct === 100) {
                  donutGrad = "#10b981";
                } else if (inProgressPct === 100) {
                  donutGrad = "#3b82f6";
                } else if (pendingPct === 100) {
                  donutGrad = "#f59e0b";
                } else if (rejectedPct === 100) {
                  donutGrad = "#ef4444";
                } else {
                  donutGrad = `conic-gradient(#10b981 0 ${completedPct}%, #3b82f6 ${completedPct}% ${completedPct + inProgressPct}%, #f59e0b ${completedPct + inProgressPct}% ${completedPct + inProgressPct + pendingPct}%, #ef4444 ${completedPct + inProgressPct + pendingPct}% 100%)`;
                }
              }
              return (
                <div style={{ padding: '13px 14px 15px' }}>
                  {/* HERO BANNER */}
                  <div className="ppb-welcome" style={{ backgroundImage: "url('/image copy.png')", marginBottom: '13px', borderRadius: '12px', overflow: 'hidden' }}>
                    <div>
                      <h2>Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {user?.name || (userRole === "Admin" ? 'Administrator' : 'User')} 👋</h2>
                      <p>
                        {userRole === "Admin"
                          ? "Admin Dashboard • Central glass plant execution & management console"
                          : "Keep pushing, great things are built here!"}
                      </p>
                    </div>
                    <div className="ppb-welcome-motto">Better Glass<br />Brighter Tomorrow</div>
                  </div>

                  {/* 4 METRIC CARDS */}
                  <div className="ppb-metrics-grid">
                    <div className="ppb-metric-card" onClick={() => setActiveTab("pis")} style={{ cursor: 'pointer' }}>
                      <div className="ppb-metric-main">
                        <span className="ppb-metric-icon ppb-metric-icon-blue"><Upload className="w-6 h-6" /></span>
                        <div className="ppb-metric-copy">
                          <h3>Total Orders Uploaded</h3>
                          <strong>{totalUploadedPdfs}</strong>
                        </div>
                        <div className="ppb-sparkline">{[20, 25, 24, 34, 30, 48, 51, 72].map((h, i) => <i key={i} style={{ height: `${h}%`, background: '#3b82f6' }} />)}</div>
                      </div>
                      <div className="ppb-metric-note ppb-note-blue"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block', flexShrink: 0 }} />{totalUploadedPdfs} PDF {totalUploadedPdfs === 1 ? "File" : "Files"} Uploaded • {effectiveStats.pendingPI} Batches in Production</div>
                    </div>

                    <div className="ppb-metric-card" onClick={() => setActiveTab("finished")} style={{ cursor: 'pointer' }}>
                      <div className="ppb-metric-main">
                        <span className="ppb-metric-icon ppb-metric-icon-green"><CheckCircle className="w-6 h-6" /></span>
                        <div className="ppb-metric-copy">
                          <h3>Completed Glass</h3>
                          <strong>{effectiveStats.totalCompletedItems ?? effectiveStats.finishedItems}</strong>
                        </div>
                        <div className="ppb-sparkline">{[12, 21, 27, 35, 41, 50, 64, 78].map((h, i) => <i key={i} style={{ height: `${h}%`, background: '#10b981' }} />)}</div>
                      </div>
                      <div className="ppb-metric-note ppb-note-green"><CheckCircle2 className="w-3.5 h-3.5" />Quality Inspected{effectiveStats.dispatchedItems > 0 ? ` (${effectiveStats.dispatchedItems} Dispatched)` : ""}</div>
                    </div>

                    <div className="ppb-metric-card" onClick={() => { setReportsInitialTab("rejects"); try { localStorage.setItem("sejal_reports_active_tab", "rejects"); } catch { } setActiveTab("reports"); }} style={{ cursor: 'pointer' }}>
                      <div className="ppb-metric-main">
                        <span className="ppb-metric-icon ppb-metric-icon-red"><AlertTriangle className="w-6 h-6" /></span>
                        <div className="ppb-metric-copy">
                          <h3>Rejected Glass</h3>
                          <strong>{effectiveStats.rejectItems}</strong>
                        </div>
                        <div className="ppb-sparkline">{[15, 23, 32, 45, 59, 72, 86, 100].map((h, i) => <i key={i} style={{ height: `${h}%`, background: '#ef4444' }} />)}</div>
                      </div>
                      <div className="ppb-metric-note ppb-note-red"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', flexShrink: 0 }} />{effectiveStats.rejectItems === 0 ? 'No rejection today' : 'Rejection logged'}</div>
                    </div>

                    <div className="ppb-metric-card" onClick={() => { setReportsInitialTab("reworks"); try { localStorage.setItem("sejal_reports_active_tab", "reworks"); } catch { } setActiveTab("reports"); }} style={{ cursor: 'pointer' }}>
                      <div className="ppb-metric-main">
                        <span className="ppb-metric-icon ppb-metric-icon-yellow"><RotateCw className="w-6 h-6" /></span>
                        <div className="ppb-metric-copy">
                          <h3>Rework Glass</h3>
                          <strong>{effectiveStats.reworkItems}</strong>
                        </div>
                        <div className="ppb-sparkline">{[16, 28, 46, 18, 37, 25, 51, 68].map((h, i) => <i key={i} style={{ height: `${h}%`, background: '#f59e0b' }} />)}</div>
                      </div>
                      <div className="ppb-metric-note ppb-note-yellow"><RotateCw className="w-3.5 h-3.5" />Sent to Line</div>
                    </div>
                  </div>

                  {/* TWO-COLUMN LAYOUT */}
                  <div className="ppb-dashboard-columns">
                    {/* LEFT COLUMN */}
                    <div className="ppb-left-col">
                      {/* Live Production Line */}
                      <section className="ppb-panel">
                        <div className="ppb-panel-heading">
                          <div><Zap className="ppb-heading-icon" size={20} fill="currentColor" /><h3>Live Production Line</h3></div>
                          <button onClick={() => setActiveTab("production-overview")}>View All <ChevronRight size={15} /></button>
                        </div>
                        <div className="ppb-queue-list">
                          <div className="ppb-queue-group">
                            <div className="ppb-queue-tile ppb-queue-tile-blue" onClick={() => setActiveTab("cutting")}>
                              <span className="ppb-queue-icon ppb-queue-icon-blue"><Scissors size={20} /></span>
                              <div><strong>Cutting Line</strong><span className="ppb-count"><b>{effectiveStats.pendingCutting ?? 0}</b> Items</span></div>
                            </div>
                            <ArrowRight className="ppb-queue-arrow" size={15} />
                          </div>
                          <div className="ppb-queue-group">
                            <div className="ppb-queue-tile ppb-queue-tile-cyan" onClick={() => setActiveTab("polishing")}>
                              <span className="ppb-queue-icon ppb-queue-icon-cyan"><Sparkles size={20} /></span>
                              <div><strong>Polishing Line</strong><span className="ppb-count"><b>{effectiveStats.pendingPolishing ?? 0}</b> Panes</span></div>
                            </div>
                            <ArrowRight className="ppb-queue-arrow" size={15} />
                          </div>
                          <div className="ppb-queue-group">
                            <div className="ppb-queue-tile ppb-queue-tile-green" onClick={() => setActiveTab("dgu")}>
                              <span className="ppb-queue-icon ppb-queue-icon-green"><Boxes size={20} /></span>
                              <div><strong>DGU Line</strong><span className="ppb-count"><b>{effectiveStats.pendingDGU ?? 0}</b> Units</span></div>
                            </div>
                            <ArrowRight className="ppb-queue-arrow" size={15} />
                          </div>
                          <div className="ppb-queue-group">
                            <div className="ppb-queue-tile ppb-queue-tile-purple" onClick={() => setActiveTab("lamination")}>
                              <span className="ppb-queue-icon ppb-queue-icon-purple"><Layers size={20} /></span>
                              <div><strong>Lamination Line</strong><span className="ppb-count"><b>{effectiveStats.pendingLamination ?? 0}</b> Items</span></div>
                            </div>
                            <ArrowRight className="ppb-queue-arrow" size={15} />
                          </div>
                          <div className="ppb-queue-group">
                            <div className="ppb-queue-tile ppb-queue-tile-emerald" onClick={() => setActiveTab("finished")}>
                              <span className="ppb-queue-icon ppb-queue-icon-emerald"><CheckCircle size={20} /></span>
                              <div><strong>Finished Glass</strong><span className="ppb-count"><b>{effectiveStats.finishedItems ?? 0}</b> Items</span></div>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Active Sticker & Batch Status */}
                      <section className="ppb-panel">
                        <div className="ppb-panel-heading">
                          <div><Grid className="ppb-heading-icon" size={20} /><h3>Active Sticker &amp; Batch Status</h3></div>
                          <button onClick={() => setActiveTab("pis")}>View All Batches <ArrowRight size={15} /></button>
                        </div>
                        <div className="ppb-table-scroll">
                          <table className="ppb-table">
                            <thead>
                              <tr>
                                <th>Batch No</th><th>Customer</th><th>Project</th><th>Current Stage</th>
                                <th>Finished / Total</th><th>SQM</th><th>Uploaded At</th><th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pis.length > 0 ? pis.slice(0, 2).map((pi) => {
                                const m = getBatchMetrics(pi);
                                return (
                                  <tr key={pi.id} onClick={() => openPIDetails(pi)} tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === "Enter") openPIDetails(pi); }}>
                                    <td><span className="ppb-live-dot" /><u style={{ fontWeight: 900 }}>{formatBatchNumber(pi.batchNo || pi.piNumber)}</u><ChevronRight size={13} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} /></td>
                                    <td>{pi.customerName}</td>
                                    <td>{pi.projectName || "—"}</td>
                                    <td><span className="ppb-stage-pill">{m.activeStageName}</span></td>
                                    <td><strong>{m.completedPieces} / {m.totalPieces} pcs</strong><span className="ppb-mini-progress" style={{ width: `${Math.max(10, m.progressPct)}%` }} /></td>
                                    <td>{m.totalSqm.toFixed(2)} m²</td>
                                    <td>{formatPlatformDate(pi.createdAt || pi.issueDate)}<small style={{ display: 'block', color: '#8099b4' }}>{formatPlatformTime(pi.createdAt)}</small></td>
                                    <td><span className="ppb-status-pill">COMPLETED</span></td>
                                  </tr>
                                );
                              }) : (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: '#8099b4', fontWeight: 600 }}>No batch data yet. Upload a sticker PDF to get started.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      {/* Worker Daily Progress (Stickers & SQM) */}
                      <section className="ppb-panel">
                        <div className="ppb-panel-heading">
                          <div className="flex items-center gap-2">
                            <Factory className="ppb-heading-icon" size={20} />
                            <h3>Worker Daily Progress</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab("analytics")}
                            className="flex items-center gap-1 font-bold text-xs text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                            title="Open daily reports and leaderboard"
                          >
                            Daily Reports <ArrowRight size={14} />
                          </button>
                        </div>

                        {/* Stage Selector Pills */}
                        <div className="flex items-center gap-1.5 flex-wrap px-3 py-2 bg-slate-50/80 border-b border-slate-200/80">
                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mr-1">Stage:</span>
                          {[
                            { id: "Cutting", label: "Cutting" },
                            { id: "Polishing", label: "Polishing" },
                            { id: "Pairing", label: "Pairing" },
                            { id: "DGU", label: "IGU / DGU" },
                            { id: "Lamination", label: "Lamination" },
                            { id: "Dispatched", label: "Dispatch" },
                          ].map((stg) => {
                            const isSel = overviewThroughputStage === stg.id;
                            return (
                              <button
                                key={stg.id}
                                type="button"
                                onClick={() => setOverviewThroughputStage(stg.id)}
                                className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                                  isSel
                                    ? "bg-blue-600 text-white shadow-xs"
                                    : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
                                }`}
                              >
                                {stg.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Users Table for the selected stage */}
                        <div className="ppb-table-scroll">
                          <table className="ppb-table">
                            <thead>
                              <tr>
                                <th>Worker Name</th>
                                <th>Stage</th>
                                <th style={{ textAlign: "center" }}>Pieces Done</th>
                                <th style={{ textAlign: "right" }}>Total Area (m²)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const stageMap = (stats as any)?.userThroughputByStage?.[overviewThroughputStage] || {};
                                const userEntries = Object.entries(stageMap);
                                if (userEntries.length === 0) {
                                  return (
                                    <tr>
                                      <td colSpan={4} style={{ textAlign: "center", padding: "16px", color: "#8099b4", fontWeight: 600 }}>
                                        No scan records for {overviewThroughputStage} yet. Active floor scans will appear here automatically.
                                      </td>
                                    </tr>
                                  );
                                }
                                return userEntries.map(([opName, opData]: [string, any]) => {
                                  const displayName = opData.name || opName;
                                  const username = opData.username;
                                  return (
                                    <tr key={opName}>
                                      <td>
                                        <div className="flex items-center gap-2">
                                          <div className="w-5 h-5 rounded bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                                            {displayName.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <strong className="text-slate-800 text-xs">{displayName}</strong>
                                            {username && (
                                              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.5 rounded-md inline-flex items-center">
                                                @{username}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                      <td>
                                        <span className="ppb-stage-pill">{overviewThroughputStage}</span>
                                      </td>
                                      <td style={{ textAlign: "center" }}>
                                        <strong className="text-emerald-600 font-mono text-xs">{opData.stickers.toLocaleString()} pcs</strong>
                                      </td>
                                      <td style={{ textAlign: "right" }}>
                                        <strong className="text-blue-600 font-mono text-xs">{opData.sqm.toFixed(2)} m²</strong>
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      {/* Left Column Content End */}
                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="ppb-right-col">
                      {/* Production Summary */}
                      <section className="ppb-panel ppb-summary-panel">
                        <div className="ppb-panel-heading relative">
                          <div className="flex items-center gap-1.5">
                            <Activity className="ppb-heading-icon" size={20} />
                            <h3>Production Summary</h3>
                            <span className="ppb-live-badge"><i />Live</span>
                          </div>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setSummaryFilterDropdownOpen((v) => !v)}
                              className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors border border-slate-200"
                            >
                              {summaryTimeFilter === "Today" ? (
                                <>
                                  <span>{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "2-digit", year: "numeric" }).format(now).replace(/\//g, '.')}</span>
                                  <span className="text-blue-600 font-extrabold">Today</span>
                                </>
                              ) : summaryTimeFilter === "Week" ? (
                                <span className="text-blue-600 font-extrabold">This Week</span>
                              ) : summaryTimeFilter === "Month" ? (
                                <span className="text-blue-600 font-extrabold">This Month</span>
                              ) : (
                                <span className="text-blue-600 font-extrabold">All Time</span>
                              )}
                              <ChevronDown size={12} className={`transition-transform ${summaryFilterDropdownOpen ? "rotate-180" : ""}`} />
                            </button>
                            {summaryFilterDropdownOpen && (
                              <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-30 text-xs font-semibold">
                                {[
                                  { label: "Today", value: "Today" as const },
                                  { label: "This Week", value: "Week" as const },
                                  { label: "This Month", value: "Month" as const },
                                  { label: "All Time", value: "All" as const },
                                ].map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                      setSummaryTimeFilter(opt.value);
                                      setSummaryFilterDropdownOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center justify-between ${summaryTimeFilter === opt.value ? "text-blue-600 bg-blue-50/50 font-bold" : "text-slate-700"}`}
                                  >
                                    <span>{opt.label}</span>
                                    {summaryTimeFilter === opt.value && <CheckCircle size={11} className="text-blue-600" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <div className="ppb-donut" style={{ background: donutGrad }}>
                            <div className="ppb-donut-inner">
                              <strong>{completedPct}%</strong>
                              <span>COMPLETED</span>
                              <small>{completedItems} / {grandTotal}</small>
                            </div>
                          </div>
                          <div className="ppb-summary-legend">
                            <div
                              onClick={() => setActiveTab("finished")}
                              className="cursor-pointer hover:bg-emerald-50 px-1 py-0.5 rounded transition-colors"
                              title="View Finished & Dispatched Items"
                            >
                              <i className="ppb-dot ppb-dot-green" />Completed <b>{completedItems} <small>({completedPct}%)</small></b>
                            </div>
                            <div
                              onClick={() => setActiveTab("production-overview")}
                              className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded transition-colors"
                              title="View In-Progress Workstations"
                            >
                              <i className="ppb-dot ppb-dot-blue" />In Progress <b>{inProgressItems} <small>({inProgressPct}%)</small></b>
                            </div>
                            <div
                              onClick={() => setActiveTab("pis")}
                              className="cursor-pointer hover:bg-amber-50 px-1 py-0.5 rounded transition-colors"
                              title="View Batches"
                            >
                              <i className="ppb-dot ppb-dot-yellow" />Pending <b>{pendingItems} <small>({pendingPct}%)</small></b>
                            </div>
                            <div
                              onClick={() => { setReportsInitialTab("rejects"); try { localStorage.setItem("sejal_reports_active_tab", "rejects"); } catch { } setActiveTab("reports"); }}
                              className="cursor-pointer hover:bg-red-50 px-1 py-0.5 rounded transition-colors"
                              title="View Rejections Report"
                            >
                              <i className="ppb-dot ppb-dot-red" />Rejected <b>{rejectedItems} <small>({rejectedPct}%)</small></b>
                            </div>
                          </div>
                        </div>
                        <div className="ppb-summary-chips">
                          <span
                            onClick={() => setActiveTab("cutting")}
                            className="cursor-pointer hover:scale-105 active:scale-95 transition-all"
                            style={{ color: '#7c3aed' }}
                            title="View Cutting Workstation"
                          >
                            ◉&nbsp; Cut <b>{effectiveStats.pendingCutting ?? 0}</b>
                          </span>
                          <span
                            onClick={() => setActiveTab("polishing")}
                            className="cursor-pointer hover:scale-105 active:scale-95 transition-all"
                            style={{ color: '#0891b2' }}
                            title="View Polishing Workstation"
                          >
                            ◉&nbsp; Polish <b>{effectiveStats.pendingPolishing ?? 0}</b>
                          </span>
                          <span
                            onClick={() => setActiveTab("dgu")}
                            className="cursor-pointer hover:scale-105 active:scale-95 transition-all"
                            style={{ color: '#059669' }}
                            title="View DGU Workstation"
                          >
                            ◉&nbsp; DGU <b>{effectiveStats.pendingDGU ?? 0}</b>
                          </span>
                          <span
                            onClick={() => setActiveTab("lamination")}
                            className="cursor-pointer hover:scale-105 active:scale-95 transition-all"
                            style={{ color: '#b45309' }}
                            title="View Lamination Workstation"
                          >
                            ◉&nbsp; Lam <b>{effectiveStats.pendingLamination ?? 0}</b>
                          </span>
                          <span
                            onClick={() => setActiveTab("finished")}
                            className="cursor-pointer hover:scale-105 active:scale-95 transition-all"
                            style={{ color: '#10b981' }}
                            title="View Finished & Dispatched Warehouse"
                          >
                            ◉&nbsp; Fin <b>{completedItems}</b>
                          </span>
                        </div>
                      </section>

                      {/* Today's Overview */}
                      <section className="ppb-panel ppb-overview-panel">
                        <div className="ppb-panel-heading">
                          <div
                            onClick={() => setActiveTab("analytics")}
                            className="cursor-pointer group flex items-center gap-2"
                            title="Click to view detailed Enterprise Performance Analytics"
                          >
                            <Factory className="ppb-heading-icon group-hover:scale-110 transition-transform" size={20} />
                            <h3 className="group-hover:text-blue-600 transition-colors">Today's Overview</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab("analytics")}
                            className="flex items-center gap-1 font-bold text-xs text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                            title="Open Enterprise Performance Analytics"
                          >
                            Analytics <ArrowRight size={15} />
                          </button>
                        </div>
                        <div
                          className="ppb-progress-row cursor-pointer hover:bg-blue-50/50 p-1.5 rounded-lg transition-colors"
                          onClick={() => setActiveTab("production-overview")}
                          title={`Production Efficiency: ${efficiencyRate}% (Based on completed workstation stages across ${totalItems} items)`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700">Production Efficiency</span>
                            <strong className="text-xs font-black text-blue-700">{`${efficiencyRate}%`}</strong>
                          </div>
                          <div className="ppb-progress-bar">
                            <div
                              className="ppb-progress-fill ppb-progress-fill-blue"
                              style={{ width: `${efficiencyRate}%` }}
                            />
                          </div>
                        </div>
                        <div
                          className="ppb-progress-row cursor-pointer hover:bg-emerald-50/50 p-1.5 rounded-lg transition-colors"
                          style={{ marginTop: 8 }}
                          onClick={() => setActiveTab("analytics")}
                          title={`On-Time Delivery: ${onTimeRate}% (Based on customer order delivery schedule)`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700">On-Time Delivery</span>
                            <strong className="text-xs font-black" style={{ color: "#059669" }}>
                              {`${onTimeRate}%`}
                            </strong>
                          </div>
                          <div className="ppb-progress-bar">
                            <div
                              className="ppb-progress-fill ppb-progress-fill-green"
                              style={{ width: `${onTimeRate}%` }}
                            />
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>
                  {/* Dashboard End Custom Footer Card */}
                  <div className="mt-5 w-full bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-200 flex items-center relative overflow-hidden h-[70px]">

                    {/* 40% Background Image aligned to right */}
                    <div className="absolute right-0 top-0 h-full pointer-events-none z-0" style={{ width: '40%' }}>
                      <div className="absolute inset-0 bg-gradient-to-r from-white via-white/40 to-transparent z-10" />
                      <img src="/image copy 5.png" alt="Skyline Background" className="h-full w-full object-cover object-right opacity-90 mix-blend-multiply" />
                    </div>

                    {/* Content Container */}
                    <div className="flex w-full relative z-10 items-center justify-between pl-5 pr-4 h-full">

                      {/* Left side: Logo & Text */}
                      <div className="flex items-center gap-3 py-2 shrink-0 bg-white/60 pr-4 rounded-r-3xl backdrop-blur-sm">
                        <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold shrink-0 shadow-sm">
                          <Building2 size={16} />
                        </div>
                        <div className="flex flex-col justify-center">
                          <h4 className="text-[10px] font-black text-slate-900 leading-tight">SEJAL GLASS &amp; GLASS MANUFACTURING PRODUCTS LLC</h4>
                          <p className="text-[7.5px] font-bold text-slate-500 mt-0.5">Reflecting Values • Precision Glass Production • Built for Dubai. Made for Excellence.</p>
                        </div>
                      </div>

                      {/* Center: 4 mini stats */}
                      <div className="flex items-center gap-5 bg-white/60 px-4 py-2 rounded-3xl backdrop-blur-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-blue-50 text-blue-600 rounded flex items-center justify-center shrink-0"><Layers size={12} /></div>
                          <div className="flex flex-col justify-center">
                            <div className="text-[7.5px] font-bold text-slate-500 uppercase tracking-wide">Total Batches</div>
                            <div className="text-[11.5px] font-black text-slate-900 leading-none mt-0.5">{pis.length}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-emerald-50 text-emerald-600 rounded flex items-center justify-center shrink-0"><CheckSquare size={12} /></div>
                          <div className="flex flex-col justify-center">
                            <div className="text-[7.5px] font-bold text-slate-500 uppercase tracking-wide">Finished Items</div>
                            <div className="text-[11.5px] font-black text-slate-900 leading-none mt-0.5">{effectiveStats.totalCompletedItems ?? effectiveStats.finishedItems ?? 0}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-blue-50 text-blue-600 rounded flex items-center justify-center shrink-0"><TrendingUp size={12} /></div>
                          <div className="flex flex-col justify-center">
                            <div className="text-[7.5px] font-bold text-slate-500 uppercase tracking-wide">Efficiency</div>
                            <div className="text-[11.5px] font-black text-slate-900 leading-none mt-0.5">{efficiencyRate}%</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-emerald-50 text-emerald-600 rounded flex items-center justify-center shrink-0"><Clock size={12} /></div>
                          <div className="flex flex-col justify-center">
                            <div className="text-[7.5px] font-bold text-slate-500 uppercase tracking-wide">On-Time Delivery</div>
                            <div className="text-[11.5px] font-black text-slate-900 leading-none mt-0.5">{onTimeRate}%</div>
                          </div>
                        </div>
                      </div>

                      {/* Empty spacer to push content left if needed, letting the 40% bg image shine on the right */}
                      <div className="w-[15%]"></div>
                    </div>

                  </div>
                </div>
              );
            })()}

            {/* Universal Module Page Back Button & Breadcrumbs */}
            {activeTab !== "overview" && (
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200/90 shadow-2xs font-bold text-xs transition-all cursor-pointer group active:scale-95"
                  title="Back"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-slate-500 group-hover:-translate-x-1 group-hover:text-blue-600 transition-all" />
                  <span>Back</span>
                </button>

                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <span
                    className="hover:text-blue-600 cursor-pointer transition-colors"
                    onClick={() => setActiveTab("overview")}
                    title={userRole === "Admin" ? "Return to Admin Dashboard" : "Return to Dashboard"}
                  >
                    {userRole === "Admin" ? "Admin Dashboard" : "Dashboard"}
                  </span>
                  <span>/</span>
                  <span className="text-slate-800 font-extrabold">
                    {activeTab === "pis" ? "Sticker & Batch" :
                      activeTab === "production-overview" ? "Production Overview" :
                        activeTab === "dispatched-history" ? "Dispatched History" :
                          activeTab === "cutting" ? "Cutting Workstation" :
                            activeTab === "polishing" ? "Polishing Workstation" :
                              activeTab === "pairing" ? "Glass Pairing" :
                                activeTab === "dgu" ? "DGU/IGU Assembly" :
                                  activeTab === "lamination" ? "Lamination Line" :
                                    activeTab === "finished" ? "Finished Glass" :
                                      activeTab === "reports" ? "Reports & Analytics" :
                                        activeTab === "analytics" ? "Daily Reports" :
                                          activeTab === "settings" ? "System Settings" : activeTab}
                  </span>
                </div>
              </div>
            )}


            {/* TAB: PRODUCTION OVERVIEW */}
            {activeTab === "production-overview" && (
              <ProductionOverviewView
                items={items}
                pis={pis}
                stats={stats}
                onNavigateTab={(tab) => setActiveTab(tab as any)}
                onOpenPIDetails={openPIDetails}
              />
            )}

            {/* OTHER WORKSTATION TABS (Cutting, DGU, Lamination, Finished) */}
            {activeTab !== "overview" && activeTab !== "production-overview" && activeTab !== "pis" && activeTab !== "reports" && activeTab !== "analytics" && activeTab !== "dispatched-history" && activeTab !== "settings" && (
              <ProductionStageView
                stage={
                  activeTab === "cutting" ? "Cutting" :
                    activeTab === "polishing" ? "Polishing" :
                      activeTab === "pairing" ? "Pairing" :
                        activeTab === "dgu" ? "DGU" :
                          activeTab === "lamination" ? "Lamination" :
                            activeTab === "finished" ? "Finished" : (activeTab as any)
                }
                items={items}
                pis={pis}
                operator={user?.name || user?.username || (userRole === "Admin" ? "Administrator" : "Staff")}
                externalSearchTerm={piSearchTerm}
                onRefresh={() => fetchData(true)}
                onOptimisticAdvance={handleOptimisticAdvance}
                onPrintSticker={handleOpenSticker}
                onReject={handleOpenReject}
                onRework={handleOpenRework}
                onNavigateTab={(tab) => setActiveTab(tab as any)}
              />
            )}

            {/* TAB: DISPATCHED HISTORY */}
            {activeTab === "dispatched-history" && (
              <DispatchedHistoryView
                items={items}
                pis={pis}
                operator={user?.name || user?.username || (userRole === "Admin" ? "Administrator" : "Staff")}
                onRefresh={() => fetchData(true)}
                onPrintSticker={handleOpenSticker}
                onNavigateToDispatchQueue={() => setActiveTab("finished")}
              />
            )}

            {/* TAB: STICKER & BATCH STATUS MANAGEMENT */}
            {activeTab === "pis" && (
              <div className="space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3 min-w-0 flex-wrap sm:flex-nowrap">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                      <Boxes className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight whitespace-nowrap">
                          Sticker &amp; Batch Status
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1 shadow-2xs shrink-0">
                          <FileText className="w-3 h-3 text-rose-600" />
                          {totalUploadedPdfs} {totalUploadedPdfs === 1 ? "PDF" : "PDFs"} Uploaded
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1 shadow-2xs shrink-0">
                          <Layers className="w-3 h-3 text-blue-600" />
                          {pis.length} Batches
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium mt-0.5 break-words">
                        Track and manage {totalUploadedPdfs} uploaded sticker PDF {totalUploadedPdfs === 1 ? "file" : "files"} ({pis.length} batches) and shop floor orders grouped by customer.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* View Uploaded PDFs */}
                    <Button
                      onClick={() => setUploadedPdfsModalOpen(true)}
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-700 bg-rose-50/70 hover:bg-rose-100 font-bold text-xs gap-1.5 rounded-xl shadow-xs h-9 px-3.5"
                    >
                      <FileText className="w-3.5 h-3.5 text-rose-600" /> View Uploaded PDFs ({totalUploadedPdfs})
                    </Button>

                    {/* Export Excel */}
                    <Button
                      ref={batchExportBtnRef}
                      size="sm"
                      onClick={() => {
                        const willOpen = !isBatchExportOpen;
                        if (willOpen && batchExportBtnRef.current) {
                          const rect = batchExportBtnRef.current.getBoundingClientRect();
                          setBatchExportPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                        }
                        setIsBatchExportOpen(willOpen);
                      }}
                      className="bg-gradient-to-r from-emerald-500 to-emerald-700 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 rounded-xl shadow-xs h-9 px-3.5 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
                      <ChevronDown className={`w-3 h-3 transition-transform ${isBatchExportOpen ? "rotate-180" : ""}`} />
                    </Button>

                    {isBatchExportOpen && batchExportPos && ReactDOM.createPortal(
                      <div
                        style={{ position: "fixed", top: batchExportPos.top, right: batchExportPos.right, zIndex: 9999 }}
                        className="w-72 bg-white border-2 border-emerald-300 rounded-2xl shadow-2xl p-2 space-y-1 animate-in fade-in zoom-in-95"
                      >
                        <div className="px-2.5 py-1.5 text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                          Export Excel Options (Sticker &amp; Batch)
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsBatchExportOpen(false);
                            exportStageWipToExcel("Cutting", items, "All_Batch_Items_Full", pis);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-emerald-50 hover:text-emerald-900 transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div>
                            <div>Export All Items ({items.length} Items)</div>
                            <div className="text-[10px] text-slate-400 font-normal">Full item list across all batches</div>
                          </div>
                        </button>
                        {pis.map((pi) => (
                          <button
                            key={pi.id}
                            type="button"
                            onClick={() => {
                              setIsBatchExportOpen(false);
                              const batchItems = items.filter((i) => i.piId === pi.id || i.piNumber === pi.piNumber);
                              exportBatchProgressMatrixToExcel(pi, batchItems);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-blue-50 hover:text-blue-900 transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                            <div>
                              <div>Batch {formatBatchNumber(pi.piNumber) || pi.piNumber}</div>
                              <div className="text-[10px] text-slate-400 font-normal">{pi.customerName} — Progress matrix</div>
                            </div>
                          </button>
                        ))}
                      </div>,
                      document.body
                    )}

                    {(userRole === "Admin" || userRole === "Supervisor") && (
                      <>
                        <Button
                          onClick={() => setStickerUploadModalOpen(true)}
                          size="sm"
                          variant="outline"
                          className="border-slate-300 text-slate-700 bg-white hover:bg-slate-50 font-bold text-xs gap-1.5 rounded-xl shadow-xs h-9 px-3.5"
                        >
                          <Upload className="w-3.5 h-3.5 text-blue-600" /> Upload Sticker PDF
                        </Button>
                        <Button
                          onClick={() => setManualPIModalOpen(true)}
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 rounded-xl shadow-xs h-9 px-3.5"
                        >
                          <Plus className="w-3.5 h-3.5" /> Manual Entry
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* KPI Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                  <div
                    className="ppb-metric-card cursor-pointer hover:border-rose-300 hover:shadow-md transition-all group"
                    onClick={() => setUploadedPdfsModalOpen(true)}
                    title="Click to view details of all uploaded PDF files"
                  >
                    <div className="ppb-metric-main">
                      <div className="ppb-metric-copy">
                        <h3>Uploaded PDFs</h3>
                        <strong>
                          {totalUploadedPdfs} <span style={{ fontSize: "16px" }}>{totalUploadedPdfs === 1 ? "File" : "Files"}</span>
                        </strong>
                        <div className="ppb-metric-change">
                          <span className="text-rose-600 font-bold text-[11px] flex items-center gap-1 group-hover:underline">
                            <FileText className="w-3 h-3" /> View {totalUploadedPdfs} Source {totalUploadedPdfs === 1 ? "PDF" : "PDFs"}
                          </span>
                        </div>
                      </div>
                      <div className="ppb-metric-icon" style={{ background: "linear-gradient(135deg, #f43f5e, #be123c)", color: "#fff" }}>
                        <FileText size={24} />
                      </div>
                    </div>
                  </div>

                  <div className="ppb-metric-card">
                    <div className="ppb-metric-main">
                      <div className="ppb-metric-copy">
                        <h3>Active Batches</h3>
                        <strong>{pis.length} <span style={{ fontSize: '16px' }}>Batches</span></strong>
                        <div className="ppb-metric-change">
                          <span className="ppb-metric-change-up">In Production</span>
                        </div>
                      </div>
                      <div className="ppb-metric-icon ppb-metric-icon-blue"><Layers size={24} /></div>
                    </div>
                  </div>

                  <div className="ppb-metric-card">
                    <div className="ppb-metric-main">
                      <div className="ppb-metric-copy">
                        <h3>Glass Units</h3>
                        <strong>{pipelineMetrics.totalUnits} <span style={{ fontSize: '16px' }}>Units</span></strong>
                        <div className="ppb-metric-change">
                          <span className="ppb-metric-change-up">
                            {items.length} {items.length === 1 ? "Piece" : "Pieces"} Being Tracked
                          </span>
                        </div>
                      </div>
                      <div className="ppb-metric-icon ppb-metric-icon-green"><Boxes size={24} /></div>
                    </div>
                  </div>

                  <div className="ppb-metric-card">
                    <div className="ppb-metric-main">
                      <div className="ppb-metric-copy">
                        <h3>Clear Batches</h3>
                        <strong>{clearBatchesCount} <span style={{ fontSize: '16px' }}>Orders</span></strong>
                        <div className="ppb-metric-change">
                          <span className="text-cyan-700 font-bold text-[11px]">{clearPdfCount} Clear {clearPdfCount === 1 ? "PDF" : "PDFs"}</span>
                        </div>
                      </div>
                      <div className="ppb-metric-icon" style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#fff' }}><Truck size={24} /></div>
                    </div>
                  </div>

                  <div className="ppb-metric-card">
                    <div className="ppb-metric-main">
                      <div className="ppb-metric-copy">
                        <h3>Coloured Batches</h3>
                        <strong>{colourBatchesCount} <span style={{ fontSize: '16px' }}>Orders</span></strong>
                        <div className="ppb-metric-change">
                          <span className="text-purple-700 font-bold text-[11px]">{colourPdfCount} Coloured {colourPdfCount === 1 ? "PDF" : "PDFs"}</span>
                        </div>
                      </div>
                      <div className="ppb-metric-icon" style={{ background: 'linear-gradient(135deg, #a855f7, #7e22ce)', color: '#fff' }}><Briefcase size={24} /></div>
                    </div>
                  </div>
                </div>

                {/* Filters & Search Toolbar */}
                <div className="ppb-panel p-3 bg-white border border-slate-200/80 rounded-2xl shadow-xs mb-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    {/* Left Side: Finish Filter Tabs & PDF Dropdown */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
                        <button
                          type="button"
                          onClick={() => setPiFinishFilter("ALL")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${piFinishFilter === "ALL"
                              ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200"
                              : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                            }`}
                        >
                          <span>All Glass</span>
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${piFinishFilter === "ALL" ? "bg-slate-200 text-slate-800" : "bg-slate-200/60 text-slate-600"
                            }`}>
                            {pis.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPiFinishFilter("CLEAR")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${piFinishFilter === "CLEAR"
                              ? "bg-cyan-600 text-white shadow-xs"
                              : "text-cyan-800 hover:bg-cyan-100/60"
                            }`}
                        >
                          <span>Clear Glass</span>
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${piFinishFilter === "CLEAR" ? "bg-white/20 text-white" : "bg-cyan-200 text-cyan-900"
                            }`}>
                            {clearBatchesCount}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPiFinishFilter("COLOUR")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${piFinishFilter === "COLOUR"
                              ? "bg-purple-600 text-white shadow-xs"
                              : "text-purple-800 hover:bg-purple-100/60"
                            }`}
                        >
                          <span>Coloured Glass</span>
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${piFinishFilter === "COLOUR" ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900"
                            }`}>
                            {colourBatchesCount}
                          </span>
                        </button>
                      </div>

                      {uploadedPdfsSummary.length > 1 && (
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/90 rounded-xl px-3 py-1.5 shadow-2xs">
                          <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <select
                            value={selectedPdfFilter}
                            onChange={(e) => setSelectedPdfFilter(e.target.value)}
                            className="text-xs font-bold bg-transparent border-0 text-slate-700 focus:outline-hidden cursor-pointer"
                            title="Filter batches by uploaded PDF"
                          >
                            <option value="ALL">All PDFs ({totalUploadedPdfs})</option>
                            {uploadedPdfsSummary.map((pdf) => (
                              <option key={pdf.fileName} value={pdf.fileName}>
                                {pdf.fileName} ({pdf.batches.length} {pdf.batches.length === 1 ? "batch" : "batches"})
                              </option>
                            ))}
                          </select>
                          {selectedPdfFilter !== "ALL" && (
                            <button
                              type="button"
                              onClick={() => setSelectedPdfFilter("ALL")}
                              className="text-[10px] text-rose-600 hover:text-rose-800 font-black ml-1 px-1 rounded hover:bg-rose-100 cursor-pointer"
                              title="Clear PDF filter"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right Side: Expand/Collapse + Responsive Search Bar */}
                    <div className="flex items-center gap-2.5 flex-1 justify-end min-w-[280px]">
                      {groupedCustomerData.length > 0 && (
                        <div className="flex items-center gap-1 bg-slate-100/80 border border-slate-200/80 rounded-xl px-2 py-0.5 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAllCustomersExpanded(true)}
                            className="text-[11px] font-bold text-slate-600 hover:text-purple-700 h-7 px-2"
                          >
                            Expand All
                          </Button>
                          <span className="text-slate-300">|</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAllCustomersExpanded(false)}
                            className="text-[11px] font-bold text-slate-600 hover:text-purple-700 h-7 px-2"
                          >
                            Collapse All
                          </Button>
                        </div>
                      )}

                      <div className="relative flex-1 max-w-md min-w-[180px]">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="Search customer, batch, project..."
                          value={piSearchTerm}
                          onChange={(e) => setPiSearchTerm(e.target.value)}
                          className="pl-8.5 pr-8 text-xs bg-slate-50/90 border-slate-200 rounded-xl h-9 font-medium focus:bg-white transition-all w-full"
                        />
                        {piSearchTerm && (
                          <button
                            type="button"
                            onClick={() => setPiSearchTerm("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                            title="Clear search"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* GROUP BY CUSTOMER & PROJECT */}
                <div className="space-y-3">
                  {groupedCustomerData.length > 0 ? (
                    groupedCustomerData.map((customer) => {
                      const isExpanded = isCustomerExpanded(customer.groupKey);
                      const isCompleted = customer.status === "Completed" || (customer.totalPieces > 0 && customer.completedPieces >= customer.totalPieces);

                      return (
                        <div
                          key={customer.groupKey}
                          className={`ppb-panel p-0 overflow-hidden transition-all duration-300 ${isCompleted ? "border-2 border-emerald-500 shadow-[0_8px_30px_rgb(16,185,129,0.12)]" : "hover:border-[#1680f5] shadow-[0_4px_20px_rgb(22,128,245,0.06)] hover:shadow-[0_8px_30px_rgb(22,128,245,0.15)]"}`}
                        >
                          {/* Customer Summary Card Header */}
                          <div
                            onClick={() => toggleCustomerExpanded(customer.groupKey)}
                            className={`w-full m-0 p-4 sm:p-5 cursor-pointer select-none transition-all duration-300 border-b-0 relative overflow-hidden group flex items-start md:items-center justify-between gap-4 flex-col md:flex-row ${isCompleted ? "bg-gradient-to-r from-emerald-50/80 to-teal-50/40 hover:from-emerald-100/60" : "bg-gradient-to-r from-[#f8fafc] to-white hover:from-blue-50/50"}`}
                          >
                            {/* Left: Customer Info & Badges */}
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div
                                className={`w-12 h-12 rounded-[14px] text-white flex items-center justify-center font-black text-lg shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-105 ${isCompleted ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-200/50" : "bg-gradient-to-br from-[#1680f5] to-[#1470e0] shadow-blue-200/50"}`}
                              >
                                {isCompleted ? (
                                  <CheckCircle className="w-5 h-5 text-emerald-50" />
                                ) : (
                                  <Building2 className="w-5 h-5" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3
                                    className="text-[17px] font-black tracking-tight truncate text-rose-700 flex items-center gap-2"
                                    title={customer.pdfFiles?.join(', ') || customer.customerName}
                                  >
                                    <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                                    <span className="truncate">
                                      {customer.pdfFiles && customer.pdfFiles.length > 0
                                        ? customer.pdfFiles.join(', ')
                                        : customer.customerName}
                                    </span>
                                  </h3>
                                  {customer.projectName && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs">
                                      <Briefcase className="w-3 h-3 text-blue-600" />
                                      {customer.projectName}
                                    </span>
                                  )}
                                  {customer.hasColour && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                                      Coloured
                                    </span>
                                  )}
                                  {customer.hasClear && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-100 text-cyan-800 border border-cyan-200">
                                      Clear
                                    </span>
                                  )}
                                  {isCompleted ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs border border-emerald-400">
                                      <Check className="w-3 h-3 stroke-[3]" /> COMPLETED
                                    </span>
                                  ) : (
                                    <StatusBadge status={customer.status} />
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 font-medium truncate mt-0.5 flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    <span>{customer.customerName}</span>
                                  </span>
                                  {customer.projectName && (
                                    <>
                                      <span className="text-slate-300">•</span>
                                      <span className="flex items-center gap-1">
                                        <span className="text-slate-400 font-semibold">Project:</span>
                                        <span className="font-bold text-slate-700">{customer.projectName}</span>
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Center: Stage Flow Breakdown Pills */}
                            <div className="flex items-center gap-2 flex-wrap bg-slate-50/60 p-1.5 rounded-2xl border border-slate-100/80" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => {
                                  setPiSearchTerm(customer.projectName || customer.customerName);
                                  setActiveTab("cutting");
                                }}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all flex items-center gap-1.5 shadow-xs ${customer.inCutting > 0
                                    ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                                    : "bg-slate-50 text-slate-400 border-slate-200/60 opacity-60"
                                  }`}
                                title="View Cutting items for this customer and project"
                              >
                                <Scissors className="w-3 h-3 text-purple-600" />
                                <span>Cutting: <strong>{customer.inCutting}</strong></span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setPiSearchTerm(customer.projectName || customer.customerName);
                                  setActiveTab("pairing");
                                }}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all flex items-center gap-1.5 shadow-xs ${customer.inPairing > 0
                                    ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                    : "bg-slate-50 text-slate-400 border-slate-200/60 opacity-60"
                                  }`}
                                title="View Pairing Buffer items for this customer and project"
                              >
                                <RefreshCw className="w-3 h-3 text-blue-600" />
                                <span>Pairing: <strong>{customer.inPairing}</strong></span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setPiSearchTerm(customer.projectName || customer.customerName);
                                  setActiveTab("lamination");
                                }}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all flex items-center gap-1.5 shadow-xs ${customer.inLamination > 0
                                    ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                                    : "bg-slate-50 text-slate-400 border-slate-200/60 opacity-60"
                                  }`}
                                title="View Lamination items for this customer and project"
                              >
                                <Flame className="w-3 h-3 text-amber-600" />
                                <span>Lamination: <strong>{customer.inLamination}</strong></span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setPiSearchTerm(customer.projectName || customer.customerName);
                                  setActiveTab("dgu");
                                }}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all flex items-center gap-1.5 shadow-xs ${customer.inDgu > 0
                                    ? "bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100"
                                    : "bg-slate-50 text-slate-400 border-slate-200/60 opacity-60"
                                  }`}
                                title="View DLGU / IGU items for this customer and project"
                              >
                                <ShieldCheck className="w-3 h-3 text-teal-600" />
                                <span>DLGU: <strong>{customer.inDgu}</strong></span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setPiSearchTerm(customer.projectName || customer.customerName);
                                  setActiveTab("finished");
                                }}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all flex items-center gap-1.5 shadow-xs ${customer.inFinished > 0
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                    : "bg-slate-50 text-slate-400 border-slate-200/60 opacity-60"
                                  }`}
                                title="View Finished Warehouse items for this customer and project"
                              >
                                <Truck className="w-3 h-3 text-emerald-600" />
                                <span>Finished: <strong>{customer.inFinished}</strong></span>
                              </button>
                            </div>

                            {/* Right: Quantities, Progress & Accordion Trigger */}
                            <div className="flex items-center gap-5 shrink-0 justify-between md:justify-end w-full md:w-auto mt-2 md:mt-0">
                              <div className="text-left md:text-right">
                                <div className="font-mono text-xs font-black text-slate-900 flex items-center justify-start md:justify-end gap-1.5 flex-wrap">
                                  <span className="text-rose-700 font-bold inline-flex items-center gap-0.5" title={`Source: ${customer.pdfFiles?.join(', ') || ''}`}>
                                    <FileText className="w-3 h-3 text-rose-500" />
                                    {customer.pdfFiles?.length || 1} {customer.pdfFiles?.length === 1 ? 'PDF' : 'PDFs'}
                                  </span>
                                  <span className="text-slate-400">•</span>
                                  <span className={isCompleted ? "text-emerald-900 font-bold" : ""}>
                                    {customer.totalUnits && customer.totalUnits !== customer.totalPieces ? (
                                      <>
                                        <span className="font-extrabold text-blue-700">{customer.completedUnits}/{customer.totalUnits} units</span>
                                        <span className="text-slate-500 font-medium text-[11px]"> ({customer.completedPieces}/{customer.totalPieces} pcs)</span>
                                      </>
                                    ) : (
                                      <>{customer.completedPieces}/{customer.totalPieces} pcs</>
                                    )}
                                  </span>
                                  <span className="text-slate-400">•</span>
                                  <span className="text-slate-600">{customer.totalSqm.toFixed(2)} m²</span>
                                </div>
                                <div className="flex items-center gap-2 justify-start md:justify-end mt-1.5">
                                  <div
                                    className={`w-32 sm:w-40 h-2 rounded-full overflow-hidden ${isCompleted ? "bg-emerald-200" : "bg-slate-200"
                                      }`}
                                  >
                                    <div
                                      className={`h-full rounded-full transition-all ${isCompleted
                                          ? "bg-gradient-to-r from-emerald-500 to-teal-600"
                                          : "bg-gradient-to-r from-purple-500 to-indigo-600"
                                        }`}
                                      style={{ width: `${customer.progressPct}%` }}
                                    />
                                  </div>
                                  <span
                                    className={`text-xs font-mono font-bold ${isCompleted ? "text-emerald-700 font-extrabold" : "text-slate-500"
                                      }`}
                                  >
                                    {customer.progressPct}%
                                  </span>
                                </div>
                              </div>

                              <div
                                className={`p-2 rounded-xl transition-all shadow-2xs shrink-0 ${isCompleted
                                    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 group-hover:scale-105"
                                    : "bg-slate-100 text-slate-600 hover:bg-purple-100 hover:text-purple-700 group-hover:scale-105"
                                  }`}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 stroke-[2.5]" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Collapsible Customer Sub-Table */}
                          {isExpanded && (
                            <div className="border-t border-slate-200 bg-slate-50/50 p-4 space-y-3">
                              {/* Customer Batches Table */}
                              <div className="ppb-panel p-0 overflow-hidden shadow-[0_4px_20px_rgb(22,128,245,0.04)] border-slate-100/60">
                                <TableHorizontalScrollWrapper>
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                      <tr className="border-b border-slate-100 text-[10px] font-extrabold text-[#1680f5] uppercase tracking-widest bg-blue-50/40">
                                        <th className="py-2.5 px-3 whitespace-nowrap">BATCH NO</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">SOURCE PDF</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">FINISH</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">PROJECT</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">CURRENT STAGE</th>
                                        <th className="py-2.5 px-3 text-center whitespace-nowrap">PIECES</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">TOTAL SQM</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">UPLOADED AT</th>
                                        <th className="py-2.5 px-3 text-center whitespace-nowrap">STATUS</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">ACTIONS</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {customer.batches.map((pi) => {
                                        const metrics = getBatchMetrics(pi);
                                        return (
                                          <tr
                                            key={pi.id}
                                            onClick={() => openPIDetails(pi)}
                                            className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                                          >
                                            <td className="py-2.5 px-3 font-mono font-bold text-purple-700 whitespace-nowrap group-hover:underline">
                                              {formatBatchNumber(pi.batchNo || pi.piNumber)}
                                            </td>
                                            <td className="py-2.5 px-3 whitespace-nowrap">
                                              <div className="flex items-center gap-1.5 text-slate-700 max-w-[190px] truncate" title={pi.fileName || "Sticker PDF"}>
                                                <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                                <span className="truncate text-xs font-mono font-bold text-slate-800">{pi.fileName || "Sticker PDF"}</span>
                                              </div>
                                            </td>
                                            <td className="py-2.5 px-3 whitespace-nowrap">
                                              {pi.colorOrClear === "Colour" ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                                                  Coloured Glass
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-100 text-cyan-800 border border-cyan-200">
                                                  Clear Glass
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-2.5 px-3 text-slate-700">
                                              <div className="font-semibold">{pi.projectName || "Standard Project"}</div>
                                            </td>
                                            <td className="py-2.5 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                              <button
                                                type="button"
                                                onClick={() => setActiveTab(metrics.activeStageTab)}
                                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10.5px] font-black border shadow-2xs hover:opacity-80 transition-all cursor-pointer ${metrics.activeStageBadgeClass}`}
                                                title={`Go to ${metrics.activeStageName}`}
                                              >
                                                <span>{metrics.activeStageName}</span>
                                                <ChevronRight className="w-3 h-3 opacity-60" />
                                              </button>
                                            </td>
                                            <td className="py-2.5 px-3 text-center font-bold text-slate-800 whitespace-nowrap">
                                              {metrics.completedPieces} / {metrics.totalPieces}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                                              {metrics.totalSqm.toFixed(2)} m²
                                            </td>
                                            <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs">
                                              <div className="flex items-center gap-1 font-semibold text-slate-700">
                                                <Calendar className="w-3 h-3 text-purple-600" />
                                                {formatPlatformDate(pi.createdAt || pi.issueDate)}
                                              </div>
                                            </td>
                                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                              <StatusBadge status={metrics.status || pi.status || "Pending"} />
                                            </td>
                                            <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1" onClick={(e) => e.stopPropagation()}>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openPIDetails(pi);
                                                }}
                                                className="h-7 w-7 p-0 text-slate-500 hover:text-purple-600 rounded-md"
                                                title="View Details"
                                              >
                                                <Eye className="w-3.5 h-3.5" />
                                              </Button>
                                              {userRole === "Admin" && (
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeletePI(pi.id);
                                                  }}
                                                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 rounded-md"
                                                  title="Delete Batch"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </TableHorizontalScrollWrapper>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-12 px-4 flex flex-col items-center justify-center text-center bg-white rounded-xl border border-dashed border-slate-200">
                      <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-3">
                        <Users className="w-7 h-7" />
                      </div>
                      <h3 className="text-sm font-extrabold text-slate-900">No Matching Customers or Batches</h3>
                      <p className="text-xs text-slate-500 mt-1">No batches found matching your search or filters. Clear your filters or upload a sticker batch.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: REPORTS & AUDIT LOG */}
            {activeTab === "reports" && (
              <React.Suspense
                fallback={
                  <div className="py-24 flex flex-col items-center justify-center text-slate-500">
                    <div className="w-9 h-9 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin mb-3" />
                    <span className="text-xs font-medium tracking-wide">Loading Reports & Audit Logs...</span>
                  </div>
                }
              >
                <ReportsView
                  key={reportsInitialTab}
                  initialTab={reportsInitialTab}
                  onTabChange={(tab) => {
                    setReportsInitialTab(tab);
                    try {
                      localStorage.setItem("sejal_reports_active_tab", tab);
                    } catch { }
                  }}
                  onPrintSticker={handleOpenSticker}
                  onReject={handleOpenReject}
                  onRework={handleOpenRework}
                />
              </React.Suspense>
            )}

            {/* TAB: PERFORMANCE ANALYTICS */}
            {activeTab === "analytics" && (
              <React.Suspense
                fallback={
                  <div className="py-24 flex flex-col items-center justify-center text-slate-500">
                    <div className="w-9 h-9 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin mb-3" />
                    <span className="text-xs font-medium tracking-wide">Loading Performance Analytics...</span>
                  </div>
                }
              >
                <PerformanceAnalyticsView onNavigateTab={(tab) => setActiveTab(tab as any)} />
              </React.Suspense>
            )}
            {/* TAB: SETTINGS */}
            {activeTab === "settings" && (
              <div className="flex-1 w-full animate-in fade-in duration-200">
                <SettingsView />
              </div>
            )}
          </main>
        </div>



        {/* Modals - Lazy Loaded on Demand to Keep Network Lean */}
        <React.Suspense fallback={null}>
          {uploadedPdfsModalOpen && (
            <UploadedPdfsModal
              open={uploadedPdfsModalOpen}
              onOpenChange={setUploadedPdfsModalOpen}
              pdfSummaries={uploadedPdfsSummary}
              pis={pis}
              items={items}
              onSelectPdfFilter={(fileName) => {
                setSelectedPdfFilter(fileName);
                setActiveTab("pis");
              }}
              onOpenUploadModal={() => setStickerUploadModalOpen(true)}
              onDeletePI={handleDeletePI}
              onViewPIDocument={openPIDetails}
              userRole={userRole}
            />
          )}

          {stickerUploadModalOpen && (
            <StickerUploaderModal
              open={stickerUploadModalOpen}
              onOpenChange={setStickerUploadModalOpen}
              onSuccess={() => {
                fetchData(true);
              }}
            />
          )}

          {manualPIModalOpen && (
            <ManualPIModal
              open={manualPIModalOpen}
              onOpenChange={setManualPIModalOpen}
              onSuccess={() => {
                fetchData(true);
              }}
            />
          )}

          {scanModalOpen && (
            <ScanLookupModal
              open={scanModalOpen}
              onOpenChange={setScanModalOpen}
              operator={user?.name || user?.username || (userRole === "Admin" ? "Administrator" : "Staff")}
              currentStage={currentWorkstationStage}
              initialCode={scanInitialCode}
              onPrintSticker={handleOpenSticker}
              onReject={handleOpenReject}
              onRework={handleOpenRework}
              onCompleteStage={handleCompleteStageFromScan}
            />
          )}

          {selectedPI && piModalOpen && (
            <PIDocumentModal
              open={piModalOpen}
              onOpenChange={setPiModalOpen}
              pi={selectedPI}
              items={
                selectedPIItems && selectedPIItems.length > 0
                  ? selectedPIItems
                  : items.filter((i) => i.piId === selectedPI.id || i.piNumber === selectedPI.piNumber)
              }
              onDeletePI={handleDeletePI}
              onReleaseToProduction={handleReleaseToProduction}
            />
          )}

          {selectedStickerItem && stickerModalOpen && (
            <BarcodeStickerModal
              open={stickerModalOpen}
              onOpenChange={setStickerModalOpen}
              item={selectedStickerItem}
            />
          )}

          {rejectReworkItem && rejectReworkModalOpen && (
            <RejectReworkModal
              open={rejectReworkModalOpen}
              onOpenChange={setRejectReworkModalOpen}
              item={rejectReworkItem}
              allItems={items}
              mode={rejectReworkMode}
              onSuccess={() => fetchData(true)}
            />
          )}
        </React.Suspense>
      </div>
    </div>
  );
}
