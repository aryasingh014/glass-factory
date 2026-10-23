import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { 
  Settings, Users, Shield, Bell, Plus, Edit2, Trash2, Save, X, Key, KeyRound,
  Mail, Lock, CheckCircle2, AlertCircle, RefreshCw, Check, Minus,
  Power, Smartphone, Laptop, Globe, ShieldCheck, UserCheck, Zap, Activity,
  Search, Filter, Scissors, Sparkles, Layers, Boxes, Box, PackageCheck,
  Truck, Camera, Tag, ScanLine, RotateCcw, ClipboardList, FileSpreadsheet,
  FileText, Eye, AlertOctagon, SlidersHorizontal, Calendar, AlertTriangle
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { UserRole, UserRecord, UserSession, RolePermissions, ProductionStage } from "@shared/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export const WORKSTATION_STAGES: { stage: ProductionStage; label: string; description: string; badgeClass: string }[] = [
  { stage: "Cutting", label: "Cutting", description: "Glass Cutting & Breaking Tables", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  { stage: "Polishing", label: "Polishing", description: "Edge Grinding & Polishing Line", badgeClass: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { stage: "Pairing", label: "Pairing", description: "Assembly & Buffer Pairing", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { stage: "DGU", label: "IGU / DGU", description: "Insulated Double Glazing Line", badgeClass: "bg-teal-50 text-teal-700 border-teal-200" },
  { stage: "Lamination", label: "Lamination", description: "PVB / EVA Autoclave Line", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  { stage: "Dispatched", label: "Dispatch", description: "Finished Warehouse & Dispatch Gate", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
];

export function SettingsView() {
  const { user: currentUser, role: currentRole, getAuthHeaders, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("settings_tab") || "users";

  const setActiveTab = useCallback((tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "users") {
        next.delete("settings_tab");
      } else {
        next.set("settings_tab", tab);
      }
      return next;
    });
  }, [setSearchParams]);

  // User management states
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("ALL");

  // Modal states for creating / editing users
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);

  // Add/Edit Form fields
  const [formData, setFormData] = useState<{
    username: string;
    name: string;
    email: string;
    role: UserRole;
    password: string;
    isActive: boolean;
    assignedStages: ProductionStage[];
  }>({
    username: "",
    name: "",
    email: "",
    role: "Operator" as UserRole,
    password: "",
    isActive: true,
    assignedStages: ["Cutting"],
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Active Sessions states
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Role Permissions Matrix
  const [permissionsMatrix, setPermissionsMatrix] = useState<Record<UserRole, RolePermissions> | null>(null);

  // Granular User Permission Customization
  const [selectedUserForPermsId, setSelectedUserForPermsId] = useState<string | null>(null);

  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/auth/users", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      toast.error("Failed to load users list.");
    } finally {
      setLoadingUsers(false);
    }
  }, [getAuthHeaders]);

  // Fetch active sessions
  const fetchSessions = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/auth/sessions", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch {
      // silent
    } finally {
      setLoadingSessions(false);
    }
  }, [getAuthHeaders, isAdmin]);

  // Fetch permissions
  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/permissions", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setPermissionsMatrix(data.permissions || null);
      }
    } catch {}
  }, [getAuthHeaders]);

  // Permission Matrix Search & Category Filters
  const [moduleSearch, setModuleSearch] = useState("");
  const [moduleCategoryFilter, setModuleCategoryFilter] = useState<string>("ALL");

  // Comprehensive System modules, workstations, floor tools & small parts configuration
  const SYSTEM_MODULES: {
    id: string;
    name: string;
    category: "Shop Floor Workstations" | "Workstation Floor Tools" | "Order & Batch Management" | "Quality Assurance" | "Reports & Plant Intelligence" | "System Administration";
    description: string;
    key: string;
    icon: any;
  }[] = [
    // 1. Shop Floor Workstations
    {
      id: "mod-cutting",
      name: "Cutting Workstation (Glass Cutting & Breaking Tables)",
      category: "Shop Floor Workstations",
      description: "CNC cutting tables, breakout bars, primary barcode labeling & batch drilldown",
      key: "module:cutting",
      icon: Scissors,
    },
    {
      id: "mod-polishing",
      name: "Polishing & Edging Line (Edge Grinding & Arrising)",
      category: "Shop Floor Workstations",
      description: "Straight-line edging, CNC arrising, diamond wheel polishing & bulk rack advance",
      key: "module:polishing",
      icon: Sparkles,
    },
    {
      id: "mod-pairing",
      name: "Pairing & Assembly Buffer Workstation",
      category: "Shop Floor Workstations",
      description: "Inner/outer glass pane matching, pairing queue buffer & DGU unit assembly preparation",
      key: "module:pairing",
      icon: Layers,
    },
    {
      id: "mod-dgu",
      name: "DGU / IGU Insulated Double Glazing Line",
      category: "Shop Floor Workstations",
      description: "Aluminum spacer bending, desiccant gas fill, secondary sealing & paired unit advance",
      key: "module:dgu",
      icon: Boxes,
    },
    {
      id: "mod-lamination",
      name: "Lamination & Autoclave Processing Line",
      category: "Shop Floor Workstations",
      description: "Cleanroom PVB/EVA film layering, vacuum ring de-airing & high-pressure autoclave curing",
      key: "module:lamination",
      icon: Box,
    },
    {
      id: "mod-finished",
      name: "Finished Warehouse & Quality Inspection Staging",
      category: "Shop Floor Workstations",
      description: "Final optical QC inspection, finished goods crating, rack storage & dispatch staging",
      key: "module:finished",
      icon: PackageCheck,
    },
    {
      id: "mod-dispatch-exec",
      name: "Shipment Dispatch & Gate Pass Execution",
      category: "Shop Floor Workstations",
      description: "Authorize delivery gate passes, customer handover notes & mark items as Dispatched",
      key: "canDispatch",
      icon: Truck,
    },

    // 2. Workstation Floor Tools & Hardware
    {
      id: "mod-cam-scan",
      name: "Live Camera Barcode Scanner",
      category: "Workstation Floor Tools",
      description: "Use workstation webcam, USB video camera or mobile camera for real-time barcode scanning",
      key: "canCameraScan",
      icon: Camera,
    },
    {
      id: "mod-print-stickers",
      name: "Thermal Barcode Sticker Printing",
      category: "Workstation Floor Tools",
      description: "Generate & print single piece labels, batch barcodes & thermal sticker rolls",
      key: "canPrintStickers",
      icon: Tag,
    },
    {
      id: "mod-scan-lookup",
      name: "Barcode Diagnostic & Fast Item Lookup Modal",
      category: "Workstation Floor Tools",
      description: "Instant barcode scan diagnostic tool, item status verification & history lookup",
      key: "canScanLookup",
      icon: ScanLine,
    },
    {
      id: "mod-undo-advance",
      name: "Stage Advance Reversal & Step-Back (Undo)",
      category: "Workstation Floor Tools",
      description: "Revert accidental barcode scans and move glass pieces back to previous workstation",
      key: "canUndoStageAdvance",
      icon: RotateCcw,
    },

    // 3. Order & Batch Management
    {
      id: "mod-pi-tracking",
      name: "PI Master Tracking & Production Batches",
      category: "Order & Batch Management",
      description: "Browse Proforma Invoices, batch order completion percentages & customer specifications",
      key: "module:pis",
      icon: ClipboardList,
    },
    {
      id: "mod-pi-upload",
      name: "Excel PI Sheets & Barcode Batch Uploader",
      category: "Order & Batch Management",
      description: "Import customer PI spreadsheets, glass cutting lists & barcode manifest files",
      key: "canUploadPI",
      icon: FileSpreadsheet,
    },
    {
      id: "mod-manual-pi",
      name: "Manual PI Order Creation Modal",
      category: "Order & Batch Management",
      description: "Direct manual creation of new customer PIs, glass specifications & pane dimensions",
      key: "canCreateManualPI",
      icon: FileText,
    },
    {
      id: "mod-pi-docs",
      name: "CAD Drawings & Technical PDF Viewer",
      category: "Order & Batch Management",
      description: "Open uploaded technical engineering drawings, CAD specifications & project PDFs",
      key: "canViewPIDocuments",
      icon: Eye,
    },
    {
      id: "mod-pi-delete",
      name: "PI Batch Deletion & Order Cancellation",
      category: "Order & Batch Management",
      description: "Permanently delete PI batches and cancel active manufacturing orders",
      key: "canDeletePI",
      icon: Trash2,
    },

    // 4. Quality Assurance & Defect Control
    {
      id: "mod-reject-rework",
      name: "Defect Logging & Quality Rejection",
      category: "Quality Assurance",
      description: "Log surface scratches, edge chips, bubbles & reject non-conforming glass panes",
      key: "canRejectRework",
      icon: AlertOctagon,
    },
    {
      id: "mod-remake-queue",
      name: "Remake & Rework Routing Queue",
      category: "Quality Assurance",
      description: "Route rejected items back to Cutting/Polishing for re-cutting and re-fabrication",
      key: "canRejectRework",
      icon: RefreshCw,
    },

    // 5. Reports & Plant Intelligence
    {
      id: "mod-production-overview",
      name: "Factory Floor WIP & Bottleneck Pipeline",
      category: "Reports & Plant Intelligence",
      description: "Live bird's-eye view of active pieces across all stations & pipeline bottlenecks",
      key: "module:production-overview",
      icon: SlidersHorizontal,
    },
    {
      id: "mod-dispatched-history",
      name: "Dispatched History & Delivery Archive",
      category: "Reports & Plant Intelligence",
      description: "Browse historical completed shipments, customer delivery dates & delivery notes",
      key: "module:dispatched-history",
      icon: Calendar,
    },
    {
      id: "mod-audit-reports",
      name: "Daily Production & Operator Audit Reports",
      category: "Reports & Plant Intelligence",
      description: "Daily shift production totals, rejection summaries & operator throughput logs",
      key: "canViewReports",
      icon: FileSpreadsheet,
    },
    {
      id: "mod-export-reports",
      name: "Excel & CSV Data Export",
      category: "Reports & Plant Intelligence",
      description: "Download workstation WIP tables, batch progress matrices & audit reports to Excel",
      key: "canExportReports",
      icon: FileSpreadsheet,
    },
    {
      id: "mod-analytics",
      name: "Plant Performance & OEE Analytics",
      category: "Reports & Plant Intelligence",
      description: "Overall Equipment Effectiveness, availability, quality rate & cycle times",
      key: "canViewAnalytics",
      icon: Zap,
    },

    // 6. System Administration & Security
    {
      id: "mod-user-mgmt",
      name: "User Provisioning & Password Administration",
      category: "System Administration",
      description: "Create user accounts, edit profiles, assign roles and reset passwords",
      key: "canManageUsers",
      icon: Users,
    },
    {
      id: "mod-settings",
      name: "System Configuration & Terminal Sessions",
      category: "System Administration",
      description: "Configure platform settings, manage active operator sessions & terminate sessions",
      key: "canManageSettings",
      icon: Settings,
    },
    {
      id: "mod-clear-db",
      name: "Master Database Reset & System Data Purge",
      category: "System Administration",
      description: "Factory reset database and purge all production records and scan logs",
      key: "canClearData",
      icon: AlertTriangle,
    },
  ];

  const hasPermission = (role: UserRole, permKey: string): boolean => {
    if (role === "Admin") return true;
    const perm = permissionsMatrix?.[role];
    if (!perm) return false;

    if (permKey.startsWith("module:")) {
      const mod = permKey.replace("module:", "");
      return perm.allowedModules?.includes(mod) ?? false;
    }
    return Boolean((perm as any)[permKey]);
  };

  const handleTogglePermission = async (role: UserRole, permKey: string, currentVal: boolean) => {
    if (!isAdmin) {
      toast.error("Only Administrators can modify RBAC permissions.");
      return;
    }
    if (role === "Admin") {
      toast.info("Administrator permissions are locked to full system access.");
      return;
    }

    const newVal = !currentVal;

    // Optimistic UI update
    setPermissionsMatrix((prev) => {
      if (!prev) return prev;
      const rolePerm = { ...prev[role] };
      if (permKey.startsWith("module:")) {
        const mod = permKey.replace("module:", "");
        const modules = rolePerm.allowedModules ? [...rolePerm.allowedModules] : [];
        if (newVal && !modules.includes(mod)) modules.push(mod);
        else if (!newVal) rolePerm.allowedModules = modules.filter((m) => m !== mod);
        rolePerm.allowedModules = modules;
      } else {
        (rolePerm as any)[permKey] = newVal;
      }
      return {
        ...prev,
        [role]: rolePerm,
      };
    });

    try {
      const res = await fetch("/api/auth/permissions", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          role,
          key: permKey,
          value: newVal,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.permissions) setPermissionsMatrix(data.permissions);
        toast.success(`Updated ${role} permission.`);
      } else {
        fetchPermissions();
        toast.error("Failed to update permissions.");
      }
    } catch {
      fetchPermissions();
      toast.error("Error updating permissions.");
    }
  };

  const getUserPermissionValue = (user: UserRecord, permKey: string): { effective: boolean; isOverridden: boolean; roleDefault: boolean } => {
    const basePerm = permissionsMatrix?.[user.role];
    let roleDefault = false;
    if (user.role === "Admin") {
      roleDefault = true;
    } else if (basePerm) {
      if (permKey.startsWith("module:")) {
        const mod = permKey.replace("module:", "");
        roleDefault = basePerm.allowedModules?.includes(mod) ?? false;
      } else {
        roleDefault = Boolean((basePerm as any)[permKey]);
      }
    }

    if (user.role === "Admin") {
      return { effective: true, isOverridden: false, roleDefault: true };
    }

    const custom = user.customPermissions;
    let isOverridden = false;
    let effective = roleDefault;

    if (custom) {
      if (permKey.startsWith("module:")) {
        const mod = permKey.replace("module:", "");
        if (Array.isArray(custom.allowedModules)) {
          isOverridden = true;
          effective = custom.allowedModules.includes(mod);
        }
      } else if (permKey in custom) {
        isOverridden = true;
        effective = Boolean((custom as any)[permKey]);
      }
    }

    // Workstation assigned stages fallback if allowedModules was not explicitly overridden
    if (!isOverridden && user.role === "Operator" && user.assignedStages && user.assignedStages.length > 0) {
      if (permKey.startsWith("module:")) {
        const mod = permKey.replace("module:", "");
        const stageMap: Record<string, string> = {
          cutting: "Cutting",
          polishing: "Polishing",
          pairing: "Pairing",
          dgu: "DGU",
          lamination: "Lamination",
          finished: "Finished",
        };
        const targetStage = stageMap[mod];
        if (targetStage) {
          effective = user.assignedStages.includes(targetStage as ProductionStage);
        }
      } else if (permKey === "canDispatch") {
        effective = user.assignedStages.some((s) => ["finished", "dispatched", "dispatch"].includes(s.toLowerCase()));
      }
    }

    return { effective, isOverridden, roleDefault };
  };

  const handleToggleUserPermission = async (user: UserRecord, permKey: string, currentVal: boolean) => {
    if (!isAdmin) {
      toast.error("Only Administrators can customize user permissions.");
      return;
    }
    if (user.role === "Admin") {
      toast.info("Super Administrator permissions cannot be restricted.");
      return;
    }

    const newVal = !currentVal;

    // Optimistically update users list
    setUsers((prevUsers) =>
      prevUsers.map((u) => {
        if (u.id !== user.id) return u;
        const currentCustom = { ...(u.customPermissions || {}) };
        if (permKey.startsWith("module:")) {
          const mod = permKey.replace("module:", "");
          const baseModules = permissionsMatrix?.[u.role]?.allowedModules || [];
          const existingModules = Array.isArray(currentCustom.allowedModules)
            ? [...currentCustom.allowedModules]
            : [...baseModules];
          if (newVal && !existingModules.includes(mod)) existingModules.push(mod);
          else if (!newVal) {
            const idx = existingModules.indexOf(mod);
            if (idx !== -1) existingModules.splice(idx, 1);
          }
          currentCustom.allowedModules = existingModules;
        } else {
          (currentCustom as any)[permKey] = newVal;
        }
        return { ...u, customPermissions: currentCustom };
      })
    );

    try {
      const res = await fetch("/api/auth/permissions", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          userId: user.id,
          key: permKey,
          value: newVal,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUsers((prev) => prev.map((u) => (u.id === data.user.id ? data.user : u)));
        }
        toast.success(`Updated permission for ${user.name}`);
      } else {
        fetchUsers();
        toast.error("Failed to update user permission.");
      }
    } catch {
      fetchUsers();
      toast.error("Error updating user permission.");
    }
  };

  const handleResetUserPermissions = async (user: UserRecord) => {
    if (!isAdmin) return;
    if (!window.confirm(`Reset all custom permissions for ${user.name} back to standard ${user.role} defaults?`)) {
      return;
    }

    try {
      const res = await fetch("/api/auth/permissions", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          userId: user.id,
          resetUser: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUsers((prev) => prev.map((u) => (u.id === data.user.id ? data.user : u)));
        }
        toast.success(`Reset permissions to ${user.role} defaults for ${user.name}`);
      } else {
        toast.error("Failed to reset permissions.");
      }
    } catch {
      toast.error("Error resetting permissions.");
    }
  };

  const userForPerms =
    users.find((u) => u.id === selectedUserForPermsId) ||
    users.find((u) => u.role !== "Admin") ||
    users[0] ||
    null;

  useEffect(() => {
    fetchUsers();
    if (isAdmin) fetchSessions();
    fetchPermissions();

    // Auto-refresh active sessions every 12 seconds
    const interval = setInterval(() => {
      if (isAdmin && activeTab === "security") {
        fetchSessions();
      }
    }, 12000);
    return () => clearInterval(interval);
  }, [fetchUsers, fetchSessions, fetchPermissions, isAdmin, activeTab]);

  // Handle Add User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.name.trim() || !formData.email.trim() || !formData.password) {
      setFormError("Please fill in all required fields.");
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          ...formData,
          sendEmail: sendWelcomeEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create user");
      }

      toast.success(data.message || `User '${formData.name}' created successfully!`);
      if (data.emailStatus?.sent) {
        toast.success(data.emailStatus.message, { duration: 5000 });
      } else if (data.emailStatus?.message) {
        toast.info(data.emailStatus.message, { duration: 5000 });
      }
      setIsAddUserOpen(false);
      setFormData({ username: "", name: "", email: "", role: "Operator", password: "", isActive: true, assignedStages: ["Cutting"] });
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message || "Failed to create user.");
    } finally {
      setFormSubmitting(false);
    }
  };



  // Handle Edit User
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setFormSubmitting(true);
    setFormError(null);

    try {
      const payload: any = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        isActive: formData.isActive,
        assignedStages: formData.assignedStages,
      };
      if (formData.password.trim()) {
        payload.password = formData.password.trim();
      }

      const res = await fetch(`/api/auth/users/${selectedUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update user");
      }

      toast.success(data.message || `User '${formData.name}' updated!`);
      setIsEditUserOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message || "Failed to update user.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Delete User
  const handleDeleteUser = async (user: UserRecord) => {
    if (user.id === currentUser?.id) {
      toast.error("You cannot delete your own active account.");
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete user '${user.name}' (${user.username})?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/auth/users/${user.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete user");
      }
      toast.success(data.message || "User deleted successfully");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    }
  };

  // Handle Revoke Session
  const handleRevokeSession = async (session: UserSession) => {
    if (!window.confirm(`Terminate session for ${session.name} on ${session.ip}?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/auth/sessions/${session.sessionId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke session");
      toast.success("Active session terminated.");
      fetchSessions();
    } catch (err: any) {
      toast.error(err.message || "Failed to terminate session");
    }
  };

  const openEditModal = (u: UserRecord) => {
    setSelectedUser(u);
    setFormData({
      username: u.username,
      name: u.name,
      email: u.email,
      role: u.role,
      password: "",
      isActive: u.isActive,
      assignedStages: u.assignedStages && u.assignedStages.length > 0 ? u.assignedStages : ["Cutting"],
    });
    setFormError(null);
    setIsEditUserOpen(true);
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole = userRoleFilter === "ALL" || u.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  const tabs = [
    { id: "users", label: "User Management", icon: Users },
    { id: "security", label: "Real-Time Sessions & RBAC", icon: Shield },
    { id: "general", label: "General Settings", icon: Settings },
  ];

  return (
    <div className="w-full px-0 py-0 space-y-2 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white/80 backdrop-blur-md p-2.5 sm:p-3 rounded-xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[9.5px] font-black uppercase tracking-wider whitespace-nowrap">
              RBAC &amp; Authentication Control
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync Active
            </span>
          </div>
          <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">System Settings &amp; Access Control</h1>
          <p className="text-slate-500 text-[11px] font-medium">Manage operator credentials, role-based workstation access, and live user sessions.</p>
        </div>
        
        {activeTab === "users" && (
          <Button 
            onClick={() => {
              setFormData({ username: "", name: "", email: "", role: "Operator", password: "", isActive: true, assignedStages: ["Cutting"] });
              setFormError(null);
              setIsAddUserOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-2xs transition-all h-7 px-3 text-xs flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
          >
            <Plus className="w-3 h-3" />
            Add New User
          </Button>
        )}
      </div>

      {/* Top Tabs Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white/80 backdrop-blur-md p-1 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all duration-200 cursor-pointer text-xs whitespace-nowrap ${
                activeTab === tab.id 
                ? "bg-blue-600 text-white shadow-2xs shadow-blue-500/25 ring-1 ring-blue-600" 
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <tab.icon className={`w-3.5 h-3.5 shrink-0 ${activeTab === tab.id ? "text-white" : "text-slate-500"}`} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-200/70 shrink-0">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Current User</span>
          <span className="text-xs font-bold text-slate-800">{currentUser?.name}</span>
          <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
            {currentRole}
          </span>
        </div>
      </div>

      {/* Settings Content Area */}
      <div className="w-full bg-white/90 backdrop-blur-2xl rounded-xl border border-slate-200/80 p-3 sm:p-3.5 shadow-2xs min-h-[420px]">
          
          {/* ═══ TAB: USER MANAGEMENT ═══ */}
          {activeTab === "users" && (
            <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">User Accounts &amp; Roles</h2>
                  <p className="text-[10.5px] text-slate-500 font-medium">Provision and manage credentials for Admin, Supervisor, and Operator staff.</p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Input
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="h-7 w-40 bg-slate-50 border-slate-200 text-xs rounded-lg"
                  />
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="h-7 px-2 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-lg outline-none"
                  >
                    <option value="ALL">All Roles</option>
                    <option value="Admin">Admin</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Operator">Operator</option>
                  </select>
                  <button
                    onClick={fetchUsers}
                    className="h-7 w-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer shrink-0"
                    title="Refresh users"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingUsers ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Users Table */}
              <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap min-w-[200px]">User / Identifier</th>
                        <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap min-w-[100px]">Role</th>
                        <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap min-w-[170px]">Assigned Stage(s)</th>
                        <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap min-w-[90px]">Status</th>
                        <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap min-w-[140px]">Last Login</th>
                        <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider text-[10px] text-right whitespace-nowrap min-w-[80px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-slate-400 text-xs font-medium">
                            No users match the search criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => {
                          const isSelf = u.id === currentUser?.id;
                          return (
                            <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-3 py-2 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-md bg-blue-50 border border-blue-100 text-blue-600 font-bold flex items-center justify-center text-[10px] shrink-0">
                                    {u.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                                      <span>{u.name}</span>
                                      {isSelf && (
                                        <span className="px-1 py-0.2 rounded bg-blue-100 text-blue-700 text-[8.5px] font-black uppercase tracking-wider whitespace-nowrap inline-flex items-center shrink-0">
                                          You
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[9.5px] text-slate-400 font-mono">{u.username} • {u.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider whitespace-nowrap border shrink-0 ${
                                  u.role === "Admin"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : u.role === "Supervisor"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}>
                                  {u.role}
                                </span>
                                {u.customPermissions && Object.keys(u.customPermissions).length > 0 && (
                                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-indigo-50 border border-indigo-200 text-indigo-700 whitespace-nowrap inline-flex items-center gap-0.5" title="User has custom permission overrides">
                                    <Zap className="w-2.5 h-2.5 fill-indigo-500 text-indigo-500" />
                                    Custom RBAC
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <div className="flex flex-wrap gap-1 items-center max-w-[220px]">
                                  {u.assignedStages && u.assignedStages.length > 0 ? (
                                    u.assignedStages.map((stg) => {
                                      const stgDef = WORKSTATION_STAGES.find((ws) => ws.stage === stg);
                                      const badgeClass = stgDef ? stgDef.badgeClass : "bg-slate-100 text-slate-700 border-slate-200";
                                      const label = stgDef ? stgDef.label : stg;
                                      return (
                                        <span
                                          key={stg}
                                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border inline-flex items-center gap-1 ${badgeClass}`}
                                        >
                                          {label}
                                        </span>
                                      );
                                    })
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-medium italic">All Stages</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <div className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-700 whitespace-nowrap">
                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${u.isActive ? "bg-emerald-500" : "bg-red-400"}`} />
                                  <span>{u.isActive ? "Active" : "Disabled"}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-[10.5px] text-slate-500 font-mono">
                                {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => {
                                      setSelectedUserForPermsId(u.id);
                                      setActiveTab("security");
                                      toast.info(`Configuring granular permissions for ${u.name}`);
                                    }}
                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
                                    title={`Customize RBAC permissions for ${u.name}`}
                                  >
                                    <Shield className="w-3 h-3 text-indigo-500" />
                                  </button>
                                  <button
                                    onClick={() => openEditModal(u)}
                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                                    title="Edit user & password"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  {!isSelf && (
                                    <button
                                      onClick={() => handleDeleteUser(u)}
                                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                                      title="Delete user"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ TAB: SESSIONS & RBAC ═══ */}
          {activeTab === "security" && (
            <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
              
              {/* Active Sessions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900">Live Active Sessions</h2>
                    <p className="text-[10.5px] text-slate-500 font-medium">Real-time heartbeat monitoring of connected shop floor and office terminals.</p>
                  </div>
                  <button
                    onClick={fetchSessions}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingSessions ? "animate-spin" : ""}`} />
                    Refresh Sessions
                  </button>
                </div>

                <div className="bg-white rounded-lg border border-slate-200/80 shadow-2xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80">
                          <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">Active User</th>
                          <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">Role</th>
                          <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">IP / Terminal</th>
                          <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">Heartbeat Status</th>
                          <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider text-[10px] text-right whitespace-nowrap">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sessions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-5 text-center text-slate-400 text-xs font-medium">
                              No active session records found.
                            </td>
                          </tr>
                        ) : (
                          sessions.map((s) => (
                            <tr key={s.sessionId} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-3 py-2 whitespace-nowrap">
                                <div className="font-bold text-slate-900 text-xs">{s.name}</div>
                                <div className="text-[9.5px] text-slate-400 font-mono">{s.username}</div>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase border ${
                                  s.role === "Admin"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : s.role === "Supervisor"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}>
                                  {s.role}
                                </span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <div className="text-[11px] font-mono text-slate-700 font-semibold">{s.ip}</div>
                                <div className="text-[9px] text-slate-400 truncate max-w-[140px]">{s.userAgent}</div>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${s.status === "Active" ? "bg-emerald-500 animate-pulse" : "bg-amber-400"}`} />
                                  <div>
                                    <span className="text-[11px] font-bold text-slate-800">{s.status === "Active" ? "Live Online" : "Idle"}</span>
                                    <div className="text-[9px] text-slate-400 font-mono">
                                      {new Date(s.lastHeartbeat).toLocaleTimeString()}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-right">
                                <button
                                  onClick={() => handleRevokeSession(s)}
                                  className="px-2 py-0.5 rounded-md bg-red-50 hover:bg-red-100 text-red-600 text-[10.5px] font-bold transition-colors cursor-pointer"
                                >
                                  Disconnect
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ═══ Interactive User Access Permission Matrix ═══ */}
              <div className="pt-3.5 border-t border-slate-200/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">Module Access Permission Matrix</h2>
                      <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider border shadow-2xs bg-indigo-50 text-indigo-700 border-indigo-200">
                        Interactive User Access Control
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-500 font-medium mt-0.5">
                      Select any user (User A vs. User B) below to configure and customize their individual module access.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 animate-in fade-in duration-200">
                    {/* User Selection & Overview Bar */}
                    <div className="p-3 bg-gradient-to-r from-indigo-50/80 via-blue-50/50 to-slate-50 border border-indigo-200/80 rounded-xl shadow-2xs">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        
                        {/* User Picker Dropdown */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <label className="text-xs font-extrabold text-slate-800 whitespace-nowrap flex items-center gap-1.5">
                            <UserCheck className="w-4 h-4 text-indigo-600" />
                            Select User to Customize:
                          </label>
                          <select
                            value={userForPerms?.id || ""}
                            onChange={(e) => setSelectedUserForPermsId(e.target.value)}
                            className="h-8.5 px-3 py-1 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-slate-900 shadow-2xs focus:ring-2 focus:ring-indigo-500 focus:outline-none min-w-[280px]"
                          >
                            {users.map((u) => {
                              const hasOverrides = u.customPermissions && Object.keys(u.customPermissions).length > 0;
                              return (
                                <option key={u.id} value={u.id}>
                                  {u.name} (@{u.username}) — {u.role} {hasOverrides ? "★ [Custom RBAC]" : ""}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        {/* Selected User Info & Actions */}
                        {userForPerms && (
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Base Role Badge */}
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-lg border border-slate-200 shadow-2xs text-xs font-bold text-slate-800">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Base Role:</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                                userForPerms.role === "Admin" ? "bg-purple-50 text-purple-700 border border-purple-200" :
                                userForPerms.role === "Supervisor" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                                "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}>
                                {userForPerms.role}
                              </span>
                            </div>

                            {/* Overrides Status Badge */}
                            {userForPerms.customPermissions && Object.keys(userForPerms.customPermissions).length > 0 ? (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-100 border border-indigo-300 text-indigo-800 rounded-lg text-xs font-black shadow-2xs">
                                <Zap className="w-3 h-3 text-indigo-600 fill-indigo-600" />
                                <span>Custom Permissions Active</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold shadow-2xs">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Using Standard {userForPerms.role} Defaults</span>
                              </div>
                            )}

                            {/* Live Permission Counter Badge */}
                            <div className="flex items-center gap-2 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold shadow-2xs">
                              <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                                <Check className="w-3 h-3 stroke-[3]" />
                                {userForPerms ? SYSTEM_MODULES.filter((m) => getUserPermissionValue(userForPerms, m.key).effective).length : 0} Granted
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-500 font-medium">
                                {userForPerms ? SYSTEM_MODULES.filter((m) => !getUserPermissionValue(userForPerms, m.key).effective).length : 0} Disabled
                              </span>
                            </div>

                            {/* Reset Button */}
                            {userForPerms.customPermissions && Object.keys(userForPerms.customPermissions).length > 0 && userForPerms.role !== "Admin" && (
                              <button
                                type="button"
                                onClick={() => handleResetUserPermissions(userForPerms)}
                                className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-600 hover:text-red-700 border border-red-200 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                                title="Revert all customized permissions for this user back to base role defaults"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Reset to Role Defaults
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Search & Category Filter Toolbar */}
                    <div className="space-y-2.5 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        {/* Search Input */}
                        <div className="relative flex-1 max-w-md">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={moduleSearch}
                            onChange={(e) => setModuleSearch(e.target.value)}
                            placeholder="Search by module name, floor tool, report, or keyword..."
                            className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                          />
                          {moduleSearch && (
                            <button
                              type="button"
                              onClick={() => setModuleSearch("")}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Category Filter Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {[
                          { id: "ALL", label: "All Items", count: SYSTEM_MODULES.length },
                          { id: "Shop Floor Workstations", label: "Workstations", count: SYSTEM_MODULES.filter(m => m.category === "Shop Floor Workstations").length },
                          { id: "Workstation Floor Tools", label: "Shop Floor Tools", count: SYSTEM_MODULES.filter(m => m.category === "Workstation Floor Tools").length },
                          { id: "Order & Batch Management", label: "Order & Batches", count: SYSTEM_MODULES.filter(m => m.category === "Order & Batch Management").length },
                          { id: "Quality Assurance", label: "Quality & Remakes", count: SYSTEM_MODULES.filter(m => m.category === "Quality Assurance").length },
                          { id: "Reports & Plant Intelligence", label: "Reports & Intelligence", count: SYSTEM_MODULES.filter(m => m.category === "Reports & Plant Intelligence").length },
                          { id: "System Administration", label: "Administration", count: SYSTEM_MODULES.filter(m => m.category === "System Administration").length },
                        ].map((cat) => {
                          const isActive = moduleCategoryFilter === cat.id;
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setModuleCategoryFilter(cat.id)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                isActive
                                  ? "bg-indigo-600 text-white shadow-2xs"
                                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                              }`}
                            >
                              <span>{cat.label}</span>
                              <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full ${
                                isActive ? "bg-indigo-700 text-indigo-100" : "bg-slate-100 text-slate-500"
                              }`}>
                                {cat.count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Clean 2-Column User Permission Matrix Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/90">
                              <th className="px-4 py-3 font-extrabold text-slate-700 uppercase tracking-wider text-[10.5px]">
                                System Module &amp; Feature Details ({SYSTEM_MODULES.filter((mod) => {
                                  if (moduleCategoryFilter !== "ALL" && mod.category !== moduleCategoryFilter) return false;
                                  if (moduleSearch.trim()) {
                                    const q = moduleSearch.toLowerCase();
                                    return mod.name.toLowerCase().includes(q) || mod.description.toLowerCase().includes(q) || mod.category.toLowerCase().includes(q) || mod.key.toLowerCase().includes(q);
                                  }
                                  return true;
                                }).length} Items)
                              </th>
                              <th className="px-4 py-3 text-center font-extrabold text-slate-700 uppercase tracking-wider text-[10.5px] whitespace-nowrap w-[200px]">
                                <div className="font-black text-indigo-700 text-xs">
                                  {userForPerms?.name ? `${userForPerms.name}'s Access` : "Individual Access"}
                                </div>
                                <div className="text-[8.5px] text-indigo-500 font-mono font-medium tracking-wider">
                                  CLICK TO TOGGLE PERMISSION
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {SYSTEM_MODULES.filter((mod) => {
                              if (moduleCategoryFilter !== "ALL" && mod.category !== moduleCategoryFilter) return false;
                              if (moduleSearch.trim()) {
                                const q = moduleSearch.toLowerCase();
                                return (
                                  mod.name.toLowerCase().includes(q) ||
                                  mod.description.toLowerCase().includes(q) ||
                                  mod.category.toLowerCase().includes(q) ||
                                  mod.key.toLowerCase().includes(q)
                                );
                              }
                              return true;
                            }).map((mod) => {
                              if (!userForPerms) return null;
                              const { effective, isOverridden } = getUserPermissionValue(userForPerms, mod.key);
                              const isUserAdmin = userForPerms.role === "Admin";
                              const IconComponent = mod.icon;

                              const getCatBadge = (cat: string) => {
                                switch (cat) {
                                  case "Shop Floor Workstations": return "bg-blue-50 text-blue-700 border-blue-200";
                                  case "Workstation Floor Tools": return "bg-purple-50 text-purple-700 border-purple-200";
                                  case "Order & Batch Management": return "bg-indigo-50 text-indigo-700 border-indigo-200";
                                  case "Quality Assurance": return "bg-rose-50 text-rose-700 border-rose-200";
                                  case "Reports & Plant Intelligence": return "bg-cyan-50 text-cyan-700 border-cyan-200";
                                  case "System Administration": return "bg-slate-100 text-slate-700 border-slate-300";
                                  default: return "bg-slate-50 text-slate-600 border-slate-200";
                                }
                              };

                              return (
                                <tr key={mod.id} className="hover:bg-slate-50/80 transition-colors">
                                  {/* Module & Feature Info */}
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-start gap-3">
                                      <div className="mt-0.5 p-2 rounded-lg bg-slate-100 border border-slate-200/80 shrink-0 text-slate-600">
                                        <IconComponent className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                          <span className="font-bold text-slate-900 text-xs">{mod.name}</span>
                                          <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold border ${getCatBadge(mod.category)}`}>
                                            {mod.category}
                                          </span>
                                          {isOverridden && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-50 border border-indigo-200 text-indigo-700">
                                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
                                              Custom
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-snug">{mod.description}</p>
                                      </div>
                                    </div>
                                  </td>

                                  {/* User's custom toggle button */}
                                  <td className="px-4 py-2.5 whitespace-nowrap text-center">
                                    {isUserAdmin ? (
                                      <div 
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs select-none shadow-2xs"
                                        title="Administrator accounts are locked to full system access"
                                      >
                                        <Lock className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Full Access (Admin)</span>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleUserPermission(userForPerms, mod.key, effective)}
                                        disabled={!isAdmin}
                                        title={isAdmin ? `Click to ${effective ? "revoke" : "grant"} '${mod.name}' for ${userForPerms.name}` : undefined}
                                        className={`inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 select-none shadow-2xs ${
                                          isAdmin ? "cursor-pointer hover:scale-105 active:scale-95" : "cursor-default"
                                        } ${
                                          effective
                                            ? "bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700"
                                            : "bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-500"
                                        }`}
                                      >
                                        {effective ? (
                                          <>
                                            <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                                            <span>Granted</span>
                                          </>
                                        ) : (
                                          <>
                                            <Minus className="w-3.5 h-3.5 text-slate-400 stroke-[2.5]" />
                                            <span>Disabled</span>
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                            {SYSTEM_MODULES.filter((mod) => {
                              if (moduleCategoryFilter !== "ALL" && mod.category !== moduleCategoryFilter) return false;
                              if (moduleSearch.trim()) {
                                const q = moduleSearch.toLowerCase();
                                return mod.name.toLowerCase().includes(q) || mod.description.toLowerCase().includes(q) || mod.category.toLowerCase().includes(q) || mod.key.toLowerCase().includes(q);
                              }
                              return true;
                            }).length === 0 && (
                              <tr>
                                <td colSpan={2} className="px-4 py-8 text-center text-slate-400 text-xs">
                                  No system modules or tools match your search &ldquo;{moduleSearch}&rdquo;.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}



          {/* ═══ TAB: GENERAL ═══ */}
          {activeTab === "general" && (
            <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">Factory Configuration</h2>
                <p className="text-[10.5px] text-slate-500 font-medium mb-3">Basic information about the production facility.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 uppercase tracking-wider">Facility Name</label>
                    <input type="text" defaultValue="Sejal Glass & Glass Manufacturing Products LLC" className="w-full h-8 bg-white border border-slate-200 rounded-lg px-3 font-medium text-xs text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-2xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 uppercase tracking-wider">Timezone</label>
                    <select className="w-full h-8 bg-white border border-slate-200 rounded-lg px-3 font-medium text-xs text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none shadow-2xs">
                      <option>Asia/Dubai (GST - UTC+4)</option>
                      <option>Asia/Riyadh (AST - UTC+3)</option>
                      <option>Europe/London (GMT)</option>
                    </select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10.5px] font-bold text-slate-700 uppercase tracking-wider">Support Email</label>
                    <input type="email" defaultValue="support@sejalglass.com" className="w-full h-8 bg-white border border-slate-200 rounded-lg px-3 font-medium text-xs text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none shadow-2xs" />
                  </div>
                </div>
              </div>

              <div className="pt-3.5 border-t border-slate-200/60">
                <h2 className="text-sm font-extrabold text-slate-900">System Preferences</h2>
                <div className="mt-2.5 space-y-2">
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200/80 shadow-2xs">
                    <div>
                      <h3 className="font-bold text-xs text-slate-900">Enable Real-Time Scan Audio</h3>
                      <p className="text-[10.5px] text-slate-500 font-medium mt-0.5">Play a success chime on valid barcode scans.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

      </div>

      {/* ═══ MODAL: ADD USER ═══ */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden my-auto animate-in zoom-in-95 duration-200">
            {/* Pinned Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 shrink-0 bg-white">
              <div>
                <h3 className="text-lg font-black text-slate-900">Add New User</h3>
                <p className="text-xs text-slate-500 font-medium">Provision user credentials and select role permissions.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddUserOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleCreateUser} className="flex flex-col min-h-0 flex-1">
              <div className="p-5 sm:px-6 sm:py-5 overflow-y-auto space-y-3.5 flex-1 min-h-0">
                {formError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">Full Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. John Doe"
                      className="h-10 rounded-xl"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">Username</label>
                    <Input
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="e.g. jdoe"
                      className="h-10 rounded-xl"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Email Address</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="e.g. jdoe@sejalglass.com"
                    className="h-10 rounded-xl"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">User Role</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Admin", "Supervisor", "Operator"] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFormData({ ...formData, role: r })}
                        className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          formData.role === r
                            ? "bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/20 shadow-sm"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Workstation / Stage Selection */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 block">
                      Assigned Workstation / Stage
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">Select stage(s) this ID operates</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {WORKSTATION_STAGES.map((ws) => {
                      const isSelected = formData.assignedStages?.includes(ws.stage);
                      return (
                        <button
                          key={ws.stage}
                          type="button"
                          onClick={() => {
                            const current = formData.assignedStages || [];
                            const next = isSelected
                              ? current.filter((s) => s !== ws.stage)
                              : [...current, ws.stage];
                            setFormData({ ...formData, assignedStages: next });
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                            isSelected
                              ? "bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20 text-blue-900 shadow-xs"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">{ws.label}</span>
                            {isSelected ? (
                              <Check className="w-3.5 h-3.5 text-blue-600 stroke-[3]" />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-full border border-slate-300" />
                            )}
                          </div>
                          <p className="text-[9.5px] text-slate-500 font-medium mt-0.5 truncate">{ws.description}</p>
                        </button>
                      );
                    })}
                  </div>
                  {(!formData.assignedStages || formData.assignedStages.length === 0) && (
                    <p className="text-[10.5px] text-amber-600 font-semibold">⚠️ No stage selected (User will have access to all stages).</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Initial Password</label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    className="h-10 rounded-xl"
                    required
                  />
                </div>

                {/* SMTP Welcome Email Checkbox */}
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/80 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="sendWelcomeEmail"
                    checked={sendWelcomeEmail}
                    onChange={(e) => setSendWelcomeEmail(e.target.checked)}
                    className="mt-0.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="sendWelcomeEmail" className="text-xs font-medium text-slate-700 cursor-pointer leading-tight">
                    <span className="font-bold text-blue-900 block">Send Credentials via SMTP Email</span>
                    <span className="text-[11px] text-slate-500">Automatically deliver role credentials and login instructions to user's inbox via Gmail SMTP.</span>
                  </label>
                </div>
              </div>

              {/* Pinned Sticky Footer */}
              <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddUserOpen(false)}
                  className="h-10 rounded-xl font-bold cursor-pointer px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={formSubmitting}
                  className="h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer px-5 shadow-sm shadow-blue-500/20"
                >
                  {formSubmitting ? "Creating User..." : "Create Account"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ MODAL: EDIT USER ═══ */}
      {isEditUserOpen && selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden my-auto animate-in zoom-in-95 duration-200">
            {/* Pinned Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 shrink-0 bg-white">
              <div>
                <h3 className="text-lg font-black text-slate-900">Edit User: {selectedUser.name}</h3>
                <p className="text-xs text-slate-500 font-medium">Update profile details, role, or reset password.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditUserOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleUpdateUser} className="flex flex-col min-h-0 flex-1">
              <div className="p-5 sm:px-6 sm:py-5 overflow-y-auto space-y-3.5 flex-1 min-h-0">
                {formError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">Full Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="h-10 rounded-xl"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">Email Address</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="h-10 rounded-xl"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">User Role</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Admin", "Supervisor", "Operator"] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFormData({ ...formData, role: r })}
                        className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          formData.role === r
                            ? "bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/20 shadow-sm"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Workstation / Stage Selection (Edit) */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 block">
                      Assigned Workstation / Stage
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">Select stage(s) this ID operates</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {WORKSTATION_STAGES.map((ws) => {
                      const isSelected = formData.assignedStages?.includes(ws.stage);
                      return (
                        <button
                          key={ws.stage}
                          type="button"
                          onClick={() => {
                            const current = formData.assignedStages || [];
                            const next = isSelected
                              ? current.filter((s) => s !== ws.stage)
                              : [...current, ws.stage];
                            setFormData({ ...formData, assignedStages: next });
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                            isSelected
                              ? "bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20 text-blue-900 shadow-xs"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">{ws.label}</span>
                            {isSelected ? (
                              <Check className="w-3.5 h-3.5 text-blue-600 stroke-[3]" />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-full border border-slate-300" />
                            )}
                          </div>
                          <p className="text-[9.5px] text-slate-500 font-medium mt-0.5 truncate">{ws.description}</p>
                        </button>
                      );
                    })}
                  </div>
                  {(!formData.assignedStages || formData.assignedStages.length === 0) && (
                    <p className="text-[10.5px] text-amber-600 font-semibold">⚠️ No stage selected (User will have access to all stages).</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    New Password <span className="text-slate-400 font-normal">(Leave blank to keep current)</span>
                  </label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="New password (optional)"
                    className="h-10 rounded-xl"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                  <span className="text-xs font-bold text-slate-700">Account Active</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* Pinned Sticky Footer */}
              <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditUserOpen(false)}
                  className="h-10 rounded-xl font-bold cursor-pointer px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={formSubmitting}
                  className="h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer px-5 shadow-sm shadow-blue-500/20"
                >
                  {formSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}


