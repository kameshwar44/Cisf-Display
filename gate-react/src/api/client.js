// Thin wrapper over fetch for the gate server API (/api/...)
import { logApi } from "./debug.js";

const TOKEN_KEY = "cisf-gate-session";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked — the session lasts until the page is closed
  }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  const token = getToken();
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    logApi({ method, path, body, status: 0, ms: elapsed(), error: err.message });
    throw new ApiError(0, "Cannot reach the gate server");
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  logApi({ method, path, body, status: res.status, ms: elapsed(), data });
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data;
}

export const eventsUrl = (gateId) =>
  `/api/gates/${gateId}/events?token=${encodeURIComponent(getToken() ?? "")}`;
