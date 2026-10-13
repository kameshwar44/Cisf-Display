// Generates sample pass records in the cisf database, with a copy of the
// photos for every record so each one can later be replaced with the real
// person's / vehicle's image.
//
//   npm run generate                    500 records
//   npm run generate -- --count 200     a different number
//   npm run generate -- --reset         remove previously generated records first
//   npm run generate -- --seed 7        a different (repeatable) random set
//
// What is created for each record (all sharing one ref_no):
//   visitors  — person, ID proof, pass, validity, photos
//   vehicles  — for drivers (about 40%): plate, vehicle pass, weighbridge, ANPR image
//   cargo     — for container trucks (about 75% of drivers): containers, Form 13, scans
// Images:  uploads/people/<ref>/registered.png and live.png
//          uploads/vehicles/<ref>/anpr.png
//          uploads/cargo/<ref>/container.jpg
// Generated ref numbers are 8 digits starting 15 (15000001, 15000002, ...).
// A small share fail a check on purpose (expired, blacklisted, rejected,
// face mismatch, cargo anomaly) so denials can be tried too.
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";
import { createPool, withTransaction } from "../src/db.js";
import { formatDateTime } from "../src/format.js";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const COUNT = Math.max(1, Math.min(Number(arg("count", 500)) || 500, 5000));
const RESET = args.includes("--reset");
const SEED = Number(arg("seed", 2026)) || 2026;
const REF_BASE = 15000000;
const GENERATED_REF = "^15[0-9]{6}$";

// ── repeatable randomness ──
let state = SEED >>> 0;
const random = () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (list) => list[int(0, list.length - 1)];
const chance = (p) => random() < p;
const digits = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? int(1, 9) : int(0, 9))).join("");
const letters = (n) => Array.from({ length: n }, () => String.fromCharCode(65 + int(0, 25))).join("");
const pad = (n, w) => String(n).padStart(w, "0");

// ── vocabulary ──
const FIRST = [
  "ARUN", "KARTHIK", "PRIYA", "DIVYA", "SURESH", "RAMESH", "LAKSHMI", "ANITHA", "VIJAY", "SENTHIL",
  "MURUGAN", "SARAVANAN", "DEEPA", "KAVYA", "RAJESH", "MANOJ", "SANJAY", "FATIMA", "MOHAMMED", "JOSEPH",
  "MARY", "ANAND", "GANESH", "BALAJI", "HARISH", "PRAKASH", "REVATHI", "SANGEETHA", "VENKATESH", "SUBRAMANI",
  "RAHUL", "POOJA", "NANDHINI", "SHANKAR", "THIRUMURUGAN", "KAVITHA", "MEENA", "ASHOK", "DINESH", "GOPAL",
  "JAYANTHI", "KANNAN", "LOGESH", "MAHESH", "NAVEEN", "PANDIAN", "RAVI", "SELVI", "UMA", "YUSUF",
];
const LAST = [
  "KUMAR", "SUNDARAM", "KRISHNAN", "RAJAN", "PILLAI", "NAIR", "IYER", "REDDY", "SHARMA", "SINGH",
  "KHAN", "DAS", "MENON", "NATARAJAN", "SELVAM", "MURTHY", "RAO", "VARGHESE", "BASHA", "CHANDRAN",
];
const COMPANIES = [
  "SUBHIKSHA LOGISTICS", "EVERGREEN MARINE CORP", "DP WORLD CHENNAI", "BHARAT FREIGHT CARRIERS",
  "MAERSK LINE INDIA", "CHENNAI CONTAINER TERMINAL", "PSA CHENNAI", "TVS SUPPLY CHAIN",
  "ALLCARGO LOGISTICS", "GATEWAY DISTRIPARKS", "KAILASH INDUSTRIES", "SRI BALAJI TRANSPORTS",
  "CONTAINER CORPORATION OF INDIA", "OCEAN SKY SHIPPING", "SOUTHERN STEVEDORES", "COASTAL MARINE SERVICES",
];
const VISITOR_PASSES = [
  ["VISITOR PASS", "Personal"], ["VENDOR PASS", "Commercial"], ["CONTRACTOR PASS", "Contractor"],
  ["CHA AGENT PASS", "Commercial"], ["PERSONAL PASS", "Personal"], ["EMPLOYEE PASS", "Commercial"],
];
const VISITOR_PURPOSES = [
  "NEW PROJECTS", "MEETING", "MAINTENANCE WORK", "CUSTOMS CLEARANCE", "SURVEY", "INSPECTION",
  "DOCUMENTATION", "PERSONAL WORK", "EQUIPMENT SERVICE", "AUDIT",
];
const DRIVER_PURPOSES = [
  "CONTAINER DELIVERY", "CARGO PICKUP", "LOADING", "UNLOADING", "STEEL EXPORT", "TERMINAL DISPATCH",
];
const VEHICLE_CLASSES = [
  ["TRAILER", "HEAVY TRAILER", 15000, 18000], ["TRUCK", "TRUCK", 8000, 11000],
  ["TANKER", "TANKER TRUCK", 10000, 12000], ["TRAILER", "CONTAINER TRAILER", 14000, 17000],
  ["MINI TRUCK", "LIGHT COMMERCIAL VEHICLE", 2500, 3500],
];
const OWNER_CODES = ["MSCU", "MAEU", "TCKU", "CMAU", "HLXU", "OOLU", "EISU", "TGHU", "TEMU", "MEDU"];
const TERMINALS = ["CCTL", "CITPL", "DP WORLD", "PSA CHENNAI"];
const CARGO_TYPES = [
  "AUTOMOTIVE PARTS", "RAW MATERIALS", "CHEMICALS", "TEXTILES", "ELECTRONICS", "MACHINERY",
  "FOOD PRODUCTS", "STEEL COILS", "GARMENTS", "PHARMACEUTICALS",
];
const STATES = ["TN", "TN", "TN", "TN", "KA", "AP", "KL", "MH", "DL", "HR"];

function idProof() {
  switch (int(1, 5)) {
    case 1:
      return ["DRIVING LICENCE", `TN${pad(int(1, 99), 2)}${int(2005, 2024)}${digits(7)}`];
    case 2:
      return ["VOTER ID", `${letters(3)}${digits(7)}`];
    case 3:
      return ["PAN", `${letters(5)}${digits(4)}${letters(1)}`];
    default:
      return ["AADHAAR", digits(12)];
  }
}

// ISO 6346 check digit, so container numbers look right
function containerNumber() {
  const owner = pick(OWNER_CODES);
  const serial = pad(int(0, 999999), 6);
  const value = (ch) => {
    if (/\d/.test(ch)) return Number(ch);
    const v = ch.charCodeAt(0) - 55; // A = 10
    return v + Math.floor((v - 1) / 10); // skip multiples of 11
  };
  const sum = [...owner + serial].reduce((s, ch, i) => s + value(ch) * 2 ** i, 0);
  return `${owner} ${serial}-${(sum % 11) % 10}`;
}

const round15 = (ms) => Math.round(ms / 900_000) * 900_000;
const HOUR = 3600_000;

// Valid now (most), or expired for the denial cases
function validity(kind) {
  const now = Date.now();
  if (kind === "expired") {
    const till = round15(now - int(24, 240) * HOUR);
    return [formatDateTime(new Date(till - int(12, 168) * HOUR)), formatDateTime(new Date(till))];
  }
  const from = round15(now - int(1, 72) * HOUR);
  const till = round15(now + int(8, 30 * 24) * HOUR);
  return [formatDateTime(new Date(from)), formatDateTime(new Date(till))];
}

// ── image copies ──
const SOURCE = {
  registered: "visistor-feed-removebg-preview.png",
  live: "visistor-feed.png",
  anpr: "Weighbridge-ANPR-1.png",
  container: "container_number_recognition_example.jpg",
};
function copyImage(source, relative) {
  const target = path.join(config.uploadsDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.copyFileSync(path.join(config.uploadsDir, source), target);
  return relative.split(path.sep).join("/");
}

// Multi-row INSERT in chunks
async function insertRows(client, table, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const values = [];
    const tuples = chunk.map((row) => {
      const marks = columns.map((c) => {
        values.push(row[c]);
        return `$${values.length}`;
      });
      return `(${marks.join(", ")})`;
    });
    await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}`, values);
  }
}

async function removeGenerated(client) {
  const { rows } = await client.query("SELECT ref_no FROM visitors WHERE ref_no ~ $1", [GENERATED_REF]);
  const refs = rows.map((r) => r.ref_no);
  await client.query(
    `DELETE FROM gate_transactions
      WHERE visitor_id IN (SELECT id FROM visitors WHERE ref_no ~ $1)
         OR vehicle_id IN (SELECT id FROM vehicles WHERE ref_no ~ $1)
         OR cargo_id   IN (SELECT id FROM cargo    WHERE ref_no ~ $1)`,
    [GENERATED_REF],
  );
  for (const table of ["cargo", "vehicles", "visitors"]) {
    await client.query(`DELETE FROM ${table} WHERE ref_no ~ $1`, [GENERATED_REF]);
  }
  await client.query("DELETE FROM blacklist WHERE added_by = 'GENERATOR'");
  return refs;
}

const pool = createPool();
try {
  const summary = await withTransaction(pool, async (client) => {
    let removedRefs = [];
    if (RESET) removedRefs = await removeGenerated(client);

    const { rows: [last] } = await client.query(
      "SELECT max(ref_no::int) AS max FROM visitors WHERE ref_no ~ $1",
      [GENERATED_REF],
    );
    const firstRef = Math.max(REF_BASE, last.max ?? REF_BASE) + 1;
    if (firstRef + COUNT > REF_BASE + 999999) throw new Error("Generated ref range is full — use --reset");

    const visitors = [];
    const vehicles = [];
    const cargo = [];
    const blacklist = [];
    const tally = { visitorOnly: 0, withVehicle: 0, withCargo: 0, failing: 0 };
    const examples = { visitorOnly: [], withCargo: [], failing: [] };

    for (let i = 0; i < COUNT; i++) {
      const ref = String(firstRef + i);
      const seq = firstRef + i - REF_BASE;
      const driver = chance(0.4);
      const hasCargo = driver && chance(0.75);

      // Most are clear; a few fail one check on purpose
      const fault = chance(0.12)
        ? pick(["expired", "blacklisted", "rejected", "face", driver ? "vehicle" : "expired", hasCargo ? "cargo" : "rejected"])
        : null;

      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const [idType, idNo] = idProof();
      const aadhaar = idType === "AADHAAR" ? idNo : digits(12);
      const [validFrom, validTill] = validity(fault === "expired" ? "expired" : "valid");
      const [passType, hep] = driver ? ["DRIVER PASS", "Commercial"] : pick(VISITOR_PASSES);
      const company = pick(COMPANIES);
      const vehicleClass = driver ? pick(VEHICLE_CLASSES) : null;

      visitors.push({
        ref_no: ref,
        full_name: name,
        id_proof_type: idType,
        id_proof_number: idNo,
        company,
        purpose: driver ? pick(DRIVER_PURPOSES) : pick(VISITOR_PURPOSES),
        vehicle_type: driver ? vehicleClass[0] : pick(["TWO WHEELER", "TWO WHEELER", "CAR", "ON FOOT"]),
        pass_type: passType,
        pass_number: `${validFrom.slice(0, 2)}${pad(1 + "JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC".indexOf(validFrom.slice(3, 6)) / 3, 2)}${validFrom.slice(9, 11)}${pad(seq, 4)}`,
        pass_id: String(16000000 + seq),
        valid_from: validFrom,
        valid_till: validTill,
        pass_status: fault === "rejected" ? "REJECTED" : "APPROVED",
        type_of_hep: hep,
        aadhar_no: aadhaar,
        contact_no: `${int(6, 9)}${digits(9).slice(1)}${int(0, 9)}`,
        frs_verified: fault !== "face",
        frs_match_score: fault === "face" ? (int(200, 600) / 10).toFixed(2) : (int(920, 998) / 10).toFixed(2),
        blacklist_status: fault === "blacklisted" ? "BLACKLISTED" : "CLEAR",
        live_feed_camera: "FRS · CAM-01",
        live_feed_image: copyImage(SOURCE.live, path.join("people", ref, "live.png")),
        registered_face_image: copyImage(SOURCE.registered, path.join("people", ref, "registered.png")),
      });

      if (fault === "blacklisted") {
        blacklist.push({
          type: "PERSON",
          identifier: aadhaar,
          name,
          reason: "Sample record — flagged for testing",
          added_on: new Date(Date.now() - int(1, 90) * 24 * HOUR),
          added_by: "GENERATOR",
          status: "ACTIVE",
          severity: pick(["HIGH", "CRITICAL", "MEDIUM"]),
        });
      }

      if (driver) {
        const [vFrom, vTill] = validity("valid");
        const tare = int(vehicleClass[2], vehicleClass[3]);
        const net = hasCargo ? int(8000, 28000) : 0;
        const plate = `${pick(STATES)}${pad(int(1, 99), 2)}${letters(2)}${pad(int(1, 9999), 4)}`;
        vehicles.push({
          ref_no: ref,
          registration_no: plate,
          blacklist_status: fault === "vehicle" ? "BLACKLISTED" : "CLEAR",
          company,
          purpose: visitors.at(-1).purpose,
          pass_type: pick(["DAILY", "DAILY", "WEEKLY", "MONTHLY", "HAZMAT PASS"]),
          pass_number: String(2600000000 + seq),
          pass_id: String(17000000 + seq),
          valid_from: vFrom,
          valid_till: vTill,
          pass_status: "APPROVED",
          anpr_verified: true,
          anpr_camera: "ANPR · CAM-02 · GATE-0-A",
          anpr_feed_image: copyImage(SOURCE.anpr, path.join("vehicles", ref, "anpr.png")),
          vehicle_class: vehicleClass[1],
          weight_bridge: pick(["WB-001", "WB-002", "WB-003"]),
          gross_weight: `${tare + net} KG`,
          tare_weight: `${tare} KG`,
          net_weight: `${net} KG`,
        });
        if (fault === "vehicle") {
          blacklist.push({
            type: "VEHICLE",
            identifier: plate,
            name: null,
            reason: "Sample record — flagged for testing",
            added_on: new Date(Date.now() - int(1, 90) * 24 * HOUR),
            added_by: "GENERATOR",
            status: "ACTIVE",
            severity: "MEDIUM",
          });
        }
      }

      if (hasCargo) {
        const two = chance(0.55);
        const size = two ? "20" : pick(["20", "40", "40"]);
        const direction = pick(["EXPORT", "EXPORT", "IMPORT"]);
        cargo.push({
          ref_no: ref,
          container1_number: containerNumber(),
          container1_size: size,
          container1_type: direction,
          container2_number: two ? containerNumber() : "",
          container2_size: two ? size : "",
          container2_type: two ? direction : "",
          form13_no: `F13-2026-${pad(seq, 4)}`,
          form13_match: fault !== "cargo",
          terminal: pick(TERMINALS),
          rapi_scan_status: fault === "cargo" ? "ANOMALY DETECTED" : "CLEAR",
          ooc_status: fault === "cargo" ? "PENDING" : "COMPLETED",
          cargo_verified: fault !== "cargo",
          camera_feed: "AI-CAM · Container · GATE-0-A",
          feed_image: copyImage(SOURCE.container, path.join("cargo", ref, "container.jpg")),
          cargo_type: pick(CARGO_TYPES),
          seal_no: `SEAL-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${pad(seq, 4)}`,
          customs_ref_no: `CUS-CHN-2026-${pad(seq, 5)}`,
        });
      }

      const visitor = visitors.at(-1);
      if (fault) tally.failing++;
      if (hasCargo) tally.withCargo++;
      else if (driver) tally.withVehicle++;
      else tally.visitorOnly++;
      if (fault && examples.failing.length < 3) examples.failing.push(`${visitor.pass_number} (${fault})`);
      else if (!fault && hasCargo && examples.withCargo.length < 3) examples.withCargo.push(visitor.pass_number);
      else if (!fault && !driver && examples.visitorOnly.length < 3) examples.visitorOnly.push(visitor.pass_number);
    }

    await insertRows(client, "visitors", visitors);
    await insertRows(client, "vehicles", vehicles);
    await insertRows(client, "cargo", cargo);
    await insertRows(client, "blacklist", blacklist);
    return { removedRefs, firstRef, tally, examples, counts: [visitors.length, vehicles.length, cargo.length] };
  });

  // Remove image folders of records deleted by --reset
  for (const ref of summary.removedRefs) {
    for (const dir of ["people", "vehicles", "cargo"]) {
      fs.rmSync(path.join(config.uploadsDir, dir, ref), { recursive: true, force: true });
    }
  }

  const { firstRef, tally, examples, counts } = summary;
  if (RESET) console.log(`Removed ${summary.removedRefs.length} previously generated record(s).`);
  console.log(`Generated refs ${firstRef} – ${firstRef + COUNT - 1}:`);
  console.log(`  visitors ${counts[0]}  ·  vehicles ${counts[1]}  ·  cargo ${counts[2]}`);
  console.log(`  visitor only ${tally.visitorOnly}  ·  with vehicle ${tally.withVehicle}  ·  with vehicle + cargo ${tally.withCargo}`);
  console.log(`  ${tally.failing} fail a check on purpose`);
  console.log(`Images: ${config.uploadsDir}${path.sep}{people,vehicles,cargo}${path.sep}<ref>${path.sep}`);
  console.log("Pass numbers to try at the gate:");
  console.log(`  visitor only:      ${examples.visitorOnly.join(", ")}`);
  console.log(`  vehicle + cargo:   ${examples.withCargo.join(", ")}`);
  console.log(`  should be denied:  ${examples.failing.join(", ")}`);
} catch (err) {
  console.error("ERROR:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
