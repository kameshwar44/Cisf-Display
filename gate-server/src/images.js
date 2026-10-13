import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

const TYPES = {
  "image/jpeg": { ext: ".jpg", magic: [0xff, 0xd8, 0xff] },
  "image/png": { ext: ".png", magic: [0x89, 0x50, 0x4e, 0x47] },
};

// Image columns (live_feed_image, anpr_feed_image, ...) may hold a full URL,
// a path, or a bare file name. Bare names are files in gate-server/uploads/.
export function imageUrl(value) {
  if (value == null || String(value).trim() === "") return null;
  const v = String(value).trim().replace(/\\/g, "/");
  if (/^(https?:)?\/\//i.test(v) || v.startsWith("/") || v.startsWith("data:image/")) return v;
  return `/uploads/${v.split("/").map(encodeURIComponent).join("/")}`;
}

// Devices send each image either as a path already under /uploads/ or as a
// base64 data URL (data:image/jpeg;base64,...), which is saved to
// uploads/captures/. Returns the public /uploads/... path.
export function storeImage(value, field) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(422, `${field} must be a string`);

  if (value.startsWith("/uploads/")) {
    const resolved = path.resolve(config.uploadsDir, "." + value.slice("/uploads".length));
    if (!resolved.startsWith(config.uploadsDir + path.sep) || !fs.existsSync(resolved)) {
      throw new HttpError(422, `${field}: file not found`);
    }
    return value;
  }

  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new HttpError(422, `${field} must be an /uploads/ path or a JPEG/PNG data URL`);
  const type = TYPES[match[1]];
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > config.maxImageBytes) throw new HttpError(413, `${field} is too large`);
  if (!type.magic.every((b, i) => bytes[i] === b)) {
    throw new HttpError(422, `${field} is not a valid ${match[1]} image`);
  }

  const name = `${crypto.randomUUID()}${type.ext}`;
  const dir = path.join(config.uploadsDir, "captures");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), bytes);
  return `/uploads/captures/${name}`;
}
