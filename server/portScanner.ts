import { execFile } from "node:child_process";
import dgram from "node:dgram";
import net from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ScanProtocol = "TCP" | "UDP";
export type ScanHost = "127.0.0.1" | "::1";
export type PortProcess = { pid: number | null; command: string | null; runtime: string | null; user: string | null; uptime: string | null; args: string | null };
export type WebInfo = { reachable: boolean; responseMs: number | null; status: number | null; statusText: string | null; title: string | null; server: string | null; contentType: string | null; url: string; error: string | null };
export type PortResult = { port: number; state: "used" | "free"; protocol: ScanProtocol; address: string; process: PortProcess | null; web: WebInfo };

const COMMON_RUNTIME_PATTERNS: Array<[RegExp, string]> = [[/node|tsx|next|vite|npm|pnpm|bun/i, "Node.js"], [/python|uvicorn|gunicorn|django|flask/i, "Python"], [/java|jar|spring/i, "Java"], [/ruby|rails/i, "Ruby"], [/go|air/i, "Go"], [/php|artisan/i, "PHP"], [/nginx/i, "Nginx"], [/apache|httpd/i, "Apache"]];
function inferRuntime(command: string | null, args: string | null) { const haystack = `${command ?? ""} ${args ?? ""}`; return COMMON_RUNTIME_PATTERNS.find(([pattern]) => pattern.test(haystack))?.[1] ?? command ?? "Unknown"; }
function emptyWebInfo(port: number, host: ScanHost, error: string | null = null): WebInfo { const displayHost = host.includes(":") ? `[${host}]` : host; return { reachable: false, responseMs: null, status: null, statusText: null, title: null, server: null, contentType: null, url: `http://${displayHost}:${port}`, error }; }

async function readProcess(pid: number): Promise<PortProcess> {
  try { const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "user=,comm=,args=,etime="]); const line = stdout.trim(); const match = line.match(/^(\S+)\s+(\S+)\s+(.+?)\s+(\d+(?::\d+){1,2})$/); if (!match) return { pid, command: null, runtime: null, user: null, uptime: null, args: null }; const [, user, command, args, uptime] = match; return { pid, command, runtime: inferRuntime(command, args), user, uptime, args }; } catch { return { pid, command: null, runtime: null, user: null, uptime: null, args: null }; }
}

async function findListener(port: number, protocol: ScanProtocol): Promise<PortProcess | null> {
  try {
    const lsofProtocol = protocol === "TCP" ? "TCP" : "UDP";
    const args = ["-nP", `-i${lsofProtocol}:${port}`];
    if (protocol === "TCP") args.push("-sTCP:LISTEN");
    args.push("-F", "pcu");
    const { stdout } = await execFileAsync("lsof", args); const lines = stdout.split("\n").filter(Boolean); const pidLine = lines.find((line) => line.startsWith("p")); if (!pidLine) return null; const pid = Number(pidLine.slice(1)); return Number.isInteger(pid) ? readProcess(pid) : null;
  } catch {
    try { const { stdout } = await execFileAsync("ss", [protocol === "TCP" ? "-ltnp" : "-lunp"]); const line = stdout.split("\n").find((item) => item.includes(`:${port} `) || item.includes(`:${port},`)); const pidMatch = line?.match(/pid=(\d+)/); return pidMatch ? readProcess(Number(pidMatch[1])) : null; } catch { return null; }
  }
}

function canConnect(port: number, host: ScanHost, timeoutMs = 220): Promise<boolean> { return new Promise((resolve) => { const socket = net.createConnection({ host, port }); let settled = false; const finish = (value: boolean) => { if (settled) return; settled = true; socket.destroy(); resolve(value); }; socket.once("connect", () => finish(true)); socket.once("error", () => finish(false)); socket.setTimeout(timeoutMs, () => finish(false)); }); }
function isUdpUsed(port: number, host: ScanHost): Promise<boolean> { return new Promise((resolve) => { const socket = dgram.createSocket(host.includes(":") ? "udp6" : "udp4"); let settled = false; const finish = (used: boolean) => { if (settled) return; settled = true; try { socket.close(); } catch {} resolve(used); }; socket.once("listening", () => finish(false)); socket.once("error", (error: NodeJS.ErrnoException) => finish(error.code === "EADDRINUSE")); socket.bind(port, host); }); }

async function inspectWeb(port: number, host: ScanHost): Promise<WebInfo> {
  const displayHost = host.includes(":") ? `[${host}]` : host; const url = `http://${displayHost}:${port}`;
  try { const startedAt = Date.now(); const response = await fetch(url, { signal: AbortSignal.timeout(900), redirect: "manual", headers: { "user-agent": "PortScope/1.0" } }); const contentType = response.headers.get("content-type"); let title: string | null = null; if (contentType?.includes("text/html")) { const body = await response.text(); title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || null; } return { reachable: true, responseMs: Date.now() - startedAt, status: response.status, statusText: response.statusText, title, server: response.headers.get("server"), contentType, url, error: null }; } catch (error) { return emptyWebInfo(port, host, error instanceof Error ? error.message : "Tidak dapat mengakses HTTP"); }
}

async function inspectPort(port: number, protocol: ScanProtocol, host: ScanHost): Promise<PortResult> {
  const used = protocol === "TCP" ? await canConnect(port, host) : await isUdpUsed(port, host);
  const address = host;
  if (!used) return { port, state: "free", protocol, address, process: null, web: emptyWebInfo(port, host, protocol === "UDP" ? "UDP tidak memiliki probe HTTP" : "Port tidak menerima koneksi HTTP") };
  const [process, web] = await Promise.all([findListener(port, protocol), protocol === "TCP" ? inspectWeb(port, host) : Promise.resolve(emptyWebInfo(port, host, "UDP tidak memiliki probe HTTP"))]);
  return { port, state: "used", protocol, address, process, web };
}

export async function scanPorts(ports: number[], options: { protocol?: ScanProtocol; host?: ScanHost } = {}): Promise<PortResult[]> {
  const protocol = options.protocol ?? "TCP"; const host = options.host ?? "127.0.0.1"; const uniquePorts = Array.from(new Set(ports)).filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535); const results: PortResult[] = [];
  for (let index = 0; index < uniquePorts.length; index += 40) { const chunk = uniquePorts.slice(index, index + 40); results.push(...(await Promise.all(chunk.map((port) => inspectPort(port, protocol, host))))); }
  return results.sort((a, b) => a.port - b.port);
}

export function buildPortList(input: { mode: "popular" | "range" | "custom"; start?: number; end?: number; ports?: number[] }) { if (input.mode === "custom") return input.ports ?? []; if (input.mode === "range") { const start = input.start ?? 1; const end = input.end ?? start; return Array.from({ length: Math.min(end - start + 1, 256) }, (_, index) => start + index); } return [3000, 3001, 4000, 4173, 5000, 5173, 5432, 6379, 8000, 8080, 8888, 9000]; }
