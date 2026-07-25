import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Box,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Filter,
  Gauge,
  GlassWater,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  PackageCheck,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Truck,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Proforma Invoices", icon: FileText, count: "24" },
  { label: "Production", icon: Gauge },
  { label: "Reports", icon: ClipboardList },
];

const stages = [
  { name: "Cutting", key: "CUTTING", count: 42, color: "#3165ed", tint: "#eaf0ff" },
  { name: "Tempering", key: "TEMPERING", count: 28, color: "#7c5ce4", tint: "#f0edff" },
  { name: "Lamination", key: "LAMINATION", count: 16, color: "#e58a35", tint: "#fff3e6" },
  { name: "DGU", key: "DGU", count: 23, color: "#16a691", tint: "#e7f8f5" },
  { name: "Finished", key: "FINISHED", count: 186, color: "#55ad69", tint: "#ebf8ee" },
];

const recentPIs = [
  { number: "PI-202408-018", customer: "Al Noor Properties", project: "Harbor View Towers", items: 48, area: "1,284.5 m²", status: "In Production", tone: "blue", date: "Aug 24, 2024" },
  { number: "PI-202408-017", customer: "Meridian Interiors", project: "The Palm Residence", items: 32, area: "872.0 m²", status: "Completed", tone: "green", date: "Aug 23, 2024" },
  { number: "PI-202408-016", customer: "Vertex Contracting", project: "Metro Business Park", items: 64, area: "2,105.8 m²", status: "In Production", tone: "blue", date: "Aug 21, 2024" },
  { number: "PI-202408-015", customer: "Studio Forma", project: "Azure Villas", items: 18, area: "410.2 m²", status: "Pending", tone: "amber", date: "Aug 20, 2024" },
];

const queueItems = [
  { serial: "GL-240824-00842", detail: "10mm Clear Toughened", stage: "Tempering", eta: "12 min", color: "#7c5ce4" },
  { serial: "GL-240824-00839", detail: "6mm Low-E DGU", stage: "DGU", eta: "28 min", color: "#16a691" },
  { serial: "GL-240824-00831", detail: "12mm Extra Clear", stage: "Cutting", eta: "45 min", color: "#3165ed" },
];

function StatCard({ icon: Icon, label, value, change, positive = true, accent }: { icon: typeof Box; label: string; value: string; change: string; positive?: boolean; accent: string }) {
  return (
    <div className="stat-card group">
      <div className="flex items-start justify-between">
        <div className="icon-tile" style={{ backgroundColor: accent + "14", color: accent }}><Icon size={19} strokeWidth={2.2} /></div>
        <MoreHorizontal size={18} className="text-slate-300 transition-colors group-hover:text-slate-500" />
      </div>
      <div className="mt-5 flex items-end justify-between gap-2">
        <div><p className="text-[13px] font-medium text-slate-500">{label}</p><p className="mt-1 text-[28px] font-bold tracking-[-0.04em] text-slate-900">{value}</p></div>
        <span className={`mb-1 flex items-center gap-0.5 text-xs font-semibold ${positive ? "text-emerald-600" : "text-rose-500"}`}>
          {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}
        </span>
      </div>
    </div>
  );
}

export default function Index() {
  const [activeNav, setActiveNav] = useState("Overview");
  const [search, setSearch] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [notice, setNotice] = useState("");

  const filteredPIs = useMemo(() => recentPIs.filter((pi) => `${pi.number} ${pi.customer} ${pi.project}`.toLowerCase().includes(search.toLowerCase())), [search]);

  const flashNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  };

  return (
    <div className="min-h-screen bg-[#f6f8fc] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-slate-200/80 bg-white px-4 lg:flex">
        <div className="flex h-[86px] items-center gap-3 px-3">
          <div className="brand-mark"><GlassWater size={22} strokeWidth={2.2} /></div>
          <div><p className="text-[15px] font-extrabold tracking-[-0.03em] text-slate-900">GlassTrack</p><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Operations OS</p></div>
        </div>
        <div className="mb-5 mt-4 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</div>
        <nav className="space-y-1">
          {navItems.map(({ label, icon: Icon, count }) => (
            <button key={label} onClick={() => setActiveNav(label)} className={`sidebar-link ${activeNav === label ? "sidebar-link-active" : ""}`}>
              <Icon size={18} strokeWidth={activeNav === label ? 2.4 : 2} /><span>{label}</span>{count && <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{count}</span>}
            </button>
          ))}
        </nav>
        <div className="mb-5 mt-9 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Plant floor</div>
        <nav className="space-y-1">
          <button onClick={() => setActiveNav("Scan station")} className={`sidebar-link ${activeNav === "Scan station" ? "sidebar-link-active" : ""}`}><ScanLine size={18} /><span>Scan station</span><span className="ml-auto h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-50" /></button>
          <button onClick={() => flashNotice("All production stations are online")} className="sidebar-link"><Truck size={18} /><span>Dispatch</span></button>
        </nav>
        <div className="mt-auto">
          <div className="mb-4 rounded-2xl bg-[#f3f6ff] p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold text-[#3165ed]">Plant capacity</span><Sparkles size={15} className="text-[#3165ed]" /></div><div className="mb-2 flex justify-between text-[11px] font-medium text-slate-500"><span>Current utilization</span><span className="font-bold text-slate-800">68%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full w-[68%] rounded-full bg-[#3165ed]" /></div></div>
          <button className="sidebar-link mb-2"><Settings2 size={18} /><span>Settings</span></button>
          <div className="flex items-center gap-3 border-t border-slate-100 px-3 py-5"><div className="avatar">AM</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">Aisha Malik</p><p className="text-[11px] text-slate-400">Administrator</p></div><ChevronDown size={15} className="text-slate-400" /></div>
        </div>
      </aside>

      <main className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur-md sm:px-8 lg:px-10">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><Menu size={20} /></button><div><p className="hidden text-xs font-medium text-slate-400 sm:block">Friday, August 30, 2024</p><h1 className="text-[18px] font-bold tracking-[-0.02em] text-slate-900 sm:mt-0.5 sm:text-[20px]">Good morning, Aisha <span className="text-[#3165ed]">—</span></h1></div></div>
          <div className="flex items-center gap-2 sm:gap-4"><div className="relative hidden md:block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PI, serial or customer" className="h-10 w-[245px] rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs shadow-none placeholder:text-slate-400 focus-visible:ring-[#3165ed]" /></div><button onClick={() => flashNotice("You have 3 new notifications")} className="relative rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100"><Bell size={19} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#3165ed] ring-2 ring-white" /></button><div className="avatar hidden sm:flex">AM</div></div>
        </header>

        <div className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
          {notice && <div className="toast-notice"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-400"><span>Workspace</span><span>/</span><span className="text-slate-600">{activeNav}</span></div><h2 className="text-[26px] font-extrabold tracking-[-0.045em] text-slate-950 sm:text-[30px]">Production overview</h2><p className="mt-1 text-sm text-slate-500">A clear view of your glass production floor, from PI to dispatch.</p></div><div className="flex gap-2"><Button onClick={() => setShowScanner(true)} variant="outline" className="h-10 gap-2 rounded-xl border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm"><ScanLine size={16} className="text-[#3165ed]" /> Scan item</Button><Button onClick={() => flashNotice("New PI workflow opened")} className="h-10 gap-2 rounded-xl bg-[#3165ed] px-4 text-xs font-bold text-white shadow-[0_6px_14px_rgba(49,101,237,0.22)] hover:bg-[#2858dc]"><Plus size={16} /> New PI</Button></div></div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard icon={FileText} label="Total PIs" value="124" change="12.5%" accent="#3165ed" /><StatCard icon={RefreshCw} label="In production" value="38" change="8.2%" accent="#7c5ce4" /><StatCard icon={PackageCheck} label="Finished items" value="1,248" change="18.4%" accent="#16a691" /><StatCard icon={AlertTriangle} label="Needs attention" value="14" change="3.1%" positive={false} accent="#e58a35" /></div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_330px]">
            <section className="panel"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="section-title">Production pipeline</h3><p className="section-subtitle">Items currently moving through the plant</p></div><button onClick={() => flashNotice("Pipeline filters opened")} className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><Filter size={14} /> Filter</button></div><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">{stages.map((stage, index) => <div key={stage.key} className="stage-card" style={{ backgroundColor: stage.tint }}><div className="flex items-start justify-between"><span className="stage-icon" style={{ backgroundColor: stage.color }}><Box size={15} /></span>{index < 4 && <ArrowUpRight size={14} style={{ color: stage.color }} />}</div><p className="mt-5 text-[13px] font-semibold text-slate-600">{stage.name}</p><p className="mt-1 text-[25px] font-extrabold tracking-[-0.05em] text-slate-900">{stage.count}</p><div className="mt-3 h-1 overflow-hidden rounded-full bg-white/80"><div className="h-full rounded-full" style={{ width: `${Math.min(100, 25 + stage.count / 2)}%`, backgroundColor: stage.color }} /></div><p className="mt-2 text-[10px] font-semibold text-slate-400">{index === 4 ? "Ready to dispatch" : "Pending queue"}</p></div>)}</div><div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-[11px] font-semibold text-slate-500"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#3165ed]" /> Active today <b className="text-slate-800">95</b></span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#16a691]" /> Completed today <b className="text-slate-800">42</b></span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#e58a35]" /> Rework <b className="text-slate-800">7</b></span></div></section>
            <section className="scan-panel"><div className="flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a9c8ff]">Quick action</p><h3 className="mt-1 text-[19px] font-extrabold tracking-[-0.03em] text-white">Scan an item</h3></div><div className="rounded-xl bg-white/10 p-2.5"><QrCode size={21} className="text-[#bdd3ff]" /></div></div><p className="mt-3 text-xs leading-relaxed text-[#a9bde0]">Scan a barcode to view status, update a stage, or flag an issue.</p><div className="mt-6 rounded-xl border border-white/15 bg-white/[0.08] p-2"><div className="flex items-center gap-2"><ScanLine size={17} className="ml-2 text-[#8fb3ff]" /><input value={scanValue} onChange={(e) => setScanValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && flashNotice(scanValue ? `Item ${scanValue} found` : "Ready to scan an item")} placeholder="Scan barcode or type serial" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs text-white outline-none placeholder:text-[#8198c0]" /><button onClick={() => flashNotice(scanValue ? `Item ${scanValue} found` : "Ready to scan an item")} className="rounded-lg bg-[#3165ed] p-2 text-white hover:bg-[#4778f0]"><ArrowUpRight size={15} /></button></div></div><div className="mt-5 flex items-center gap-2 text-[10px] font-semibold text-[#8ea8d1]"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Scanner station online <span className="ml-auto">Last sync 2m ago</span></div></section>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_330px]">
            <section className="panel overflow-hidden p-0"><div className="flex flex-col justify-between gap-3 px-6 py-5 sm:flex-row sm:items-center"><div><h3 className="section-title">Recent proforma invoices</h3><p className="section-subtitle">Latest orders across your production floor</p></div><button onClick={() => setActiveNav("Proforma Invoices")} className="text-xs font-bold text-[#3165ed] hover:underline">View all PIs <span className="ml-1">→</span></button></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="border-y border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400"><th className="px-6 py-3">PI number</th><th className="px-4 py-3">Customer / project</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Status</th><th className="px-6 py-3 text-right">Issued</th></tr></thead><tbody>{filteredPIs.map((pi) => <tr key={pi.number} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"><td className="px-6 py-4"><p className="text-xs font-bold text-[#3165ed]">{pi.number}</p><p className="mt-1 text-[10px] font-medium text-slate-400">{pi.date}</p></td><td className="px-4 py-4"><p className="text-xs font-bold text-slate-800">{pi.customer}</p><p className="mt-1 text-[11px] text-slate-400">{pi.project}</p></td><td className="px-4 py-4"><p className="text-xs font-bold text-slate-700">{pi.items} sheets</p><p className="mt-1 text-[10px] text-slate-400">{pi.area}</p></td><td className="px-4 py-4"><span className={`status-pill status-${pi.tone}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{pi.status}</span></td><td className="px-6 py-4 text-right"><button onClick={() => flashNotice(`Opening ${pi.number}`)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table>{filteredPIs.length === 0 && <div className="px-6 py-10 text-center text-sm text-slate-400">No PIs match your search.</div>}</div></section>
            <section className="panel"><div className="flex items-start justify-between"><div><h3 className="section-title">Live queue</h3><p className="section-subtitle">Next items to process</p></div><span className="relative mt-1 flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span></div><div className="mt-5 space-y-4">{queueItems.map((item) => <div key={item.serial} className="flex items-center gap-3"><div className="queue-icon" style={{ color: item.color, backgroundColor: item.color + "14" }}><GlassWater size={16} /></div><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-slate-800">{item.serial}</p><p className="mt-1 truncate text-[10px] text-slate-400">{item.detail}</p></div><div className="text-right"><p className="text-[10px] font-bold" style={{ color: item.color }}>{item.stage}</p><p className="mt-1 text-[10px] text-slate-400">{item.eta}</p></div></div>)}</div><button onClick={() => setActiveNav("Production")} className="mt-6 w-full rounded-xl border border-slate-200 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">Open production queue</button></section>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-5 py-3.5 text-[11px] text-slate-500 shadow-sm"><span className="flex items-center gap-2"><ShieldCheck size={15} className="text-emerald-500" /> All systems operational</span><span className="flex items-center gap-5"><span>Last updated <b className="font-semibold text-slate-700">just now</b></span><button onClick={() => flashNotice("Dashboard refreshed")} className="flex items-center gap-1.5 font-bold text-[#3165ed]"><RefreshCw size={13} /> Refresh</button></span></div>
        </div>
      </main>

      {showScanner && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><div className="mb-3 inline-flex rounded-xl bg-[#eef3ff] p-3 text-[#3165ed]"><ScanLine size={22} /></div><h3 className="text-xl font-extrabold tracking-[-0.03em] text-slate-900">Scan production item</h3><p className="mt-1 text-sm text-slate-500">Use a handheld scanner or enter a serial number.</p></div><button onClick={() => setShowScanner(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><div className="mt-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><ScanLine size={18} className="text-[#3165ed]" /><input autoFocus value={scanValue} onChange={(e) => setScanValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (flashNotice(`Item ${scanValue || ""} found`), setShowScanner(false))} placeholder="GL-240824-00842" className="h-12 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate-400" /></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowScanner(false)} className="rounded-xl text-xs font-bold">Cancel</Button><Button onClick={() => { flashNotice(`Item ${scanValue || ""} found`); setShowScanner(false); }} className="rounded-xl bg-[#3165ed] text-xs font-bold">Find item</Button></div></div></div>}
    </div>
  );
}
