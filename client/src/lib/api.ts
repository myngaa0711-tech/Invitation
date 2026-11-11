// Where the API/Socket.IO server lives.
//   - empty (local dev): same origin, the Vite proxy forwards /api and /socket.io
//   - set on Vercel to the Render URL, e.g. https://invite-xxxx.onrender.com
export const API_BASE = (import.meta.env?.VITE_API_URL ?? "").replace(/\/+$/, "");

const BASE = `${API_BASE}/api`;

const ADMIN_KEY_STORE = "invite:adminKey";

export function getAdminKey(): string {
  try {
    return localStorage.getItem(ADMIN_KEY_STORE) ?? "";
  } catch {
    return "";
  }
}

export function setAdminKey(key: string): void {
  try {
    if (key) localStorage.setItem(ADMIN_KEY_STORE, key);
    else localStorage.removeItem(ADMIN_KEY_STORE);
  } catch {
    /* ignore */
  }
}

function adminHeaders(): HeadersInit {
  const key = getAdminKey();
  return key ? { "x-admin-key": key } : {};
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readJson<T>(res: Response, path: string): Promise<T> {
  if (!res.ok) throw new ApiError(res.status, `API ${path} → ${res.status}`);
  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(502, "API холболт тохируулагдаагүй эсвэл сервер JSON хариу буцаасангүй.");
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string, opts: { admin?: boolean } = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: opts.admin ? adminHeaders() : undefined,
  });
  return readJson<T>(res, path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson<T>(res, path);
}
