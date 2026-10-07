import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2,
  ShieldCheck,
  Layers,
  Flame,
  Zap,
  Cpu,
  Workflow,
  ArrowRight,
  CheckCircle2,
  ScanLine,
  Check,
  Factory,
  Sparkles,
  Award,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  Shield,
  Clock,
  BarChart3,
  Boxes,
  X,
  ChevronDown,
  Info,
  Send,
  Globe,
  HeartHandshake,
  Scale,
  Users,
  BadgeCheck,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

// Types matching Sejal Glass Product Portfolio
type GlassProductCategory =
  | "solid"
  | "kool"
  | "tone"
  | "fort"
  | "armor"
  | "fireban"
  | "decor"
  | "lunaro";

interface ProductSpec {
  id: GlassProductCategory;
  name: string;
  brandTag: string;
  badge: string;
  tagline: string;
  description: string;
  typicalConfig: string;
  uValue: string;
  shgc: string;
  soundRw: string;
  vlt: string;
  maxSize: string;
  standards: string[];
  applications: string[];
  layers: { name: string; type: string; color: string; thickness: string }[];
}

const PRODUCTS: Record<GlassProductCategory, ProductSpec> = {
  kool: {
    id: "kool",
    name: "Kool Glass™",
    brandTag: "Insulating & Solar Control Glass",
    badge: "Thermal & Energy Conservation",
    tagline: "High-performance Double Glazed Units (DGU / IGU) for superior solar control and low U-values.",
    description:
      "Kool Glass is engineered for modern sustainable architecture, combining advanced magnetron sputtered Low-E coatings with hermetically sealed Argon-filled cavities to dramatically reduce HVAC chilling loads and solar glare while maximizing daylight.",
    typicalConfig: "6mm / 8mm Stopray Low-E + 16mm Warm Edge (90% Argon) + 6mm Clear Toughened",
    uValue: "1.1 W/m²K",
    shgc: "0.26",
    soundRw: "36 dB",
    vlt: "64%",
    maxSize: "3300 × 7500 mm (Jumbo Line)",
    standards: ["EN 1279-2/3", "ASTM E2190", "IS 2553 (Part 1)", "ISO 9001:2015"],
    applications: ["Curtain Walls & Facades", "Unitized Glazing", "Skylights", "Commercial Windows"],
    layers: [
      { name: "Outer Solar Pane", type: "Stopray Vision Low-E #2", color: "from-sky-500 to-blue-600", thickness: "6mm / 8mm" },
      { name: "Hermetic Cavity Buffer", type: "90% Argon Gas + Desiccant", color: "from-emerald-400/60 to-teal-400/60", thickness: "12mm - 20mm" },
      { name: "Inner Safety Pane", type: "Fully Toughened Float", color: "from-blue-400 to-cyan-500", thickness: "6mm / 8mm" },
    ],
  },
  solid: {
    id: "solid",
    name: "Solid Glass™",
    brandTag: "Toughened & Heat Strengthened Safety Glass",
    badge: "5x - 7x Mechanical Tensile Strength",
    tagline: "Manufactured in a state-of-the-art horizontal tempering plant for supreme flatness and endurance.",
    description:
      "Available in Fully Toughened (FT) and Heat Strengthened (HS) variants. Subjected to controlled rapid air quenching up to 680°C. Fully Toughened crumbles into safe blunt granular fragments. Optional Heat Soak Testing (HST) is conducted to eliminate Nickel Sulphide (NiS) spontaneous inclusion risk.",
    typicalConfig: "8mm / 10mm / 12mm / 15mm / 19mm Fully Toughened with Heat Soak Test (HST)",
    uValue: "5.7 W/m²K",
    shgc: "0.82",
    soundRw: "33 dB",
    vlt: "89%",
    maxSize: "3300 × 8000 mm",
    standards: ["IS 2553", "EN 12150-1", "ASTM C1048", "DIN 18008"],
    applications: ["Frameless Patch Assemblies", "Shower Cubicles", "Stairways & Balustrades", "Shopfronts & Partitions"],
    layers: [
      { name: "Fully Toughened Pane", type: "Horizontal Convection Tempered (HST)", color: "from-blue-600 to-sky-500", thickness: "8mm - 19mm" },
    ],
  },
  fort: {
    id: "fort",
    name: "Fort Glass™",
    brandTag: "Structural & Security Laminated Safety Glass",
    badge: "Impact, Security & Fall-Through Safety",
    tagline: "High-grade autoclave processed multi-layer laminated safety glass with PVB or SentryGlas (SGP) interlayers.",
    description:
      "Fort Glass provides impenetrable security against burglaries, forced entry, and extreme windloads. In case of breakage, glass fragments remain bonded to the tough plastic interlayer, preventing personal injury and maintaining the barrier envelope.",
    typicalConfig: "10mm Toughened + 1.52mm SentryGlas (SGP) / PVB + 10mm Toughened",
    uValue: "5.1 W/m²K",
    shgc: "0.72",
    soundRw: "42 dB",
    vlt: "86%",
    maxSize: "3000 × 6000 mm",
    standards: ["EN ISO 12543", "ANSI Z97.1", "ASTM C1172", "IS 2553 Part 1"],
    applications: ["Structural Balustrades", "Glass Canopies & Walkways", "Overhead Skylights", "Hurricane & Cyclone Envelopes"],
    layers: [
      { name: "Upper Toughened Ply", type: "High Strength Low-Iron", color: "from-blue-500 to-indigo-600", thickness: "8mm / 10mm" },
      { name: "High Shear Interlayer", type: "SentryGlas SGP / Acoustic PVB", color: "from-amber-400 to-yellow-500", thickness: "1.52mm" },
      { name: "Lower Toughened Ply", type: "Convection Toughened Float", color: "from-sky-500 to-blue-600", thickness: "8mm / 10mm" },
    ],
  },
  tone: {
    id: "tone",
    name: "Tone Glass™",
    brandTag: "Acoustic Insulation Glazing",
    badge: "Noise Reduction & Sound Dampening",
    tagline: "Insulating and laminated glass units acoustically tuned for heavy traffic, airports, and urban hubs.",
    description:
      "Engineered with asymmetric glass thickness combinations, wide cavities, and specialized acoustic interlayers to disrupt acoustic vibration resonance and reduce external decibel noise levels by up to 48 dB.",
    typicalConfig: "(6+0.76+6mm) Acoustic Lam + 16mm Argon + 8mm Toughened",
    uValue: "1.2 W/m²K",
    shgc: "0.32",
    soundRw: "46 dB",
    vlt: "68%",
    maxSize: "2800 × 6000 mm",
    standards: ["ISO 10140", "EN 1279", "ASTM E90"],
    applications: ["Airport Terminal Facades", "Highway-Facing Commercials", "Recording Studios", "Hospital & Hotel Rooms"],
    layers: [
      { name: "Acoustic Laminated Pane", type: "6mm + Sound PVB + 6mm", color: "from-indigo-600 to-blue-600", thickness: "12.76mm" },
      { name: "Asymmetric Cavity", type: "16mm Argon Gas Fill", color: "from-teal-400/50 to-emerald-400/50", thickness: "16mm" },
      { name: "Dense Substrate Pane", type: "8mm Heavy Toughened", color: "from-sky-600 to-cyan-600", thickness: "8mm" },
    ],
  },
  armor: {
    id: "armor",
    name: "Armor Glass™ & Armor Plus",
    brandTag: "Bullet & Blast Resistant Glazing",
    badge: "Ballistic & Explosive Protection",
    tagline: "Engineered multi-ply composite glass built to withstand high-velocity firearms and explosive shockwaves.",
    description:
      "Combining thick glass plies with high-tensile polymer interlayers and non-spall polycarbonate backing to absorb ballistic kinetic energy without interior splintering. Certified across international ballistic threat standards.",
    typicalConfig: "Multi-layer Glass/Polycarbonate Composite (24mm - 65mm Thickness)",
    uValue: "4.5 W/m²K",
    shgc: "0.65",
    soundRw: "45 dB",
    vlt: "75%",
    maxSize: "2200 × 4000 mm",
    standards: ["EN 1063 (BR1 to BR7)", "NIJ 0108.01", "IS 14652"],
    applications: ["Bank Counters & Cash Vans", "Embassy & Military Facilities", "VIP Residences", "Jewelry Showrooms"],
    layers: [
      { name: "Strike Face Pane", type: "High-Compression Tempered", color: "from-slate-700 to-blue-900", thickness: "10mm" },
      { name: "Energy Absorbing Poly", type: "High-Toughness SGP / PU", color: "from-amber-400 to-amber-600", thickness: "2.28mm" },
      { name: "Intermediate Float Core", type: "Optically Clear Laminated", color: "from-blue-600 to-indigo-700", thickness: "12mm" },
      { name: "Non-Spall Shield", type: "Polycarbonate Safety Layer", color: "from-cyan-500 to-blue-500", thickness: "4mm" },
    ],
  },
  fireban: {
    id: "fireban",
    name: "FireBan Glass™",
    brandTag: "Fire-Resistant Safety Glazing",
    badge: "Joint Venture with CGI International (Pyroguard)",
    tagline: "Fire integrity and radiation insulation up to 120 minutes with zero flammable smoke transmission.",
    description:
      "Formulated with an intumescent clear interlayer that turns into a rigid, opaque heat-shield under fire conditions, preventing temperature rise on the unexposed side and ensuring safe escape corridors.",
    typicalConfig: "Pyroguard Integrity & Insulation (EI 30 / EI 60 / EI 120)",
    uValue: "2.8 W/m²K",
    shgc: "0.68",
    soundRw: "41 dB",
    vlt: "82%",
    maxSize: "2000 × 3500 mm",
    standards: ["BS 476 Part 22", "EN 1364", "EN 13501-2", "IS 3614"],
    applications: ["Fire Exit Enclosures", "Server Rooms", "Hospital Atriums", "Smoke Barriers"],
    layers: [
      { name: "Exposed Fire Pane", type: "Heat-Resistant Borosilicate/Float", color: "from-rose-600 to-orange-500", thickness: "6mm" },
      { name: "Intumescent Gel Interlayer", type: "Thermal Foam Reactor", color: "from-yellow-400 to-amber-500", thickness: "4mm" },
      { name: "Unexposed Safety Pane", type: "Toughened Safety Float", color: "from-sky-500 to-blue-600", thickness: "6mm" },
    ],
  },
  decor: {
    id: "decor",
    name: "Decor Glass™",
    brandTag: "Architectural Ceramic Fritted & Silk-Screened",
    badge: "Aesthetics & Glare Reduction",
    tagline: "Custom ceramic enamel patterns fused into the glass at 680°C for lifetime UV non-fading durability.",
    description:
      "Combines customized geometric dots, lines, and gradients to provide privacy, architectural elegance, and bird-friendly facade visibility while controlling solar glare.",
    typicalConfig: "6mm / 8mm / 10mm Ceramic Silk Screen Printed Toughened Glass",
    uValue: "5.6 W/m²K",
    shgc: "0.45",
    soundRw: "32 dB",
    vlt: "45%",
    maxSize: "2800 × 6000 mm",
    standards: ["EN 12150", "ASTM C1048"],
    applications: ["Spandrel Glass Panels", "Interior Partitions", "Balcony Glass Facias", "Retail Storefronts"],
    layers: [
      { name: "Fused Ceramic Enamel", type: "Tempered In-Furnace Silkscreen", color: "from-amber-600 to-orange-500", thickness: "Pattern" },
      { name: "Toughened Substrate", type: "Optiwhite / Clear Float", color: "from-blue-500 to-sky-400", thickness: "8mm - 12mm" },
    ],
  },
  lunaro: {
    id: "lunaro",
    name: "Lunaro™",
    brandTag: "Ultra-Clear Low-Iron Glass Range",
    badge: "91%+ Light Transmittance",
    tagline: "Crystal clarity with eliminated greenish iron tint for true-to-life color rendering.",
    description:
      "Produced with reduced iron oxide content to eliminate the greenish tint of standard float glass. Perfect for luxury showroom vitrines, art museum vitrines, and high-end interior spaces.",
    typicalConfig: "8mm / 10mm / 12mm Ultra-Clear Extra Low-Iron Toughened",
    uValue: "5.7 W/m²K",
    shgc: "0.88",
    soundRw: "33 dB",
    vlt: "91.5%",
    maxSize: "3300 × 7500 mm",
    standards: ["EN 572-2", "ASTM C1036"],
    applications: ["Luxury Display Cases", "Museum Displays", "High-End Retail Facades", "Interior Partitions"],
    layers: [
      { name: "Low-Iron Pure Substrate", type: "High Purity Float (Fe2O3 < 0.01%)", color: "from-cyan-400 to-sky-300", thickness: "8mm - 19mm" },
    ],
  },
};

const FACTORY_STEPS = [
  {
    step: "01",
    title: "CNC Optimized Cutting",
    icon: Factory,
    desc: "Automated nested scoring & breakout (Bottero / Lisec). Tolerance within ±0.3mm with edge-deletion for Low-E coatings.",
    metric: "±0.3 mm Tolerance",
    highlight: "Laser Edge Deletion",
  },
  {
    step: "02",
    title: "CNC Double Edging & Notching",
    icon: Workflow,
    desc: "Diamond wheel flat polishing, arris chamfering, and high-precision waterjet CNC cutouts for fittings & hinges.",
    metric: "Polished Flat Edge",
    highlight: "Custom Cutouts & Holes",
  },
  {
    step: "03",
    title: "Horizontal Convection Tempering (HST)",
    icon: Flame,
    desc: "Horizontal heating furnace up to 680°C with Heat Soak Testing (HST) to prevent Nickel Sulphide spontaneous fracture.",
    metric: "> 95 MPa Compressive",
    highlight: "Zero Roller Wave Distortion",
  },
  {
    step: "04",
    title: "Cleanroom Robotic Pairing & Buffer",
    icon: Boxes,
    desc: "Class 10,000 cleanroom robotic suction positioning. Real-time pairing buffer staging with automated barcode scanning.",
    metric: "Class 10,000 Cleanroom",
    highlight: "Zero Debris Assurance",
  },
  {
    step: "05",
    title: "Autoclave Lamination (SGP/PVB)",
    icon: ShieldCheck,
    desc: "High-pressure autoclave curing at 12.5 Bar and 140°C. Delivers bubble-free, optically crystal structural bonding.",
    metric: "12.5 Bar Pressure",
    highlight: "SentryGlas / PVB / PU",
  },
  {
    step: "06",
    title: "Automated Argon DGU Line",
    icon: Cpu,
    desc: "Automated warm-edge applicator, 90%+ Argon gas cavity injection, and dual-component structural silicone robotic extrusion.",
    metric: "90%+ Argon Fill",
    highlight: "Robotic Dual Silicone Seal",
  },
  {
    step: "07",
    title: "QR Laser Serialization & Stillage Dispatch",
    icon: ScanLine,
    desc: "Unique thermal QR/Barcode sticker applied to each unit. Direct lot stillage tracking for factory and site delivery.",
    metric: "100% Traceability",
    highlight: "Site & Factory Lot Staging",
  },
];

const CORE_VALUES = [
  {
    title: "Trusteeship",
    icon: HeartHandshake,
    desc: "Our principal objective is to ensure stakeholder value creation, transparency in operations, and long-term client trust.",
  },
  {
    title: "Integrity",
    icon: Scale,
    desc: "Doing business with integrity is our cornerstone. We adhere to rigorous ethical practices and international technical specifications.",
  },
  {
    title: "Respect",
    icon: Users,
    desc: "Respect for individuals, our 150+ skilled technicians, master craftsmen, and client partners worldwide.",
  },
  {
    title: "Credibility",
    icon: BadgeCheck,
    desc: "Unwavering commitment to quality assurance, testing accreditations, and delivering on commitments on time.",
  },
];

const LANDMARK_PROJECTS = [
  {
    name: "Astra Twin Tower",
    location: "Commercial Financial Center",
    scope: "24,500 m² Facade",
    type: "Kool Glass™ Stopray Vision 40T Double Glazed Units (8mm + 16A + 6mm)",
    tag: "Commercial Skyscraper",
    bgPattern: "bg-gradient-to-br from-blue-50 via-indigo-50/50 to-white",
    borderColor: "border-blue-200/80",
    badgeColor: "bg-blue-100 text-blue-800",
  },
  {
    name: "Marina Bay Horizon Residences",
    location: "Harbor Waterfront",
    scope: "14,200 m² Balustrades & Canopies",
    type: "Fort Glass™ 10+10mm SGP Structural Laminated Glass (Heat Soaked)",
    tag: "Luxury Residential",
    bgPattern: "bg-gradient-to-br from-sky-50 via-cyan-50/50 to-white",
    borderColor: "border-sky-200/80",
    badgeColor: "bg-sky-100 text-sky-800",
  },
  {
    name: "Grand Opera & Cultural Center",
    location: "Civic Square",
    scope: "8,600 m² Acoustic Envelope",
    type: "Tone Glass™ Double Laminated Acoustic Glazing (Rw 48 dB)",
    tag: "Cultural Landmark",
    bgPattern: "bg-gradient-to-br from-amber-50 via-orange-50/50 to-white",
    borderColor: "border-amber-200/80",
    badgeColor: "bg-amber-100 text-amber-800",
  },
  {
    name: "SkyPoint Atrium & Botanical Dome",
    location: "Metropolitan Hub",
    scope: "9,800 m² Jumbo Curved Skylight",
    type: "Solid Glass™ & Decor Glass™ 12mm Curved Toughened Low-Iron with Ceramic Frit",
    tag: "Architectural Atrium",
    bgPattern: "bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white",
    borderColor: "border-emerald-200/80",
    badgeColor: "bg-emerald-100 text-emerald-800",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [selectedProduct, setSelectedProduct] = useState<GlassProductCategory>("kool");

  // Quote Modal State
  const [quoteModalOpen, setQuoteModalOpen] = useState<boolean>(false);
  const [quoteSubmitted, setQuoteSubmitted] = useState<boolean>(false);
  const [quoteForm, setQuoteForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    projectName: "",
    glassType: "Kool Glass™ (Double Glazed Units)",
    estimatedSqm: "500",
    message: "",
  });

  const handleQuoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuoteSubmitted(true);
    setTimeout(() => {
      setQuoteModalOpen(false);
      setQuoteSubmitted(false);
      setQuoteForm({
        name: "",
        email: "",
        phone: "",
        company: "",
        projectName: "",
        glassType: "Kool Glass™ (Double Glazed Units)",
        estimatedSqm: "500",
        message: "",
      });
    }, 2500);
  };

  const currentProduct = PRODUCTS[selectedProduct];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 selection:bg-red-100 selection:text-red-900 font-sans">
      {/* Background ambient lighting effects (Clean Light Theme) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-1/4 w-[600px] h-[600px] bg-blue-100/50 rounded-full blur-[130px]" />
        <div className="absolute top-[30%] right-[-5%] w-[500px] h-[500px] bg-red-100/40 rounded-full blur-[140px]" />
        <div className="absolute bottom-[10%] left-[-10%] w-[700px] h-[700px] bg-slate-100/60 rounded-full blur-[160px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a08_1px,transparent_1px),linear-gradient(to_bottom,#0f172a08_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>


      {/* STICKY LIGHT GLASS NAVBAR WITH OFFICIAL LOGO */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/95 border-b border-slate-200 shadow-xs transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Official Brand Logo */}
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/sejal-glass-logo.png"
              alt="Sejal Glass Ltd - Reflecting Values"
              className="h-12 w-auto object-contain"
            />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-sm font-semibold text-slate-700">
            <a href="#products" className="hover:text-[#e31e24] transition-colors">
              Products
            </a>
            <a href="#values" className="hover:text-[#e31e24] transition-colors">
              Values & SBUs
            </a>
            <a href="#factory" className="hover:text-[#e31e24] transition-colors">
              Manufacturing Process
            </a>
            <a href="#portfolio" className="hover:text-[#e31e24] transition-colors">
              Projects
            </a>
            <a href="#contact" className="hover:text-[#e31e24] transition-colors">
              Contact
            </a>
          </nav>

            {/* Action CTAs */}
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setQuoteModalOpen(true)}
                variant="outline"
                className="hidden sm:inline-flex border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold h-10 px-4 rounded-xl shadow-xs"
              >
                Get Quote
              </Button>
              <Button
                onClick={() => navigate("/login")}
                className="bg-gradient-to-r from-[#1a3a6b] to-[#254d8c] hover:from-[#132b4f] hover:to-[#1a3a6b] text-white font-extrabold text-xs h-10 px-5 rounded-xl shadow-md transition-all hover:scale-[1.02] flex items-center gap-2"
              >
                <LogIn className="h-4 w-4 text-amber-300" />
                ERP Portal Login
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
        </div>
      </header>

      {/* HERO SECTION WITH REALISTIC ARCHITECTURAL GLASS BACKGROUND */}
      <section className="relative overflow-hidden pt-10 pb-20 md:pt-16 md:pb-28 border-b border-slate-200/80">
        {/* Real High-Definition Architectural Glass Building Background Image */}
        <div className="absolute inset-0 z-0">
          <img
            src="/hero-glass-bg.jpg"
            alt="Modern Architectural Glass Facade - Sejal Glass"
            className="w-full h-full object-cover object-center scale-[1.01] transform transition-transform duration-1000"
          />
          {/* Subtle light grading to maintain text contrast while showing pristine image clarity */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/75 via-white/35 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-transparent to-white/70" />
          
          {/* Subtle realistic architectural grid & specular light streak */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a06_1px,transparent_1px),linear-gradient(to_bottom,#0f172a06_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_40%,#000_60%,transparent_100%)]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Hero Left Column */}
            <div className="lg:col-span-7 space-y-6 text-left">
              {/* Slogan Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-red-200/80 shadow-xs text-xs font-bold text-[#e31e24]">
                <Sparkles className="h-3.5 w-3.5 text-[#e31e24]" />
                <span>Reflecting Values · Leading Architectural Glass Processors</span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-[#0a1628] tracking-tight leading-[1.08] drop-shadow-sm">
                Opening Vistas in <br />
                <span className="bg-gradient-to-r from-[#1a3a6b] via-[#e31e24] to-[#1a3a6b] bg-clip-text text-transparent">
                  Architectural Delight & Strength.
                </span>
              </h1>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Button
                  onClick={() => navigate("/login")}
                  className="bg-gradient-to-r from-[#1a3a6b] via-[#204a87] to-[#1a3a6b] hover:from-[#142c52] hover:to-[#1a3a6b] text-white font-extrabold text-sm h-12 px-7 rounded-xl shadow-xl shadow-blue-900/20 hover:scale-[1.02] transition-all flex items-center gap-2.5"
                >
                  <LogIn className="h-4 w-4 text-amber-300" />
                  Login to ERP Portal
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => setQuoteModalOpen(true)}
                  variant="outline"
                  className="border-slate-300/90 bg-white/90 backdrop-blur-md hover:bg-white text-slate-800 font-bold text-sm h-12 px-6 rounded-xl shadow-sm hover:border-slate-400 flex items-center gap-2 transition-all hover:scale-[1.01]"
                >
                  Request Official Quotation
                </Button>
              </div>

              {/* Live Trust Metrics with Frosted Glass Realism */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-6 border-t border-slate-300/60">
                <div className="p-3.5 rounded-xl bg-white/85 backdrop-blur-md border border-white/80 shadow-md shadow-slate-900/5 hover:bg-white transition-all hover:scale-[1.02]">
                  <div className="text-2xl font-black text-[#0a1628]">99.4%</div>
                  <div className="text-[11px] text-slate-600 font-bold">First-Pass Yield</div>
                </div>
                <div className="p-3.5 rounded-xl bg-white/85 backdrop-blur-md border border-white/80 shadow-md shadow-slate-900/5 hover:bg-white transition-all hover:scale-[1.02]">
                  <div className="text-2xl font-black text-[#e31e24]">120k m²</div>
                  <div className="text-[11px] text-slate-600 font-bold">Annual Capacity</div>
                </div>
                <div className="p-3.5 rounded-xl bg-white/85 backdrop-blur-md border border-white/80 shadow-md shadow-slate-900/5 hover:bg-white transition-all hover:scale-[1.02]">
                  <div className="text-2xl font-black text-blue-700">2 Plants</div>
                  <div className="text-[11px] text-slate-600 font-bold">India & UAE</div>
                </div>
                <div className="p-3.5 rounded-xl bg-white/85 backdrop-blur-md border border-white/80 shadow-md shadow-slate-900/5 hover:bg-white transition-all hover:scale-[1.02]">
                  <div className="text-2xl font-black text-emerald-700">IS 2553</div>
                  <div className="text-[11px] text-slate-600 font-bold">BIS & EN Certified</div>
                </div>
              </div>
            </div>

            {/* Hero Right Column: Interactive Glass Telemetry Widget with Frosted Glass Container */}
            <div className="lg:col-span-5 relative">
              <div className="relative rounded-3xl p-1 bg-gradient-to-br from-blue-300/60 via-red-200/50 to-white/80 shadow-2xl backdrop-blur-lg">
                <div className="rounded-[22px] bg-white/95 backdrop-blur-md p-6 border border-white/80 shadow-sm space-y-5">
                  {/* Header of widget */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex h-3 w-3">
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </div>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                        Live Production Telemetry
                      </span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-[#e31e24] bg-red-50/90 px-2 py-0.5 rounded border border-red-200">
                      SFO-262700384
                    </span>
                  </div>

                  {/* Glass Layer Graphic Card */}
                  <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-slate-50/90 to-blue-50/30 p-5 border border-slate-200/90 shadow-inner">
                    <div className="flex items-center justify-between text-xs mb-3">
                      <span className="font-bold text-slate-900">Active Unit: Kool Glass™</span>
                      <span className="text-blue-700 font-mono font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-100">DGU High-Performance</span>
                    </div>

                    {/* Visual 3D Stack of Glass */}
                    <div className="space-y-2.5 py-1">
                      <div className="relative h-8 rounded-lg bg-gradient-to-r from-blue-600 via-sky-600 to-blue-500 text-white flex items-center justify-between px-3.5 text-[11px] font-bold shadow-sm border border-blue-400/40">
                        <span>Outer Pane: 8mm Stopray Vision 40T</span>
                        <span className="text-[10px] bg-black/25 px-2 py-0.5 rounded font-mono">#2 Low-E</span>
                      </div>

                      <div className="relative h-8 rounded-lg bg-emerald-50/90 border border-dashed border-emerald-400/80 flex items-center justify-between px-3.5 text-[11px] font-semibold text-emerald-900 shadow-2xs">
                        <span>16mm Argon Cavity (90% Purity)</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">Warm Edge Spacer</span>
                      </div>

                      <div className="relative h-8 rounded-lg bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 text-white flex items-center justify-between px-3.5 text-[11px] font-bold shadow-sm border border-sky-400/40">
                        <span>Inner Pane: 6mm Solid Glass™ (HST)</span>
                        <span className="text-[10px] bg-black/25 px-2 py-0.5 rounded font-mono">Heat Soaked</span>
                      </div>
                    </div>

                    {/* Real-time stats bar */}
                    <div className="grid grid-cols-3 gap-2 pt-4 mt-3 border-t border-slate-200 text-center">
                      <div className="bg-white/90 backdrop-blur-xs p-2 rounded-lg border border-slate-200 shadow-2xs">
                        <div className="text-[10px] text-slate-500 font-semibold">Thermal U-Val</div>
                        <div className="text-xs font-black text-[#e31e24]">1.1 W/m²K</div>
                      </div>
                      <div className="bg-white/90 backdrop-blur-xs p-2 rounded-lg border border-slate-200 shadow-2xs">
                        <div className="text-[10px] text-slate-500 font-semibold">Acoustic Rw</div>
                        <div className="text-xs font-black text-blue-700">38 dB</div>
                      </div>
                      <div className="bg-white/90 backdrop-blur-xs p-2 rounded-lg border border-slate-200 shadow-2xs">
                        <div className="text-[10px] text-slate-500 font-semibold">Solar SHGC</div>
                        <div className="text-xs font-black text-emerald-700">0.26</div>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar in widget */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-700">
                      <span className="font-bold">Batch Order: Astra Twin Tower</span>
                      <span className="font-mono font-bold text-[#e31e24]">75% Completed</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className="h-full bg-gradient-to-r from-[#e31e24] to-emerald-500 rounded-full transition-all duration-1000"
                        style={{ width: "75%" }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-600 font-semibold">
                      <span className="text-emerald-600 font-bold">Cutting ✓</span>
                      <span className="text-emerald-600 font-bold">Pairing ✓</span>
                      <span className="text-blue-700 font-bold">DGU Assembly ▶</span>
                      <span className="text-slate-400">Dispatch</span>
                    </div>
                  </div>

                  {/* Launch / Login CTA */}
                  <Button
                    onClick={() => navigate("/login")}
                    className="w-full bg-[#1a3a6b] hover:bg-[#132b4f] text-white font-extrabold text-xs h-10 rounded-xl shadow-md flex items-center justify-center gap-2 transition-transform hover:scale-[1.01]"
                  >
                    <LogIn className="h-4 w-4 text-amber-300" />
                    Login to Access Manufacturing Dashboard
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION: SEJAL GLASS PRODUCT PORTFOLIO */}
      <section id="products" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-200">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-800">
            <Layers className="h-3.5 w-3.5" /> Official Sejal Glass Products
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-[#0a1628] tracking-tight">
            Engineered Architectural Glass Solutions
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            Satisfying customer needs with specialized product ranges from energy-saving insulated units to bullet-resistant composites.
          </p>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-10">
          {(
            [
              { id: "kool", label: "Kool Glass™ (DGU)", icon: Layers },
              { id: "solid", label: "Solid Glass™ (Toughened)", icon: Flame },
              { id: "fort", label: "Fort Glass™ (Laminated)", icon: ShieldCheck },
              { id: "tone", label: "Tone Glass™ (Acoustic)", icon: Building2 },
              { id: "armor", label: "Armor Glass™ (Bullet/Blast)", icon: Shield },
              { id: "fireban", label: "FireBan™ (Fire Rated)", icon: Flame },
              { id: "decor", label: "Decor Glass™ (Fritted)", icon: Sparkles },
              { id: "lunaro", label: "Lunaro™ (Low-Iron)", icon: Zap },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = selectedProduct === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedProduct(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  active
                    ? "bg-[#1a3a6b] text-white shadow-md scale-[1.02]"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-2xs"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-[#e31e24]" : "text-slate-500"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Product Detail Card */}
        <div className="rounded-3xl bg-white border border-slate-200/90 p-6 sm:p-10 shadow-lg">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Specs & Info */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-3 py-1 rounded-md bg-red-50 border border-red-200 text-xs font-extrabold text-[#e31e24]">
                  {currentProduct.badge}
                </span>
                <span className="text-xs text-slate-500 font-semibold">{currentProduct.brandTag}</span>
              </div>

              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-[#0a1628]">{currentProduct.name}</h3>
                <p className="text-xs font-bold text-slate-500 mt-1">{currentProduct.tagline}</p>
              </div>

              <p className="text-slate-600 text-sm leading-relaxed">{currentProduct.description}</p>

              {/* Performance Metric Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-[11px] text-slate-500 font-semibold">U-Value (Thermal)</div>
                  <div className="text-lg font-black text-[#0a1628]">{currentProduct.uValue}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-[11px] text-slate-500 font-semibold">SHGC (Solar)</div>
                  <div className="text-lg font-black text-emerald-700">{currentProduct.shgc}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-[11px] text-slate-500 font-semibold">Acoustic (Rw)</div>
                  <div className="text-lg font-black text-blue-700">{currentProduct.soundRw}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-[11px] text-slate-500 font-semibold">Light Trans. (VLT)</div>
                  <div className="text-lg font-black text-[#e31e24]">{currentProduct.vlt}</div>
                </div>
              </div>

              {/* Standard Compliances & Key Applications */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-[#e31e24]" /> Testing Standards
                  </div>
                  <ul className="space-y-1 text-slate-600 font-medium">
                    {currentProduct.standards.map((std, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-emerald-600" /> {std}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-blue-600" /> Architectural Applications
                  </div>
                  <ul className="space-y-1 text-slate-600 font-medium">
                    {currentProduct.applications.map((app, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-cyan-600" /> {app}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Right Layer Graphic & Spec Box */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-2xl bg-slate-50 p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                  <span>Layer Schematic Architecture</span>
                  <span className="text-[#e31e24] font-bold">Exploded View</span>
                </div>

                <div className="space-y-3 py-2">
                  {currentProduct.layers.map((layer, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3.5 h-10 rounded-md bg-gradient-to-b ${layer.color}`} />
                        <div>
                          <div className="text-xs font-bold text-slate-900">{layer.name}</div>
                          <div className="text-[11px] text-slate-500 font-medium">{layer.type}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] font-mono font-bold text-[#e31e24] bg-red-50 px-2 py-0.5 rounded border border-red-200">
                          {layer.thickness}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-900 flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <span>
                    Typical Configuration: <strong className="text-slate-900">{currentProduct.typicalConfig}</strong>
                  </span>
                </div>

                <Button
                  onClick={() => {
                    setQuoteForm((prev) => ({
                      ...prev,
                      glassType: currentProduct.name,
                    }));
                    setQuoteModalOpen(true);
                  }}
                  className="w-full bg-[#1a3a6b] hover:bg-[#122b52] text-white font-bold text-xs h-11 rounded-xl shadow-md transition-transform flex items-center justify-center gap-2"
                >
                  Request Technical Quotation for {currentProduct.name}
                  <ArrowRight className="h-3.5 w-3.5 text-amber-300" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION: SEJAL GLASS CORE VALUES & SBUs */}
      <section id="values" className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-200">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-xs font-bold text-[#e31e24]">
            <HeartHandshake className="h-3.5 w-3.5" /> Company Pillars & Philosophy
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-[#0a1628] tracking-tight">
            Reflecting Values Since Inception
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            Sejal Glass Ltd. operates on four foundational pillars ensuring long-term client trust and manufacturing excellence.
          </p>
        </div>

        {/* 4 Pillars Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CORE_VALUES.map((val, idx) => {
            const Icon = val.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-md transition-all space-y-3"
              >
                <div className="h-11 w-11 rounded-xl bg-red-50 text-[#e31e24] flex items-center justify-center border border-red-200">
                  <Icon className="h-5 w-5" />
                </div>
                <h4 className="text-base font-extrabold text-slate-900">{val.title}</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{val.desc}</p>
              </div>
            );
          })}
        </div>

        {/* SBUs Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-10">
          <div className="p-7 rounded-3xl bg-gradient-to-br from-blue-50 to-white border border-blue-200 shadow-sm space-y-3">
            <span className="text-[11px] font-mono font-bold text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-full">
              SBU 01
            </span>
            <h3 className="text-xl font-black text-slate-900">Architectural Glass Solutions</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              State-of-the-art horizontal tempering furnaces, automated double glazing lines, high-pressure autoclaves, and CNC processing catering to iconic skyscrapers, airports, and commercial facades globally.
            </p>
          </div>

          <div className="p-7 rounded-3xl bg-gradient-to-br from-red-50 to-white border border-red-200 shadow-sm space-y-3">
            <span className="text-[11px] font-mono font-bold text-[#e31e24] bg-red-100 px-2.5 py-0.5 rounded-full">
              SBU 02
            </span>
            <h3 className="text-xl font-black text-slate-900">Sejal Encasa</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              A premier 30,000 sq. ft. architectural and interior mall specializing in top-notch interior glass solutions, decorative mirrors, luxury hardware, and bespoke living spaces.
            </p>
          </div>
        </div>
      </section>


      {/* SECTION: 7-STAGE INTELLIGENT FACTORY LINE */}
      <section id="factory" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-200">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-800">
            <Workflow className="h-3.5 w-3.5" /> End-to-End Precision Automation
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-[#0a1628] tracking-tight">
            Intelligent 7-Stage Manufacturing Process
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            Equipped with state-of-the-art horizontal tempering furnaces, automated double glazing lines, and autoclaves in Mumbai and UAE.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {FACTORY_STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={idx}
                className="relative rounded-2xl bg-white p-6 border border-slate-200/90 hover:border-blue-400 transition-all group hover:-translate-y-1 shadow-2xs hover:shadow-md"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-[#1a3a6b] group-hover:bg-[#1a3a6b] group-hover:text-white transition-colors">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-2xl font-black font-mono text-slate-300 group-hover:text-[#e31e24] transition-colors">
                    {step.step}
                  </span>
                </div>

                <h4 className="text-base font-bold text-slate-900 mb-2">{step.title}</h4>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">{step.desc}</p>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-medium">{step.metric}</span>
                  <span className="font-bold text-[#e31e24] bg-red-50 px-2 py-0.5 rounded border border-red-200">
                    {step.highlight}
                  </span>
                </div>
              </div>
            );
          })}

          {/* 8th Card: ERP Integration Banner */}
          <div className="relative rounded-2xl bg-gradient-to-br from-[#1a3a6b] to-[#0f2444] text-white p-6 border border-blue-900 flex flex-col justify-between shadow-md">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider mb-2">
                <Cpu className="h-4 w-4" /> Live ERP Control
              </div>
              <h4 className="text-lg font-black text-white mb-2">Real-Time Factory Dispatch & QR Tracking</h4>
              <p className="text-xs text-slate-200 leading-relaxed">
                Supervisors and operators utilize barcode terminals and automated optical scanners connected directly to
                the production execution engine.
              </p>
            </div>
            <Button
              onClick={() => navigate("/login")}
              className="mt-6 bg-[#e31e24] hover:bg-[#c2191e] text-white font-extrabold text-xs h-10 rounded-xl flex items-center justify-center gap-2"
            >
              <LogIn className="h-4 w-4" />
              Login to Factory ERP <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </section>


      {/* SECTION: LANDMARK PROJECTS PORTFOLIO */}
      <section id="portfolio" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-200">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-xs font-bold text-[#e31e24]">
            <Building2 className="h-3.5 w-3.5" /> Iconic Architecture
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-[#0a1628] tracking-tight">
            Glazing Landmark Horizons Worldwide
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            Trusted by premier facade consultants, structural engineers, and tier-one general contractors for iconic commercial
            skyscrapers, residential towers, and civic structures.
          </p>
        </div>

        {/* Project Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {LANDMARK_PROJECTS.map((proj, idx) => (
            <div
              key={idx}
              className={`rounded-3xl ${proj.bgPattern} border ${proj.borderColor} p-7 sm:p-9 shadow-sm hover:shadow-md relative overflow-hidden group transition-all`}
            >
              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-extrabold uppercase tracking-wider px-3 py-1 rounded-full ${proj.badgeColor}`}>
                    {proj.tag}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-500">{proj.scope}</span>
                </div>

                <h3 className="text-2xl font-black text-slate-900 group-hover:text-[#1a3a6b] transition-colors">
                  {proj.name}
                </h3>
                <p className="text-xs text-slate-600 font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-blue-600" /> {proj.location}
                </p>

                <div className="p-3.5 rounded-xl bg-white/90 border border-slate-200 text-xs text-slate-700 shadow-2xs">
                  <span className="font-bold text-slate-900">Glass Specification: </span>
                  {proj.type}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION: CERTIFICATIONS & STANDARDS */}
      <section id="standards" className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-200">
        <div className="rounded-3xl bg-white border border-slate-200/90 p-8 sm:p-12 text-center space-y-6 shadow-sm">
          <h3 className="text-2xl sm:text-3xl font-black text-[#0a1628]">
            Tested & Certified to Global Quality Accreditations
          </h3>
          <p className="text-slate-600 text-xs sm:text-sm max-w-2xl mx-auto">
            Our state-of-the-art laboratory performs continuous ball-drop impact tests, spectro-photometric laser
            reflectance checks, optical stress polariscope audits, and gas chromatograph cavity leakage tests.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            {[
              "IS 2553 (Part 1) Safety Glass Certified",
              "ISO 9001:2015 Quality Management",
              "EN 1279 Insulating Glass Units (IGU/DGU)",
              "ASTM C1048 Heat-Treated Flat Glass",
              "EN 12150 Thermally Toughened Safety Glass",
              "EN ISO 12543 Laminated Glass",
              "ANSI Z97.1 Safety Glazing Materials",
            ].map((cert, idx) => (
              <div
                key={idx}
                className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-2 shadow-2xs"
              >
                <ShieldCheck className="h-4 w-4 text-[#e31e24]" />
                {cert}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION: CONTACT & GLOBAL MANUFACTURING PLANTS */}
      <section id="contact" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-200">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-800">
            <Building2 className="h-3.5 w-3.5" /> Corporate & Manufacturing Presence
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-[#0a1628] tracking-tight">
            Our Corporate Offices & Plants
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            Reach out to our engineering and sales offices across India and the United Arab Emirates.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* India HQ */}
          <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#e31e24]">
                Corporate Headquarters · India
              </span>
              <span className="text-xs text-slate-500 font-mono">SEJAL GLASS LTD.</span>
            </div>
            <h3 className="text-xl font-black text-slate-900">Sejal Encasa, Mumbai</h3>
            <p className="text-xs text-slate-600 leading-relaxed flex items-start gap-2">
              <MapPin className="h-4 w-4 text-[#e31e24] shrink-0 mt-0.5" />
              173/174, Sejal Encasa, 3rd Floor, S.V. Road, Kandivali (West), Mumbai - 400067, Maharashtra, India.
            </p>
            <div className="space-y-1.5 pt-2 text-xs text-slate-700">
              <div className="flex items-center gap-2 font-semibold">
                <Phone className="h-3.5 w-3.5 text-blue-600" /> +91-22-2866 5100 / 6932 5100
              </div>
              <div className="flex items-center gap-2 font-semibold">
                <Mail className="h-3.5 w-3.5 text-emerald-600" /> info@sejalglass.co.in
              </div>
            </div>
          </div>

          {/* UAE Plant */}
          <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Manufacturing Plant · UAE
              </span>
              <span className="text-xs text-slate-500 font-mono">SEJAL GLASS & PRODUCTS LLC</span>
            </div>
            <h3 className="text-xl font-black text-slate-900">Ras Al Khaimah Plant, UAE</h3>
            <p className="text-xs text-slate-600 leading-relaxed flex items-start gap-2">
              <MapPin className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              Plot # 41 & 43, Al Ghali Industrial Zone, Ras Al Khaimah, United Arab Emirates.
            </p>
            <div className="space-y-1.5 pt-2 text-xs text-slate-700">
              <div className="flex items-center gap-2 font-semibold">
                <Phone className="h-3.5 w-3.5 text-blue-600" /> +971 7 233 1592
              </div>
              <div className="flex items-center gap-2 font-semibold">
                <Mail className="h-3.5 w-3.5 text-emerald-600" /> sales@sejalglass.co.in
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 bg-[#0e1e35] text-slate-300 border-t border-slate-800 py-12 px-4 sm:px-6 lg:px-8 text-xs">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="bg-white p-2 rounded-xl inline-block">
              <img
                src="/sejal-glass-logo.png"
                alt="Sejal Glass"
                className="h-10 w-auto object-contain"
              />
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              SEJAL GLASS LTD. — Preferred architectural glass processors in India and internationally. Reflecting Values
              through world-class safety, acoustic, and solar control glazing.
            </p>
          </div>

          <div>
            <h5 className="font-bold text-white mb-3 uppercase tracking-wider text-xs">Products</h5>
            <ul className="space-y-2 text-slate-400">
              <li>Kool Glass™ (DGU / IGU)</li>
              <li>Solid Glass™ (Toughened & HST)</li>
              <li>Fort Glass™ (SGP Laminated)</li>
              <li>Tone Glass™ (Acoustic)</li>
              <li>Armor Glass™ (Bullet & Blast)</li>
              <li>FireBan Glass™ (Fire Resistant)</li>
              <li>Decor Glass™ (Ceramic Fritted)</li>
              <li>Lunaro™ (Low-Iron Clear)</li>
            </ul>
          </div>

          <div>
            <h5 className="font-bold text-white mb-3 uppercase tracking-wider text-xs">Systems & Portals</h5>
            <ul className="space-y-2 text-slate-400">
              <li>
                <Link to="/login" className="text-amber-300 hover:underline font-semibold flex items-center gap-1.5">
                  <LogIn className="w-3.5 h-3.5 text-amber-300" />
                  Production ERP &amp; Tracking OS (Login)
                </Link>
              </li>

              <li>
                <button onClick={() => setQuoteModalOpen(true)} className="hover:text-white text-left">
                  Request Quotation
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="font-bold text-white mb-3 uppercase tracking-wider text-xs">Contact Headquarters</h5>
            <ul className="space-y-2 text-slate-400">
              <li className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-[#e31e24] shrink-0 mt-0.5" />
                173/174, Sejal Encasa, Kandivali (W), Mumbai-400067
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-sky-400" /> +91-22-2866 5100 / 6932 5100
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-emerald-400" /> info@sejalglass.co.in
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-[11px] text-slate-400">
          <div>© {new Date().getFullYear()} Sejal Glass Ltd. All Rights Reserved. (CIN: L26100MH1998PLC117447)</div>
          <div className="flex gap-4">
            <span>IS 2553 Certified</span>
            <span>ISO 9001:2015</span>
            <span>EN 1279 Compliant</span>
          </div>
        </div>
      </footer>

      {/* MODAL: REQUEST ARCHITECTURAL QUOTE */}
      {quoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-xl rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-2xl space-y-5">
            <button
              onClick={() => setQuoteModalOpen(false)}
              className="absolute right-5 top-5 h-8 w-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1">
              <div className="text-xs font-bold text-[#e31e24] uppercase tracking-wider">Fast Technical Quotation</div>
              <h3 className="text-2xl font-black text-slate-900">Request Project Proposal</h3>
              <p className="text-xs text-slate-500">
                Our facade engineering team will review your specifications and issue a comprehensive commercial quote
                within 24 hours.
              </p>
            </div>

            {quoteSubmitted ? (
              <div className="p-8 rounded-2xl bg-emerald-50 border border-emerald-300 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h4 className="text-lg font-bold text-slate-900">Quote Request Transmitted</h4>
                <p className="text-xs text-slate-600">
                  Reference #QT-{Math.floor(100000 + Math.random() * 900000)} generated. Our engineering team at Sejal Glass Ltd. has received
                  your specs.
                </p>
              </div>
            ) : (
              <form onSubmit={handleQuoteSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Your Full Name *</label>
                    <Input
                      required
                      value={quoteForm.name}
                      onChange={(e) => setQuoteForm({ ...quoteForm, name: e.target.value })}
                      placeholder="e.g. David Vance"
                      className="bg-slate-50 border-slate-300 text-slate-900 rounded-xl text-xs h-10"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Company / Contractor *</label>
                    <Input
                      required
                      value={quoteForm.company}
                      onChange={(e) => setQuoteForm({ ...quoteForm, company: e.target.value })}
                      placeholder="e.g. Al Futtaim Facades LLC"
                      className="bg-slate-50 border-slate-300 text-slate-900 rounded-xl text-xs h-10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Email Address *</label>
                    <Input
                      type="email"
                      required
                      value={quoteForm.email}
                      onChange={(e) => setQuoteForm({ ...quoteForm, email: e.target.value })}
                      placeholder="engineer@company.com"
                      className="bg-slate-50 border-slate-300 text-slate-900 rounded-xl text-xs h-10"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Phone Number *</label>
                    <Input
                      required
                      value={quoteForm.phone}
                      onChange={(e) => setQuoteForm({ ...quoteForm, phone: e.target.value })}
                      placeholder="+91 98200 12345 / +971 50 123 4567"
                      className="bg-slate-50 border-slate-300 text-slate-900 rounded-xl text-xs h-10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Project Name</label>
                    <Input
                      value={quoteForm.projectName}
                      onChange={(e) => setQuoteForm({ ...quoteForm, projectName: e.target.value })}
                      placeholder="e.g. Downtown Horizon Tower"
                      className="bg-slate-50 border-slate-300 text-slate-900 rounded-xl text-xs h-10"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Estimated Sqm</label>
                    <Input
                      value={quoteForm.estimatedSqm}
                      onChange={(e) => setQuoteForm({ ...quoteForm, estimatedSqm: e.target.value })}
                      placeholder="e.g. 1,200 m²"
                      className="bg-slate-50 border-slate-300 text-slate-900 rounded-xl text-xs h-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Glass Spec Required</label>
                  <Input
                    value={quoteForm.glassType}
                    onChange={(e) => setQuoteForm({ ...quoteForm, glassType: e.target.value })}
                    placeholder="e.g. Kool Glass™ Stopray + 16A + 6mm Solid Glass™ (HST)"
                    className="bg-slate-50 border-slate-300 text-slate-900 rounded-xl text-xs h-10"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Additional Project Details / Remarks</label>
                  <textarea
                    rows={3}
                    value={quoteForm.message}
                    onChange={(e) => setQuoteForm({ ...quoteForm, message: e.target.value })}
                    placeholder="Delivery timeline, acoustic requirements, structural drawings..."
                    className="w-full rounded-xl bg-slate-50 border border-slate-300 p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1a3a6b]"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#1a3a6b] hover:bg-[#122b52] text-white font-extrabold text-xs h-11 rounded-xl shadow-md"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Submit Engineering RFQ
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
