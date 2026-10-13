// Browser-console logging of API calls and live updates.
// On in development (npm run dev). In a production build, turn it on with
// localStorage.setItem("cisf-debug", "1") in the console and reload.
function enabled() {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem("cisf-debug") === "1";
  } catch {
    return false;
  }
}

export const debugEnabled = enabled();

// Never print the password typed at sign-in or the session token
const masked = (value) => {
  if (!value || typeof value !== "object") return value;
  const copy = Array.isArray(value) ? [...value] : { ...value };
  for (const key of ["password", "token"]) if (key in copy) copy[key] = "****";
  return copy;
};

export function logApi({ method, path, body, status, ms, data, error }) {
  if (!debugEnabled) return;
  const ok = status >= 200 && status < 400;
  console.groupCollapsed(
    `%c[api]%c ${method} ${path} → ${status || "network error"} (${ms} ms)`,
    `color:${ok ? "#138808" : "#dc2626"};font-weight:700`,
    "color:inherit",
  );
  if (body !== undefined) console.log("request:", masked(body));
  if (error) console.log("error:", error);
  else console.log("response:", masked(data));
  console.groupEnd();
}

export function logEvent(event, data) {
  if (!debugEnabled) return;
  console.groupCollapsed(`%c[live]%c ${event}${data?.id ? ` — arrival #${data.id}` : data === null ? " — no arrival" : ""}`, "color:#e87000;font-weight:700", "color:inherit");
  console.log(data);
  console.groupEnd();
}
