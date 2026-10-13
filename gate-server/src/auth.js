import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { one } from "./db.js";
import { HttpError } from "./errors.js";

// ── Passwords (users.password_hash) ──
// bcrypt ($2a$ / $2b$ / $2y$ — also what pgcrypto's crypt(..., gen_salt('bf'))
// produces) is the standard. "salt:hash" scrypt hashes from the earlier
// version of this server are also accepted.
export const hashPassword = (password) => bcrypt.hash(password, 12);

// true / false, or null if the stored hash is in a format we can't check
export async function verifyPassword(password, stored) {
  const hash = String(stored ?? "");
  if (/^\$2[aby]\$\d{2}\$.{53}$/.test(hash)) return bcrypt.compare(password, hash);
  const scrypt = /^([0-9a-f]{32}):([0-9a-f]{128})$/i.exec(hash);
  if (scrypt) {
    const expected = Buffer.from(scrypt[2], "hex");
    const actual = crypto.scryptSync(password, Buffer.from(scrypt[1], "hex"), expected.length);
    return crypto.timingSafeEqual(actual, expected);
  }
  return null;
}

// ── Sign-in tokens: JWT, HS256 ──
let secret = config.jwtSecret;
export function ensureJwtSecret() {
  if (secret) return true;
  secret = crypto.randomBytes(32).toString("hex");
  return false;
}
export const setJwtSecret = (value) => (secret = value);

const b64json = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const sign = (data) => crypto.createHmac("sha256", secret).update(data).digest();

export function issueToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + config.sessionHours * 3600;
  const head = b64json({ alg: "HS256", typ: "JWT" });
  const body = b64json({
    sub: user.id,
    username: user.username,
    role: user.role,
    jti: crypto.randomUUID(),
    iat: now,
    exp,
  });
  const token = `${head}.${body}.${sign(`${head}.${body}`).toString("base64url")}`;
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

// Signed-out tokens, kept until they would have expired anyway
const revoked = new Map(); // jti → exp (seconds)

export function verifyToken(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  try {
    if (JSON.parse(Buffer.from(head, "base64url")).alg !== "HS256") return null;
    const given = Buffer.from(sig, "base64url");
    const expected = sign(`${head}.${body}`);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url"));
    const now = Math.floor(Date.now() / 1000);
    if (!(claims.exp > now) || revoked.has(claims.jti)) return null;
    return claims;
  } catch {
    return null;
  }
}

export function revokeToken(claims) {
  const now = Math.floor(Date.now() / 1000);
  for (const [jti, exp] of revoked) if (exp <= now) revoked.delete(jti);
  revoked.set(claims.jti, claims.exp);
}

// ── Sign-in attempt limit: 5 failures per username + address per 15 minutes ──
const failures = new Map(); // key → { count, until }
const WINDOW_MS = 15 * 60_000;

export function checkLoginAllowed(key) {
  const entry = failures.get(key);
  if (entry && entry.until > Date.now() && entry.count >= 5) {
    throw new HttpError(429, "Too many failed sign-in attempts — try again in 15 minutes");
  }
}

export function recordLoginFailure(key) {
  const entry = failures.get(key);
  if (!entry || entry.until <= Date.now()) failures.set(key, { count: 1, until: Date.now() + WINDOW_MS });
  else entry.count += 1;
}

export const clearLoginFailures = (key) => failures.delete(key);

export const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  fullName: u.full_name || u.username,
  role: u.role,
});

// Operator auth: "Authorization: Bearer <token>". EventSource can't send
// headers, so the live-events route may pass ?token= instead.
export function requireOperator(pool, { allowQueryToken = false } = {}) {
  return async (req, res, next) => {
    const header = req.get("authorization") || "";
    let token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token && allowQueryToken && typeof req.query.token === "string") token = req.query.token;
    const claims = token && verifyToken(token);
    const user =
      claims &&
      (await one(pool, "SELECT id, username, full_name, role FROM users WHERE id = $1", [claims.sub]));
    if (!user) throw new HttpError(401, "Not signed in or session expired");
    req.user = user;
    req.tokenClaims = claims;
    next();
  };
}

// Gate devices (FRS / ANPR / container OCR) authenticate with a shared key
export function requireDevice(req, res, next) {
  const given = Buffer.from(req.get("x-device-key") || "");
  const expected = Buffer.from(config.deviceKey);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new HttpError(401, "Invalid device key");
  }
  next();
}
