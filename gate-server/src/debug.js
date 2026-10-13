// Debug logging: API requests / responses, SQL queries and their rows, and
// live-update pushes. On unless NODE_ENV=production; DEBUG_LOG=true / false
// overrides. Secrets are masked and long values shortened.
import util from "node:util";

export const debugEnabled =
  process.env.DEBUG_LOG !== undefined
    ? process.env.DEBUG_LOG === "true"
    : process.env.NODE_ENV !== "production";

const SECRET_KEYS = /^(password|password_hash|passwordhash|token|jwt_token|authorization|x-device-key)$/i;
const MAX_STRING = 160;
const MAX_ROWS = 20;

// Copy of value safe to print: secrets masked, long strings / lists shortened
export function redact(value, depth = 0) {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    if (/^\$2[aby]\$\d{2}\$/.test(value)) return "<bcrypt hash>";
    if (value.startsWith("data:")) return `<${value.slice(5, value.indexOf(";"))} data URL, ${value.length} chars>`;
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length} chars)` : value;
  }
  if (depth > 6) return "…";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ROWS).map((v) => redact(v, depth + 1));
    if (value.length > MAX_ROWS) items.push(`… ${value.length - MAX_ROWS} more`);
    return items;
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) && v ? "****" : redact(v, depth + 1);
    return out;
  }
  return String(value);
}

const show = (value) =>
  util.inspect(redact(value), { depth: 6, colors: process.stdout.isTTY, breakLength: 140, compact: 4 });

const time = () => new Date().toTimeString().slice(0, 8);

export function logLine(tag, message, data) {
  if (!debugEnabled) return;
  console.log(`${time()} [${tag}] ${message}`);
  if (data !== undefined) console.log(`         ${show(data).replace(/\n/g, "\n         ")}`);
}

const oneLineSql = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

function logQuery(text, values, started, err, res) {
  const ms = (performance.now() - started).toFixed(1);
  const sql = oneLineSql(text);
  if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql)) return logLine("db", `${sql} (${ms} ms)`);
  const params = values?.length ? `\n         params ${show(values)}` : "";
  if (err) return logLine("db", `✕ ${ms} ms  ${sql}${params}\n         error: ${err.message}`);
  const count = res?.rowCount ?? res?.rows?.length ?? 0;
  logLine("db", `${ms} ms  ${sql}${params}\n         → ${res?.command ?? ""} ${count} row(s)`, res?.rows?.length ? res.rows : undefined);
}

// Wraps a pg client's query() so every statement is logged (works for both
// the promise and callback forms; Pool.query goes through it too)
export function instrumentClient(client) {
  if (!debugEnabled || client.__debugWrapped) return;
  client.__debugWrapped = true;
  const original = client.query.bind(client);
  client.query = (...args) => {
    const [first, second] = args;
    const text = typeof first === "string" ? first : first?.text;
    const values = Array.isArray(second) ? second : first?.values;
    const started = performance.now();
    const cbIndex = args.findIndex((a) => typeof a === "function");
    if (cbIndex >= 0) {
      const cb = args[cbIndex];
      args[cbIndex] = (err, res) => {
        logQuery(text, values, started, err, res);
        cb(err, res);
      };
      return original(...args);
    }
    const result = original(...args);
    if (result && typeof result.then === "function") {
      return result.then(
        (res) => {
          logQuery(text, values, started, null, res);
          return res;
        },
        (err) => {
          logQuery(text, values, started, err);
          throw err;
        },
      );
    }
    return result;
  };
}

// Express middleware: each API call with the body that came in and the
// JSON that was sent back (logged when the response is done, so bodies
// parsed later by a route — device scans — are included)
export function requestLogger(req, res, next) {
  if (!debugEnabled || !req.path.startsWith("/api/")) return next();
  const started = performance.now();
  const url = req.originalUrl.replace(/token=[^&]+/, "token=****");
  let sent;
  const json = res.json.bind(res);
  res.json = (body) => {
    sent = body;
    return json(body);
  };

  if (req.path.endsWith("/events")) {
    logLine("sse", `display connected: ${url}`);
    res.on("close", () => logLine("sse", `display disconnected: ${req.path}`));
    return next();
  }

  res.on("finish", () => {
    const ms = (performance.now() - started).toFixed(1);
    logLine("api", `${req.method} ${url} → ${res.statusCode} (${ms} ms)`);
    if (req.body && Object.keys(req.body).length) logLine("api", "  request body:", req.body);
    if (sent !== undefined) logLine("api", "  response:", sent);
  });
  next();
}
