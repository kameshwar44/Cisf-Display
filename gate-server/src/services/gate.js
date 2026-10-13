// Gate logic over the cisf PostgreSQL tables:
//   gate_config        — gate / lane and the header text shown on the display
//   visitors, vehicles, cargo — the records the checks are run on
//   gate_transactions  — one row per arrival at a gate lane
//   blacklist, alerts, statistics — consulted and updated on decisions
//   audit_log          — added by this server: who changed what
import crypto from "node:crypto";
import { many, one, withTransaction } from "../db.js";
import { HttpError } from "../errors.js";
import { displayDateTime, formatDateTime, localDate, parseDbDateTime } from "../format.js";
import { imageUrl, storeImage } from "../images.js";

export const SECTIONS = ["visitor", "vehicle", "cargo"];
const STATUS_COLUMN = { visitor: "visitor_status", vehicle: "vehicle_status", cargo: "cargo_status" };
const ID_COLUMN = { visitor: "visitor_id", vehicle: "vehicle_id", cargo: "cargo_id" };
const STATUS_OK = "VERIFIED";
const STATUS_FAIL = "REJECTED";

// ── Reading status words stored as text ──
const OK_WORDS = new Set([
  "VERIFIED", "APPROVED", "CLEAR", "CLEARED", "ALL CLEAR", "PASS", "PASSED", "OK", "GRANTED",
  "COMPLETED", "COMPLETE", "MATCHED", "VALID", "ACTIVE", "YES", "TRUE", "SUCCESS",
]);
// "ALL_CLEAR" and "ALL CLEAR" read the same
const upper = (v) => String(v ?? "").trim().toUpperCase().replace(/_/g, " ");
export const isOk = (status) => OK_WORDS.has(upper(status).replace(/^✓\s*/, ""));
const isBlacklistClear = (status) =>
  ["", "CLEAR", "NONE", "NO", "FALSE", "NOT BLACKLISTED", "NOT LISTED", "N/A"].includes(upper(status));

// overall_result → "GRANTED" | "DENIED" | null (not decided yet)
export function decisionOf(result) {
  const r = upper(result);
  if (!r || /PENDING|REVIEW|PROGRESS|WAITING/.test(r)) return null;
  if (/DENIED|DENY|REJECT|BLOCK|FAIL|LOCK|NOT |DETAIN/.test(r)) return "DENIED";
  if (/GRANT|APPROV|ALLOW|PASS|CLEAR|PERMIT/.test(r)) return "GRANTED";
  return null;
}

const normaliseId = (v) => String(v).replace(/\s+/g, "").toUpperCase();

async function blacklistHit(q, identifiers) {
  const ids = identifiers.filter((v) => v != null && String(v).trim() !== "").map(normaliseId);
  if (!ids.length) return null;
  return one(
    q,
    `SELECT * FROM blacklist
      WHERE upper(coalesce(status, 'ACTIVE')) = 'ACTIVE'
        AND upper(regexp_replace(identifier, '\\s', '', 'g')) = ANY($1)
      ORDER BY id LIMIT 1`,
    [ids],
  );
}

function validityProblem(rec, now = new Date()) {
  const from = parseDbDateTime(rec.valid_from);
  const till = parseDbDateTime(rec.valid_till, { endOfDay: true });
  if (from && now < from) return "Pass not yet valid";
  if (till && now > till) return "Pass expired";
  return null;
}

const passStatusProblem = (status) =>
  isOk(status) ? null : status ? `Pass ${String(status).trim().toLowerCase()}` : "No pass status";

// ── Automatic checks: a list of reasons (empty = clear) ──
async function visitorProblems(q, v) {
  const reasons = [passStatusProblem(v.pass_status), validityProblem(v)];
  if (v.frs_verified === false) reasons.push("Face not matched");
  if (!isBlacklistClear(v.blacklist_status) || (await blacklistHit(q, [v.ref_no, v.aadhar_no, v.id_proof_number]))) {
    reasons.push("Person blacklisted");
  }
  return reasons.filter(Boolean);
}

async function vehicleProblems(q, v) {
  const reasons = [passStatusProblem(v.pass_status), validityProblem(v)];
  if (v.anpr_verified === false) reasons.push("Number plate not verified");
  if (!isBlacklistClear(v.blacklist_status) || (await blacklistHit(q, [v.registration_no, v.ref_no]))) {
    reasons.push("Vehicle blacklisted");
  }
  return reasons.filter(Boolean);
}

function cargoProblems(c) {
  const reasons = [];
  if (c.form13_match === false) reasons.push("Form 13 mismatch");
  if (!isOk(c.rapi_scan_status)) reasons.push(`RapiScan: ${c.rapi_scan_status ?? "no result"}`);
  if (!isOk(c.ooc_status)) reasons.push(`OOC: ${c.ooc_status ?? "not completed"}`);
  if (c.cargo_verified === false) reasons.push("Cargo not verified");
  return reasons;
}

const PROBLEMS = { visitor: visitorProblems, vehicle: vehicleProblems, cargo: (q, c) => cargoProblems(c) };

// One at a time: q may be a single transaction client, which can't run
// queries concurrently
async function loadRecords(q, t) {
  const visitor = t.visitor_id ? await one(q, "SELECT * FROM visitors WHERE id = $1", [t.visitor_id]) : null;
  const vehicle = t.vehicle_id ? await one(q, "SELECT * FROM vehicles WHERE id = $1", [t.vehicle_id]) : null;
  const cargo = t.cargo_id ? await one(q, "SELECT * FROM cargo WHERE id = $1", [t.cargo_id]) : null;
  return { visitor, vehicle, cargo };
}

// A stored status (set at scan time or by an operator override) wins;
// otherwise the check is worked out from the records now.
async function evaluate(q, t, recs) {
  const checks = {};
  const reasons = {};
  for (const key of SECTIONS) {
    if (!recs[key]) {
      checks[key] = true;
      reasons[key] = [];
      continue;
    }
    const auto = await PROBLEMS[key](q, recs[key]);
    const stored = t[STATUS_COLUMN[key]];
    if (stored != null && String(stored).trim() !== "") {
      checks[key] = isOk(stored);
      reasons[key] = checks[key] ? [] : auto.length ? auto : ["Rejected by operator"];
    } else {
      checks[key] = auto.length === 0;
      reasons[key] = auto;
    }
  }
  return { checks, reasons };
}

// ── Display shape (what the React cards render) ──
const joinParts = (...parts) => parts.filter((p) => p != null && String(p).trim() !== "").join(" | ");
const validityText = (r) => {
  const from = displayDateTime(r.valid_from);
  const till = displayDateTime(r.valid_till);
  return from || till ? `${from ?? "—"} - ${till ?? "—"}` : "—";
};
const containerType = (t) => (upper(t).startsWith("I") ? "I" : "E");

function visitorView(v) {
  return {
    ref: v.ref_no,
    name: v.full_name,
    idProof: [v.id_proof_type, v.id_proof_number].filter(Boolean).join(" : "),
    company: v.company,
    purpose: v.purpose,
    vehicle: v.vehicle_type,
    passType: v.pass_type,
    passNo: joinParts(v.pass_number, v.pass_id),
    passStatus: v.pass_status,
    validity: validityText(v),
    typeOfHep: v.type_of_hep,
    frsVerified: v.frs_verified,
    frsScore: v.frs_match_score,
    camera: v.live_feed_camera,
    liveImage: imageUrl(v.live_feed_image),
    registeredImage: imageUrl(v.registered_face_image),
  };
}

function vehicleView(v) {
  return {
    ref: v.ref_no,
    plate: v.registration_no,
    blacklistStatus: v.blacklist_status,
    company: v.company,
    purpose: v.purpose,
    passType: v.pass_type,
    passNo: joinParts(v.pass_number, v.pass_id),
    passStatus: v.pass_status,
    validity: validityText(v),
    vehicleClass: v.vehicle_class,
    weighBridge: {
      name: v.weight_bridge,
      gross: v.gross_weight,
      tare: v.tare_weight,
      net: v.net_weight,
    },
    camera: v.anpr_camera,
    image: imageUrl(v.anpr_feed_image),
  };
}

function cargoView(c) {
  return {
    ref: c.ref_no,
    containers: [1, 2]
      .filter((n) => c[`container${n}_number`])
      .map((n) => ({
        seq: n,
        number: c[`container${n}_number`],
        size: c[`container${n}_size`] ?? "",
        ei: containerType(c[`container${n}_type`]),
      })),
    form13: c.form13_no,
    form13Match: c.form13_match !== false,
    terminal: c.terminal,
    rapiscan: c.rapi_scan_status,
    rapiscanOk: isOk(c.rapi_scan_status),
    ooc: c.ooc_status,
    oocOk: isOk(c.ooc_status),
    cargoType: c.cargo_type,
    sealNo: c.seal_no,
    customsRef: c.customs_ref_no,
    camera: c.camera_feed,
    image: imageUrl(c.feed_image),
  };
}

export async function getGateConfig(q, id) {
  return one(q, "SELECT * FROM gate_config WHERE id = $1", [id]);
}

export const configView = (g) => ({
  gate: { id: g.id, name: g.gate_name, lane: g.lane_name },
  header: {
    title: g.header_title,
    ministry: g.ministry,
    facility: g.facility,
    organization: g.organization,
    systemStatus: g.system_status,
  },
});

async function gateIdFor(q, t) {
  const g = await one(
    q,
    "SELECT id FROM gate_config WHERE gate_name = $1 AND lane_name = $2 ORDER BY id LIMIT 1",
    [t.gate_name, t.lane_name],
  );
  return g?.id ?? null;
}

async function operatorName(q, operatorId) {
  if (!operatorId) return null;
  const u = await one(q, "SELECT full_name FROM users WHERE username = $1", [operatorId]);
  return u?.full_name || operatorId;
}

export async function getView(q, id) {
  const t = await one(q, "SELECT * FROM gate_transactions WHERE id = $1", [id]);
  if (!t) return null;
  const recs = await loadRecords(q, t);
  const { checks, reasons } = await evaluate(q, t, recs);
  const decision = decisionOf(t.overall_result);
  const decidedAudit = decision
    ? await one(
        q,
        `SELECT created_at FROM audit_log WHERE gate_transaction_id = $1 AND action = 'DECISION'
          ORDER BY id DESC LIMIT 1`,
        [t.id],
      )
    : null;
  const direction = upper(t.gate_mode) === "EXIT" ? "exit" : "entry";

  return {
    id: t.id,
    transactionId: t.transaction_id,
    createdAt: t.timestamp,
    direction,
    gate: { id: await gateIdFor(q, t), name: t.gate_name, lane: t.lane_name, direction },
    sections: SECTIONS.filter((key) => recs[key]),
    mode: recs.vehicle || recs.cargo ? "full" : "visitor",
    checks,
    reasons,
    decision,
    overallResult: t.overall_result,
    decidedBy: decision ? await operatorName(q, t.operator_id) : null,
    decidedAt: decidedAudit ? formatDateTime(decidedAudit.created_at) : null,
    remarks: t.remarks,
    visitor: recs.visitor && visitorView(recs.visitor),
    vehicle: recs.vehicle && vehicleView(recs.vehicle),
    cargo: recs.cargo && cargoView(recs.cargo),
  };
}

// The gate lane's latest arrival
export async function currentView(q, gateId) {
  const g = await getGateConfig(q, gateId);
  if (!g) throw new HttpError(404, "Gate not found");
  const row = await one(
    q,
    `SELECT id FROM gate_transactions WHERE gate_name = $1 AND lane_name = $2
      ORDER BY "timestamp" DESC NULLS LAST, id DESC LIMIT 1`,
    [g.gate_name, g.lane_name],
  );
  return row ? getView(q, row.id) : null;
}

export async function audit(q, transactionId, username, action, detail) {
  await q.query(
    "INSERT INTO audit_log (gate_transaction_id, username, action, detail) VALUES ($1, $2, $3, $4)",
    [transactionId, username, action, detail ? JSON.stringify(detail) : null],
  );
}

const newTransactionId = () => {
  const stamp = localDate().replace(/-/g, "") + formatDateTime(new Date()).slice(-5).replace(":", "");
  return `TXN-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

// ── A scan from the gate devices ──
// input: { gateId | gateName + laneName, gateMode?,
//          visitorRef? / visitorId?, vehicleRef? / vehicleId?, cargoRef? / cargoId?,
//          liveFeedImage?, anprFeedImage?, cargoFeedImage?, transactionId?, remarks?,
//          username? (set when an operator starts the arrival from a pass) }
export async function createTransaction(pool, input) {
  const gate = input.gateId
    ? await getGateConfig(pool, Number(input.gateId))
    : await one(pool, "SELECT * FROM gate_config WHERE gate_name = $1 AND lane_name = $2", [
        input.gateName,
        input.laneName,
      ]);
  if (!gate) throw new HttpError(422, "Unknown gate — give gateId, or gateName and laneName from gate_config");

  const find = async (table, ref, id) => {
    if (id) {
      const row = await one(pool, `SELECT * FROM ${table} WHERE id = $1`, [Number(id)]);
      if (!row) throw new HttpError(422, `No ${table} record with id ${id}`);
      return row;
    }
    if (!ref) return null;
    const row = await one(pool, `SELECT * FROM ${table} WHERE ref_no = $1 ORDER BY id DESC LIMIT 1`, [String(ref)]);
    if (!row) throw new HttpError(422, `No ${table} record with ref_no ${ref}`);
    return row;
  };
  const recs = {
    visitor: await find("visitors", input.visitorRef, input.visitorId),
    vehicle: await find("vehicles", input.vehicleRef, input.vehicleId),
    cargo: await find("cargo", input.cargoRef, input.cargoId),
  };
  if (!recs.visitor && !recs.vehicle && !recs.cargo) {
    throw new HttpError(422, "Give at least one of visitorRef, vehicleRef, cargoRef");
  }

  let gateMode = upper(input.gateMode);
  if (gateMode !== "ENTRY" && gateMode !== "EXIT") {
    const last = await one(
      pool,
      `SELECT gate_mode FROM gate_transactions WHERE gate_name = $1 AND lane_name = $2
        ORDER BY "timestamp" DESC NULLS LAST, id DESC LIMIT 1`,
      [gate.gate_name, gate.lane_name],
    );
    gateMode = upper(last?.gate_mode) === "EXIT" ? "EXIT" : "ENTRY";
  }

  const images = {
    visitor: recs.visitor && storeImage(input.liveFeedImage, "liveFeedImage"),
    vehicle: recs.vehicle && storeImage(input.anprFeedImage, "anprFeedImage"),
    cargo: recs.cargo && storeImage(input.cargoFeedImage, "cargoFeedImage"),
  };
  const transactionId = input.transactionId ? String(input.transactionId).slice(0, 100) : newTransactionId();

  return withTransaction(pool, async (client) => {
    if (images.visitor) await client.query("UPDATE visitors SET live_feed_image = $1 WHERE id = $2", [images.visitor, recs.visitor.id]);
    if (images.vehicle) await client.query("UPDATE vehicles SET anpr_feed_image = $1 WHERE id = $2", [images.vehicle, recs.vehicle.id]);
    if (images.cargo) await client.query("UPDATE cargo SET feed_image = $1 WHERE id = $2", [images.cargo, recs.cargo.id]);

    const status = {};
    for (const key of SECTIONS) {
      if (!recs[key]) continue;
      const fresh = await one(client, `SELECT * FROM ${key === "cargo" ? "cargo" : key + "s"} WHERE id = $1`, [recs[key].id]);
      status[key] = (await PROBLEMS[key](client, fresh)).length === 0 ? STATUS_OK : STATUS_FAIL;
    }

    const row = await one(
      client,
      `INSERT INTO gate_transactions
         (transaction_id, "timestamp", gate_mode, gate_name, lane_name, visitor_id, vehicle_id, cargo_id,
          visitor_status, vehicle_status, cargo_status, overall_result, operator_id, remarks)
       VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', NULL, $11)
       RETURNING id`,
      [
        transactionId,
        gateMode,
        gate.gate_name,
        gate.lane_name,
        recs.visitor?.id ?? null,
        recs.vehicle?.id ?? null,
        recs.cargo?.id ?? null,
        status.visitor ?? null,
        status.vehicle ?? null,
        status.cargo ?? null,
        input.remarks ? String(input.remarks).slice(0, 500) : null,
      ],
    ).catch((err) => {
      if (err.code === "23505") throw new HttpError(409, `transaction_id ${transactionId} already exists`);
      throw err;
    });
    await audit(client, row.id, input.username ?? null, input.username ? "PASS_PRESENTED" : "SCAN", {
      transactionId,
      gateMode,
      status,
    });
    return { id: row.id, gateId: gate.id };
  });
}

// ── Pass presented at the gate ──
// A pass number, pass id, ref no., vehicle registration or container number
// finds the person; the vehicle and cargo filed under the same ref_no come
// with them. A name (3+ letters) also works. Up to 10 matches, exact first.
export async function searchPasses(q, term) {
  const text = String(term ?? "").trim().slice(0, 60);
  if (text.length < 2) return [];
  const compact = text.replace(/[\s-]+/g, "").toUpperCase();
  const escaped = text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const rows = await many(
    q,
    `SELECT v.*, vh.id AS vehicle_id, vh.registration_no, c.id AS cargo_id,
            (v.pass_number = $1 OR v.pass_id = $1 OR v.ref_no = $1
             OR vh.compact = $2 OR coalesce(c.hit, false)) AS exact
       FROM visitors v
       LEFT JOIN LATERAL (
         SELECT id, registration_no, upper(regexp_replace(registration_no, '[\\s-]', '', 'g')) AS compact
           FROM vehicles WHERE ref_no = v.ref_no ORDER BY id DESC LIMIT 1) vh ON true
       LEFT JOIN LATERAL (
         SELECT id,
                upper(regexp_replace(coalesce(container1_number, ''), '[\\s-]', '', 'g')) = $2
                OR upper(regexp_replace(coalesce(container2_number, ''), '[\\s-]', '', 'g')) = $2 AS hit
           FROM cargo WHERE ref_no = v.ref_no ORDER BY id DESC LIMIT 1) c ON true
      WHERE v.pass_number = $1 OR v.pass_id = $1 OR v.ref_no = $1
         OR vh.compact = $2 OR coalesce(c.hit, false)
         OR v.pass_number LIKE $3 || '%' OR v.ref_no LIKE $3 || '%'
         OR (length($1) >= 3 AND v.full_name ILIKE '%' || $3 || '%')
      ORDER BY exact DESC, v.id DESC
      LIMIT 10`,
    [text, compact, escaped],
  );

  return rows.map((v) => ({
    visitorId: v.id,
    vehicleId: v.vehicle_id,
    cargoId: v.cargo_id,
    exact: v.exact,
    ref: v.ref_no,
    name: v.full_name,
    company: v.company,
    passType: v.pass_type,
    passNo: joinParts(v.pass_number, v.pass_id),
    validity: validityText(v),
    plate: v.registration_no,
    photo: imageUrl(v.registered_face_image),
    sections: ["visitor", v.vehicle_id && "vehicle", v.cargo_id && "cargo"].filter(Boolean),
    problem: passStatusProblem(v.pass_status) || validityProblem(v),
  }));
}

// Operator starts an arrival for the pass that was shown
export async function startArrival(pool, gateId, { visitorId, vehicleId, cargoId }, user) {
  if (!visitorId && !vehicleId && !cargoId) throw new HttpError(422, "Choose a pass first");
  return createTransaction(pool, {
    gateId,
    visitorId,
    vehicleId,
    cargoId,
    username: user.username,
    remarks: "Pass presented at gate",
  });
}

// Demo scan built from the latest visitor / vehicle / cargo records
export async function simulateScan(pool, gateId, mode) {
  const latest = (table) => one(pool, `SELECT ref_no FROM ${table} ORDER BY id DESC LIMIT 1`);
  const visitor = await latest("visitors");
  const input = { gateId, visitorRef: visitor?.ref_no, remarks: "SIMULATED" };
  if (mode === "full") {
    input.vehicleRef = (await latest("vehicles"))?.ref_no;
    input.cargoRef = (await latest("cargo"))?.ref_no;
  }
  return createTransaction(pool, input);
}

async function lockOpen(client, id) {
  const t = await one(client, "SELECT * FROM gate_transactions WHERE id = $1 FOR UPDATE", [id]);
  if (!t) throw new HttpError(404, "Transaction not found");
  if (decisionOf(t.overall_result)) {
    throw new HttpError(409, `Transaction already decided (${t.overall_result})`);
  }
  return t;
}

// ── Operator corrections before the decision (each one audited) ──
//   checks:     { visitor?, vehicle?, cargo? } booleans — override a check
//   plateRead:  corrected registration number → vehicles.registration_no
//   containers: [{ seq: 1|2, number, size, ei }] → cargo.container{n}_*
//   gateMode:   "entry" | "exit"
export async function updateTransaction(pool, id, patch, user) {
  return withTransaction(pool, async (client) => {
    const t = await lockOpen(client, id);

    if (patch.checks && typeof patch.checks === "object") {
      for (const key of SECTIONS) {
        const value = patch.checks[key];
        if (value === undefined) continue;
        if (typeof value !== "boolean") throw new HttpError(422, `checks.${key} must be true or false`);
        if (!t[ID_COLUMN[key]]) throw new HttpError(422, `This arrival has no ${key} record`);
        const next = value ? STATUS_OK : STATUS_FAIL;
        if (upper(t[STATUS_COLUMN[key]]) === next) continue;
        await client.query(`UPDATE gate_transactions SET ${STATUS_COLUMN[key]} = $1 WHERE id = $2`, [next, id]);
        await audit(client, id, user.username, "CHECK_OVERRIDE", { check: key, from: t[STATUS_COLUMN[key]], to: next });
      }
    }

    if (patch.plateRead !== undefined) {
      if (!t.vehicle_id) throw new HttpError(422, "This arrival has no vehicle record");
      const plate = String(patch.plateRead).trim().toUpperCase();
      if (!/^[A-Z0-9 -]{1,20}$/.test(plate)) throw new HttpError(422, "Registration number must be 1–20 letters / digits");
      const v = await one(client, "SELECT registration_no FROM vehicles WHERE id = $1", [t.vehicle_id]);
      if (v.registration_no !== plate) {
        await client.query("UPDATE vehicles SET registration_no = $1 WHERE id = $2", [plate, t.vehicle_id]);
        await audit(client, id, user.username, "PLATE_EDIT", { from: v.registration_no, to: plate });
      }
    }

    if (patch.containers !== undefined) {
      if (!t.cargo_id) throw new HttpError(422, "This arrival has no cargo record");
      if (!Array.isArray(patch.containers)) throw new HttpError(422, "containers must be a list");
      const c = await one(client, "SELECT * FROM cargo WHERE id = $1", [t.cargo_id]);
      for (const raw of patch.containers) {
        const seq = Number(raw.seq);
        if (seq !== 1 && seq !== 2) throw new HttpError(422, "Container seq must be 1 or 2");
        const number = String(raw.number ?? "").trim().toUpperCase();
        const size = String(raw.size ?? "").replace(/\D/g, "").slice(0, 2);
        const type = raw.ei === "I" ? "IMPORT" : "EXPORT";
        if (!number || number.length > 50) throw new HttpError(422, `Container ${seq}: number is required`);
        const before = {
          number: c[`container${seq}_number`],
          size: c[`container${seq}_size`],
          type: c[`container${seq}_type`],
        };
        if (before.number === number && (before.size ?? "") === size && upper(before.type) === type) continue;
        await client.query(
          `UPDATE cargo SET container${seq}_number = $1, container${seq}_size = $2, container${seq}_type = $3 WHERE id = $4`,
          [number, size || null, type, t.cargo_id],
        );
        await audit(client, id, user.username, "CONTAINER_EDIT", { seq, from: before, to: { number, size, type } });
      }
    }

    if (patch.gateMode !== undefined) {
      const mode = upper(patch.gateMode);
      if (mode !== "ENTRY" && mode !== "EXIT") throw new HttpError(422, "gateMode must be 'entry' or 'exit'");
      if (upper(t.gate_mode) !== mode) {
        await client.query("UPDATE gate_transactions SET gate_mode = $1 WHERE id = $2", [mode, id]);
        await audit(client, id, user.username, "GATE_MODE", { from: t.gate_mode, to: mode });
      }
    }

    return gateIdFor(client, t);
  });
}

// ── Decision: GRANTED if every check is clear, else DENIED ──
// Also updates today's statistics row and raises an alert on a denial.
export async function decide(pool, id, user) {
  return withTransaction(pool, async (client) => {
    const t = await lockOpen(client, id);
    const recs = await loadRecords(client, t);
    const { checks, reasons } = await evaluate(client, t, recs);
    const present = SECTIONS.filter((key) => recs[key]);
    const granted = present.every((key) => checks[key]);
    const result = granted ? "GRANTED" : "DENIED";
    const failures = present.flatMap((key) => (checks[key] ? [] : reasons[key]));
    const summary = granted ? "All checks cleared" : `Denied: ${failures.join("; ")}`;

    await client.query(
      `UPDATE gate_transactions
          SET visitor_status = $1, vehicle_status = $2, cargo_status = $3,
              overall_result = $4, operator_id = $5, remarks = $6
        WHERE id = $7`,
      [
        recs.visitor ? (checks.visitor ? STATUS_OK : STATUS_FAIL) : t.visitor_status,
        recs.vehicle ? (checks.vehicle ? STATUS_OK : STATUS_FAIL) : t.vehicle_status,
        recs.cargo ? (checks.cargo ? STATUS_OK : STATUS_FAIL) : t.cargo_status,
        result,
        String(user.username).slice(0, 50),
        t.remarks ? `${t.remarks} · ${summary}` : summary,
        id,
      ],
    );

    await recordStatistics(client, t, recs, failures, granted);

    if (!granted) {
      const who = recs.visitor?.full_name || recs.vehicle?.registration_no || recs.cargo?.ref_no || "";
      await client.query(
        "INSERT INTO alerts (type, severity, message) VALUES ('ACCESS_DENIED', 'HIGH', $1)",
        [`${t.gate_name} / ${t.lane_name}: access denied${who ? ` — ${who}` : ""} (${failures.join("; ")})`],
      );
    }

    await audit(client, id, user.username, "DECISION", { result, failures });
    return gateIdFor(client, t);
  });
}

async function recordStatistics(client, t, recs, failures, granted) {
  const date = localDate();
  // One statistics row per gate per day; the lock stops two decisions
  // creating duplicate rows
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`statistics:${t.gate_name}:${date}`]);
  let row = await one(
    client,
    "SELECT id FROM statistics WHERE date = $1 AND gate_name IS NOT DISTINCT FROM $2 ORDER BY id LIMIT 1",
    [date, t.gate_name],
  );
  if (!row) {
    row = await one(client, "INSERT INTO statistics (date, gate_name) VALUES ($1, $2) RETURNING id", [
      date,
      t.gate_name,
    ]);
  }
  const exit = upper(t.gate_mode) === "EXIT";
  const containers = recs.cargo ? [1, 2].filter((n) => recs.cargo[`container${n}_number`]).length : 0;
  const add = {
    total_entries: exit ? 0 : 1,
    total_exits: exit ? 1 : 0,
    access_granted: granted ? 1 : 0,
    access_denied: granted ? 0 : 1,
    vehicles_in: recs.vehicle && !exit ? 1 : 0,
    vehicles_out: recs.vehicle && exit ? 1 : 0,
    containers_processed: containers,
    frs_matches: recs.visitor && recs.visitor.frs_verified !== false ? 1 : 0,
    frs_mismatches: recs.visitor && recs.visitor.frs_verified === false ? 1 : 0,
    blacklist_hits: failures.filter((f) => /blacklisted/i.test(f)).length,
  };
  const columns = Object.keys(add);
  await client.query(
    `UPDATE statistics SET ${columns.map((c, i) => `${c} = coalesce(${c}, 0) + $${i + 1}`).join(", ")}
      WHERE id = $${columns.length + 1}`,
    [...columns.map((c) => add[c]), row.id],
  );
}

// ── History, audit, monitoring ──
export async function listTransactions(q, { gateId, limit }) {
  const g = gateId ? await getGateConfig(q, gateId) : null;
  if (gateId && !g) throw new HttpError(404, "Gate not found");
  const rows = await many(
    q,
    `SELECT t.*, v.full_name AS visitor_name, vh.registration_no
       FROM gate_transactions t
       LEFT JOIN visitors v ON v.id = t.visitor_id
       LEFT JOIN vehicles vh ON vh.id = t.vehicle_id
      WHERE ($1::text IS NULL OR (t.gate_name = $1 AND t.lane_name = $2))
      ORDER BY t."timestamp" DESC NULLS LAST, t.id DESC
      LIMIT $3`,
    [g?.gate_name ?? null, g?.lane_name ?? null, Math.min(Math.max(Number(limit) || 50, 1), 500)],
  );
  return rows.map((r) => ({
    id: r.id,
    transactionId: r.transaction_id,
    at: r.timestamp && formatDateTime(r.timestamp),
    gateMode: r.gate_mode,
    gate: r.gate_name,
    lane: r.lane_name,
    visitorName: r.visitor_name,
    plate: r.registration_no,
    cargo: Boolean(r.cargo_id),
    statuses: { visitor: r.visitor_status, vehicle: r.vehicle_status, cargo: r.cargo_status },
    overallResult: r.overall_result,
    decision: decisionOf(r.overall_result),
    operatorId: r.operator_id,
    remarks: r.remarks,
  }));
}

export async function auditTrail(q, id) {
  const rows = await many(
    q,
    `SELECT a.*, u.full_name FROM audit_log a LEFT JOIN users u ON u.username = a.username
      WHERE a.gate_transaction_id = $1 ORDER BY a.id`,
    [id],
  );
  return rows.map((a) => ({
    id: a.id,
    action: a.action,
    by: a.username ? a.full_name || a.username : "Gate device",
    detail: a.detail,
    at: formatDateTime(a.created_at),
  }));
}
