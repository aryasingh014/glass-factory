import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ShieldCheck,
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Cpu,
  Factory,
  CheckCircle2,
  Sparkles,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

interface RolePreset {
  role: UserRole;
  username: string;
  defaultPass: string;
  name: string;
  colorClass: string;
  badgeClass: string;
  description: string;
}

const ROLE_PRESETS: RolePreset[] = [
  {
    role: "Admin",
    username: "admin",
    defaultPass: "Admin@123",
    name: "System Administrator",
    colorClass: "from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
    description: "Full system config, DB controls & batch management",
  },
  {
    role: "Supervisor",
    username: "supervisor",
    defaultPass: "Supervisor@123",
    name: "Production Supervisor",
    colorClass: "from-blue-600 to-cyan-700 hover:from-blue-700 hover:to-cyan-800",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
    description: "PI release, QC oversight & audit reporting",
  },
  {
    role: "Operator",
    username: "operator",
    defaultPass: "Operator@123",
    name: "Shop Floor Operator",
    colorClass: "from-amber-600 to-emerald-700 hover:from-amber-700 hover:to-emerald-800",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    description: "Barcode scanning, stage execution & defect entry",
  },
];

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState("admin");
  const [password, setPassword] = useState("Admin@123");
  const [selectedRole, setSelectedRole] = useState<UserRole>("Admin");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as any)?.from?.pathname || "/app";

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSelectPreset = (preset: RolePreset) => {
    setSelectedRole(preset.role);
    setIdentifier(preset.username);
    setPassword(preset.defaultPass);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Please enter your username/email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await login({
        identifier: identifier.trim(),
        password,
        role: selectedRole,
      });

      if (res.success) {
        toast.success(res.message || "Authentication successful!");
        navigate(from, { replace: true });
      } else {
        setError(res.message || "Invalid credentials. Please verify username and password.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070d17] text-slate-100 flex flex-col justify-between selection:bg-red-900 selection:text-white font-sans relative overflow-hidden">
      {/* Background Ambient Glows & Grid */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-1/4 w-[600px] h-[600px] bg-blue-600/15 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[600px] h-[600px] bg-red-600/15 rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      </div>

      {/* Top Header / Branding Bar */}
      <header className="relative z-10 p-6 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-3">
          <img
            src="/sejal-glass-logo.png"
            alt="Sejal Glass Ltd"
            className="h-10 w-auto object-contain bg-white/95 px-3 py-1 rounded-xl shadow-xs"
          />
        </Link>
        <Link
          to="/"
          className="text-xs font-bold text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
        >
          <span>Return to Homepage</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      {/* Main Card Container */}
      <main className="relative z-10 flex items-center justify-center p-4 flex-1">
        <div className="w-full max-w-xl">
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800/90 p-8 sm:p-10 shadow-2xl backdrop-blur-2xl space-y-6">
            {/* Title & Subtitle */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800/80 text-[11px] font-extrabold text-blue-300">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>Enterprise RBAC Security</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase">
                Production ERP Portal
              </h1>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Sign in with your role-specific credentials to access workstations and audit consoles.
              </p>
            </div>

            {/* Quick Demo Role Selector */}
            <div className="space-y-2">
              <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Select User Role</span>
                <span className="text-[10px] text-blue-400 font-normal">Click to auto-fill credentials</span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {ROLE_PRESETS.map((preset) => {
                  const isSelected = selectedRole === preset.role;
                  return (
                    <button
                      key={preset.role}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer select-none ${
                        isSelected
                          ? "bg-slate-800 border-blue-500 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/50"
                          : "bg-slate-950/60 border-slate-800/90 hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black text-white">{preset.role}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />}
                      </div>
                      <div className="text-[10px] text-slate-400 line-clamp-1">
                        {preset.username}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error Message Banner */}
            {error && (
              <div className="p-3.5 rounded-2xl bg-red-950/80 border border-red-800/80 text-red-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="font-medium leading-relaxed">{error}</div>
              </div>
            )}

            {/* Authentication Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-300 block">
                  Username or Email
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter username (e.g. admin, supervisor, operator)"
                    className="pl-10 h-11 bg-slate-950/80 border-slate-800 text-slate-100 rounded-xl text-xs focus-visible:ring-1 focus-visible:ring-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-300 block">
                    Password
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">
                    Default: {selectedRole}@123
                  </span>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="pl-10 pr-10 h-11 bg-slate-950/80 border-slate-800 text-slate-100 rounded-xl text-xs focus-visible:ring-1 focus-visible:ring-blue-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-[#1a3a6b] via-[#204a87] to-[#1a3a6b] hover:from-[#142c52] hover:to-[#1a3a6b] text-white font-extrabold text-xs rounded-xl shadow-xl shadow-blue-900/30 transition-all hover:scale-[1.01] flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {loading ? (
                  <span>Signing In...</span>
                ) : (
                  <>
                    <Cpu className="w-4 h-4 text-amber-300" />
                    <span>Sign In as {selectedRole}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>

            {/* Default Role Info Footnote */}
            <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Sejal Glass Operations ERP</span>
              <span className="font-mono">v2.4.0 • Dubai Plant</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 p-6 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} Sejal Glass Ltd. All rights reserved. Reflecting Values.
      </footer>
    </div>
  );
}
