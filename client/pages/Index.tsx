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
  { name: "Cutting", key: "CUTTING", count: 202, color: "#3165ed", tint: "#eaf0ff" },
  { name: "Tempering", key: "TEMPERING", count: 38, color: "#7c5ce4", tint: "#f0edff" },
  { name: "Lamination", key: "LAMINATION", count: 16, color: "#e58a35", tint: "#fff3e6" },
  { name: "DGU", key: "DGU", count: 56, color: "#16a691", tint: "#e7f8f5" },
  { name: "Finished", key: "FINISHED", count: 186, color: "#55ad69", tint: "#ebf8ee" },
];

const recentPIs = [
  { number: "SFO-0384", customer: "CIJI BLDG. METALIC CONST. IND. LLC", project: "G_1P_10_ST · GL01 Site Discovery", items: 202, area: "1,396 × 2,350 mm", status: "In Production", tone: "blue", date: "Opt. date · 18 Jul 2026" },
  { number: "OB-03084", customer: "CIJI BLDG. METALIC CONST. IND. LLC", project: "G_1P_10_ST · GL03 Site Discovery", items: 38, area: "1,396 × 1,210 mm", status: "In Production", tone: "blue", date: "Batch 1468" },
  { number: "SFO-1348", customer: "Sejal Glass Manufacturing Products LLC", project: "Shop floor order · Phase 02", items: 12, area: "1,383 × 2,798 mm", status: "Completed", tone: "green", date: "SFO date · 25 Apr 2026" },
  { number: "GL-009-00", customer: "Villa Glass", project: "Phase-02 · 02 Nos Villa Glass", items: 2, area: "1,032 × 2,798 mm", status: "Pending", tone: "amber", date: "Imported workbook" },
];

const queueItems = [
  { serial: "10126270134900002", detail: "6MM SYP YBE 0140N CLEAR · GL01", stage: "Tempering", eta: "12 min", color: "#7c5ce4" },
  { serial: "10126270134900006", detail: "6MM SYP YBE 0140N CLEAR · GL03", stage: "DGU", eta: "28 min", color: "#16a691" },
  { serial: "OB-03084 / POS 1", detail: "1,396 × 2,350 mm · 12MM BLACK SPACER", stage: "Cutting", eta: "45 min", color: "#3165ed" },
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

function ModuleView({ module, onNotice, onScan }: { module: string; onNotice: (message: string) => void; onScan: () => void }) {
  const [productionFilter, setProductionFilter] = useState("All stages");
  const [reportType, setReportType] = useState("Production summary");
  const [uploadName, setUploadName] = useState("");
  const moduleCopy: Record<string, { title: string; subtitle: string }> = {
    "Proforma Invoices": { title: "Proforma invoices", subtitle: "Create, import, release, and track every customer order." },
    Production: { title: "Production control", subtitle: "Move glass sheets through each stage with confidence." },
    Reports: { title: "Reports & insights", subtitle: "Export production performance and exception reports." },
    "Scan station": { title: "Scan station", subtitle: "Use a barcode to instantly locate and update a glass item." },
    Dispatch: { title: "Dispatch", subtitle: "Coordinate finished items ready to leave the plant." },
    Settings: { title: "Plant settings", subtitle: "Manage users, routes, stations, and operational preferences." },
  };
  const copy = moduleCopy[module] || moduleCopy.Production;

  return <>
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-400"><span>Workspace</span><span>/</span><span className="text-slate-600">{module}</span></div><h2 className="text-[26px] font-extrabold tracking-[-0.045em] text-slate-950 sm:text-[30px]">{copy.title}</h2><p className="mt-1 text-sm text-slate-500">{copy.subtitle}</p></div><div className="flex gap-2">{module === "Scan station" ? <Button onClick={onScan} className="h-10 gap-2 rounded-xl bg-[#3165ed] px-4 text-xs font-bold text-white"><ScanLine size={16} /> Open scanner</Button> : <Button onClick={() => onNotice(module === "Proforma Invoices" ? "New PI workflow opened" : "Action queued for review")} className="h-10 gap-2 rounded-xl bg-[#3165ed] px-4 text-xs font-bold text-white"><Plus size={16} /> {module === "Proforma Invoices" ? "New PI" : "Create export"}</Button>}</div></div>
    {module === "Proforma Invoices" && <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3"><StatCard icon={FileText} label="Total invoices" value="124" change="12.5%" accent="#3165ed" /><StatCard icon={RefreshCw} label="In production" value="2" change="8.2%" accent="#7c5ce4" /><StatCard icon={Upload} label="Imports this month" value="18" change="6.4%" accent="#16a691" /></div><section className="panel overflow-hidden p-0"><div className="flex flex-col justify-between gap-3 px-6 py-5 sm:flex-row sm:items-center"><div><h3 className="section-title">Invoice register</h3><p className="section-subtitle">Search, review, and release customer orders</p></div><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#9db7ff] bg-[#f5f8ff] px-3 py-2 text-xs font-bold text-[#3165ed]"><Upload size={14} />{uploadName || "Import Excel"}<input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const name = e.target.files?.[0]?.name; if (name) { setUploadName(name); onNotice(`${name} ready to validate`); } }} /></label></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr className="border-y border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400"><th className="px-6 py-3">PI number</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Status</th><th className="px-6 py-3 text-right">Action</th></tr></thead><tbody>{recentPIs.map((pi) => <tr key={pi.number} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"><td className="px-6 py-4 text-xs font-bold text-[#3165ed]">{pi.number}</td><td className="px-4 py-4 text-xs font-semibold text-slate-800">{pi.customer}</td><td className="px-4 py-4 text-xs text-slate-500">{pi.project}</td><td className="px-4 py-4 text-xs font-bold text-slate-700">{pi.items}</td><td className="px-4 py-4"><span className={`status-pill status-${pi.tone}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{pi.status}</span></td><td className="px-6 py-4 text-right"><button onClick={() => onNotice(`${pi.number} opened`)} className="text-xs font-bold text-[#3165ed]">View</button></td></tr>)}</tbody></table></div></section></div>}
    {module === "Production" && <div className="space-y-6"><section className="panel"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h3 className="section-title">Stage queues</h3><p className="section-subtitle">Select a stage to manage pending items</p></div><select value={productionFilter} onChange={(e) => setProductionFilter(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none"><option>All stages</option>{stages.map((stage) => <option key={stage.key}>{stage.name}</option>)}</select></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{stages.map((stage) => <button key={stage.key} onClick={() => { setProductionFilter(stage.name); onNotice(`${stage.name} queue selected`); }} className={`stage-card text-left ${productionFilter === stage.name ? "ring-2 ring-[#3165ed] ring-offset-2" : ""}`} style={{ backgroundColor: stage.tint }}><span className="stage-icon" style={{ backgroundColor: stage.color }}><Box size={15} /></span><p className="mt-4 text-xs font-bold text-slate-600">{stage.name}</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{stage.count}</p><p className="mt-2 text-[10px] font-semibold text-slate-400">Pending queue</p></button>)}</div></section><section className="panel"><div className="flex items-center justify-between"><div><h3 className="section-title">Items in {productionFilter === "All stages" ? "all stages" : productionFilter}</h3><p className="section-subtitle">Scan or select an item to update its status</p></div><Button onClick={onScan} variant="outline" className="h-9 gap-2 rounded-xl text-xs font-bold"><ScanLine size={14} /> Scan item</Button></div><div className="mt-5 space-y-2">{queueItems.map((item) => <div key={item.serial} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 px-4 py-3"><div className="queue-icon" style={{ color: item.color, backgroundColor: item.color + "14" }}><GlassWater size={16} /></div><div className="min-w-[170px] flex-1"><p className="text-xs font-bold text-slate-800">{item.serial}</p><p className="mt-1 text-[10px] text-slate-400">{item.detail}</p></div><span className="text-[10px] font-bold" style={{ color: item.color }}>{item.stage}</span><span className="text-[10px] text-slate-400">ETA {item.eta}</span><Button onClick={() => onNotice(`${item.serial} marked complete`)} className="h-8 rounded-lg bg-[#3165ed] px-3 text-[10px] font-bold">Complete</Button></div>)}</div></section></div>}
    {module === "Reports" && <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3"><StatCard icon={ClipboardList} label="Reports generated" value="86" change="21.2%" accent="#3165ed" /><StatCard icon={PackageCheck} label="Sheets produced" value="4,892" change="18.4%" accent="#16a691" /><StatCard icon={AlertTriangle} label="Exceptions" value="21" change="4.8%" positive={false} accent="#e58a35" /></div><section className="panel"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h3 className="section-title">Report center</h3><p className="section-subtitle">Choose a report and export the latest production data</p></div><div className="flex gap-2"><Button onClick={() => onNotice(`${reportType} exported as PDF`)} className="h-9 gap-2 rounded-xl bg-[#3165ed] text-xs font-bold"><FileText size={14} /> PDF</Button><Button onClick={() => onNotice(`${reportType} exported as Excel`)} variant="outline" className="h-9 gap-2 rounded-xl text-xs font-bold"><FileSpreadsheet size={14} /> Excel</Button></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{["Production summary", "Pending items", "Finished items", "Reject report", "Rework report", "Operator performance"].map((report) => <button key={report} onClick={() => setReportType(report)} className={`rounded-xl border p-4 text-left transition-colors ${reportType === report ? "border-[#3165ed] bg-[#f3f6ff]" : "border-slate-100 hover:bg-slate-50"}`}><div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef3ff] text-[#3165ed]"><ClipboardList size={16} /></div><p className="text-xs font-bold text-slate-800">{report}</p><p className="mt-1 text-[10px] text-slate-400">Updated today</p></button>)}</div></section></div>}
    {module === "Scan station" && <section className="panel mx-auto max-w-2xl"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[#eef3ff] text-[#3165ed]"><QrCode size={42} strokeWidth={1.5} /></div><div className="mt-5 text-center"><h3 className="text-xl font-extrabold tracking-[-0.03em] text-slate-900">Ready to scan</h3><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">Connect a handheld scanner or use the input below. GlassTrack will show the item’s current stage, route, and available actions.</p><Button onClick={onScan} className="mt-6 h-11 gap-2 rounded-xl bg-[#3165ed] px-5 text-xs font-bold"><ScanLine size={16} /> Start scanning</Button></div><div className="mt-8 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-emerald-50 p-4 text-center"><p className="text-lg font-extrabold text-emerald-700">Online</p><p className="mt-1 text-[10px] font-bold text-emerald-600">Station status</p></div><div className="rounded-xl bg-[#f3f6ff] p-4 text-center"><p className="text-lg font-extrabold text-[#3165ed]">1,248</p><p className="mt-1 text-[10px] font-bold text-[#3165ed]">Finished today</p></div><div className="rounded-xl bg-amber-50 p-4 text-center"><p className="text-lg font-extrabold text-amber-700">7</p><p className="mt-1 text-[10px] font-bold text-amber-600">Needs rework</p></div></div></section>}
    {module === "Settings" && <div className="grid gap-6 lg:grid-cols-2"><section className="panel"><div className="mb-5 flex items-center gap-3"><div className="icon-tile bg-[#eef3ff] text-[#3165ed]"><Settings2 size={19} /></div><div><h3 className="section-title">Workspace settings</h3><p className="section-subtitle">Configure how GlassTrack works for your team</p></div></div><div className="space-y-3">{[{ label: "Require supervisor approval for rejects", enabled: true }, { label: "Auto-refresh production queues", enabled: true }, { label: "Notify operators on rework", enabled: false }].map((setting) => <button key={setting.label} onClick={() => onNotice(`${setting.label} ${setting.enabled ? "disabled" : "enabled"}`)} className="flex w-full items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-left hover:bg-slate-50"><span className="text-xs font-semibold text-slate-700">{setting.label}</span><span className={`h-5 w-9 rounded-full p-0.5 ${setting.enabled ? "bg-[#3165ed]" : "bg-slate-200"}`}><span className={`block h-4 w-4 rounded-full bg-white transition-transform ${setting.enabled ? "translate-x-4" : ""}`} /></span></button>)}</div></section><section className="panel"><div className="mb-5 flex items-center gap-3"><div className="icon-tile bg-[#e7f8f5] text-[#16a691]"><Users size={19} /></div><div><h3 className="section-title">Team & access</h3><p className="section-subtitle">3 roles · 18 active users</p></div></div><div className="space-y-3">{[{ role: "Administrators", count: "3 users", color: "#3165ed" }, { role: "Supervisors", count: "5 users", color: "#7c5ce4" }, { role: "Production operators", count: "10 users", color: "#16a691" }].map((team) => <div key={team.role} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: team.color }}>{team.count.split(" ")[0]}</div><div className="flex-1"><p className="text-xs font-bold text-slate-800">{team.role}</p><p className="mt-1 text-[10px] text-slate-400">{team.count}</p></div><button onClick={() => onNotice(`${team.role} opened`)} className="text-xs font-bold text-[#3165ed]">Manage</button></div>)}</div></section></div>}
    {module === "Dispatch" && <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3"><StatCard icon={Truck} label="Ready to dispatch" value="186" change="12.8%" accent="#16a691" /><StatCard icon={CalendarDays} label="Collections today" value="8" change="2" accent="#3165ed" /><StatCard icon={Users} label="Active customers" value="32" change="6.1%" accent="#7c5ce4" /></div><section className="panel"><div className="flex items-center justify-between"><div><h3 className="section-title">Dispatch schedule</h3><p className="section-subtitle">Finished glass awaiting collection</p></div><button onClick={() => onNotice("Dispatch schedule refreshed")} className="text-xs font-bold text-[#3165ed]">Refresh</button></div><div className="mt-5 space-y-3">{[{ customer: "CIJI BLDG. METALIC CONST. IND. LLC", reference: "SFO-0384", sheets: 202, time: "09:30 AM", status: "Loading" }, { customer: "CIJI BLDG. METALIC CONST. IND. LLC", reference: "OB-03084", sheets: 38, time: "11:00 AM", status: "Ready" }, { customer: "Sejal Glass Manufacturing Products LLC", reference: "SFO-1348", sheets: 12, time: "02:30 PM", status: "Scheduled" }].map((delivery) => <div key={delivery.reference} className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-100 px-4 py-4"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e7f8f5] text-[#16a691]"><Truck size={17} /></div><div className="min-w-[150px] flex-1"><p className="text-xs font-bold text-slate-800">{delivery.customer}</p><p className="mt-1 text-[10px] text-slate-400">{delivery.reference} · {delivery.sheets} sheets</p></div><span className="text-xs font-bold text-slate-600">{delivery.time}</span><span className="status-pill status-green">{delivery.status}</span><button onClick={() => onNotice(`${delivery.reference} opened`)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><MoreHorizontal size={16} /></button></div>)}</div></section></div>}
  </>;
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
          <div><p className="text-[15px] font-extrabold tracking-[-0.03em] text-slate-900">Sejal Glass</p><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Production Control</p></div>
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
          <button onClick={() => setActiveNav("Dispatch")} className={`sidebar-link ${activeNav === "Dispatch" ? "sidebar-link-active" : ""}`}><Truck size={18} /><span>Dispatch</span></button>
        </nav>
        <div className="mt-auto">
          <div className="mb-4 rounded-2xl bg-[#f3f6ff] p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold text-[#3165ed]">Plant capacity</span><Sparkles size={15} className="text-[#3165ed]" /></div><div className="mb-2 flex justify-between text-[11px] font-medium text-slate-500"><span>Current utilization</span><span className="font-bold text-slate-800">68%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full w-[68%] rounded-full bg-[#3165ed]" /></div></div>
          <button onClick={() => setActiveNav("Settings")} className={`sidebar-link mb-2 ${activeNav === "Settings" ? "sidebar-link-active" : ""}`}><Settings2 size={18} /><span>Settings</span></button>
          <div className="flex items-center gap-3 border-t border-slate-100 px-3 py-5"><div className="avatar">AM</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">Aisha Malik</p><p className="text-[11px] text-slate-400">Administrator</p></div><ChevronDown size={15} className="text-slate-400" /></div>
        </div>
      </aside>

      <main className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur-md sm:px-8 lg:px-10">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><Menu size={20} /></button><div><p className="hidden text-xs font-medium text-slate-400 sm:block">Production date · 18 July 2026</p><h1 className="text-[18px] font-bold tracking-[-0.02em] text-slate-900 sm:mt-0.5 sm:text-[20px]">Good morning, Sejal Glass team <span className="text-[#3165ed]">—</span></h1></div></div>
          <div className="flex items-center gap-2 sm:gap-4"><div className="relative hidden md:block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PI, serial or customer" className="h-10 w-[245px] rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs shadow-none placeholder:text-slate-400 focus-visible:ring-[#3165ed]" /></div><button onClick={() => flashNotice("You have 3 new notifications")} className="relative rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100"><Bell size={19} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#3165ed] ring-2 ring-white" /></button><div className="avatar hidden sm:flex">AM</div></div>
        </header>

        <div className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
          {notice && <div className="toast-notice"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
          {activeNav === "Overview" ? <>
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-400"><span>Workspace</span><span>/</span><span className="text-slate-600">{activeNav}</span></div><h2 className="text-[26px] font-extrabold tracking-[-0.045em] text-slate-950 sm:text-[30px]">Production overview</h2><p className="mt-1 text-sm text-slate-500">A clear view of your glass production floor, from PI to dispatch.</p></div><div className="flex gap-2"><Button onClick={() => setShowScanner(true)} variant="outline" className="h-10 gap-2 rounded-xl border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm"><ScanLine size={16} className="text-[#3165ed]" /> Scan item</Button><Button onClick={() => flashNotice("New PI workflow opened")} className="h-10 gap-2 rounded-xl bg-[#3165ed] px-4 text-xs font-bold text-white shadow-[0_6px_14px_rgba(49,101,237,0.22)] hover:bg-[#2858dc]"><Plus size={16} /> New PI</Button></div></div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard icon={FileText} label="Total PIs" value="4" change="12.5%" accent="#3165ed" /><StatCard icon={RefreshCw} label="In production" value="2" change="8.2%" accent="#7c5ce4" /><StatCard icon={PackageCheck} label="Finished items" value="280" change="18.4%" accent="#16a691" /><StatCard icon={AlertTriangle} label="Needs attention" value="14" change="3.1%" positive={false} accent="#e58a35" /></div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_330px]">
            <section className="panel"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="section-title">Production pipeline</h3><p className="section-subtitle">Items currently moving through the plant</p></div><button onClick={() => flashNotice("Pipeline filters opened")} className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><Filter size={14} /> Filter</button></div><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">{stages.map((stage, index) => <div key={stage.key} className="stage-card" style={{ backgroundColor: stage.tint }}><div className="flex items-start justify-between"><span className="stage-icon" style={{ backgroundColor: stage.color }}><Box size={15} /></span>{index < 4 && <ArrowUpRight size={14} style={{ color: stage.color }} />}</div><p className="mt-5 text-[13px] font-semibold text-slate-600">{stage.name}</p><p className="mt-1 text-[25px] font-extrabold tracking-[-0.05em] text-slate-900">{stage.count}</p><div className="mt-3 h-1 overflow-hidden rounded-full bg-white/80"><div className="h-full rounded-full" style={{ width: `${Math.min(100, 25 + stage.count / 2)}%`, backgroundColor: stage.color }} /></div><p className="mt-2 text-[10px] font-semibold text-slate-400">{index === 4 ? "Ready to dispatch" : "Pending queue"}</p></div>)}</div><div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-[11px] font-semibold text-slate-500"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#3165ed]" /> Active today <b className="text-slate-800">95</b></span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#16a691]" /> Completed today <b className="text-slate-800">42</b></span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#e58a35]" /> Rework <b className="text-slate-800">7</b></span></div></section>
            <section className="scan-panel"><div className="flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a9c8ff]">Quick action</p><h3 className="mt-1 text-[19px] font-extrabold tracking-[-0.03em] text-white">Scan an item</h3></div><div className="rounded-xl bg-white/10 p-2.5"><QrCode size={21} className="text-[#bdd3ff]" /></div></div><p className="mt-3 text-xs leading-relaxed text-[#a9bde0]">Scan a barcode to view status, update a stage, or flag an issue.</p><div className="mt-6 rounded-xl border border-white/15 bg-white/[0.08] p-2"><div className="flex items-center gap-2"><ScanLine size={17} className="ml-2 text-[#8fb3ff]" /><input value={scanValue} onChange={(e) => setScanValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && flashNotice(scanValue ? `Item ${scanValue} found` : "Ready to scan an item")} placeholder="Scan barcode or type serial" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs text-white outline-none placeholder:text-[#8198c0]" /><button onClick={() => flashNotice(scanValue ? `Item ${scanValue} found` : "Ready to scan an item")} className="rounded-lg bg-[#3165ed] p-2 text-white hover:bg-[#4778f0]"><ArrowUpRight size={15} /></button></div></div><div className="mt-5 flex items-center gap-2 text-[10px] font-semibold text-[#8ea8d1]"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Scanner station online <span className="ml-auto">Last sync 2m ago</span></div></section>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_330px]">
            <section className="panel overflow-hidden p-0"><div className="flex flex-col justify-between gap-3 px-6 py-5 sm:flex-row sm:items-center"><div><h3 className="section-title">Client production orders</h3><p className="section-subtitle">Live orders from the Sejal Glass shop floor</p></div><button onClick={() => setActiveNav("Proforma Invoices")} className="text-xs font-bold text-[#3165ed] hover:underline">View all PIs <span className="ml-1">→</span></button></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="border-y border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400"><th className="px-6 py-3">PI number</th><th className="px-4 py-3">Customer / project</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Status</th><th className="px-6 py-3 text-right">Issued</th></tr></thead><tbody>{filteredPIs.map((pi) => <tr key={pi.number} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"><td className="px-6 py-4"><p className="text-xs font-bold text-[#3165ed]">{pi.number}</p><p className="mt-1 text-[10px] font-medium text-slate-400">{pi.date}</p></td><td className="px-4 py-4"><p className="text-xs font-bold text-slate-800">{pi.customer}</p><p className="mt-1 text-[11px] text-slate-400">{pi.project}</p></td><td className="px-4 py-4"><p className="text-xs font-bold text-slate-700">{pi.items} sheets</p><p className="mt-1 text-[10px] text-slate-400">{pi.area}</p></td><td className="px-4 py-4"><span className={`status-pill status-${pi.tone}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{pi.status}</span></td><td className="px-6 py-4 text-right"><button onClick={() => flashNotice(`Opening ${pi.number}`)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table>{filteredPIs.length === 0 && <div className="px-6 py-10 text-center text-sm text-slate-400">No PIs match your search.</div>}</div></section>
            <section className="panel"><div className="flex items-start justify-between"><div><h3 className="section-title">Live queue</h3><p className="section-subtitle">Next items to process</p></div><span className="relative mt-1 flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span></div><div className="mt-5 space-y-4">{queueItems.map((item) => <div key={item.serial} className="flex items-center gap-3"><div className="queue-icon" style={{ color: item.color, backgroundColor: item.color + "14" }}><GlassWater size={16} /></div><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-slate-800">{item.serial}</p><p className="mt-1 truncate text-[10px] text-slate-400">{item.detail}</p></div><div className="text-right"><p className="text-[10px] font-bold" style={{ color: item.color }}>{item.stage}</p><p className="mt-1 text-[10px] text-slate-400">{item.eta}</p></div></div>)}</div><button onClick={() => setActiveNav("Production")} className="mt-6 w-full rounded-xl border border-slate-200 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">Open production queue</button></section>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-5 py-3.5 text-[11px] text-slate-500 shadow-sm"><span className="flex items-center gap-2"><ShieldCheck size={15} className="text-emerald-500" /> All systems operational</span><span className="flex items-center gap-5"><span>Last updated <b className="font-semibold text-slate-700">just now</b></span><button onClick={() => flashNotice("Dashboard refreshed")} className="flex items-center gap-1.5 font-bold text-[#3165ed]"><RefreshCw size={13} /> Refresh</button></span></div>
          </>
          : <ModuleView module={activeNav} onNotice={flashNotice} onScan={() => setShowScanner(true)} />}
        </div>
      </main>

      {showScanner && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><div className="mb-3 inline-flex rounded-xl bg-[#eef3ff] p-3 text-[#3165ed]"><ScanLine size={22} /></div><h3 className="text-xl font-extrabold tracking-[-0.03em] text-slate-900">Scan production item</h3><p className="mt-1 text-sm text-slate-500">Use a handheld scanner or enter a serial number.</p></div><button onClick={() => setShowScanner(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><div className="mt-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><ScanLine size={18} className="text-[#3165ed]" /><input autoFocus value={scanValue} onChange={(e) => setScanValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (flashNotice(`Item ${scanValue || ""} found`), setShowScanner(false))} placeholder="GL-240824-00842" className="h-12 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate-400" /></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowScanner(false)} className="rounded-xl text-xs font-bold">Cancel</Button><Button onClick={() => { flashNotice(`Item ${scanValue || ""} found`); setShowScanner(false); }} className="rounded-xl bg-[#3165ed] text-xs font-bold">Find item</Button></div></div></div>}
    </div>
  );
}
