import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  ExternalLink,
  FileCode2,
  Globe2,
  LayoutDashboard,
  ListFilter,
  Loader2,
  Network,
  PanelLeft,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  TerminalSquare,
  X,
} from "lucide-react";

type ScanRequest = {
  mode: "popular" | "range" | "custom";
  start?: number;
  end?: number;
  ports?: number[];
};

type PortResult = {
  port: number;
  state: "used" | "free";
  protocol: "TCP";
  address: string;
  process: {
    pid: number | null;
    command: string | null;
    runtime: string | null;
    user: string | null;
    uptime: string | null;
    args: string | null;
  } | null;
  web: {
    reachable: boolean;
    status: number | null;
    statusText: string | null;
    title: string | null;
    server: string | null;
    contentType: string | null;
    url: string;
    error: string | null;
  };
};

function formatTime() {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function StatusPill({ state }: { state: PortResult["state"] }) {
  return (
    <span className={`status-pill ${state}`}>
      <span className="status-dot" />
      {state === "used" ? "Used" : "Free"}
    </span>
  );
}

function StatCard({ label, value, detail, accent }: { label: string; value: number | string; detail: string; accent: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${accent}`}><Activity size={18} strokeWidth={1.8} /></div>
      <div>
        <p className="eyebrow">{label}</p>
        <p className="stat-value">{value}</p>
        <p className="stat-detail">{detail}</p>
      </div>
    </div>
  );
}

function DetailPanel({ result, onClose }: { result: PortResult | null; onClose: () => void }) {
  if (!result) {
    return (
      <aside className="detail-panel empty-detail">
        <div className="empty-icon"><Network size={22} /></div>
        <h3>Pilih port untuk detail</h3>
        <p>Informasi proses, runtime, dan service web akan tampil di sini.</p>
      </aside>
    );
  }

  const process = result.process;
  return (
    <aside className="detail-panel">
      <div className="detail-heading">
        <div>
          <p className="eyebrow">Port detail</p>
          <h2>{result.port}</h2>
        </div>
        <button className="icon-button" aria-label="Tutup detail" onClick={onClose}><X size={17} /></button>
      </div>
      <div className="detail-status-row">
        <StatusPill state={result.state} />
        <span className="muted-label">{result.protocol} · {result.address}</span>
      </div>

      <div className="detail-section">
        <div className="section-label"><TerminalSquare size={15} /> Process</div>
        {process ? (
          <div className="process-card">
            <div className="process-main">
              <div className="process-avatar"><FileCode2 size={18} /></div>
              <div className="process-copy">
                <strong>{process.command || "Unknown process"}</strong>
                <span>{process.args || "Command line tidak tersedia"}</span>
              </div>
            </div>
            <div className="process-meta">
              <span><b>PID</b>{process.pid ?? "—"}</span>
              <span><b>Runtime</b>{process.runtime ?? "Unknown"}</span>
              <span><b>User</b>{process.user ?? "—"}</span>
              <span><b>Uptime</b>{process.uptime ?? "—"}</span>
            </div>
          </div>
        ) : (
          <div className="soft-empty">Tidak ada process listener yang terbaca.</div>
        )}
      </div>

      <div className="detail-section">
        <div className="section-label"><Globe2 size={15} /> Web service</div>
        <div className="web-card">
          <div className="web-row"><span>URL</span><code>{result.web.url}</code></div>
          <div className="web-row"><span>Status</span><strong className={result.web.reachable ? "success-text" : "muted-text"}>{result.web.status ? `${result.web.status} ${result.web.statusText ?? ""}` : "Tidak terdeteksi"}</strong></div>
          <div className="web-row"><span>Title</span><strong>{result.web.title || "—"}</strong></div>
          <div className="web-row"><span>Server</span><strong>{result.web.server || "—"}</strong></div>
          <div className="web-row"><span>Content type</span><strong>{result.web.contentType || "—"}</strong></div>
        </div>
        <button
          className="open-service"
          disabled={!result.web.reachable}
          onClick={() => window.open(result.web.url, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink size={15} />
          Open web service
          <ArrowUpRight size={14} />
        </button>
      </div>
    </aside>
  );
}

export default function Home() {
  const [scanRequest, setScanRequest] = useState<ScanRequest | null>({ mode: "popular" });
  const [mode, setMode] = useState<ScanRequest["mode"]>("popular");
  const [start, setStart] = useState("3000");
  const [end, setEnd] = useState("9000");
  const [customPorts, setCustomPorts] = useState("3000, 5173, 8080");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "used" | "free">("all");
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const [lastScan, setLastScan] = useState(formatTime());

  const scanQuery = trpc.ports.scan.useQuery(scanRequest ?? { mode: "popular" }, {
    enabled: scanRequest !== null,
    refetchOnWindowFocus: false,
  });
  const results = (scanQuery.data ?? []) as PortResult[];

  const visibleResults = useMemo(() => results.filter((result) => {
    const matchesFilter = filter === "all" || result.state === filter;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || String(result.port).includes(term) || result.process?.command?.toLowerCase().includes(term) || result.process?.runtime?.toLowerCase().includes(term);
    return matchesFilter && matchesSearch;
  }), [results, filter, search]);

  const selected = results.find((result) => result.port === selectedPort) ?? null;
  const usedCount = results.filter((result) => result.state === "used").length;
  const freeCount = results.filter((result) => result.state === "free").length;
  const webCount = results.filter((result) => result.web.reachable).length;

  const performScan = () => {
    const request: ScanRequest = mode === "popular"
      ? { mode }
      : mode === "range"
        ? { mode, start: Number(start), end: Number(end) }
        : { mode, ports: customPorts.split(",").map((port) => Number(port.trim())).filter(Boolean) };
    setSelectedPort(null);
    setScanRequest(request);
    setLastScan(formatTime());
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Network size={19} strokeWidth={2.2} /></div><span>PortScope</span></div>
        <div className="sidebar-label">Workspace</div>
        <nav className="sidebar-nav">
          <button className="nav-item active"><LayoutDashboard size={17} />Overview</button>
          <button className="nav-item"><ListFilter size={17} />Port map<span className="nav-count">{results.length || "—"}</span></button>
          <button className="nav-item"><Server size={17} />Services<span className="nav-count">{webCount || "—"}</span></button>
        </nav>
        <div className="sidebar-label">Tools</div>
        <nav className="sidebar-nav">
          <button className="nav-item"><Settings2 size={17} />Preferences</button>
          <button className="nav-item"><CircleHelp size={17} />Help & docs</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="environment-card"><div className="env-status" /><div><span>Environment</span><strong>Local server</strong></div><ChevronDown size={15} /></div>
          <div className="profile-row"><div className="profile-avatar">PS</div><div><strong>PortScope</strong><span>Developer workspace</span></div><PanelLeft size={15} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>Port overview</strong></div>
          <div className="topbar-actions"><span className="last-scan"><span className="live-dot" />Updated {lastScan}</span><button className="icon-button"><Command size={17} /></button></div>
        </header>

        <div className="content-wrap">
          <section className="page-intro">
            <div><p className="eyebrow accent-text">SYSTEM INSPECTOR</p><h1>Port overview</h1><p className="intro-copy">Scan local ports, identify running processes, and open web services from one place.</p></div>
            <div className="scope-note"><ShieldCheck size={16} /><span>Read-only inspection<br /><b>127.0.0.1</b></span></div>
          </section>

          <section className="stats-grid">
            <StatCard label="Scanned ports" value={results.length || "—"} detail="Current scan scope" accent="blue" />
            <StatCard label="In use" value={usedCount || "—"} detail="Active TCP listeners" accent="orange" />
            <StatCard label="Available" value={freeCount || "—"} detail="Ready to use" accent="green" />
            <StatCard label="Web services" value={webCount || "—"} detail="HTTP responses found" accent="violet" />
          </section>

          <section className="scan-panel">
            <div className="panel-header"><div><h2>Scan ports</h2><p>Choose a preset or define the ports you want to inspect.</p></div><div className="scan-mode"><span className="mode-indicator" />Server-side scan</div></div>
            <div className="scan-controls">
              <div className="select-wrap"><label htmlFor="scan-mode">Scan mode</label><select id="scan-mode" value={mode} onChange={(event) => setMode(event.target.value as ScanRequest["mode"])}><option value="popular">Popular development ports</option><option value="range">Port range</option><option value="custom">Custom ports</option></select><ChevronDown size={15} /></div>
              {mode === "range" && <><div className="input-wrap"><label htmlFor="start-port">From</label><input id="start-port" type="number" min="1" max="65535" value={start} onChange={(event) => setStart(event.target.value)} /></div><div className="range-dash">—</div><div className="input-wrap"><label htmlFor="end-port">To</label><input id="end-port" type="number" min="1" max="65535" value={end} onChange={(event) => setEnd(event.target.value)} /></div></>}
              {mode === "custom" && <div className="input-wrap custom-input"><label htmlFor="custom-ports">Ports</label><input id="custom-ports" value={customPorts} onChange={(event) => setCustomPorts(event.target.value)} placeholder="3000, 5173, 8080" /></div>}
              <button className="primary-button" onClick={performScan} disabled={scanQuery.isFetching}><span>{scanQuery.isFetching ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}</span>{scanQuery.isFetching ? "Scanning" : "Run scan"}</button>
            </div>
            {scanQuery.error && <div className="error-banner">Scan gagal: {scanQuery.error.message}</div>}
          </section>

          <section className="workspace-grid">
            <div className="ports-panel">
              <div className="panel-header table-heading"><div><h2>Port activity</h2><p>{visibleResults.length} dari {results.length} port ditampilkan</p></div><div className="table-actions"><div className="search-box"><Search size={15} /><input aria-label="Cari port atau process" placeholder="Search ports" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="filter-group"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "used" ? "selected" : ""} onClick={() => setFilter("used")}>Used</button><button className={filter === "free" ? "selected" : ""} onClick={() => setFilter("free")}>Free</button></div></div></div>
              <div className="table-scroll"><table><thead><tr><th>Port</th><th>Status</th><th>Process</th><th>Runtime</th><th>Web</th><th /></tr></thead><tbody>
                {scanQuery.isLoading ? <tr><td colSpan={6} className="table-empty"><Loader2 className="spin" size={20} /><span>Scanning local ports…</span></td></tr> : visibleResults.length === 0 ? <tr><td colSpan={6} className="table-empty"><div className="empty-icon small"><Search size={18} /></div><span>Tidak ada hasil. Jalankan scan atau ubah filter.</span></td></tr> : visibleResults.map((result) => <tr key={result.port} className={selectedPort === result.port ? "row-selected" : ""} onClick={() => setSelectedPort(result.port)}><td><span className="port-number">{result.port}</span><span className="protocol">{result.protocol}</span></td><td><StatusPill state={result.state} /></td><td><div className="table-process"><span className="mini-process"><FileCode2 size={14} /></span><span>{result.process?.command || "—"}</span></div></td><td><span className="runtime-text">{result.process?.runtime || "—"}</span></td><td>{result.web.reachable ? <span className="web-badge"><Globe2 size={13} />HTTP {result.web.status}</span> : <span className="muted-text">—</span>}</td><td><button className="row-arrow" aria-label={`Lihat detail port ${result.port}`}><ArrowUpRight size={15} /></button></td></tr>)}
              </tbody></table></div>
              <div className="table-footer"><span><span className="footer-live" />Read-only · Results from {lastScan}</span><span>Click a row to inspect</span></div>
            </div>
            <DetailPanel result={selected} onClose={() => setSelectedPort(null)} />
          </section>

          <footer className="page-footer"><span>PortScope <span className="footer-separator">/</span> Local development utility</span><span>Only scans the environment where this server runs</span></footer>
        </div>
      </main>
    </div>
  );
}
