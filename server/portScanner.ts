import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PortProcess = {
  pid: number | null;
  command: string | null;
  runtime: string | null;
  user: string | null;
  uptime: string | null;
  args: string | null;
};

export type WebInfo = {
  reachable: boolean;
  responseMs: number | null;
  status: number | null;
  statusText: string | null;
  title: string | null;
  server: string | null;
  contentType: string | null;
  url: string;
  error: string | null;
};

export type PortResult = {
  port: number;
  state: "used" | "free";
  protocol: "TCP";
  address: string;
  process: PortProcess | null;
  web: WebInfo;
};

const COMMON_RUNTIME_PATTERNS: Array<[RegExp, string]> = [
  [/node|tsx|next|vite|npm|pnpm|bun/i, "Node.js"],
  [/python|uvicorn|gunicorn|django|flask/i, "Python"],
  [/java|jar|spring/i, "Java"],
  [/ruby|rails/i, "Ruby"],
  [/go|air/i, "Go"],
  [/php|artisan/i, "PHP"],
  [/nginx/i, "Nginx"],
  [/apache|httpd/i, "Apache"],
];

function inferRuntime(command: string | null, args: string | null) {
  const haystack = `${command ?? ""} ${args ?? ""}`;
  return COMMON_RUNTIME_PATTERNS.find(([pattern]) => pattern.test(haystack))?.[1] ?? command ?? "Unknown";
}

function emptyWebInfo(port: number, error: string | null = null): WebInfo {
  return {
    reachable: false,
    responseMs: null,
    status: null,
    statusText: null,
    title: null,
    server: null,
    contentType: null,
    url: `http://127.0.0.1:${port}`,
    error,
  };
}

async function readProcess(pid: number): Promise<PortProcess> {
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "user=,comm=,args=,etime="]);
    const line = stdout.trim();
    const match = line.match(/^(\S+)\s+(\S+)\s+(.+?)\s+(\d+(?::\d+){1,2})$/);
    if (!match) {
      return { pid, command: null, runtime: null, user: null, uptime: null, args: null };
    }
    const [, user, command, args, uptime] = match;
    return { pid, command, runtime: inferRuntime(command, args), user, uptime, args };
  } catch {
    return { pid, command: null, runtime: null, user: null, uptime: null, args: null };
  }
}

async function findListener(port: number): Promise<PortProcess | null> {
  try {
    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-F", "pcu"]);
    const lines = stdout.split("\n").filter(Boolean);
    const pidLine = lines.find((line) => line.startsWith("p"));
    if (!pidLine) return null;
    const pid = Number(pidLine.slice(1));
    if (!Number.isInteger(pid)) return null;
    return await readProcess(pid);
  } catch {
    try {
      const { stdout } = await execFileAsync("ss", ["-ltnp"]);
      const line = stdout.split("\n").find((item) => item.includes(`:${port} `) || item.includes(`:${port},`));
      const pidMatch = line?.match(/pid=(\d+)/);
      return pidMatch ? await readProcess(Number(pidMatch[1])) : null;
    } catch {
      return null;
    }
  }
}

function canConnect(port: number, timeoutMs = 220): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(false));
  });
}

async function inspectWeb(port: number): Promise<WebInfo> {
  const url = `http://127.0.0.1:${port}`;
  try {
    const startedAt = Date.now();
    const response = await fetch(url, {
      signal: AbortSignal.timeout(900),
      redirect: "manual",
      headers: { "user-agent": "PortScope/1.0" },
    });
    const contentType = response.headers.get("content-type");
    let title: string | null = null;
    if (contentType?.includes("text/html")) {
      const body = await response.text();
      title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
    }
    return {
      reachable: true,
      responseMs: Date.now() - startedAt,
      status: response.status,
      statusText: response.statusText,
      title,
      server: response.headers.get("server"),
      contentType,
      url,
      error: null,
    };
  } catch (error) {
    return emptyWebInfo(port, error instanceof Error ? error.message : "Tidak dapat mengakses HTTP");
  }
}

async function inspectPort(port: number): Promise<PortResult> {
  const open = await canConnect(port);
  if (!open) {
    return { port, state: "free", protocol: "TCP", address: "127.0.0.1", process: null, web: emptyWebInfo(port, "Port tidak menerima koneksi HTTP") };
  }
  const [process, web] = await Promise.all([findListener(port), inspectWeb(port)]);
  return { port, state: "used", protocol: "TCP", address: "127.0.0.1", process, web };
}

export async function scanPorts(ports: number[]): Promise<PortResult[]> {
  const uniquePorts = Array.from(new Set(ports)).filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535);
  const results: PortResult[] = [];
  for (let index = 0; index < uniquePorts.length; index += 40) {
    const chunk = uniquePorts.slice(index, index + 40);
    results.push(...(await Promise.all(chunk.map(inspectPort))));
  }
  return results.sort((a, b) => a.port - b.port);
}

export function buildPortList(input: { mode: "popular" | "range" | "custom"; start?: number; end?: number; ports?: number[] }) {
  if (input.mode === "custom") return input.ports ?? [];
  if (input.mode === "range") {
    const start = input.start ?? 1;
    const end = input.end ?? start;
    return Array.from({ length: Math.min(end - start + 1, 256) }, (_, index) => start + index);
  }
  return [3000, 3001, 4000, 4173, 5000, 5173, 5432, 6379, 8000, 8080, 8888, 9000];
}
