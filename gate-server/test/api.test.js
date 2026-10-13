// End-to-end API tests against a throwaway PostgreSQL database.
// A database "cisf_test" is (re)created on the server in DATABASE_URL from
// db/cisf-schema.sql and filled with fixtures. The real cisf data is not used.
// Set TEST_DATABASE_URL to use a different test database.
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, describe, test } from "node:test";
import pg from "pg";

const adminUrl = process.env.DATABASE_URL;
const skip = adminUrl ? false : "DATABASE_URL is not set (gate-server/.env)";

let testUrl;
if (adminUrl) {
  const u = new URL(process.env.TEST_DATABASE_URL || adminUrl);
  if (!process.env.TEST_DATABASE_URL) u.pathname = "/cisf_test";
  testUrl = u.toString();
}

process.env.JWT_SECRET = "test-secret";
process.env.ALLOW_SIMULATION = "true";

let server;
let pool;
let base;
let token;
let deviceKey;

async function call(path, { method = "GET", body, auth = true, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

before(async () => {
  if (skip) return;
  const dbName = new URL(testUrl).pathname.slice(1);
  if (!/^[a-z0-9_]+$/i.test(dbName) || dbName === "cisf") throw new Error(`Refusing to use "${dbName}" as the test database`);

  // Fresh test database with the cisf schema
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const { createApp } = await import("../src/app.js");
  const { createPool, prepareDatabase } = await import("../src/db.js");
  const { hashPassword } = await import("../src/auth.js");
  const { formatDateTime } = await import("../src/format.js");
  deviceKey = (await import("../src/config.js")).config.deviceKey;

  pool = createPool(testUrl);
  await pool.query(fs.readFileSync(new URL("../db/cisf-schema.sql", import.meta.url), "utf8"));
  await prepareDatabase(pool);

  const at = (hours) => formatDateTime(new Date(Date.now() + hours * 3600_000));
  await pool.query(
    `INSERT INTO users (username, password_hash, role, full_name) VALUES ('CISF-OP-042', $1, 'operator', 'Duty Operator')`,
    [await hashPassword("Cisf@2026")],
  );
  await pool.query(
    `INSERT INTO gate_config (gate_name, lane_name, facility, ministry, header_title)
     VALUES ('GATE 0', 'Entry Lane A', 'Chennai Port Authority', 'Ministry of Ports, Shipping & Waterways',
             'Government of India — CISF Gate Management System')`,
  );
  await pool.query(
    `INSERT INTO visitors (ref_no, full_name, id_proof_type, id_proof_number, company, purpose, vehicle_type,
                           pass_type, pass_number, pass_id, valid_from, valid_till, live_feed_camera,
                           live_feed_image, registered_face_image)
     VALUES ('14785058', 'THIRUMURUGAN', 'DRIVING LICENCE', '823969187556', 'SUBHIKSHA LOGISTICS', 'NEW PROJECTS',
             'TWO WHEELER', 'VENDOR PASS', '2008261051', '14645240', $1, $2, 'FRS · CAM-01',
             'visistor-feed.png', 'visistor-feed-removebg-preview.png'),
            ('14785099', 'EXPIRED PERSON', 'AADHAAR', '1111', 'ACME', 'VISIT', NULL,
             'DAILY', '1', '2', $3, $4, NULL, NULL, NULL)`,
    [at(-24), at(24 * 6), at(-72), at(-48)],
  );
  await pool.query(
    `INSERT INTO vehicles (ref_no, registration_no, company, purpose, pass_type, pass_number, pass_id,
                           valid_from, valid_till, anpr_camera, anpr_feed_image)
     VALUES ('14785007', 'UP91AT4254', 'SUBHIKSHA LOGISTICS', 'LOADING', 'DAILY', '2108260212', '14648095',
             $1, $2, 'ANPR · CAM-02', 'Weighbridge-ANPR-1.png'),
            ('14785008', 'TN01XX0001', 'ACME', 'LOADING', 'DAILY', '9', '9', $1, $2, NULL, NULL)`,
    [at(-2), at(20)],
  );
  await pool.query(`INSERT INTO blacklist (type, identifier, name, reason) VALUES ('VEHICLE', 'TN 01 XX 0001', NULL, 'Test')`);
  await pool.query(
    `INSERT INTO cargo (ref_no, container1_number, container1_size, container2_number, container2_size,
                        form13_no, terminal, camera_feed, feed_image)
     VALUES ('14784965', 'TCKU 123456-7', '20', 'MEDU 987654-2', '20', 'F13-2025-0091', 'CCTL',
             'AI-CAM · Container', 'container_number_recognition_example.jpg')`,
  );
  // An arrival waiting at the gate (as a device would have left it)
  await pool.query(
    `INSERT INTO gate_transactions (transaction_id, visitor_id, overall_result, operator_id)
     VALUES ('TXN-SEED-1', 1, NULL, NULL)`,
  );

  server = createApp(pool).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server?.closeAllConnections();
  server?.close();
  await pool?.end();
});

describe("auth", { skip }, () => {
  test("public gate config for the sign-in screen", async () => {
    const r = await call("/api/gates/1/config", { auth: false });
    assert.equal(r.status, 200);
    assert.equal(r.data.gate.name, "GATE 0");
    assert.equal(r.data.header.ministry, "Ministry of Ports, Shipping & Waterways");
  });

  test("rejects a wrong password and protects the API", async () => {
    const bad = await call("/api/auth/login", { method: "POST", body: { username: "CISF-OP-042", password: "nope" }, auth: false });
    assert.equal(bad.status, 401);
    assert.equal((await call("/api/gates/1/current", { auth: false })).status, 401);
  });

  test("signs in against users and records last_login", async () => {
    const r = await call("/api/auth/login", {
      method: "POST",
      body: { username: "cisf-op-042", password: "Cisf@2026" },
      auth: false,
    });
    assert.equal(r.status, 200);
    token = r.data.token;
    assert.equal(r.data.operator.fullName, "Duty Operator");
    const { rows } = await pool.query("SELECT last_login FROM users WHERE id = 1");
    assert.ok(rows[0].last_login);
  });
});

describe("visitor-only arrival from the database", { skip }, () => {
  let id;

  test("current arrival is built from gate_transactions + visitors", async () => {
    const t = (await call("/api/gates/1/current")).data.transaction;
    id = t.id;
    assert.deepEqual(t.sections, ["visitor"]);
    assert.equal(t.mode, "visitor");
    assert.equal(t.visitor.name, "THIRUMURUGAN");
    assert.equal(t.visitor.passNo, "2008261051 | 14645240");
    assert.equal(t.visitor.registeredImage, "/uploads/visistor-feed-removebg-preview.png");
    assert.equal(t.checks.visitor, true);
    assert.equal(t.decision, null);
  });

  test("override writes visitor_status and the audit log", async () => {
    const r = await call(`/api/transactions/${id}`, { method: "PATCH", body: { checks: { visitor: false } } });
    assert.equal(r.data.checks.visitor, false);
    assert.deepEqual(r.data.reasons.visitor, ["Rejected by operator"]);
    const { rows } = await pool.query("SELECT visitor_status FROM gate_transactions WHERE id = $1", [id]);
    assert.equal(rows[0].visitor_status, "REJECTED");
    const trail = (await call(`/api/transactions/${id}/audit`)).data;
    assert.ok(trail.some((a) => a.action === "CHECK_OVERRIDE" && a.by === "Duty Operator"));
  });

  test("decision DENIED: result, alert, statistics; then locked", async () => {
    const r = await call(`/api/transactions/${id}/decision`, { method: "POST" });
    assert.equal(r.data.decision, "DENIED");
    assert.equal(r.data.decidedBy, "Duty Operator");
    const { rows: [t] } = await pool.query("SELECT overall_result, operator_id FROM gate_transactions WHERE id = $1", [id]);
    assert.deepEqual({ ...t }, { overall_result: "DENIED", operator_id: "CISF-OP-042" });
    const { rows: alerts } = await pool.query("SELECT * FROM alerts");
    assert.equal(alerts.length, 1);
    const { rows: [stats] } = await pool.query("SELECT * FROM statistics");
    assert.equal(stats.access_denied, 1);
    assert.equal(stats.total_entries, 1);
    assert.equal((await call(`/api/transactions/${id}/decision`, { method: "POST" })).status, 409);
  });
});

describe("device scans", { skip }, () => {
  const scan = { gateId: 1, visitorRef: "14785058", vehicleRef: "14785007", cargoRef: "14784965" };
  const device = () => ({ "X-Device-Key": deviceKey });

  test("needs the device key and known refs", async () => {
    assert.equal((await call("/api/transactions", { method: "POST", body: scan, auth: false })).status, 401);
    const r = await call("/api/transactions", { method: "POST", body: { ...scan, vehicleRef: "nope" }, headers: device() });
    assert.equal(r.status, 422);
  });

  test("full arrival → edit → GRANTED", async () => {
    const created = await call("/api/transactions", { method: "POST", body: { ...scan, gateMode: "exit" }, headers: device() });
    assert.equal(created.status, 201);
    const t = created.data;
    assert.deepEqual(t.sections, ["visitor", "vehicle", "cargo"]);
    assert.equal(t.direction, "exit");
    assert.equal(t.vehicle.plate, "UP91AT4254");
    assert.equal(t.cargo.containers.length, 2);
    assert.deepEqual(t.checks, { visitor: true, vehicle: true, cargo: true });
    assert.equal((await call("/api/gates/1/current")).data.transaction.id, t.id);

    const edited = await call(`/api/transactions/${t.id}`, {
      method: "PATCH",
      body: { plateRead: "up91at4255", containers: [{ seq: 1, number: "tcku 123456-8", size: "40", ei: "I" }], gateMode: "entry" },
    });
    assert.equal(edited.data.vehicle.plate, "UP91AT4255");
    assert.deepEqual(edited.data.cargo.containers[0], { seq: 1, number: "TCKU 123456-8", size: "40", ei: "I" });
    assert.equal(edited.data.direction, "entry");
    const { rows: [c] } = await pool.query("SELECT container1_type FROM cargo WHERE ref_no = '14784965'");
    assert.equal(c.container1_type, "IMPORT");

    const decided = await call(`/api/transactions/${t.id}/decision`, { method: "POST" });
    assert.equal(decided.data.decision, "GRANTED");
    const { rows: [stats] } = await pool.query("SELECT * FROM statistics");
    assert.equal(stats.access_granted, 1);
    assert.equal(stats.vehicles_in, 1);
    assert.equal(stats.containers_processed, 2);
  });

  test("expired visitor pass and blacklisted vehicle fail automatically", async () => {
    const r = await call("/api/transactions", {
      method: "POST",
      body: { gateId: 1, visitorRef: "14785099", vehicleRef: "14785008" },
      headers: device(),
    });
    assert.equal(r.data.checks.visitor, false);
    assert.deepEqual(r.data.reasons.visitor, ["Pass expired"]);
    assert.equal(r.data.checks.vehicle, false);
    assert.deepEqual(r.data.reasons.vehicle, ["Vehicle blacklisted"]);
    assert.deepEqual(r.data.sections, ["visitor", "vehicle"]);
  });
});

describe("pass presented at the gate", { skip }, () => {
  test("search by pass no., ref, plate and name", async () => {
    const byPass = (await call("/api/gates/1/passes?q=2008261051")).data;
    assert.equal(byPass.length, 1);
    assert.equal(byPass[0].exact, true);
    assert.equal(byPass[0].name, "THIRUMURUGAN");
    assert.equal(byPass[0].problem, null);
    const expired = (await call("/api/gates/1/passes?q=14785099")).data;
    assert.equal(expired[0].problem, "Pass expired");
    assert.equal((await call("/api/gates/1/passes?q=thiru")).data.length, 1);
    assert.equal((await call("/api/gates/1/passes?q=x")).data.length, 0);
    assert.equal((await call("/api/gates/1/passes?q=2008", { auth: false })).status, 401);
  });

  test("starting an arrival makes it the current one, audited to the operator", async () => {
    const [hit] = (await call("/api/gates/1/passes?q=2008261051")).data;
    const r = await call("/api/gates/1/arrivals", { method: "POST", body: { visitorId: hit.visitorId } });
    assert.equal(r.status, 201);
    assert.equal(r.data.transaction.visitor.ref, "14785058");
    assert.equal(r.data.transaction.decision, null);
    assert.equal((await call("/api/gates/1/current")).data.transaction.id, r.data.transaction.id);
    const trail = (await call(`/api/transactions/${r.data.transaction.id}/audit`)).data;
    assert.equal(trail[0].action, "PASS_PRESENTED");
    assert.equal(trail[0].by, "Duty Operator");
    assert.equal((await call("/api/gates/1/arrivals", { method: "POST", body: {} })).status, 422);
  });

  test("pass type switch adds / drops the vehicle and cargo under the same ref", async () => {
    const current = (await call("/api/gates/1/current")).data.transaction;
    const patch = (body) => call(`/api/transactions/${current.id}`, { method: "PATCH", body });

    const none = await patch({ mode: "full" });
    assert.equal(none.status, 422);
    assert.match(none.data.error, /No vehicle or cargo is registered under REF 14785058/);

    await pool.query(
      `INSERT INTO vehicles (ref_no, registration_no, pass_number, valid_from, valid_till)
       VALUES ('14785058', 'TN09ZZ0001', '1', '01-JAN-2026 00:00', '31-DEC-2099 23:59')`,
    );
    const full = await patch({ mode: "full" });
    assert.deepEqual(full.data.sections, ["visitor", "vehicle"]);
    assert.equal(full.data.vehicle.plate, "TN09ZZ0001");
    assert.equal(full.data.checks.vehicle, true);

    const back = await patch({ mode: "visitor" });
    assert.deepEqual(back.data.sections, ["visitor"]);
    assert.equal(back.data.vehicle, null);
    const trail = (await call(`/api/transactions/${current.id}/audit`)).data;
    assert.equal(trail.filter((a) => a.action === "PASS_TYPE").length, 2);
    assert.equal((await patch({ mode: "both" })).status, 422);
  });
});

describe("history and monitoring", { skip }, () => {
  test("history, statistics, alerts", async () => {
    const history = (await call("/api/transactions?gateId=1")).data;
    assert.equal(history.length, 4);
    assert.equal((await call("/api/statistics?gateId=1")).data.length, 1);
    const alerts = (await call("/api/alerts")).data;
    const ack = await call(`/api/alerts/${alerts[0].id}/acknowledge`, { method: "POST" });
    assert.equal(ack.data.acknowledged, true);
    assert.equal((await call("/api/alerts")).data.length, 0);
  });

  test("simulated scan, then sign out", async () => {
    const r = await call("/api/gates/1/simulate", { method: "POST", body: { mode: "visitor" } });
    assert.equal(r.status, 201);
    assert.equal(r.data.transaction.remarks, "SIMULATED");
    assert.equal((await call("/api/auth/logout", { method: "POST" })).status, 204);
    assert.equal((await call("/api/auth/me")).status, 401);
  });
});
