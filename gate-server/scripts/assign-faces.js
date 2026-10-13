// Gives the generated pass records (refs 15xxxxxx) real face photos from the
// face-image folder (default gate-react/src/assets/Faceimages, or FACES_DIR).
//
//   npm run assign-faces
//
// Each photo not yet named after a ref is renamed to <ref>.png (or .jpg) for
// the next record without one, and visitors.registered_face_image /
// live_feed_image are set to /faces/<ref>.png. The server serves the folder
// at /faces/. Original file names are kept in _original-names.csv in the same
// folder, so the renaming can be traced or undone. Safe to run again: new
// photos dropped into the folder go to the records still without one.
//
// Records with a face mismatch (frs_verified = false) get another person's
// photo as the live capture, so the mismatch is visible on screen.
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";
import { createPool, many, withTransaction } from "../src/db.js";

const dir = config.facesDir;
const MAP_FILE = path.join(dir, "_original-names.csv");
const IMAGE = /\.(png|jpe?g)$/i;
const REF_NAMED = /^(15\d{6})\.(png|jpe?g)$/i;

if (!fs.existsSync(dir)) {
  console.error(`Face-image folder not found: ${dir}`);
  process.exit(1);
}

const pool = createPool();
try {
  const visitors = await many(
    pool,
    "SELECT id, ref_no, full_name, frs_verified FROM visitors WHERE ref_no ~ '^15[0-9]{6}$' ORDER BY ref_no",
  );
  const files = fs.readdirSync(dir).filter((f) => IMAGE.test(f) && !f.startsWith("_"));
  const assigned = new Map(); // ref → file name
  for (const f of files) {
    const m = REF_NAMED.exec(f);
    if (m) assigned.set(m[1], f);
  }
  const unassigned = files.filter((f) => !REF_NAMED.test(f)).sort((a, b) => a.localeCompare(b));
  const waiting = visitors.filter((v) => !assigned.has(v.ref_no));

  // Rename: next unassigned photo → next record without a face
  const mapping = [];
  for (let i = 0; i < Math.min(unassigned.length, waiting.length); i++) {
    const original = unassigned[i];
    const ref = waiting[i].ref_no;
    const name = `${ref}${path.extname(original).toLowerCase()}`;
    fs.renameSync(path.join(dir, original), path.join(dir, name));
    assigned.set(ref, name);
    mapping.push([ref, name, original, waiting[i].full_name]);
  }
  if (mapping.length) {
    const header = fs.existsSync(MAP_FILE) ? "" : "ref_no,file,original_file,record_name\n";
    fs.appendFileSync(MAP_FILE, header + mapping.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n") + "\n");
  }

  // Point the records at their photos
  const refs = [...assigned.keys()].sort();
  const updated = await withTransaction(pool, async (client) => {
    let count = 0;
    for (const v of visitors) {
      const file = assigned.get(v.ref_no);
      if (!file) continue;
      const face = `/faces/${file}`;
      let live = face;
      if (v.frs_verified === false && refs.length > 1) {
        // someone else's photo: the next ref along
        const other = refs[(refs.indexOf(v.ref_no) + 7) % refs.length];
        live = `/faces/${assigned.get(other)}`;
      }
      const r = await client.query(
        `UPDATE visitors SET registered_face_image = $1, live_feed_image = $2
          WHERE id = $3 AND (registered_face_image IS DISTINCT FROM $1 OR live_feed_image IS DISTINCT FROM $2)`,
        [face, live, v.id],
      );
      count += r.rowCount;
    }
    return count;
  });

  const without = visitors.filter((v) => !assigned.has(v.ref_no));
  console.log(`Face folder: ${dir}`);
  console.log(`  renamed ${mapping.length} photo(s) to <ref>.png${mapping.length ? ` (originals listed in ${path.basename(MAP_FILE)})` : ""}`);
  console.log(`  ${assigned.size} of ${visitors.length} generated records have a photo; ${updated} record(s) updated`);
  if (without.length) {
    console.log(`  still without a photo (keep their copied image): ${without.slice(0, 5).map((v) => v.ref_no).join(", ")}${without.length > 5 ? ", …" : ""}`);
  }
  const leftover = unassigned.length - mapping.length;
  if (leftover > 0) console.log(`  ${leftover} photo(s) left over — no generated record without a photo`);
} catch (err) {
  console.error("ERROR:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
