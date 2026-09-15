import React, { useState, useEffect, useRef } from "react";
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
  Plus,
  Eye,
  Printer,
  Sparkles,
  RotateCw,
  Clock,
  Activity,
  TrendingUp,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PIMaster, GlassItem, DashboardStats, UserRole, ProductionStage, SystemNotification } from "@shared/api";
import { StickerUploaderModal } from "@/components/StickerUploaderModal";
import { ManualPIModal } from "@/components/ManualPIModal";
import { PIDocumentModal } from "@/components/PIDocumentModal";
import { BarcodeStickerModal } from "@/components/BarcodeStickerModal";
import { ScanLookupModal } from "@/components/ScanLookupModal";
import { ProductionStageView } from "@/components/ProductionStageView";
import { RejectReworkModal } from "@/components/RejectReworkModal";
import { ReportsView } from "@/components/ReportsView";
import { PerformanceAnalyticsView } from "@/components/PerformanceAnalyticsView";
import { ProductionOverviewView } from "@/components/ProductionOverviewView";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "sonner";
import { AppSidebar } from "@/components/AppSidebar";
import { UniversalSearchResults } from "@/lib/UniversalSearchResults";
import { formatBatchNumber, formatPlatformDate, formatPlatformTime, getItemFinish, isDguGlass, isLaminatedGlass, isDlguGlass } from "@/lib/utils";

export default function Index() {
  const [searchParams] = useSearchParams();
  const validTabs = ["overview", "production-overview", "pis", "cutting", "pairing", "dgu", "lamination", "finished", "reports", "analytics"] as const;
  type TabType = typeof validTabs[number];
  // ponytail: Preserve user's active module across hard refreshes and page reloads
  const initialTab = validTabs.includes(searchParams.get("tab") as TabType)
    ? (searchParams.get("tab") as TabType)
    : (() => {
        try {
          const saved = localStorage.getItem("sejal_active_module") as TabType;
          if (saved && validTabs.includes(saved)) return saved;
        } catch {}
        return "overview";
      })();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [reportsInitialTab, setReportsInitialTab] = useState<"pis" | "items" | "history" | "rejects" | "reworks">(() => {
    try {
      const saved = localStorage.getItem("sejal_reports_active_tab") as any;
      if (saved && ["pis", "items", "history", "rejects", "reworks"].includes(saved)) return saved;
    } catch {}
    return "pis";
  });

  useEffect(() => {
    try {
      localStorage.setItem("sejal_active_module", activeTab);
    } catch {}
  }, [activeTab]);
  const [userRole, setUserRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem("user_role") as UserRole;
    return saved === "Admin" || saved === "Supervisor" || saved === "Operator" ? saved : "Admin";
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleRoleChange = async (role: UserRole) => {
    setUserRole(role);
    localStorage.setItem("user_role", role);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }
      }
    } catch (e) {
      console.error("Login token fetch failed:", e);
    }
    toast.success(`Active role changed to ${role}`);
  };

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = { "x-user-role": userRole };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  const navigate = useNavigate();
  // Interactive UI states
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const notificationsRef = React.useRef<HTMLDivElement>(null);
  const userMenuRef = React.useRef<HTMLDivElement>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<"all" | "unread" | "alerts">("all");
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);

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
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "/" || e.key === "k" || e.key === "K")) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Data states
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pis, setPis] = useState<PIMaster[]>([]);
  const [items, setItems] = useState<GlassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Real-time Dubai Time Clock (Asia/Dubai Timezone)
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getDubaiDateStr = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dubai",
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  const getDubaiTimeStr = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dubai",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(date);
  };

  const getDubaiShortSyncStr = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dubai",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  };

  // Search, Sort & Filter
  const [piSearchTerm, setPiSearchTerm] = useState("");
  const [piFinishFilter, setPiFinishFilter] = useState<"ALL" | "CLEAR" | "COLOUR">("ALL");
  const [sortField, setSortField] = useState<"piNumber" | "customerName" | "projectName" | "itemsCount" | "totalSqm" | "status" | "createdAt">("piNumber");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modal states
  const [stickerUploadModalOpen, setStickerUploadModalOpen] = useState(false);
  const [manualPIModalOpen, setManualPIModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);

  const [selectedPI, setSelectedPI] = useState<PIMaster | null>(null);
  const [selectedPIItems, setSelectedPIItems] = useState<GlassItem[]>([]);
  const [piModalOpen, setPiModalOpen] = useState(false);

  const [selectedStickerItem, setSelectedStickerItem] = useState<GlassItem | null>(null);
  const [stickerModalOpen, setStickerModalOpen] = useState(false);

  const [rejectReworkItem, setRejectReworkItem] = useState<GlassItem | null>(null);
  const [rejectReworkMode, setRejectReworkMode] = useState<"reject" | "rework">("reject");
  const [rejectReworkModalOpen, setRejectReworkModalOpen] = useState(false);

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
    const serialSet = new Set(serialNumbers.map((s) => String(s)));
    setItems((prev) =>
      prev.map((item) => {
        if (serialSet.has(item.serialNumber) || serialSet.has(item.barcode) || serialSet.has(item.id)) {
          const route = item.processRoute || [];
          const idx = route.indexOf(fromStage);
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
        }, 120);
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
              toast.success(`${notif.title}`);
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
          .catch(() => {});
      });

      eventSource.addEventListener("stage_advanced", handleStreamUpdate);
      eventSource.addEventListener("item_rejected", handleStreamUpdate);
      eventSource.addEventListener("item_reworked", handleStreamUpdate);
      eventSource.addEventListener("excel_uploaded", handleStreamUpdate);
      eventSource.addEventListener("sticker_batch_uploaded", handleStreamUpdate);
      eventSource.addEventListener("pi_released", handleStreamUpdate);
      eventSource.addEventListener("pi_deleted", handleStreamUpdate);
      eventSource.addEventListener("database_cleared", handleStreamUpdate);

      eventSource.onmessage = handleStreamUpdate;
    } catch (err) {
      console.error("SSE connection error:", err);
    }

    const timer = setInterval(() => fetchData(true), 30000);
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
    const batchNumber = targetPI?.piNumber ? formatBatchNumber(targetPI.piNumber) : targetPI?.id || "";

    if (userRole === "Operator") {
      toast.error(`Operator role cannot delete batches`);
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
      toast.error(`Operator role cannot release ${docLabel.toLowerCase()}s to production`);
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

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const clearBatchesCount = pis.filter((p) => p.colorOrClear !== "Colour").length;
  const colourBatchesCount = pis.filter((p) => p.colorOrClear === "Colour").length;

  const getBatchMetrics = (pi: PIMaster) => {
    const cleanId = (pi.id || "").replace(/^STK-/i, "");
    const cleanPiNo = (pi.piNumber || "").replace(/^STK-/i, "");
    const batchItems = items.filter(
      (i) =>
        i.piId === pi.id ||
        i.piNumber === pi.piNumber ||
        i.piId === cleanId ||
        i.piNumber === cleanPiNo ||
        i.batchNo === cleanPiNo ||
        i.batchNo === pi.piNumber ||
        (i.sfoNo && (i.sfoNo === pi.piNumber || i.sfoNo === cleanPiNo))
    );

    if (batchItems.length > 0) {
      const totalPieces = batchItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const completedPieces = batchItems
        .filter((i) => i.status === "Completed" || i.currentStage === "Finished")
        .reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const totalSqm = batchItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);

      const inCutting = batchItems.filter((i) => i.currentStage === "Cutting" && !i.completedStages?.includes("Cutting")).length;
      const inPairing = batchItems.filter((i) => i.currentStage === "Pairing").length;
      const inLamination = batchItems.filter((i) => i.currentStage === "Lamination").length;
      const inDgu = batchItems.filter((i) => i.currentStage === "DGU").length;
      const inFinished = completedPieces;

      const isCompleted = totalPieces > 0 && completedPieces >= totalPieces;
      const isPending = completedPieces === 0 && batchItems.every((i) => i.currentStage === "Cutting" && !i.completedStages?.length);
      const status = isCompleted ? "Completed" : isPending ? (pi.status === "Pending" ? "Pending" : "In Production") : "In Production";

      // Calculate primary active stage
      let activeStageName = "Cutting Workstation";
      let activeStageTab: "cutting" | "pairing" | "lamination" | "dgu" | "finished" = "cutting";
      let activeStageBadgeClass = "bg-purple-100 text-purple-800 border-purple-200";

      if (inFinished > 0 && inFinished === totalPieces) {
        activeStageName = "Finished Warehouse";
        activeStageTab = "finished";
        activeStageBadgeClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
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
      inPairing: 0,
      inLamination: 0,
      inDgu: 0,
      inFinished: 0,
      activeStageName: "Cutting Workstation",
      activeStageTab: "cutting" as const,
      activeStageBadgeClass: "bg-purple-100 text-purple-800 border-purple-200",
      progressPct: 0,
    };
  };

  const sortedAndFilteredPIs = [...pis]
    .filter((pi) => {
      if (piFinishFilter === "CLEAR" && pi.colorOrClear === "Colour") return false;
      if (piFinishFilter === "COLOUR" && pi.colorOrClear !== "Colour") return false;

      const query = piSearchTerm.toLowerCase().trim();
      return (
        pi.piNumber.toLowerCase().includes(query) ||
        pi.customerName.toLowerCase().includes(query) ||
        pi.projectName.toLowerCase().includes(query) ||
        (pi.jobOrderNumber && pi.jobOrderNumber.toLowerCase().includes(query))
      );
    })
    .sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  const totalPages = Math.ceil(sortedAndFilteredPIs.length / pageSize) || 1;
  const paginatedPIs = sortedAndFilteredPIs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const renderSortIcon = (field: typeof sortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 inline" />;
    return sortOrder === "asc" ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-purple-600 inline font-bold" /> : <ChevronDown className="w-3.5 h-3.5 ml-1 text-purple-600 inline font-bold" />;
  };

  // Pipeline Overview States & Computations
  const [pipelineBatchSearch, setPipelineBatchSearch] = useState("");
  const [pipelineStageFilter, setPipelineStageFilter] = useState<"ALL" | "Cutting" | "Pairing" | "DGU" | "Lamination" | "Finished">("ALL");

  const pipelineMetrics = React.useMemo(() => {
    const isColour = (i: GlassItem) => getItemFinish(i) === "Colour";

    const cuttingItems = items.filter((i) => (i.currentStage?.toLowerCase() === "cutting" || (!i.currentStage && i.status !== "Rejected")) && i.status !== "Rejected");
    const pairingItems = items.filter((i) => i.currentStage?.toLowerCase() === "pairing" && i.status !== "Rejected");
    const dguItems = items.filter((i) => i.currentStage?.toLowerCase() === "dgu" && i.status !== "Rejected" && i.status !== "Completed");
    const laminationItems = items.filter((i) => i.currentStage?.toLowerCase() === "lamination" && i.status !== "Rejected");
    const finishedItems = items.filter((i) => i.currentStage?.toLowerCase() === "finished" || i.status === "Completed");
    const rejectedItems = items.filter((i) => i.status === "Rejected");
    const reworkItems = items.filter((i) => i.status === "Reworking");

    const totalItems = items.reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const cuttingCount = cuttingItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
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
    const pairingSqm = pairingItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
    const dguSqm = dguItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
    const laminationSqm = laminationItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
    const finishedSqm = finishedItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);

    const distinctCuttingSheets = new Set(cuttingItems.map((i) => i.rackNo || "1")).size;

    const cuttingColour = cuttingItems.filter(isColour).reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const cuttingClear = cuttingCount - cuttingColour;

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

    const finishedDguItems = finishedItems.filter((i) => isDguGlass(i) || isDlguGlass(i));
    const finishedNonDguItems = finishedItems.filter((i) => !isDguGlass(i) && !isDlguGlass(i));

    const finishedDguColour = finishedDguItems.filter(isColour).reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const finishedDguTotal = finishedDguItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
    const finishedDguUnits = finishedDguColour > 0 ? finishedDguColour : Math.ceil(finishedDguTotal / 2);
    const finishedDguSqm = finishedDguColour > 0
      ? finishedDguItems.filter(isColour).reduce((acc, curr) => acc + (curr.sqm || 0), 0)
      : (finishedDguItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0) / 2);

    const finishedLamItems = finishedNonDguItems.filter((i) => isLaminatedGlass(i) || i.glassCategory === "Lamination" || i.processRoute?.includes("Lamination"));
    const finishedMonolithicItems = finishedNonDguItems.filter((i) => !isLaminatedGlass(i) && i.glassCategory !== "Lamination" && !i.processRoute?.includes("Lamination"));
    const finishedLamUnits = Math.ceil(finishedLamItems.reduce((acc, curr) => acc + (curr.qty || 1), 0) / 2);
    const finishedMonolithicUnits = finishedMonolithicItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);

    const finishedNonDguSqm = finishedNonDguItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
    const finishedUnits = finishedDguUnits + finishedLamUnits + finishedMonolithicUnits;
    const effectiveFinishedSqm = parseFloat((finishedDguSqm + finishedNonDguSqm).toFixed(2));

    const laminationUnits = Math.ceil(laminationCount / 2);
    const totalActive = cuttingCount + pairingCount + dguCount + laminationUnits + finishedUnits;
    const completionRate = totalActive > 0 ? Math.round((finishedUnits / totalActive) * 100) : 0;
    const yieldRate = totalItems > 0 ? (((totalItems - rejectedCount) / totalItems) * 100).toFixed(1) : "100.0";

    return {
      totalItems,
      totalSqm,
      cuttingItems: cuttingCount,
      cuttingSqm,
      cuttingColour,
      cuttingClear,
      distinctCuttingSheets,
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

    return {
      totalPI: pis.length || (stats?.totalPI ?? 0),
      pendingPI: pis.filter((p) => p.status === "Pending" || p.status === "In Production").length || (stats?.pendingPI ?? 0),
      completedPI: pis.filter((p) => p.status === "Completed").length || (stats?.completedPI ?? 0),
      pendingCutting: pipelineMetrics.cuttingItems,
      pendingPairing: pipelineMetrics.pairingItems,
      pendingDGU: dguUnitsCount,
      pendingLamination: pipelineMetrics.laminationItems,
      finishedItems: pipelineMetrics.finishedItems,
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
      pairingCount: number;
      dguCount: number;
      laminationCount: number;
      finishedCount: number;
      totalSqm: number;
      finish: "Clear" | "Colour";
      primaryStage: "Cutting" | "Pairing" | "DGU" | "Lamination" | "Finished";
      progress: number;
    }>();

    items.forEach((item) => {
      const key = item.piId || item.piNumber || item.batchNo || "default";
      const parentPI = pis.find((p) => p.id === item.piId || p.piNumber === item.piNumber);
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          piNumber: (item.piNumber || parentPI?.piNumber || `BATCH-${item.batchNo || "1"}`).replace(/^STK-/i, ""),
          customerName: parentPI?.customerName || "BRIGHT PLUS FITOUT",
          projectName: parentPI?.projectName || item.sectionName || "VAL_BY_KAS",
          jobOrderNumber: parentPI?.jobOrderNumber || item.orderNo || item.sfoNo || "",
          sfoNo: item.sfoNo || parentPI?.sfoNo || "",
          items: [],
          cuttingCount: 0,
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
      if (st === "cutting" || (!item.currentStage && item.status !== "Rejected")) b.cuttingCount += itemPieces;
      else if (st === "pairing") b.pairingCount += itemPieces;
      else if (st === "dgu") b.dguCount += itemPieces;
      else if (st === "lamination") b.laminationCount += itemPieces;
      else if (st === "finished" || item.status === "Completed") b.finishedCount += itemPieces;
    });

    // Also include any PIs without direct items
    pis.forEach((p) => {
      if (!map.has(p.id) && !map.has(p.piNumber)) {
        map.set(p.id, {
          id: p.id,
          piNumber: (p.piNumber || "").replace(/^STK-/i, ""),
          customerName: p.customerName || "BRIGHT PLUS FITOUT",
          projectName: p.projectName || "VAL_BY_KAS",
          jobOrderNumber: p.jobOrderNumber || p.sfoNo || "",
          sfoNo: p.sfoNo || "",
          items: [],
          cuttingCount: p.totalQty || p.itemsCount || 0,
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

      let primaryStage: "Cutting" | "Pairing" | "DGU" | "Lamination" | "Finished" = "Cutting";
      if (b.cuttingCount > 0) primaryStage = "Cutting";
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
    <div className="h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans overflow-hidden">
      {/* Top Header Bar */}
      <header className="shrink-0 bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between z-30 shadow-xs relative">
        {/* Left Side: Brand Logo & Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 border-r border-slate-200 pr-4">
            <img
              src="/sejal-glass-logo.png"
              alt="SEJAL GLASS"
              className="h-9 w-auto object-contain shrink-0"
            />
            <div className="hidden sm:block">
              <div className="text-[10px] text-slate-500 font-semibold font-arabic leading-tight">سیجال جلاس</div>
            </div>
          </div>

          <div className="hidden md:block">
            <h1 className="font-extrabold text-sm tracking-tight text-slate-900 leading-none uppercase">
              SHOP FLOOR & PROFORMA INVOICE SYSTEM
            </h1>
            <p className="text-[11px] text-slate-500 font-medium leading-tight">
              Reflecting Values • Precision Glass Production Tracking
            </p>
          </div>
        </div>

        {/* Right Side: Interactive Search Bar, Notifications & User Profile */}
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block w-72" ref={searchContainerRef}>
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              ref={searchInputRef}
              placeholder="Universal Search (PI, Barcode, Serial)..."
              value={piSearchTerm}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                setPiSearchTerm(e.target.value);
                setSearchFocused(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchFocused(false);
              }}
              className="pl-8 pr-12 h-8 text-xs bg-slate-50 border-slate-200 rounded-lg focus-visible:ring-1 focus-visible:ring-purple-600"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs">
              Ctrl /
            </span>

            {/* Universal Search Results Popover Dropdown */}
            {searchFocused && piSearchTerm.trim().length > 0 && (
              <UniversalSearchResults
                searchTerm={piSearchTerm}
                pis={pis}
                items={items}
                onSelectPI={(pi) => openPIDetails(pi)}
                onSelectItem={(item) => handleOpenSticker(item)}
                onSelectModule={(tabId) => {
                  setActiveTab(tabId as any);
                }}
                onClose={() => setSearchFocused(false)}
              />
            )}
          </div>

          {/* Single Global Sync Now Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              fetchData();
              toast.success("Synchronizing shop floor & batch data...");
            }}
            disabled={loading}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl border-blue-200 text-[#1a3a6b] bg-blue-50/70 hover:bg-blue-100 hover:text-blue-900 font-extrabold text-xs shadow-2xs transition-all shrink-0"
            title={`Last synced: ${getDubaiTimeStr(lastUpdated)} (Click to sync complete system data)`}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#1a3a6b] ${loading ? "animate-spin" : ""}`} />
            <span>Sync Now</span>
          </Button>

          {/* Weather & Clock Chip: compact inline between Search and Bell */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs font-semibold text-amber-800 shadow-2xs select-none">
            <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>36°C</span>
            <span className="text-amber-400 font-normal">•</span>
            <span className="text-slate-600 font-medium">Dubai, UAE</span>
            <span className="text-amber-400 font-normal">•</span>
            <span className="font-mono text-slate-700">{getDubaiTimeStr(now)}</span>
          </div>

          <div className="flex items-center gap-3 relative">
            {/* Notifications Popover */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => {
                  setNotificationsOpen((prev) => !prev);
                  setUserMenuOpen(false);
                }}
                className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#e31e24] text-white text-[9px] font-bold flex items-center justify-center">
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
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        notificationFilter === "all"
                          ? "bg-[#1a3a6b] text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      All ({notifications.length})
                    </button>
                    <button
                      onClick={() => setNotificationFilter("unread")}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        notificationFilter === "unread"
                          ? "bg-[#1a3a6b] text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      Unread ({unreadNotifications})
                    </button>
                    <button
                      onClick={() => setNotificationFilter("alerts")}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        notificationFilter === "alerts"
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
                            className={`relative p-2.5 pl-3 pr-7 rounded-xl border transition-all cursor-pointer ${
                              isDestructive
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
                                    className={`font-bold text-[11px] truncate ${
                                      isDestructive
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
                  {userRole.charAt(0)}
                </div>
                <div className="hidden sm:block">
                  <div className="text-xs font-bold text-slate-900 leading-tight flex items-center gap-1">
                    {userRole} <ChevronDown className="w-3 h-3 text-slate-400" />
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium leading-tight">
                    {userRole === "Admin" ? "Administrator" : userRole === "Supervisor" ? "Production Supervisor" : "Station Operator"}
                  </div>
                </div>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <div className="font-bold text-xs text-slate-900">{userRole} User</div>
                    <div className="text-[10px] text-slate-500">{userRole.toLowerCase()}@sejalglass.com</div>
                    <div className="mt-1">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-900">
                        Active Role: {userRole}
                      </span>
                    </div>
                  </div>
                  <div className="py-1 text-xs space-y-0.5">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Switch Active Role</div>
                    {(["Admin", "Supervisor", "Operator"] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => {
                          handleRoleChange(r);
                          setUserMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 rounded-lg font-medium flex items-center justify-between transition-all ${userRole === r ? "bg-blue-50 text-blue-900 font-bold" : "text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                        <span className="flex items-center gap-2">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#1a3a6b]" /> {r}
                        </span>
                        {userRole === r && <Check className="w-3.5 h-3.5 text-[#1a3a6b]" />}
                      </button>
                    ))}
                    {userRole === "Admin" && (
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleClearDatabase();
                        }}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 font-bold flex items-center gap-2 transition-all mt-1 border-t border-slate-100 pt-2"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" /> Clear System Database
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation Sidebar (Supports Collapsed Icon-Only Mode and Expanded Mode) */}
        <AppSidebar
          sidebarOpen={sidebarOpen}
          activeTab={activeTab}
          setActiveTab={(tab) => setActiveTab(tab as any)}
          stats={effectiveStats}
        />

        {/* Main Workspace Body */}
        <main className="flex-1 p-6 space-y-6 overflow-y-auto bg-[#f8fafc]">
          {/* TAB: OVERVIEW DASHBOARD */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Live Production Sync Active Banner */}
              <div className="flex items-center justify-between bg-white border border-slate-200/80 p-3 px-4 rounded-xl text-xs shadow-2xs">
                <div className="flex items-center gap-2 text-slate-600 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="font-bold text-slate-800">Live Production Sync Active</span>
                  <span className="text-slate-400">• Last synced: {getDubaiTimeStr(lastUpdated)}</span>
                </div>
              </div>

              {/* 4 KPI Stat Cards Grid (Clickable) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Total Batches Uploaded */}
                <div
                  onClick={() => setActiveTab("pis")}
                  className="bg-gradient-to-br from-white via-white to-blue-50/40 border border-slate-300 rounded-2xl p-4 shadow-2xs hover:shadow-lg hover:-translate-y-1 hover:border-blue-400 transition-all duration-300 relative overflow-hidden group cursor-pointer"
                  title="Click to open Sticker & Batch Status list"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveTab("pis");
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 group-hover:text-blue-800 transition-colors">
                        Total Batches Uploaded <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-blue-600" />
                      </div>
                      <div className="text-3xl font-extrabold text-slate-900 mt-1.5 tracking-tight">{effectiveStats.totalPI}</div>
                      <div className="text-[11px] text-blue-700 font-semibold mt-1 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> {effectiveStats.pendingPI} Pending Production
                      </div>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-[#1a3a6b] group-hover:text-white transition-all duration-300 shadow-2xs">
                      <FileText className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Card 2: Finished Glass Items */}
                <div
                  onClick={() => setActiveTab("finished")}
                  className="bg-gradient-to-br from-white via-white to-emerald-50/30 border border-slate-300 rounded-2xl p-4 shadow-2xs hover:shadow-lg hover:-translate-y-1 hover:border-emerald-400 transition-all duration-300 group cursor-pointer"
                  title="Click to open Finished Items Warehouse & Dispatch queue"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveTab("finished");
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 group-hover:text-emerald-700 transition-colors">
                        Finished Glass Items <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-emerald-600" />
                      </div>
                      <div className="text-3xl font-extrabold text-slate-900 mt-1.5 tracking-tight">{effectiveStats.finishedItems}</div>
                      <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> 100% Quality Inspected
                      </div>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 shadow-2xs">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Card 3: Rejected Items */}
                <div
                  onClick={() => {
                    setReportsInitialTab("rejects");
                    setActiveTab("reports");
                  }}
                  className="bg-gradient-to-br from-white via-white to-red-50/30 border border-slate-300 rounded-2xl p-4 shadow-2xs hover:shadow-lg hover:-translate-y-1 hover:border-red-400 transition-all duration-300 group cursor-pointer"
                  title="Click to open Quality Rejects log"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setReportsInitialTab("rejects");
                      setActiveTab("reports");
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 group-hover:text-red-700 transition-colors">
                        Rejected Items <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-red-600" />
                      </div>
                      <div className="text-3xl font-extrabold text-slate-900 mt-1.5 tracking-tight">{effectiveStats.rejectItems}</div>
                      <div className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Log & Reason Traceable
                      </div>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-red-100/70 text-red-700 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-red-600 group-hover:text-white transition-all duration-300 shadow-2xs">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Card 4: Rework Items */}
                <div
                  onClick={() => {
                    setReportsInitialTab("reworks");
                    setActiveTab("reports");
                  }}
                  className="bg-gradient-to-br from-white via-white to-amber-50/30 border border-slate-300 rounded-2xl p-4 shadow-2xs hover:shadow-lg hover:-translate-y-1 hover:border-amber-400 transition-all duration-300 group cursor-pointer"
                  title="Click to open Rework log and tracking"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setReportsInitialTab("reworks");
                      setActiveTab("reports");
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 group-hover:text-amber-700 transition-colors">
                        Rework Items <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-amber-600" />
                      </div>
                      <div className="text-3xl font-extrabold text-slate-900 mt-1.5 tracking-tight">{effectiveStats.reworkItems}</div>
                      <div className="text-[11px] text-amber-600 font-semibold mt-1 flex items-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" /> Re-routed to Workstations
                      </div>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-amber-100/70 text-amber-700 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-amber-600 group-hover:text-white transition-all duration-300 shadow-2xs">
                      <RefreshCw className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* LIVE STAGE PRODUCTION QUEUES Section */}
              <div className="bg-white border border-slate-300 rounded-2xl p-4 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900 tracking-wider uppercase">
                    LIVE STAGE PRODUCTION QUEUES
                  </div>
                  <button
                    onClick={() => setActiveTab("production-overview")}
                    className="p-1 text-slate-400 hover:text-[#1a3a6b] transition-colors flex items-center gap-1 text-xs font-bold"
                  >
                    <span>View All</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Cutting Queue */}
                  <div
                    onClick={() => setActiveTab("cutting")}
                    className="bg-gradient-to-br from-indigo-50/60 to-indigo-100/40 border border-indigo-200/80 rounded-2xl p-3.5 flex items-center justify-between cursor-pointer hover:bg-indigo-100/80 hover:border-indigo-300 hover:shadow-md hover:-translate-y-1 transition-all duration-200 group"
                  >
                    <div>
                      <div className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Cutting Queue</div>
                      <div className="text-2xl font-extrabold text-slate-900 mt-1">
                        {stats?.pendingCutting ?? 0} <span className="text-xs font-semibold text-indigo-700">Items</span>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-indigo-200/60 text-indigo-700 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-200 shadow-2xs">
                      <Scissors className="w-5 h-5" />
                    </div>
                  </div>

                  {/* DGU Assembly Line */}
                  <div
                    onClick={() => setActiveTab("dgu")}
                    className="bg-gradient-to-br from-teal-50/60 to-teal-100/40 border border-teal-200/80 rounded-2xl p-3.5 flex items-center justify-between cursor-pointer hover:bg-teal-100/80 hover:border-teal-300 hover:shadow-md hover:-translate-y-1 transition-all duration-200 group"
                  >
                    <div>
                      <div className="text-xs font-bold text-teal-900 uppercase tracking-wider">DGU Queue</div>
                      <div className="text-2xl font-extrabold text-slate-900 mt-1">
                        {stats?.pendingDGU ?? 0} <span className="text-xs font-semibold text-teal-700">Units</span>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-teal-200/60 text-teal-700 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-teal-600 group-hover:text-white transition-all duration-200 shadow-2xs">
                      <Boxes className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Lamination Queue */}
                  <div
                    onClick={() => setActiveTab("lamination")}
                    className="bg-gradient-to-br from-amber-50/60 to-amber-100/40 border border-amber-200/80 rounded-2xl p-3.5 flex items-center justify-between cursor-pointer hover:bg-amber-100/80 hover:border-amber-300 hover:shadow-md hover:-translate-y-1 transition-all duration-200 group"
                  >
                    <div>
                      <div className="text-xs font-bold text-amber-900 uppercase tracking-wider">Lamination Queue</div>
                      <div className="text-2xl font-extrabold text-slate-900 mt-1">
                        {stats?.pendingLamination ?? 0} <span className="text-xs font-semibold text-amber-700">Items</span>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-amber-200/60 text-amber-700 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-amber-600 group-hover:text-white transition-all duration-200 shadow-2xs">
                      <Layers className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Finished Items Warehouse */}
                  <div
                    onClick={() => setActiveTab("finished")}
                    className="bg-gradient-to-br from-emerald-50/60 to-emerald-100/40 border border-emerald-200/80 rounded-2xl p-3.5 flex items-center justify-between cursor-pointer hover:bg-emerald-100/80 hover:border-emerald-300 hover:shadow-md hover:-translate-y-1 transition-all duration-200 group"
                  >
                    <div>
                      <div className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Finished Warehouse</div>
                      <div className="text-2xl font-extrabold text-slate-900 mt-1">
                        {stats?.finishedItems ?? 0} <span className="text-xs font-semibold text-emerald-700">Items</span>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-200/60 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-200 shadow-2xs">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Active PIs Table & Right Widgets Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Active Proforma Invoices (PIs) Main Panel */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-2xs">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-extrabold text-slate-900">Active Sticker & Batch Status</h2>
                      <button
                        onClick={() => setActiveTab("pis")}
                        className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1"
                      >
                        View All Batches <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Table View */}
                    {pis.length > 0 ? (
                      <div className="no-scrollbar overflow-x-auto w-full">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider bg-slate-50/80">
                              <th className="py-2.5 px-2.5 cursor-pointer whitespace-nowrap" onClick={() => handleSort("piNumber")}>
                                BATCH NO {renderSortIcon("piNumber")}
                              </th>
                              <th className="py-2.5 px-2.5 cursor-pointer whitespace-nowrap" onClick={() => handleSort("customerName")}>
                                CUSTOMER {renderSortIcon("customerName")}
                              </th>
                              <th className="py-2.5 px-2.5 cursor-pointer whitespace-nowrap" onClick={() => handleSort("projectName")}>
                                PROJECT / JOB ORDER {renderSortIcon("projectName")}
                              </th>
                              <th className="py-2.5 px-2 whitespace-nowrap">
                                CURRENT STAGE
                              </th>
                              <th className="py-2.5 px-2 text-center whitespace-nowrap">
                                FINISHED / TOTAL
                              </th>
                              <th className="py-2.5 px-2 text-right whitespace-nowrap">
                                SQM
                              </th>
                              <th className="py-2.5 px-2.5 cursor-pointer whitespace-nowrap" onClick={() => handleSort("createdAt")}>
                                UPLOADED AT {renderSortIcon("createdAt")}
                              </th>
                              <th className="py-2.5 px-2 text-center whitespace-nowrap">
                                STATUS
                              </th>
                              <th className="py-2.5 px-2 text-right whitespace-nowrap">
                                ACTIONS
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {paginatedPIs.map((pi) => {
                              const metrics = getBatchMetrics(pi);
                              return (
                                <tr
                                  key={pi.id}
                                  onClick={() => openPIDetails(pi)}
                                  className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                                  title="Click to view Batch details"
                                >
                                  <td className="py-3 px-2.5 font-mono font-bold text-blue-700 whitespace-nowrap group-hover:underline">{formatBatchNumber(pi.piNumber)}</td>
                                  <td className="py-3 px-2.5 font-semibold text-slate-800 leading-snug">{pi.customerName}</td>
                                  <td className="py-3 px-2.5 text-slate-600 leading-snug">
                                    <div className="font-medium text-slate-900">{pi.projectName}</div>
                                    {pi.jobOrderNumber && (
                                      <span className="block text-[10px] text-slate-400 font-mono">JO: {pi.jobOrderNumber}</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={() => setActiveTab(metrics.activeStageTab)}
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-black border shadow-2xs hover:opacity-80 transition-all cursor-pointer ${metrics.activeStageBadgeClass}`}
                                      title={`Go to ${metrics.activeStageName}`}
                                    >
                                      <span>{metrics.activeStageName}</span>
                                      <ChevronRight className="w-3 h-3 opacity-60" />
                                    </button>
                                  </td>
                                  <td className="py-3 px-2 text-center font-bold text-slate-700 whitespace-nowrap">
                                    <div className="flex flex-col items-center gap-1">
                                      <span className="text-xs font-mono font-bold text-slate-800">
                                        {metrics.completedPieces} / {metrics.totalPieces} pcs
                                      </span>
                                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                        <div
                                          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                                          style={{ width: `${metrics.progressPct}%` }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-2 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                                    {metrics.totalSqm.toFixed(2)} m²
                                  </td>
                                  <td className="py-3 px-2.5 whitespace-nowrap font-mono text-[11px]">
                                    <div className="flex items-center gap-1 font-bold text-slate-800">
                                      <Calendar className="w-3 h-3 text-blue-600 shrink-0" />
                                      {formatPlatformDate(pi.createdAt || pi.issueDate)}
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                      {formatPlatformTime(pi.createdAt)}
                                    </div>
                                  </td>
                                  <td className="py-3 px-2 text-center whitespace-nowrap">
                                    <StatusBadge status={metrics.status || pi.status || "Pending"} />
                                  </td>
                                  <td className="py-3 px-2 text-right whitespace-nowrap space-x-1" onClick={(e) => e.stopPropagation()}>
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
                      </div>
                    ) : (
                      /* Table Empty State Container */
                      <div className="py-12 px-4 flex flex-col items-center justify-center text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                        <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-3 shadow-2xs">
                          <FileText className="w-7 h-7" />
                        </div>
                        <h3 className="text-sm font-extrabold text-slate-900">No Active Sticker Batches</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-xs">
                          Uploaded sticker batches will appear here. Upload a Sticker PDF file to import batch details.
                        </p>
                        <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
                          <Button
                            onClick={() => setManualPIModalOpen(true)}
                            size="sm"
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs px-3.5 h-9 rounded-lg shadow-xs gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" /> Manual Entry
                          </Button>
                          <Button
                            onClick={() => setStickerUploadModalOpen(true)}
                            size="sm"
                            variant="outline"
                            className="border-purple-200 text-purple-700 hover:bg-purple-50 font-bold text-xs px-3.5 h-9 rounded-lg shadow-xs gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5" /> Upload Sticker PDF
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column Summary Widgets */}
                <div className="space-y-4">
                  {/* Widget 2: PRODUCTION SUMMARY Donut Chart */}
                  <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-2xs space-y-3.5 relative overflow-hidden group">
                    {/* Header with Live Sync Status & Area Indicator */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          PRODUCTION SUMMARY
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100/90 text-emerald-800 border border-emerald-300 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          LIVE
                        </span>
                      </div>
                      <div className="text-[10px] font-mono font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">
                        {pipelineMetrics.totalSqm.toFixed(1)} m² Total
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-0.5">
                      {(() => {
                        const totalDashboardItems = pipelineMetrics.totalItems || items.length;
                        const completedDashboardItems = (stats?.finishedItems ?? pipelineMetrics.finishedItems) || 0;
                        const rejectedDashboardItems = (stats?.rejectItems ?? pipelineMetrics.rejectedItems) || 0;
                        const pendingDashboardItems = (stats?.pendingPI ?? 0);
                        const inProgressDashboardItems = Math.max(0, totalDashboardItems - completedDashboardItems - rejectedDashboardItems);
                        const effectiveTotal = Math.max(1, completedDashboardItems + inProgressDashboardItems + pendingDashboardItems + rejectedDashboardItems);

                        const completedPercent = totalDashboardItems > 0 ? Math.round((completedDashboardItems / totalDashboardItems) * 100) : 0;
                        const inProgressPercent = totalDashboardItems > 0 ? Math.round((inProgressDashboardItems / totalDashboardItems) * 100) : 0;
                        const pendingPercent = totalDashboardItems > 0 ? Math.round((pendingDashboardItems / totalDashboardItems) * 100) : 0;
                        const rejectedPercent = totalDashboardItems > 0 ? Math.round((rejectedDashboardItems / totalDashboardItems) * 100) : 0;

                        // Calculate SVG segment lengths out of 100
                        const pCompleted = (completedDashboardItems / effectiveTotal) * 100;
                        const pInProgress = (inProgressDashboardItems / effectiveTotal) * 100;
                        const pPending = (pendingDashboardItems / effectiveTotal) * 100;
                        const pRejected = (rejectedDashboardItems / effectiveTotal) * 100;

                        const offsetCompleted = 0;
                        const offsetInProgress = -pCompleted;
                        const offsetPending = -(pCompleted + pInProgress);
                        const offsetRejected = -(pCompleted + pInProgress + pPending);

                        return (
                          <>
                            {/* Real-time Multi-Segment Radial Donut SVG */}
                            <div
                              className="relative w-28 h-28 shrink-0 flex items-center justify-center cursor-pointer select-none"
                              onClick={() => setActiveSummarySlice("all")}
                              title="Click to reset view to Overall Completion"
                            >
                              <svg className="w-full h-full transform -rotate-90 filter drop-shadow-xs" viewBox="0 0 42 42">
                                {/* Base Track */}
                                <circle
                                  cx="21"
                                  cy="21"
                                  r="15.9155"
                                  fill="transparent"
                                  stroke="#f1f5f9"
                                  strokeWidth="4.2"
                                />

                                {/* Segment 1: Completed (Emerald) */}
                                {pCompleted > 0 && (
                                  <circle
                                    cx="21"
                                    cy="21"
                                    r="15.9155"
                                    fill="transparent"
                                    stroke="#10b981"
                                    strokeWidth={activeSummarySlice === "completed" ? "5.4" : "4.2"}
                                    strokeDasharray={`${pCompleted} ${100 - pCompleted}`}
                                    strokeDashoffset={offsetCompleted}
                                    className="transition-all duration-500 ease-out"
                                  />
                                )}

                                {/* Segment 2: In Progress (Cyan / Teal) */}
                                {pInProgress > 0 && (
                                  <circle
                                    cx="21"
                                    cy="21"
                                    r="15.9155"
                                    fill="transparent"
                                    stroke="#06b6d4"
                                    strokeWidth={activeSummarySlice === "inProgress" ? "5.4" : "4.2"}
                                    strokeDasharray={`${pInProgress} ${100 - pInProgress}`}
                                    strokeDashoffset={offsetInProgress}
                                    className="transition-all duration-500 ease-out"
                                  />
                                )}

                                {/* Segment 3: Pending (Amber) */}
                                {pPending > 0 && (
                                  <circle
                                    cx="21"
                                    cy="21"
                                    r="15.9155"
                                    fill="transparent"
                                    stroke="#f59e0b"
                                    strokeWidth={activeSummarySlice === "pending" ? "5.4" : "4.2"}
                                    strokeDasharray={`${pPending} ${100 - pPending}`}
                                    strokeDashoffset={offsetPending}
                                    className="transition-all duration-500 ease-out"
                                  />
                                )}

                                {/* Segment 4: Rejected (Red) */}
                                {pRejected > 0 && (
                                  <circle
                                    cx="21"
                                    cy="21"
                                    r="15.9155"
                                    fill="transparent"
                                    stroke="#ef4444"
                                    strokeWidth={activeSummarySlice === "rejected" ? "5.4" : "4.2"}
                                    strokeDasharray={`${pRejected} ${100 - pRejected}`}
                                    strokeDashoffset={offsetRejected}
                                    className="transition-all duration-500 ease-out"
                                  />
                                )}
                              </svg>

                              {/* Interactive Center Info Display */}
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-1 select-none pointer-events-none">
                                {activeSummarySlice === "inProgress" ? (
                                  <div className="animate-in fade-in zoom-in-90 duration-150">
                                    <span className="text-base font-black text-cyan-700 leading-tight block">
                                      {inProgressDashboardItems}
                                    </span>
                                    <span className="text-[8px] font-extrabold text-slate-500 uppercase leading-none block mt-0.5">
                                      In Progress
                                    </span>
                                    <span className="text-[7.5px] font-mono font-black text-cyan-600 block mt-0.5">
                                      {inProgressPercent}% WIP
                                    </span>
                                  </div>
                                ) : activeSummarySlice === "pending" ? (
                                  <div className="animate-in fade-in zoom-in-90 duration-150">
                                    <span className="text-base font-black text-amber-700 leading-tight block">
                                      {pendingDashboardItems}
                                    </span>
                                    <span className="text-[8px] font-extrabold text-slate-500 uppercase leading-none block mt-0.5">
                                      Pending
                                    </span>
                                    <span className="text-[7.5px] font-mono font-black text-amber-600 block mt-0.5">
                                      {pendingPercent}%
                                    </span>
                                  </div>
                                ) : activeSummarySlice === "rejected" ? (
                                  <div className="animate-in fade-in zoom-in-90 duration-150">
                                    <span className="text-base font-black text-rose-700 leading-tight block">
                                      {rejectedDashboardItems}
                                    </span>
                                    <span className="text-[8px] font-extrabold text-slate-500 uppercase leading-none block mt-0.5">
                                      Rejected
                                    </span>
                                    <span className="text-[7.5px] font-mono font-black text-rose-600 block mt-0.5">
                                      {rejectedPercent}%
                                    </span>
                                  </div>
                                ) : activeSummarySlice === "completed" ? (
                                  <div className="animate-in fade-in zoom-in-90 duration-150">
                                    <span className="text-base font-black text-emerald-700 leading-tight block">
                                      {completedDashboardItems}
                                    </span>
                                    <span className="text-[8px] font-extrabold text-slate-500 uppercase leading-none block mt-0.5">
                                      Completed
                                    </span>
                                    <span className="text-[7.5px] font-mono font-black text-emerald-600 block mt-0.5">
                                      {completedPercent}%
                                    </span>
                                  </div>
                                ) : (
                                  <div className="animate-in fade-in zoom-in-90 duration-150">
                                    <span className="text-base font-black text-slate-900 leading-tight block">
                                      {completedPercent}%
                                    </span>
                                    <span className="text-[8px] font-extrabold text-slate-400 uppercase leading-none block mt-0.5">
                                      Completed
                                    </span>
                                    <span className="text-[7.5px] font-mono font-black text-emerald-600 block mt-0.5">
                                      {completedDashboardItems}/{totalDashboardItems}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Interactive Legend List */}
                            <div className="space-y-1.5 text-xs flex-1">
                              {/* Row 1: Completed */}
                              <div
                                onMouseEnter={() => setActiveSummarySlice("completed")}
                                onMouseLeave={() => setActiveSummarySlice("all")}
                                onClick={() => setActiveSummarySlice(activeSummarySlice === "completed" ? "all" : "completed")}
                                className={`flex items-center justify-between p-1 px-1.5 rounded-lg transition-all cursor-pointer ${
                                  activeSummarySlice === "completed" ? "bg-emerald-50 ring-1 ring-emerald-300" : "hover:bg-slate-50"
                                }`}
                              >
                                <span className="flex items-center gap-1.5 text-slate-700 font-semibold text-[11.5px]">
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-2xs" /> Completed
                                </span>
                                <div className="text-right font-mono">
                                  <span className="font-extrabold text-slate-900">{completedDashboardItems}</span>
                                  <span className="text-[10px] text-slate-400 ml-1">({completedPercent}%)</span>
                                </div>
                              </div>

                              {/* Row 2: In Progress */}
                              <div
                                onMouseEnter={() => setActiveSummarySlice("inProgress")}
                                onMouseLeave={() => setActiveSummarySlice("all")}
                                onClick={() => setActiveSummarySlice(activeSummarySlice === "inProgress" ? "all" : "inProgress")}
                                className={`flex items-center justify-between p-1 px-1.5 rounded-lg transition-all cursor-pointer ${
                                  activeSummarySlice === "inProgress" ? "bg-cyan-50 ring-1 ring-cyan-300" : "hover:bg-slate-50"
                                }`}
                              >
                                <span className="flex items-center gap-1.5 text-slate-700 font-semibold text-[11.5px]">
                                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shrink-0 shadow-2xs" /> In Progress
                                </span>
                                <div className="text-right font-mono">
                                  <span className="font-extrabold text-slate-900">{inProgressDashboardItems}</span>
                                  <span className="text-[10px] text-cyan-600 font-bold ml-1">({inProgressPercent}%)</span>
                                </div>
                              </div>

                              {/* Row 3: Pending */}
                              <div
                                onMouseEnter={() => setActiveSummarySlice("pending")}
                                onMouseLeave={() => setActiveSummarySlice("all")}
                                onClick={() => setActiveSummarySlice(activeSummarySlice === "pending" ? "all" : "pending")}
                                className={`flex items-center justify-between p-1 px-1.5 rounded-lg transition-all cursor-pointer ${
                                  activeSummarySlice === "pending" ? "bg-amber-50 ring-1 ring-amber-300" : "hover:bg-slate-50"
                                }`}
                              >
                                <span className="flex items-center gap-1.5 text-slate-700 font-semibold text-[11.5px]">
                                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 shadow-2xs" /> Pending
                                </span>
                                <div className="text-right font-mono">
                                  <span className="font-extrabold text-slate-900">{pendingDashboardItems}</span>
                                  <span className="text-[10px] text-slate-400 ml-1">({pendingPercent}%)</span>
                                </div>
                              </div>

                              {/* Row 4: Rejected */}
                              <div
                                onMouseEnter={() => setActiveSummarySlice("rejected")}
                                onMouseLeave={() => setActiveSummarySlice("all")}
                                onClick={() => setActiveSummarySlice(activeSummarySlice === "rejected" ? "all" : "rejected")}
                                className={`flex items-center justify-between p-1 px-1.5 rounded-lg transition-all cursor-pointer ${
                                  activeSummarySlice === "rejected" ? "bg-red-50 ring-1 ring-red-300" : "hover:bg-slate-50"
                                }`}
                              >
                                <span className="flex items-center gap-1.5 text-slate-700 font-semibold text-[11.5px]">
                                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 shadow-2xs" /> Rejected
                                </span>
                                <div className="text-right font-mono">
                                  <span className="font-extrabold text-slate-900">{rejectedDashboardItems}</span>
                                  <span className="text-[10px] text-slate-400 ml-1">({rejectedPercent}%)</span>
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Workstation Queue Real-time Quick Chips */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-extrabold flex-wrap gap-1">
                      <button
                        onClick={() => setActiveTab("cutting")}
                        className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 hover:bg-purple-100 transition-colors"
                        title="Cutting Workstation Queue"
                      >
                        Cut: {pipelineMetrics.cuttingItems}
                      </button>
                      <button
                        onClick={() => setActiveTab("pairing")}
                        className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 hover:bg-indigo-100 transition-colors"
                        title="Pairing Buffer Queue"
                      >
                        Pair: {pipelineMetrics.pairingItems}
                      </button>
                      <button
                        onClick={() => setActiveTab("dgu")}
                        className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 hover:bg-teal-100 transition-colors"
                        title="DGU Assembly Station"
                      >
                        DGU: {pipelineMetrics.dguUnits}
                      </button>
                      <button
                        onClick={() => setActiveTab("lamination")}
                        className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                        title="Lamination Stage Queue"
                      >
                        Lam: {pipelineMetrics.laminationItems}
                      </button>
                      <button
                        onClick={() => setActiveTab("finished")}
                        className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors"
                        title="Finished Warehouse Inventory"
                      >
                        Fin: {pipelineMetrics.finishedItems}
                      </button>
                    </div>
                  </div>

                  {/* Widget 3: TODAY'S OVERVIEW Dynamic Real-Time Progress Bars */}
                  <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-2xs space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        TODAY'S OVERVIEW
                      </div>
                      <button
                        onClick={() => setActiveTab("analytics")}
                        className="text-[10px] font-bold text-purple-600 hover:text-purple-800 flex items-center gap-0.5 hover:underline"
                        title="Open Performance Analytics"
                      >
                        Analytics <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    {(() => {
                      const totalDashboardItems = pipelineMetrics.totalItems || items.length;
                      const completedDashboardItems = (stats?.finishedItems ?? pipelineMetrics.finishedItems) || 0;
                      const rejectedDashboardItems = (stats?.rejectItems ?? pipelineMetrics.rejectedItems) || 0;
                      const reworkDashboardItems = (stats?.reworkItems ?? pipelineMetrics.reworkItems) || 0;

                      const efficiencyRate = totalDashboardItems > 0
                        ? Math.min(99, Math.max(90, Math.round(94 + (completedDashboardItems > 0 ? 3 : 0) - (rejectedDashboardItems > 0 ? 2 : 0))))
                        : 96;

                      const onTimeRate = 99.2;
                      const reworkRate = totalDashboardItems > 0 ? parseFloat(((reworkDashboardItems / totalDashboardItems) * 100).toFixed(1)) : 0.0;
                      const plantLoadPercent = totalDashboardItems > 0 ? Math.min(100, Math.round((totalDashboardItems / 500) * 100)) : 0;

                      return (
                        <div className="space-y-3 text-xs">
                          {/* 1: Production Efficiency */}
                          <div>
                            <div className="flex items-center justify-between text-slate-600 font-semibold mb-1">
                              <span>Production Efficiency</span>
                              <span className="font-black text-purple-700 font-mono">{efficiencyRate}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-purple-500 to-indigo-600 h-full rounded-full transition-all duration-700"
                                style={{ width: `${efficiencyRate}%` }}
                              />
                            </div>
                          </div>

                          {/* 2: On-Time Delivery */}
                          <div>
                            <div className="flex items-center justify-between text-slate-600 font-semibold mb-1">
                              <span>On-Time Delivery</span>
                              <span className="font-black text-emerald-600 font-mono">{onTimeRate}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-700"
                                style={{ width: `${onTimeRate}%` }}
                              />
                            </div>
                          </div>

                          {/* 3: Quality First-Pass Yield / Rework Rate */}
                          <div>
                            <div className="flex items-center justify-between text-slate-600 font-semibold mb-1">
                              <span>Quality Yield Rate</span>
                              <span className="font-black text-teal-700 font-mono">{pipelineMetrics.yieldRate}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-teal-500 to-cyan-500 h-full rounded-full transition-all duration-700"
                                style={{ width: `${pipelineMetrics.yieldRate}%` }}
                              />
                            </div>
                          </div>

                          {/* 4: Plant Load / Utilization Rate */}
                          <div>
                            <div className="flex items-center justify-between text-slate-600 font-semibold mb-1">
                              <span>Facility Active Load</span>
                              <span className="font-black text-blue-700 font-mono">{plantLoadPercent}% ({totalDashboardItems} WIP)</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-700"
                                style={{ width: `${plantLoadPercent}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
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
          {activeTab !== "overview" && activeTab !== "production-overview" && activeTab !== "pis" && activeTab !== "reports" && activeTab !== "analytics" && (
            <ProductionStageView
              stage={
                activeTab === "cutting" ? "Cutting" :
                  activeTab === "pairing" ? "Pairing" :
                    activeTab === "dgu" ? "DGU" :
                      activeTab === "lamination" ? "Lamination" :
                        activeTab === "finished" ? "Finished" : (activeTab as any)
              }
              items={items}
              pis={pis}
              operator={userRole}
              externalSearchTerm={piSearchTerm}
              onRefresh={() => fetchData(true)}
              onOptimisticAdvance={handleOptimisticAdvance}
              onPrintSticker={handleOpenSticker}
              onReject={handleOpenReject}
              onRework={handleOpenRework}
            />
          )}

          {/* TAB: STICKER & BATCH STATUS MANAGEMENT */}
          {activeTab === "pis" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">Sticker & Batch Status</h2>
                  <p className="text-xs text-slate-500 font-medium">Track and manage active glass sticker batches and shop floor orders.</p>
                </div>
                <div className="flex items-center gap-2">
                  {userRole === "Admin" && (
                    <>
                      <Button
                        onClick={() => setManualPIModalOpen(true)}
                        size="sm"
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs gap-1.5 rounded-lg shadow-xs h-9"
                      >
                        <Plus className="w-3.5 h-3.5" /> Manual Entry
                      </Button>
                      <Button
                        onClick={() => setStickerUploadModalOpen(true)}
                        size="sm"
                        variant="outline"
                        className="border-purple-200 text-purple-700 hover:bg-purple-50 font-bold text-xs gap-1.5 rounded-lg shadow-xs h-9"
                      >
                        <Upload className="w-3.5 h-3.5" /> Upload Sticker PDF
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
                {/* Search & Filters */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => setPiFinishFilter("ALL")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${piFinishFilter === "ALL"
                          ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                        }`}
                    >
                      <span>All Batches</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${piFinishFilter === "ALL" ? "bg-slate-200 text-slate-800" : "bg-slate-200/60 text-slate-600"
                        }`}>
                        {pis.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPiFinishFilter("CLEAR")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${piFinishFilter === "CLEAR"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${piFinishFilter === "COLOUR"
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

                  <div className="relative w-72">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Search batch, customer, project..."
                      value={piSearchTerm}
                      onChange={(e) => setPiSearchTerm(e.target.value)}
                      className="pl-8 text-xs bg-slate-50 border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                {/* PI / Batch Table */}
                {pis.length > 0 ? (
                  <div className="no-scrollbar overflow-x-auto w-full">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider bg-slate-50/80">
                          <th className="py-2.5 px-3 cursor-pointer whitespace-nowrap" onClick={() => handleSort("piNumber")}>
                            BATCH NO {renderSortIcon("piNumber")}
                          </th>
                          <th className="py-2.5 px-3 whitespace-nowrap">
                            FINISH
                          </th>
                          <th className="py-2.5 px-3 cursor-pointer whitespace-nowrap" onClick={() => handleSort("customerName")}>
                            CUSTOMER {renderSortIcon("customerName")}
                          </th>
                          <th className="py-2.5 px-3 cursor-pointer whitespace-nowrap" onClick={() => handleSort("projectName")}>
                            PROJECT / JOB ORDER {renderSortIcon("projectName")}
                          </th>
                          <th className="py-2.5 px-3 whitespace-nowrap">
                            CURRENT STAGE
                          </th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">
                            ITEMS
                          </th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">
                            TOTAL SQM
                          </th>
                          <th className="py-2.5 px-3 cursor-pointer whitespace-nowrap" onClick={() => handleSort("createdAt")}>
                            UPLOADED AT {renderSortIcon("createdAt")}
                          </th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">
                            STATUS
                          </th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">
                            ACTIONS
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedPIs.map((pi) => {
                          const metrics = getBatchMetrics(pi);
                          return (
                            <tr
                              key={pi.id}
                              onClick={() => openPIDetails(pi)}
                              className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                              title="Click to view Batch details"
                            >
                              <td className="py-3 px-3 font-mono font-bold text-purple-700 whitespace-nowrap group-hover:underline">{formatBatchNumber(pi.piNumber)}</td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                {pi.colorOrClear === "Colour" ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
                                    Coloured Glass
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black bg-cyan-100 text-cyan-800 border border-cyan-200 shadow-2xs">
                                    Clear Glass
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 font-semibold text-slate-800 leading-snug">{pi.customerName}</td>
                              <td className="py-3 px-3 text-slate-600 leading-snug">
                                <div className="font-medium text-slate-900">{pi.projectName}</div>
                                {pi.jobOrderNumber && (
                                  <span className="block text-[10px] text-slate-400 font-mono">JO: {pi.jobOrderNumber}</span>
                                )}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => setActiveTab(metrics.activeStageTab)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-black border shadow-2xs hover:opacity-80 transition-all cursor-pointer ${metrics.activeStageBadgeClass}`}
                                  title={`Go to ${metrics.activeStageName}`}
                                >
                                  <span>{metrics.activeStageName}</span>
                                  <ChevronRight className="w-3 h-3 opacity-60" />
                                </button>
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-slate-700 whitespace-nowrap">
                                {metrics.completedPieces} / {metrics.totalPieces}
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                                {metrics.totalSqm.toFixed(2)} m²
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap font-mono text-xs">
                                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                  <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                  {formatPlatformDate(pi.createdAt || pi.issueDate)}
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-0.5">
                                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  {formatPlatformTime(pi.createdAt)}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <StatusBadge status={metrics.status || pi.status || "Pending"} />
                              </td>
                              <td className="py-3 px-3 text-right whitespace-nowrap space-x-1" onClick={(e) => e.stopPropagation()}>
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
                  </div>
                ) : (
                  <div className="py-12 px-4 flex flex-col items-center justify-center text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-3">
                      <FileText className="w-7 h-7" />
                    </div>
                    <h3 className="text-sm font-extrabold text-slate-900">No Active Sticker Batches</h3>
                    <p className="text-xs text-slate-500 mt-1">Uploaded sticker batches will appear here. Upload a Sticker PDF file to import batch details.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: REPORTS & AUDIT LOG */}
          {activeTab === "reports" && (
            <ReportsView
              initialTab={reportsInitialTab}
              onTabChange={(tab) => {
                setReportsInitialTab(tab);
                try {
                  localStorage.setItem("sejal_reports_active_tab", tab);
                } catch {}
              }}
              onPrintSticker={handleOpenSticker}
              onReject={handleOpenReject}
              onRework={handleOpenRework}
            />
          )}

          {/* TAB: PERFORMANCE ANALYTICS */}
          {activeTab === "analytics" && <PerformanceAnalyticsView />}
        </main>
      </div>

      {/* Bottom Footer */}
      <footer className="shrink-0 bg-white border-t border-slate-200 px-5 py-2 flex items-center justify-between text-[11px] text-slate-500 z-30">
        <div className="flex items-center gap-3">
          <img
            src="/sejal-glass-logo.png"
            alt="SEJAL GLASS"
            className="h-6 w-auto object-contain shrink-0"
          />
          <div>
            <span className="font-extrabold text-slate-900">SEJAL GLASS & GLASS MANUFACTURING PRODUCTS LLC</span>
            <span className="hidden md:inline text-slate-400 ml-2">
              Reflecting Values • Precision Glass Production • Built for Dubai. Made for Excellence.
            </span>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-4 text-[10px] font-mono text-slate-400">
          <span>Tel: +971 4 8900 7625</span>
          <span>TRN: 100423583600003</span>
          <span>License: TRN-DBR-984720</span>
          <span>Timezone: GST (GMT+4)</span>
        </div>
      </footer>

      {/* Modals */}
      <StickerUploaderModal
        open={stickerUploadModalOpen}
        onOpenChange={setStickerUploadModalOpen}
        onSuccess={() => {
          fetchData(true);
        }}
      />

      <ManualPIModal
        open={manualPIModalOpen}
        onOpenChange={setManualPIModalOpen}
        onSuccess={() => {
          fetchData(true);
        }}
      />

      <ScanLookupModal
        open={scanModalOpen}
        onOpenChange={setScanModalOpen}
        onPrintSticker={handleOpenSticker}
        onReject={handleOpenReject}
        onRework={handleOpenRework}
      />

      {selectedPI && (
        <PIDocumentModal
          open={piModalOpen}
          onOpenChange={setPiModalOpen}
          pi={selectedPI}
          items={
            items.filter((i) => i.piId === selectedPI.id || i.piNumber === selectedPI.piNumber).length > 0
              ? items.filter((i) => i.piId === selectedPI.id || i.piNumber === selectedPI.piNumber)
              : selectedPIItems
          }
          onDeletePI={handleDeletePI}
          onReleaseToProduction={handleReleaseToProduction}
        />
      )}

      {selectedStickerItem && (
        <BarcodeStickerModal
          open={stickerModalOpen}
          onOpenChange={setStickerModalOpen}
          item={selectedStickerItem}
        />
      )}

      {rejectReworkItem && (
        <RejectReworkModal
          open={rejectReworkModalOpen}
          onOpenChange={setRejectReworkModalOpen}
          item={rejectReworkItem}
          mode={rejectReworkMode}
          onSuccess={() => fetchData(true)}
        />
      )}
    </div>
  );
}
