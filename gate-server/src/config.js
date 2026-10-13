import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Settings come from environment variables (npm scripts load gate-server/.env)
export const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL,
  // Signs operator sign-in tokens. If unset, a random secret is generated at
  // start-up (operators must sign in again after every restart).
  jwtSecret: process.env.JWT_SECRET || "",
  sessionHours: Number(process.env.SESSION_HOURS) || 12,
  // Shared secret gate devices (FRS / ANPR / container OCR) send as X-Device-Key
  deviceKey: process.env.DEVICE_KEY || "dev-device-key",
  // Lets operators trigger demo scans from the display. Turn off in production.
  allowSimulation: process.env.ALLOW_SIMULATION !== "false",
  // Pass validity strings without a time zone are read in this zone, and
  // dates are shown in it
  timeZone: process.env.DISPLAY_TZ || "Asia/Kolkata",
  uploadsDir: path.join(root, "uploads"),
  // Face photos, served at /faces/ (npm run assign-faces names them <ref>.png)
  facesDir: process.env.FACES_DIR || path.resolve(root, "..", "gate-react", "src", "assets", "Faceimages"),
  // The built React app; served by this server when present (npm run build)
  webDist: path.resolve(root, "..", "gate-react", "dist"),
  maxImageBytes: 4 * 1024 * 1024,
};
