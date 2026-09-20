import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { UserRole } from "@shared/api";
import { toast } from "sonner";

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
}

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { username?: string; identifier?: string; password?: string; role?: UserRole }) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "sejal_auth_token";
const USER_KEY = "sejal_auth_user";
const ROLE_KEY = "user_role";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
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

  const [isLoading, setIsLoading] = useState<boolean>(true);

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

  // Validate session on mount
  useEffect(() => {
    const checkAuth = async () => {
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
            localStorage.setItem(USER_KEY, JSON.stringify(data.user));
            localStorage.setItem(ROLE_KEY, data.user.role);
          }
        } else {
          // Token invalid or expired
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          setToken(null);
          setUser(null);
        }
      } catch (err) {
        console.error("Failed to verify user session:", err);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

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
      const receivedUser: UserProfile = data.user || {
        id: `user-${(data.role || "admin").toLowerCase()}`,
        username: data.username || credentials.username || "user",
        email: `${(data.role || "admin").toLowerCase()}@sejalglass.com`,
        name: data.name || `${data.role || "Admin"} User`,
        role: data.role || "Admin",
      };

      setToken(receivedToken);
      setUser(receivedUser);

      try {
        localStorage.setItem(TOKEN_KEY, receivedToken);
        localStorage.setItem(USER_KEY, JSON.stringify(receivedUser));
        localStorage.setItem(ROLE_KEY, receivedUser.role);
      } catch {}

      return { success: true, message: data.message || `Logged in as ${receivedUser.name}` };
    } catch (err: any) {
      return { success: false, message: err.message || "Network error during login." };
    }
  };

  const logout = () => {
    try {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: getAuthHeaders(),
      }).catch(() => {});

      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(ROLE_KEY);
    } catch {}

    setToken(null);
    setUser(null);
    toast.info("You have been signed out.");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        token,
        isAuthenticated: Boolean(token && user),
        isLoading,
        login,
        logout,
        getAuthHeaders,
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
