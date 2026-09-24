import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Clock3,
  Download,
  ExternalLink,
  FileCode2,
  Globe2,
  Keyboard,
  LayoutDashboard,
  ListFilter,
  Loader2,
  Menu,
  Network,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Star,
  TerminalSquare,
  X,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

type Page = "overview" | "map" | "services" | "settings" | "help";
type ScanRequest = { mode: "popular" | "range" | "custom"; start?: number; end?: number; ports?: number[] };
type PortResult = {
  port: number;
  state: "used" | "free";
  protocol: "TCP";
  address: string;
  process: { pid: number | null; command: string | null; runtime: string | null; user: string | null; uptime: string | null; args: string | null } | null;
  web: { reachable: boolean; responseMs: number | null; status: number | null; statusText: string | null; title: string | null; server: string | null; contentType: string | null; url: string; error: string | null };
};

const pageMeta: Record<Page, { label: string; eyebrow: string; title: string; description: string }> = {
  overview: { label: "Overview", eyebrow: "SYSTEM INSPECTOR", title: "Port overview", description: "Scan local ports, identify processes, and open web services from one place." },
  map: { label: "Port map", eyebrow: "PORT INVENTORY", title: "Port map", description: "A compact view of every scanned port and its current availability." },
  services: { label: "Services", eyebrow: "WEB SERVICES", title: "Running services", description: "HTTP services detected on the current server environment." },
  settings: { label: "Settings", eyebrow: "WORKSPACE CONFIG", title: "Scan settings", description: "Set a default scope and tune the browser experience." },
  help: { label: "Help", eyebrow: "QUICK GUIDE", title: "How PortScope works", description: "Useful notes for inspecting local development environments safely." },
};

function now() { return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date()); }
function StatusPill({ state }: { state: PortResult["state"] }) { return <span className={`status-pill ${state}`}><span className="status-dot" />{state === "used" ? "Used" : "Free"}</span>; }

function StatCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Activity; label: string; value: string | number; detail: string; tone: string }) {
  return <div className="stat-card"><span className={`stat-icon ${tone}`}><Icon size={18} /></span><div><p className="eyebrow">{label}</p><p className="stat-value">{value}</p><p className="stat-detail">{detail}</p></div></div>;
}

function PortTable({ results, selectedPort, onSelect, search, setSearch, filter, setFilter, favorites, onToggleFavorite }: { results: PortResult[]; selectedPort: number | null; onSelect: (port: number) => void; search: string; setSearch: (value: string) => void; filter: "all" | "used" | "free"; setFilter: (value: "all" | "used" | "free") => void; favorites: number[]; onToggleFavorite: (port: number) => void }) {
  const visible = results.filter((result) => {
    const term = search.toLowerCase().trim();
    return (filter === "all" || result.state === filter) && (!term || String(result.port).includes(term) || result.process?.command?.toLowerCase().includes(term) || result.process?.runtime?.toLowerCase().includes(term));
  });
  return <div className="ports-panel">
    <div className="panel-header table-heading"><div><h2>Port activity</h2><p>{visible.length} of {results.length} ports shown</p></div><div className="table-actions"><label className="search-box"><Search size={15} /><input aria-label="Search ports" placeholder="Search ports" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="filter-group">{(["all", "used", "free"] as const).map((value) => <button key={value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></div></div>
    <div className="table-scroll"><table><thead><tr><th>Port</th><th>Status</th><th>Process</th><th>Runtime</th><th>Web</th><th /></tr></thead><tbody>
      {visible.length === 0 ? <tr><td colSpan={6} className="table-empty"><Search size={18} /><span>No matching ports</span></td></tr> : visible.map((result) => <tr key={result.port} className={selectedPort === result.port ? "row-selected" : ""} onClick={() => onSelect(result.port)}><td><div className="port-cell"><button className={favorites.includes(result.port) ? "favorite-button active" : "favorite-button"} aria-label={`Favorite port ${result.port}`} onClick={(event) => { event.stopPropagation(); onToggleFavorite(result.port); }}><Star size={12} /></button><span><span className="port-number">{result.port}</span><span className="protocol">{result.protocol}</span></span></div></td><td><StatusPill state={result.state} /></td><td><div className="table-process"><span className="mini-process"><FileCode2 size={14} /></span>{result.process?.command || "—"}</div></td><td><span className="runtime-text">{result.process?.runtime || "—"}</span></td><td>{result.web.reachable ? <span className="web-badge"><Globe2 size={13} />HTTP {result.web.status}</span> : <span className="muted-text">—</span>}</td><td><ChevronRight className="row-arrow" size={15} /></td></tr>)}
    </tbody></table></div><div className="table-footer"><span><span className="footer-live" />Read-only inspection</span><span>Tap a row for details</span></div>
  </div>;
}

function DetailSheet({ result, onClose }: { result: PortResult | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!result) return <div className="detail-placeholder"><div className="empty-icon"><Network size={21} /></div><h3>Select a port</h3><p>Process, runtime, and web metadata will appear here.</p></div>;
  const copyUrl = async () => { await navigator.clipboard?.writeText(result.web.url); setCopied(true); window.setTimeout(() => setCopied(false), 1400); };
  return <aside className="detail-sheet"><div className="sheet-handle" /><div className="detail-heading"><div><p className="eyebrow">Port detail</p><h2>{result.port}</h2></div><button className="icon-button" aria-label="Close detail" onClick={onClose}><X size={17} /></button></div><div className="detail-status-row"><StatusPill state={result.state} /><span className="muted-label">{result.protocol} · {result.address}</span></div>
    <div className="detail-section"><div className="section-label"><TerminalSquare size={15} />Process</div>{result.process ? <div className="process-card"><div className="process-main"><div className="process-avatar"><FileCode2 size={18} /></div><div className="process-copy"><strong>{result.process.command || "Unknown process"}</strong><span>{result.process.args || "Command line unavailable"}</span></div></div><div className="process-meta"><span><b>PID</b>{result.process.pid ?? "—"}</span><span><b>Runtime</b>{result.process.runtime ?? "Unknown"}</span><span><b>User</b>{result.process.user ?? "—"}</span><span><b>Uptime</b>{result.process.uptime ?? "—"}</span></div></div> : <div className="soft-empty">No listener process was found.</div>}</div>
    <div className="detail-section"><div className="section-label"><Globe2 size={15} />Web service</div><div className="web-card"><div className="web-row"><span>URL</span><code>{result.web.url}</code><button className="copy-button" aria-label="Copy URL" onClick={copyUrl}>{copied ? <Check size={13} /> : <Clipboard size={13} />}</button></div><div className="web-row"><span>Status</span><strong className={result.web.reachable ? "success-text" : "muted-text"}>{result.web.status ? `${result.web.status} ${result.web.statusText ?? ""}` : "Not detected"}</strong></div><div className="web-row"><span>Response</span><strong>{result.web.responseMs !== null ? `${result.web.responseMs} ms` : "—"}</strong></div><div className="web-row"><span>Title</span><strong>{result.web.title || "—"}</strong></div><div className="web-row"><span>Content type</span><strong>{result.web.contentType || "—"}</strong></div></div><button className="open-service" disabled={!result.web.reachable} onClick={() => window.open(result.web.url, "_blank", "noopener,noreferrer")}><ExternalLink size={15} />Open web service<ArrowUpRight size={14} /></button></div>
  </aside>;
}

function ScanControls({ mode, setMode, start, setStart, end, setEnd, customPorts, setCustomPorts, onScan, scanning }: { mode: ScanRequest["mode"]; setMode: (value: ScanRequest["mode"]) => void; start: string; setStart: (value: string) => void; end: string; setEnd: (value: string) => void; customPorts: string; setCustomPorts: (value: string) => void; onScan: () => void; scanning: boolean }) {
  return <section className="scan-panel"><div className="panel-header"><div><h2>Scan ports</h2><p>Choose a preset or define the ports to inspect.</p></div><div className="scan-mode"><span className="mode-indicator" />Server-side scan</div></div><div className="scan-controls"><div className="select-wrap"><label htmlFor="scan-mode">Scan mode</label><select id="scan-mode" value={mode} onChange={(event) => setMode(event.target.value as ScanRequest["mode"])}><option value="popular">Popular development ports</option><option value="range">Port range</option><option value="custom">Custom ports</option></select><ChevronRight size={15} /></div>{mode === "range" && <><div className="input-wrap"><label htmlFor="start-port">From</label><input id="start-port" type="number" value={start} onChange={(event) => setStart(event.target.value)} /></div><span className="range-dash">—</span><div className="input-wrap"><label htmlFor="end-port">To</label><input id="end-port" type="number" value={end} onChange={(event) => setEnd(event.target.value)} /></div></>}{mode === "custom" && <div className="input-wrap custom-input"><label htmlFor="custom-ports">Ports</label><input id="custom-ports" value={customPorts} onChange={(event) => setCustomPorts(event.target.value)} /></div>}<button className="primary-button" onClick={onScan} disabled={scanning}>{scanning ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}{scanning ? "Scanning" : "Run scan"}</button></div></section>;
}

function InfoPage({ page }: { page: "services" | "help" }) {
  if (page === "services") return <div className="info-grid"><div className="info-card service-summary"><div className="info-card-icon violet"><Globe2 size={19} /></div><div><p className="eyebrow">Detected now</p><h2>HTTP services</h2><p>Only services that respond on localhost appear here.</p></div></div><div className="info-card"><div className="info-card-icon blue"><ShieldCheck size={19} /></div><h3>Read-only by default</h3><p>PortScope inspects listeners and makes a simple HTTP request. It never starts, stops, or changes a process.</p></div><div className="info-card"><div className="info-card-icon orange"><Zap size={19} /></div><h3>Fast local checks</h3><p>Use the Overview scan to refresh service status and open a detected web interface in a separate tab.</p></div></div>;
  return <div className="help-list"><div className="help-card"><span>01</span><div><h3>What is scanned?</h3><p>PortScope checks TCP listeners on 127.0.0.1. The server environment is the machine being inspected.</p></div></div><div className="help-card"><span>02</span><div><h3>How is a process found?</h3><p>It reads the listener PID with system tools, then resolves command, user, runtime, and uptime details.</p></div></div><div className="help-card"><span>03</span><div><h3>Why is a web service separate?</h3><p>A used port is not always HTTP. PortScope probes HTTP and shows metadata only when the response is reachable.</p></div></div></div>;
}

export default function Home() {
  const [page, setPage] = useState<Page>("overview");
  const [scanRequest, setScanRequest] = useState<ScanRequest | null>({ mode: "popular" });
  const [mode, setMode] = useState<ScanRequest["mode"]>("popular");
  const [start, setStart] = useState("3000"); const [end, setEnd] = useState("9000"); const [customPorts, setCustomPorts] = useState("3000, 5173, 8080");
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState<"all" | "used" | "free">("all"); const [selectedPort, setSelectedPort] = useState<number | null>(null); const [lastScan, setLastScan] = useState(now());
  const [favorites, setFavorites] = useState<number[]>(() => { try { return JSON.parse(localStorage.getItem("portscope:favorites") ?? "[]"); } catch { return []; } });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const query = trpc.ports.scan.useQuery(scanRequest ?? { mode: "popular" }, { enabled: scanRequest !== null, refetchOnWindowFocus: false });
  const results = (query.data ?? []) as PortResult[]; const selected = results.find((result) => result.port === selectedPort) ?? null;
  const used = results.filter((result) => result.state === "used").length; const free = results.filter((result) => result.state === "free").length; const web = results.filter((result) => result.web.reachable).length;
  const current = pageMeta[page];
  const serviceResults = useMemo(() => results.filter((result) => result.web.reachable), [results]);
  const runScan = () => { const request: ScanRequest = mode === "popular" ? { mode } : mode === "range" ? { mode, start: Number(start), end: Number(end) } : { mode, ports: customPorts.split(",").map((port) => Number(port.trim())).filter(Boolean) }; setSelectedPort(null); setScanRequest(request); setLastScan(now()); };
  const exportResults = () => { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), scope: "127.0.0.1", results }, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `portscope-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); };
  const toggleFavorite = (port: number) => setFavorites((current) => current.includes(port) ? current.filter((item) => item !== port) : [...current, port].sort((a, b) => a - b));
  const go = (next: Page) => { setPage(next); if (next !== "map" && next !== "services") setSelectedPort(null); };
  useEffect(() => { localStorage.setItem("portscope:favorites", JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { if (!autoRefresh) return; const timer = window.setInterval(() => { query.refetch(); setLastScan(now()); }, 15000); return () => window.clearInterval(timer); }, [autoRefresh, query.refetch]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (event.key.toLowerCase() === "r" && !["INPUT", "SELECT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) runScan(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); });

  return <div className="app-shell"><header className="mobile-header"><div className="brand"><span className="brand-mark"><Network size={18} /></span><span>PortScope</span></div><div className="header-status"><span className="live-dot" />Local server</div></header><main className="main-content"><div className="topbar"><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{current.label}</strong></div><div className="topbar-actions"><span className="last-scan"><span className="live-dot" />Updated {lastScan}</span><button className="icon-button"><Menu size={17} /></button></div></div><div className="content-wrap"><section className="page-intro"><div><p className="eyebrow accent-text">{current.eyebrow}</p><h1>{current.title}</h1><p className="intro-copy">{current.description}</p></div><div className="scope-note"><ShieldCheck size={16} /><span>Read-only · <b>127.0.0.1</b></span></div></section>
    {page === "overview" && <><section className="stats-grid"><StatCard icon={Activity} label="Scanned ports" value={results.length || "—"} detail="Current scan scope" tone="blue" /><StatCard icon={Server} label="In use" value={used || "—"} detail="Active TCP listeners" tone="orange" /><StatCard icon={Check} label="Available" value={free || "—"} detail="Ready to use" tone="green" /><StatCard icon={Globe2} label="Web services" value={web || "—"} detail="HTTP responses found" tone="violet" /></section><div className="quick-strip"><span><Star size={14} />{favorites.length} pinned port{favorites.length === 1 ? "" : "s"}</span><span><Clock3 size={14} />{autoRefresh ? "Auto-refresh on · 15s" : "Manual refresh"}</span><span><Keyboard size={14} />Press R to scan</span></div><ScanControls mode={mode} setMode={setMode} start={start} setStart={setStart} end={end} setEnd={setEnd} customPorts={customPorts} setCustomPorts={setCustomPorts} onScan={runScan} scanning={query.isFetching} /><PortTable results={results} selectedPort={selectedPort} onSelect={setSelectedPort} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} favorites={favorites} onToggleFavorite={toggleFavorite} /></>}
    {page === "map" && <><div className="map-toolbar"><div><h2>All scanned ports</h2><p>Sort and inspect the current snapshot from {lastScan}.</p></div><div className="toolbar-actions"><button className="secondary-button" onClick={exportResults}><Download size={15} />Export JSON</button><button className="secondary-button" onClick={runScan}><RefreshCw size={15} />Refresh</button></div></div><PortTable results={results} selectedPort={selectedPort} onSelect={setSelectedPort} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} favorites={favorites} onToggleFavorite={toggleFavorite} /></>}
    {page === "services" && <><div className="service-count"><span className="service-count-number">{serviceResults.length}</span><span>reachable web service{serviceResults.length === 1 ? "" : "s"} in current scan</span></div><div className="service-grid">{serviceResults.length ? serviceResults.map((result) => <button className="service-card" key={result.port} onClick={() => setSelectedPort(result.port)}><div className="service-card-top"><span className="service-port">:{result.port}</span><span className="web-badge"><Globe2 size={12} />HTTP {result.web.status}</span></div><h3>{result.web.title || "Untitled local service"}</h3><p>{result.web.url}</p><div className="service-card-footer"><span>{result.process?.runtime || "Unknown runtime"} · {result.web.responseMs ?? "—"} ms</span><ArrowUpRight size={14} /></div></button>) : <div className="empty-state"><Globe2 size={20} /><h3>No web services found</h3><p>Run a scan to detect HTTP services on the current environment.</p></div>}</div></>}
    {page === "settings" && <div className="settings-grid"><div className="settings-card"><div className="setting-title"><div className="info-card-icon blue"><Settings2 size={18} /></div><div><h3>Default scan</h3><p>Choose what opens when the app loads.</p></div></div><div className="setting-options">{([["popular", "Popular development ports", "12 common ports"], ["range", "Port range", "Up to 256 ports"], ["custom", "Custom ports", "Your own list"]] as const).map(([value, label, detail]) => <button key={value} className={mode === value ? "setting-option active" : "setting-option"} onClick={() => setMode(value)}><span><b>{label}</b><small>{detail}</small></span>{mode === value ? <Check size={16} /> : <span className="radio-empty" />}</button>)}</div><button className="primary-button wide" onClick={() => { go("overview"); runScan(); }}><RefreshCw size={16} />Apply and scan</button></div><div className="settings-card"><div className="setting-title"><div className="info-card-icon green"><ShieldCheck size={18} /></div><div><h3>Runtime scope</h3><p>What this browser utility can access.</p></div></div><div className="scope-lines"><div><span>Host</span><b>127.0.0.1</b></div><div><span>Protocol</span><b>TCP</b></div><div><span>Mode</span><b>Read-only</b></div></div><button className={autoRefresh ? "setting-toggle active" : "setting-toggle"} onClick={() => setAutoRefresh(!autoRefresh)}><span><b>Auto-refresh</b><small>Refresh every 15 seconds</small></span><span className="toggle-track"><span /></span></button><div className="shortcut-note"><kbd>R</kbd><span>Run a fresh scan from any page</span></div></div></div>}
    {page === "help" && <InfoPage page="help" />}
    {page === "services" && null}
  </div></main><div className={selected ? "sheet-backdrop visible" : "sheet-backdrop"} onClick={() => setSelectedPort(null)} /><div className={selected ? "detail-dock open" : "detail-dock"}><DetailSheet result={selected} onClose={() => setSelectedPort(null)} /></div><nav className="bottom-nav"><button className={page === "overview" ? "active" : ""} onClick={() => go("overview")}><LayoutDashboard size={18} /><span>Overview</span></button><button className={page === "map" ? "active" : ""} onClick={() => go("map")}><ListFilter size={18} /><span>Port map</span>{results.length > 0 && <em>{results.length}</em>}</button><button className={page === "services" ? "active" : ""} onClick={() => go("services")}><Globe2 size={18} /><span>Services</span>{web > 0 && <em>{web}</em>}</button><button className={page === "settings" ? "active" : ""} onClick={() => go("settings")}><Settings2 size={18} /><span>Settings</span></button><button className={page === "help" ? "active" : ""} onClick={() => go("help")}><CircleHelp size={18} /><span>Help</span></button></nav></div>;
}
