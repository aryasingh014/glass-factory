import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
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
  Settings,
  LayoutGrid,
  TrendingUp,
  LogIn,
  Loader2,
  KeyRound,
  Mail,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";

const FEATURE_CARDS = [
  { icon: ShieldCheck, label: "Secure", label2: "Access" },
  { icon: Settings, label: "Streamlined", label2: "Operations" },
  { icon: LayoutGrid, label: "Better", label2: "Efficiency" },
  { icon: TrendingUp, label: "Sustainable", label2: "Growth" },
];

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot Password modal states
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<"REQUEST_OTP" | "VERIFY_OTP">("REQUEST_OTP");
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Countdown timer for resending OTP
  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleOpenForgotModal = () => {
    setForgotIdentifier(identifier.trim() || "");
    setForgotOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setForgotError(null);
    setForgotSuccess(null);
    setForgotStep("REQUEST_OTP");
    setIsForgotModalOpen(true);
  };

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setForgotError("Please enter your username or registered email address.");
      return;
    }

    setForgotLoading(true);
    setForgotError(null);
    setForgotSuccess(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: forgotIdentifier.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send password reset OTP.");
      }

      setMaskedEmail(data.maskedEmail || forgotIdentifier);
      setForgotSuccess(data.message || `A 6-digit OTP code has been dispatched to ${data.maskedEmail}`);
      setForgotStep("VERIFY_OTP");
      setResendCooldown(60);
      toast.success("Password reset OTP code dispatched via SMTP!");
    } catch (err: any) {
      setForgotError(err.message || "Failed to send OTP. Please check your username/email.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyOtpAndResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotOtp.trim() || forgotOtp.trim().length < 6) {
      setForgotError("Please enter the 6-digit OTP code received in your email.");
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setForgotError("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setForgotError("Passwords do not match. Please re-type your new password.");
      return;
    }

    setForgotLoading(true);
    setForgotError(null);

    try {
      const res = await fetch("/api/auth/verify-reset-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: forgotIdentifier.trim(),
          otp: forgotOtp.trim(),
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password.");
      }

      toast.success("Password reset successfully! Please sign in with your new password.");
      setIsForgotModalOpen(false);
      setIdentifier(forgotIdentifier);
      setPassword(newPassword);
      setError(null);
    } catch (err: any) {
      setForgotError(err.message || "Failed to verify OTP code.");
    } finally {
      setForgotLoading(false);
    }
  };

  const from = (location.state as any)?.from?.pathname || "/app";

  // Automatically navigate to app if session is already active
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Please enter your username or email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await login({
        identifier: identifier.trim(),
        password,
      });

      if (res.success) {
        toast.success(res.message || "Authentication successful!");
        navigate(from, { replace: true });
      } else {
        setError(res.message || "Invalid credentials. Please verify your username and password.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative flex flex-col overflow-x-hidden selection:bg-blue-600 selection:text-white"
      style={{ fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif" }}
    >
      {/* ─── Full-bleed Background ─── */}
      {/* The image.png is a bright glass interior — position it so the dark ceiling is on the
          left (natural darkening) and the Burj Khalifa + skyline shows center-left */}
      <div
        className="absolute inset-0 bg-no-repeat"
        style={{
          backgroundImage: "url('/image.png')",
          backgroundSize: "cover",
          backgroundPosition: "35% center",
          filter: "contrast(1.05) saturate(1.15) brightness(1.1) hue-rotate(-2deg)",
        }}
      />

      {/* ─── Gradient Overlays — Minimal and cooler to keep image bright ─── */}
      <div className="absolute inset-0 bg-blue-900/10 pointer-events-none mix-blend-overlay" />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-900/40 via-blue-900/15 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/15 via-transparent to-transparent pointer-events-none" />

      {/* ─── Top Header Bar ─── */}
      <header className="relative z-20 px-8 sm:px-12 pt-5 pb-2 flex items-center justify-between w-full">
        {/* Sejal Glass Logo Card — white box with logo */}
        <div className="bg-white px-3 py-2 rounded-2xl shadow-xl border border-white/90 inline-flex items-center">
          <img
            src="/sejal-glass-logo.png"
            alt="Sejal Glass & Glass Products LLC"
            className="h-10 sm:h-11 w-auto object-contain"
          />
        </div>

        {/* System Online Status Badge */}
        <div className="inline-flex items-center gap-2 text-[11.5px] font-semibold text-slate-200 bg-black/30 backdrop-blur-md px-4 py-2 rounded-full border border-white/15 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Operations System Online</span>
        </div>
      </header>

      {/* ─── Main Stage ─── */}
      <main className="relative z-20 flex-1 flex items-center w-full px-8 sm:px-12 py-4">
        <div className="w-full flex flex-row items-center justify-between gap-8 lg:gap-12">

          {/* ══ LEFT: Brand Narrative Panel ══ */}
          <div className="text-white flex flex-col gap-5 max-w-[450px] flex-shrink-0">

            {/* ── Hero Heading block ── */}
            <div className="space-y-0.5">
              {/* "WELCOME TO" — tiny uppercase spaced label */}
              <p
                className="text-[11px] font-black text-blue-200 uppercase mb-1.5"
                style={{ letterSpacing: "0.22em" }}
              >
                WELCOME TO
              </p>

              {/* "SEJAL GLASS" — giant white ultra-bold */}
              <h1
                className="font-black text-white uppercase leading-none drop-shadow-lg whitespace-nowrap"
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: "clamp(2.6rem, 4vw, 3.8rem)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1,
                }}
              >
                SEJAL GLASS
              </h1>

              {/* "Production ERP Portal" — medium blue bold */}
              <p
                className="font-extrabold text-blue-400 leading-tight"
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: "clamp(1.2rem, 2.2vw, 1.55rem)",
                  marginTop: "0.2rem",
                }}
              >
                Production ERP Portal
              </p>
            </div>

            {/* ── Taglines ── */}
            <div className="space-y-1">
              <p className="text-[15px] font-bold text-slate-100">
                Manage. Monitor. Grow.
              </p>
              <p className="text-[12.5px] text-slate-300 max-w-[280px] leading-relaxed font-normal">
                Your trusted partner in innovative glass
                <br />solutions for a brighter tomorrow.
              </p>
            </div>

            {/* ── 4 Feature Icon Cards ── */}
            <div className="grid grid-cols-4 gap-2.5 max-w-[300px]">
              {FEATURE_CARDS.map(({ icon: Icon, label, label2 }) => (
                <div key={label} className="flex flex-col items-center text-center">
                  <div
                    className="rounded-[12px] border border-white/20 bg-white/10 backdrop-blur-md flex items-center justify-center text-white mb-1.5 shadow-md"
                    style={{ width: "2.75rem", height: "2.75rem" }}
                  >
                    <Icon className="w-[16px] h-[16px] text-white stroke-[2]" />
                  </div>
                  <span className="text-[9.5px] font-bold text-slate-200 leading-tight text-center">
                    {label}<br />{label2}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Cursive Signature Tagline ── */}
            <div className="pt-0">
              <span
                className="text-cyan-200 font-bold italic drop-shadow-[0_2px_16px_rgba(56,189,248,0.6)]"
                style={{
                  fontFamily: "'Caveat', cursive",
                  fontSize: "clamp(1.6rem, 2.8vw, 2.1rem)",
                  letterSpacing: "0.01em",
                }}
              >
                Glass for a Better Future
              </span>
            </div>
          </div>

          {/* ══ RIGHT: Login Card ══ */}
          <div className="flex-1 flex justify-end max-w-[560px] ml-auto">
            <div
              className="w-full bg-white rounded-[22px] shadow-[0_24px_72px_rgba(0,0,0,0.32)] border border-white/70 relative overflow-hidden text-left"
              style={{ padding: "2rem 2.2rem" }}
            >

              {/* ── Top-Right Diagonal Glass Corner ── */}
              <div
                className="absolute pointer-events-none"
                style={{ 
                  top: 0, 
                  right: 0, 
                  width: "10.5rem", 
                  height: "10.5rem", 
                  clipPath: "polygon(0 0, 100% 0, 100% 100%)" 
                }}
              >
                <img
                  src="/image copy 4.png"
                  alt="Sejal Glass Architecture"
                  className="w-full h-full object-cover"
                  style={{ 
                    transform: "scale(1.15)", 
                    transformOrigin: "top right",
                    objectPosition: "right 30%",
                    filter: "contrast(1.25) brightness(0.9) saturate(1.2)"
                  }}
                />
                {/* Premium gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/40 via-transparent to-transparent mix-blend-overlay" />
              </div>


              {/* ── Card Title ── */}
              <div className="space-y-1.5 mb-5">
                <h2
                  className="text-[1.6rem] font-black text-slate-900 tracking-tight leading-tight"
                  style={{ fontFamily: "'Plus Jakarta Sans', 'Manrope', sans-serif" }}
                >
                  Production ERP{" "}
                  <span className="text-blue-600">Portal</span>
                </h2>
                <p className="text-[11.5px] text-slate-500 font-medium leading-relaxed max-w-[330px]">
                  Sign in with your role-specific credentials to access workstation
                  and audit consoles.
                </p>
              </div>

              {/* ── Error Banner ── */}
              {error && (
                <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              {/* ── Form ── */}
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* Username */}
                <div className="space-y-1.5">
                  <label className="text-[11.5px] font-bold text-slate-700 block">
                    Username or Email
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <Input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Enter your username or email"
                      className="pl-10 h-11 bg-slate-50 border-slate-200 text-slate-900 rounded-xl text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-400 transition-all placeholder:text-slate-400"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11.5px] font-bold text-slate-700 block">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={handleOpenForgotModal}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 pr-11 h-11 bg-slate-50 border-slate-200 text-slate-900 rounded-xl text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-400 transition-all"
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
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-70 text-white font-bold text-[13.5px] rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/45 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing In...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Sign In to Portal</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>



              {/* ── Card Footer ── */}
              <div className="pt-3 mt-3 border-t border-slate-100 text-[10.5px] text-slate-400 flex items-center justify-between font-medium">
                <span>Sejal Glass Operations ERP</span>
                <span className="text-slate-400 font-medium">Production Terminal</span>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* ─── Forgot Password OTP Modal ─── */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden relative"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-blue-700 to-sky-600 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
                  <KeyRound className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">Forgot Password</h3>
                  <p className="text-[11px] text-blue-100 font-medium">Secure OTP verification via SMTP</p>
                </div>
              </div>
              <button
                onClick={() => setIsForgotModalOpen(false)}
                className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Feedback Banners */}
              {forgotError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span className="font-medium">{forgotError}</span>
                </div>
              )}

              {forgotSuccess && forgotStep === "VERIFY_OTP" && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Verification code dispatched!</p>
                    <p className="text-emerald-700 mt-0.5">Please check your inbox at <strong>{maskedEmail}</strong> for the 6-digit OTP code.</p>
                  </div>
                </div>
              )}

              {/* STEP 1: Enter Username or Email to Request OTP */}
              {forgotStep === "REQUEST_OTP" && (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Enter the username or registered email address associated with your account. We will send a secure 6-digit verification code to reset your password.
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Username or Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <Input
                        type="text"
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        placeholder="e.g. admin or your@email.com"
                        className="pl-10 h-11 bg-slate-50 border-slate-200 text-slate-900 rounded-xl text-xs font-medium focus-visible:ring-2 focus-visible:ring-blue-500"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsForgotModalOpen(false)}
                      className="flex-1 h-10 text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={forgotLoading}
                      className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {forgotLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Sending OTP...</span>
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4" />
                          <span>Send OTP Code</span>
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}

              {/* STEP 2: Verify OTP & Enter New Password */}
              {forgotStep === "VERIFY_OTP" && (
                <form onSubmit={handleVerifyOtpAndResetPassword} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 block">
                        6-Digit OTP Code
                      </label>
                      <button
                        type="button"
                        disabled={resendCooldown > 0 || forgotLoading}
                        onClick={() => handleRequestOtp()}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 disabled:text-slate-400 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${forgotLoading ? "animate-spin" : ""}`} />
                        {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : "Resend OTP"}
                      </button>
                    </div>
                    <Input
                      type="text"
                      maxLength={6}
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      className="h-11 bg-slate-50 border-slate-200 text-slate-900 rounded-xl text-center font-mono text-lg tracking-[0.35em] font-bold focus-visible:ring-2 focus-visible:ring-blue-500"
                      required
                      autoFocus
                    />
                  </div>

                  {/* New Password */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="pl-10 pr-10 h-10 bg-slate-50 border-slate-200 text-slate-900 rounded-xl text-xs font-medium focus-visible:ring-2 focus-visible:ring-blue-500"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="pl-10 h-10 bg-slate-50 border-slate-200 text-slate-900 rounded-xl text-xs font-medium focus-visible:ring-2 focus-visible:ring-blue-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setForgotStep("REQUEST_OTP")}
                      className="h-10 px-3 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </Button>
                    <Button
                      type="submit"
                      disabled={forgotLoading}
                      className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {forgotLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Updating Password...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Reset Password &amp; Login</span>
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}


      {/* ─── Page Footer ─── */}
      <footer className="relative z-20 py-3 text-center text-[10px] text-white/30 tracking-wide">
        © {new Date().getFullYear()} Sejal Glass &amp; Glass Manufacturing Products LLC. Reflecting Values.
      </footer>
    </div>
  );
}
