import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ShieldCheck,
  User,
  Users,
  HardHat,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Home,
  Settings,
  LayoutGrid,
  TrendingUp,
  LogIn,
  MapPin,
  Zap,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface RolePreset {
  role: UserRole;
  username: string;
  defaultPass: string;
  hint: string;
}

const ROLE_PRESETS: RolePreset[] = [
  {
    role: "Admin",
    username: "admin",
    defaultPass: "Admin@123",
    hint: "Admin@123",
  },
  {
    role: "Supervisor",
    username: "supervisor",
    defaultPass: "Supervisor@123",
    hint: "Supervisor@123",
  },
  {
    role: "Operator",
    username: "operator",
    defaultPass: "Operator@123",
    hint: "Operator@123",
  },
];

const FEATURE_CARDS = [
  { icon: ShieldCheck, label: "Secure", label2: "Access" },
  { icon: Settings, label: "Streamlined", label2: "Operations" },
  { icon: LayoutGrid, label: "Better", label2: "Efficiency" },
  { icon: TrendingUp, label: "Sustainable", label2: "Growth" },
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
  const currentPreset = ROLE_PRESETS.find((p) => p.role === selectedRole)!;

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
    <div className="min-h-screen relative flex flex-col bg-slate-950 font-sans overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Full-bleed Dubai Skyline Background */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/dubai-glass-login-bg.jpg')" }}
      />

      {/* Cinematic Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-900/50 to-slate-900/20 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent pointer-events-none" />

      {/* ─── Top Header ─────────────────────────────────────────── */}
      <header className="relative z-20 px-6 sm:px-10 pt-6 pb-2 flex items-center justify-between max-w-[1400px] mx-auto w-full">
        {/* Logo Card */}
        <div className="bg-white px-4 py-2.5 rounded-2xl shadow-xl border border-white/80 inline-flex items-center">
          <img
            src="/sejal-glass-logo.png"
            alt="Sejal Glass & Glass Products LLC"
            className="h-9 sm:h-10 w-auto object-contain"
          />
        </div>

        {/* Return to Homepage */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-white hover:text-blue-200 transition-all duration-200 bg-black/25 hover:bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 hover:border-white/35 shadow-lg"
        >
          <div className="w-5 h-5 rounded-full border border-white/40 flex items-center justify-center">
            <Home className="w-3 h-3 text-white" />
          </div>
          <span>Return to Homepage</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      {/* ─── Main Stage ─────────────────────────────────────────── */}
      <main className="relative z-20 flex-1 flex items-center max-w-[1400px] mx-auto w-full px-6 sm:px-10 py-8">
        <div className="w-full flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-16">

          {/* ── LEFT: Brand Narrative ── */}
          <div className="text-white space-y-7 max-w-lg text-left flex-shrink-0">

            {/* Hero Text */}
            <div className="space-y-2">
              <p className="text-[11px] sm:text-[12px] font-black tracking-[0.28em] text-blue-200 uppercase">
                WELCOME TO
              </p>
              <h1 className="text-5xl sm:text-6xl lg:text-[4.25rem] font-black text-white tracking-tight leading-none uppercase drop-shadow-lg">
                SEJAL GLASS
              </h1>
              <p className="text-2xl sm:text-3xl font-extrabold text-blue-300 drop-shadow-sm leading-tight">
                Production ERP Portal
              </p>
            </div>

            {/* Tagline */}
            <div className="space-y-2">
              <p className="text-base sm:text-lg font-bold text-slate-100">
                Manage. Monitor. Grow.
              </p>
              <p className="text-sm text-slate-300 max-w-sm leading-relaxed font-normal">
                Your trusted partner in innovative glass solutions for a brighter tomorrow.
              </p>
            </div>

            {/* 4 Feature Badge Cards — rounded-square style matching reference */}
            <div className="grid grid-cols-4 gap-3 sm:gap-4 pt-1 max-w-sm">
              {FEATURE_CARDS.map(({ icon: Icon, label, label2 }) => (
                <div key={label} className="flex flex-col items-center text-center group">
                  <div
                    className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md flex items-center justify-center text-white mb-2 shadow-md transition-all duration-200 group-hover:bg-white/18 group-hover:scale-105 group-hover:border-white/35"
                    style={{ width: "3.25rem", height: "3.25rem" }}
                  >
                    <Icon className="w-5 h-5 text-white stroke-[2]" />
                  </div>
                  <span className="text-[10.5px] font-bold text-slate-200 leading-tight">
                    {label}<br />{label2}
                  </span>
                </div>
              ))}
            </div>

            {/* Cursive Signature Tagline */}
            <div className="pt-2">
              <span
                className="text-3xl sm:text-4xl text-cyan-200 font-bold italic tracking-wide drop-shadow-[0_2px_14px_rgba(56,189,248,0.55)]"
                style={{ fontFamily: "'Caveat', 'Dancing Script', cursive" }}
              >
                Glass for a Better Future
              </span>
            </div>
          </div>

          {/* ── RIGHT: Login Card ── */}
          <div className="w-full max-w-[470px] flex-shrink-0">
            <div className="bg-white rounded-3xl shadow-[0_32px_72px_rgba(0,0,0,0.40)] border border-slate-100 p-7 sm:p-8 relative overflow-hidden text-left">

              {/* Top-Right Diagonal Architectural Glass Cutout */}
              <div
                className="absolute top-0 right-0 w-[9.5rem] h-[6.5rem] overflow-hidden pointer-events-none rounded-tr-3xl"
                style={{ clipPath: "polygon(28% 0, 100% 0, 100% 100%, 0% 0%)" }}
              >
                <img
                  src="/glass-card-corner.jpg"
                  alt="Sejal Glass Architecture"
                  className="w-full h-full object-cover object-top opacity-95"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/80 via-white/10 to-transparent" />
              </div>

              {/* Enterprise RBAC Security Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-[11px] font-extrabold text-blue-600 mb-4 shadow-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 stroke-[2.5]" />
                <span>Enterprise RBAC Security</span>
              </div>

              {/* Card Title */}
              <div className="space-y-1.5 mb-6">
                <h2 className="text-[1.55rem] font-black text-slate-900 tracking-tight leading-tight">
                  Production ERP{" "}
                  <span className="text-blue-600">Portal</span>
                </h2>
                <p className="text-[12.5px] text-slate-500 font-medium leading-relaxed max-w-[330px]">
                  Sign in with your role-specific credentials to access workstation and audit consoles.
                </p>
              </div>

              {/* Role Selector */}
              <div className="space-y-2 mb-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Select User Role</span>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset(currentPreset)}
                    className="text-[11px] font-bold text-blue-600 flex items-center gap-1 hover:text-blue-700 transition-colors"
                  >
                    <Zap className="w-3 h-3 fill-blue-600" />
                    <span>Click to Auto-fill Credentials</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {ROLE_PRESETS.map((preset) => {
                    const isSelected = selectedRole === preset.role;
                    return (
                      <button
                        key={preset.role}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`p-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer relative select-none ${
                          isSelected
                            ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                            : "bg-slate-50/80 border-slate-200 hover:bg-slate-100/70 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className={`shrink-0 ${isSelected ? "text-blue-600" : "text-slate-400"}`}>
                              {preset.role === "Admin" && <User className="w-4 h-4 stroke-[2.2]" />}
                              {preset.role === "Supervisor" && <Users className="w-4 h-4 stroke-[2.2]" />}
                              {preset.role === "Operator" && <HardHat className="w-4 h-4 stroke-[2.2]" />}
                            </div>
                            <div className="min-w-0">
                              <div className={`text-[11.5px] font-black leading-tight truncate ${isSelected ? "text-blue-900" : "text-slate-800"}`}>
                                {preset.role}
                              </div>
                              <div className="text-[10px] text-slate-400 font-medium leading-tight lowercase truncate">
                                {preset.username}
                              </div>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                              <CheckCircle2 className="w-3 h-3 text-white fill-blue-600 stroke-white stroke-[1.5]" />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Error Banner */}
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Username or Email
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <Input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="admin"
                      className="pl-10 h-11 bg-slate-50 border-slate-200 text-slate-900 rounded-xl text-sm font-medium focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-400 transition-all"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 block">
                      Password
                    </label>
                    <span className="text-[10.5px] font-mono text-slate-400 tracking-tight">
                      Default: {currentPreset.hint}
                    </span>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 pr-11 h-11 bg-slate-50 border-slate-200 text-slate-900 rounded-xl text-sm font-medium focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-400 transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-70 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer mt-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing In...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Sign In as {selectedRole}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>

              {/* Card Footer */}
              <div className="pt-4 mt-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between font-medium">
                <span>Sejal Glass Operations ERP</span>
                <span className="flex items-center gap-1 font-mono text-[10.5px] text-slate-500">
                  <MapPin className="w-3 h-3 text-blue-500" />
                  <span>v2.4.0 • Dubai Plant</span>
                </span>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-20 py-3 text-center text-[10px] text-white/35 tracking-wide">
        © {new Date().getFullYear()} Sejal Glass &amp; Glass Manufacturing Products LLC. Reflecting Values.
      </footer>
    </div>
  );
}
