import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { UserRole, RolePermissions, ProductionStage } from "@shared/api";
import { toast } from "sonner";

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  assignedStages?: ProductionStage[];
}

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  token: string | null;
  sessionId: string | null;
  permissions: RolePermissions | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isOnline: boolean;
  lastHeartbeat: Date | null;
  isAdmin: boolean;
  isSupervisor: boolean;
  isOperator: boolean;
  canAccessTab: (tab: string) => boolean;
  canPerformAction: (action: "upload" | "delete" | "dispatch" | "rejectRework" | "reports" | "analytics" | "manageUsers" | "manageSettings" | "clearDb" | "cameraScan" | "printStickers" | "scanLookup" | "undoAdvance" | "manualPI" | "viewPIDocs" | "exportReports") => boolean;
  login: (credentials: { username?: string; identifier?: string; password?: string; role?: UserRole }) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  getAuthHeaders: () => Record<string, string>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "sejal_auth_token";
const USER_KEY = "sejal_auth_user";
const ROLE_KEY = "user_role";
const SESSION_KEY = "sejal_auth_session_id";
const SYNC_CHANNEL_NAME = "sejal_auth_sync_channel";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const savedUser = localStorage.getItem(USER_KEY);
      if (savedUser) return JSON.parse(savedUser);
    } catch {}
    return null;
  });

  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);

  const role: UserRole = user?.role || (localStorage.getItem(ROLE_KEY) as UserRole) || "Admin";

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      "x-user-role": role,
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }, [token, role]);

  // Session verification
  const checkAuth = useCallback(async () => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${savedToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          if (data.permissions) setPermissions(data.permissions);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          localStorage.setItem(ROLE_KEY, data.user.role);
          setIsOnline(true);
          setLastHeartbeat(new Date());
        }
      } else {
        // Token invalid or expired
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(ROLE_KEY);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem("sejal_active_module");
        localStorage.removeItem("sejal_reports_active_tab");
        setToken(null);
        setUser(null);
        setSessionId(null);
        setPermissions(null);
      }
    } catch (err) {
      console.error("Failed to verify user session:", err);
      setIsOnline(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Validate session on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Real-time Heartbeat mechanism
  useEffect(() => {
    if (!token) return;

    const pingHeartbeat = async () => {
      try {
        const res = await fetch("/api/auth/heartbeat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          setIsOnline(true);
          setLastHeartbeat(new Date());
        } else if (res.status === 401 || res.status === 403) {
          // Token revoked or session terminated remotely
          setIsOnline(false);
          logout();
          toast.error("Session expired or terminated remotely. Please sign in again.");
        }
      } catch {
        setIsOnline(false);
      }
    };

    // Ping every 25 seconds
    const interval = setInterval(pingHeartbeat, 25000);
    return () => clearInterval(interval);
  }, [token]);

  // Cross-tab Synchronization using BroadcastChannel & storage events
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === "LOGOUT") {
          setToken(null);
          setUser(null);
          setSessionId(null);
          setPermissions(null);
          toast.info("Signed out from another browser tab.");
        } else if (event.data?.type === "LOGIN") {
          checkAuth();
        }
      };
    } catch {}

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) {
        if (!e.newValue) {
          setToken(null);
          setUser(null);
          setSessionId(null);
          setPermissions(null);
        } else {
          setToken(e.newValue);
          checkAuth();
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      if (channel) channel.close();
    };
  }, [checkAuth]);

  const login = async (credentials: {
    username?: string;
    identifier?: string;
    password?: string;
    role?: UserRole;
  }): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error || data.message || "Authentication failed.";
        return { success: false, message: errorMsg };
      }

      const receivedToken = data.token;
      const receivedSessionId = data.sessionId || `ses-${Date.now()}`;
      const receivedUser: UserProfile = data.user || {
        id: `user-${(data.role || "admin").toLowerCase()}`,
        username: data.username || credentials.username || "user",
        email: `${(data.role || "admin").toLowerCase()}@sejalglass.com`,
        name: data.name || `${data.role || "Admin"} User`,
        role: data.role || "Admin",
      };

      setToken(receivedToken);
      setSessionId(receivedSessionId);
      setUser(receivedUser);
      if (data.permissions) setPermissions(data.permissions);
      setIsOnline(true);
      setLastHeartbeat(new Date());

      try {
        localStorage.setItem(TOKEN_KEY, receivedToken);
        localStorage.setItem(SESSION_KEY, receivedSessionId);
        localStorage.setItem(USER_KEY, JSON.stringify(receivedUser));
        localStorage.setItem(ROLE_KEY, receivedUser.role);
        // Reset active module to default on new login
        localStorage.removeItem("sejal_active_module");
        localStorage.removeItem("sejal_reports_active_tab");

        // Broadcast to other tabs
        const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        channel.postMessage({ type: "LOGIN", role: receivedUser.role });
        channel.close();
      } catch {}

      return { success: true, message: data.message || `Logged in as ${receivedUser.name}` };
    } catch (err: any) {
      return { success: false, message: err.message || "Network error during login." };
    }
  };

  const logout = useCallback(() => {
    try {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: getAuthHeaders(),
      }).catch(() => {});

      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(ROLE_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem("sejal_active_module");
      localStorage.removeItem("sejal_reports_active_tab");

      // Broadcast to other tabs
      const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      channel.postMessage({ type: "LOGOUT" });
      channel.close();
    } catch {}

    setToken(null);
    setUser(null);
    setSessionId(null);
    setPermissions(null);
    toast.info("You have been signed out.");
  }, [getAuthHeaders]);

  // Role checking helpers
  const isAdmin = role === "Admin";
  const isSupervisor = role === "Supervisor";
  const isOperator = role === "Operator";

  const canAccessTab = useCallback((tab: string): boolean => {
    if (isAdmin) return true;
    const target = tab.toLowerCase();

    // All roles (including Operators) can view the Dashboard overview first
    if (target === "overview") {
      return true;
    }

    // 1. Check effective permissions (role defaults + user-specific overrides)
    if (permissions) {
      if (target === "settings") {
        return Boolean(permissions.canManageSettings || permissions.canManageUsers);
      }
      if (target === "pis") {
        return Boolean(permissions.canUploadPI || permissions.canDeletePI || permissions.allowedModules?.includes("pis"));
      }
      if (target === "reports") {
        return Boolean(permissions.canViewReports);
      }
      if (target === "analytics") {
        return Boolean(permissions.canViewAnalytics);
      }
      if (target === "production-overview") {
        return Boolean(permissions.canViewReports || permissions.canViewAnalytics || permissions.allowedModules?.includes("production-overview"));
      }
      if (target === "dispatched-history") {
        return Boolean(permissions.canDispatch || permissions.canViewReports);
      }
      if (target === "finished") {
        return Boolean(permissions.canDispatch || permissions.allowedModules?.includes("finished"));
      }
      if (target === "pairing") {
        return Boolean(permissions.allowedModules?.includes("pairing") || permissions.allowedModules?.includes("cutting"));
      }
      if (["cutting", "polishing", "dgu", "lamination"].includes(target)) {
        return Boolean(permissions.allowedModules?.includes(target));
      }
    }

    // 2. Fallbacks if permissions not yet loaded
    if (isSupervisor) {
      // Supervisors can access all operational modules across all 6 workstations, but not admin settings
      return tab !== "settings";
    }
    if (isOperator) {
      if (["production-overview", "pis", "reports", "analytics", "settings"].includes(target)) {
        return false;
      }
      if (user?.assignedStages && user.assignedStages.length > 0) {
        const allowedTabs = new Set<string>();
        for (const stg of user.assignedStages) {
          const s = stg.toLowerCase();
          if (s === "cutting") allowedTabs.add("cutting");
          else if (s === "polishing") allowedTabs.add("polishing");
          else if (s === "pairing") {
            allowedTabs.add("pairing");
            allowedTabs.add("cutting"); // Pairing can be accessed under cutting or standalone
          }
          else if (s === "dgu") allowedTabs.add("dgu");
          else if (s === "lamination") allowedTabs.add("lamination");
          else if (s === "finished" || s === "dispatched" || s === "dispatch") {
            allowedTabs.add("finished");
            allowedTabs.add("dispatched-history");
          }
        }
        return allowedTabs.has(target);
      }
      return ["cutting", "polishing", "pairing", "dgu", "lamination", "finished"].includes(target);
    }
    return false;
  }, [isAdmin, isSupervisor, isOperator, user, permissions]);

  const canPerformAction = useCallback((action: "upload" | "delete" | "dispatch" | "rejectRework" | "reports" | "analytics" | "manageUsers" | "manageSettings" | "clearDb" | "cameraScan" | "printStickers" | "scanLookup" | "undoAdvance" | "manualPI" | "viewPIDocs" | "exportReports"): boolean => {
    if (isAdmin) return true;

    // 1. Check effective permissions
    if (permissions) {
      switch (action) {
        case "upload":
          return Boolean(permissions.canUploadPI);
        case "delete":
          return Boolean(permissions.canDeletePI);
        case "dispatch":
          return Boolean(permissions.canDispatch);
        case "rejectRework":
          return Boolean(permissions.canRejectRework);
        case "reports":
          return Boolean(permissions.canViewReports);
        case "analytics":
          return Boolean(permissions.canViewAnalytics);
        case "manageUsers":
          return Boolean(permissions.canManageUsers);
        case "manageSettings":
          return Boolean(permissions.canManageSettings);
        case "clearDb":
          return Boolean(permissions.canClearData);
        case "cameraScan":
          return Boolean(permissions.canCameraScan ?? true);
        case "printStickers":
          return Boolean(permissions.canPrintStickers ?? true);
        case "scanLookup":
          return Boolean(permissions.canScanLookup ?? true);
        case "undoAdvance":
          return Boolean(permissions.canUndoStageAdvance ?? isSupervisor);
        case "manualPI":
          return Boolean(permissions.canCreateManualPI ?? isSupervisor);
        case "viewPIDocs":
          return Boolean(permissions.canViewPIDocuments ?? isSupervisor);
        case "exportReports":
          return Boolean(permissions.canExportReports ?? isSupervisor);
      }
    }

    // 2. Fallbacks
    if (isSupervisor) {
      return ["upload", "delete", "dispatch", "rejectRework", "reports", "analytics", "cameraScan", "printStickers", "scanLookup", "undoAdvance", "manualPI", "viewPIDocs", "exportReports"].includes(action);
    }
    if (isOperator) {
      if (action === "dispatch") {
        // Can dispatch if assigned to finished/dispatch or unassigned stage operator
        if (!user?.assignedStages || user.assignedStages.length === 0) return true;
        return user.assignedStages.some((s) => ["finished", "dispatched", "dispatch"].includes(s.toLowerCase()));
      }
      return ["rejectRework", "cameraScan", "printStickers", "scanLookup"].includes(action);
    }
    return false;
  }, [isAdmin, isSupervisor, isOperator, user, permissions]);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        token,
        sessionId,
        permissions,
        isAuthenticated: Boolean(token && user),
        isLoading,
        isOnline,
        lastHeartbeat,
        isAdmin,
        isSupervisor,
        isOperator,
        canAccessTab,
        canPerformAction,
        login,
        logout,
        getAuthHeaders,
        refreshSession: checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

