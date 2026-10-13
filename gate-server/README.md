# CISF Gate Management System — Server

API server for the CISF gate display (`../gate-react`). It reads and writes the **`cisf` PostgreSQL database**. Every value on the display comes from it:

- **Header text** from `gate_config`
- **Visitor, vehicle and cargo details** from `visitors`, `vehicles` and `cargo`
- **The arrival at the gate** from `gate_transactions`
- **Checks** against `blacklist`
- **Decisions** written back to `gate_transactions`, `statistics` and `alerts`

Built with Node.js, Express 5 and `pg`.

## Run it

Requires Node.js 22.13+ and the `cisf` database.

1. Create `gate-server/.env` (copy [.env.example](.env.example)):
   ```
   DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/cisf
   JWT_SECRET=<long random string>
   ```
2. Start it:
   ```bash
   cd gate-server && npm install && npm start     # API on http://localhost:4000
   cd gate-react  && npm run dev                  # display on http://localhost:5173
   ```

On start, the server creates one table, `audit_log`, if it does not exist. **It changes nothing else in the schema.**

| Command | What it does |
|---|---|
| `npm start` / `npm run dev` | Start the server (dev restarts on file changes) |
| `npm run inspect-db` | Row counts and sample rows of each table (password hashes masked) |
| `npm run create-user -- <username> <password> ["Full Name"] [role]` | Add an operator to `users`, or reset a password (bcrypt) |
| `npm run check-password -- <password>` | Which users that password works for (prints usernames only) |
| `npm run generate [-- --count 500 --reset --seed 7]` | Generate sample pass records with per-record image copies (below) |
| `npm run try-search -- <pass no.> [ref:<ref_no>]` | Try the pass search from the terminal (read-only) |
| `npm test` | API tests in a separate, throwaway `cisf_test` database (your `cisf` data is never used) |

**Single-process deployment:** run `npm run build` in `gate-react`. This server then serves the display at http://localhost:4000.

## At the gate

1. **Search for the pass.** A person shows their pass. The operator types its number into the **Pass No.** bar at the top of the display (press **F2** to jump there). The bar also accepts a ref no., vehicle registration, container number or name. Matches appear as you type, each with the photo, pass type, validity, and **✓ Valid** or the problem (for example **✕ Pass expired**).
2. **Bring them up.** Press **Enter** on an exact match, or click a result. The person, and the vehicle and cargo filed under the same `ref_no`, become the gate's current arrival. This adds a `gate_transactions` row (`PENDING`, remarks "Pass presented at gate") and appears on every display at that gate.
3. **Check them.** The operator compares the person with the registered photo and reviews the checks. A check can be overridden by clicking its status strip, and plate or container reads can be corrected.
4. **Decide.** **ALL CHECKS CLEARED • APPROVED** records **GRANTED** and the barrier opens. If any check fails, the button reads **ACCESS DENIED • GATE LOCKED** and records **DENIED** with the reasons. Either way, statistics are updated, and a denial also raises an alert.

If the current arrival has not been decided yet, starting a new one asks for confirmation first.

## Sample records

`npm run generate` adds 500 pass records (refs `15000001`–`15000500`):

- **Visitors:** about 60% have a visitor pass only. About 40% are drivers with a vehicle, and most of those also have cargo with 1–2 containers.
- **Shared reference:** a person's `visitors`, `vehicles` and `cargo` rows share one `ref_no`. That link is how a single pass number brings up all three.
- **Validity:** valid around the time you run it. About 12% fail one check on purpose: expired, rejected, blacklisted (with a `blacklist` entry), face mismatch, blacklisted vehicle, or a cargo anomaly.
- **Images:** every record gets its own copy of the photos:
  ```
  uploads/people/<ref>/registered.png   ← the person's registered face
  uploads/people/<ref>/live.png         ← the live camera capture
  uploads/vehicles/<ref>/anpr.png
  uploads/cargo/<ref>/container.jpg
  ```
  **To use a real photo,** overwrite that file with the same name, for example `uploads/people/15000042/registered.png`. If your photo is a JPEG, either save it as `.png` or update `registered_face_image` in `visitors` to point at the new file name.
- **Reruns:** `npm run generate -- --reset` removes the generated records (and their transactions, blacklist entries and images) before generating again. Records that were not generated are never touched.

## How the tables are used

| Table | Read | Written |
|---|---|---|
| `users` | sign-in (bcrypt `password_hash`) | `last_login` on sign-in |
| `gate_config` | gate & lane names; header title, ministry, facility, organization, system status (public, for the sign-in screen) | — |
| `gate_transactions` | the display shows the **latest row** whose `gate_name` + `lane_name` match the gate; `gate_mode` = Entry / Exit | new row per device scan; `*_status` on override; `overall_result`, `operator_id`, `remarks` on decision |
| `visitors` / `vehicles` / `cargo` | everything on the three cards, including feed images and camera names | `live_feed_image` / `anpr_feed_image` / `feed_image` from device scans; `registration_no` and `container*` columns when the operator corrects a camera read |
| `blacklist` | `ACTIVE` entries are matched (spaces and case ignored) against visitor ref no. / Aadhaar / ID number and vehicle registration / ref no. | — |
| `statistics` | `GET /api/statistics` | today's row for the gate (one per day): entries/exits, granted/denied, vehicles in/out, containers, FRS matches, blacklist hits |
| `alerts` | `GET /api/alerts` | an `ACCESS_DENIED` alert on every denial; acknowledged via the API |
| `audit_log` *(added)* | `GET /api/transactions/:id/audit` | every scan, override, correction, Entry/Exit change and decision, with username |

An arrival's **sections** are whichever of `visitor_id`, `vehicle_id` and `cargo_id` are set. A visitor-only pass shows the Visitor card alone, with the registered face only.

### The checks

| Check | Passes when |
|---|---|
| **Visitor** | `pass_status` is an OK word (APPROVED, VERIFIED, ACTIVE, …), now is within `valid_from` – `valid_till`, `frs_verified` is not false, `blacklist_status` is CLEAR, and there is no active `blacklist` match |
| **Vehicle** | The same pass and validity rules, `anpr_verified` is not false, plus the blacklist rules on the registration number |
| **Cargo** | `form13_match`, `rapi_scan_status` CLEAR, `ooc_status` COMPLETED, and `cargo_verified` |

- **Validity:** `valid_from` and `valid_till` are text columns. Accepted formats include `2026-08-20 15:49`, `20-AUG-2026 15:49`, `20-08-2026 15:49`, `20/08/2026 3:49 PM` and ISO timestamps. Times without a zone are read in `DISPLAY_TZ`. A value in any other format is shown as stored and not used for the time check.
- **Stored results win.** A device scan writes `VERIFIED` or `REJECTED` into `visitor_status`, `vehicle_status` and `cargo_status`, and an operator override replaces it. When a status is empty, the check is worked out live from the records. The display shows the reasons a check failed (for example "Pass expired" or "Vehicle blacklisted").
- **Undecided arrivals:** an `overall_result` that is empty or PENDING means undecided. GRANTED / APPROVED-style values count as granted, and DENIED / REJECTED-style values as denied. A decided arrival is read-only (`409`).

## API

All JSON. Errors are `{ "error": "message" }` with the HTTP status set.

**Operator endpoints** need `Authorization: Bearer <token>` from sign-in. The token is an HS256 JWT valid for `SESSION_HOURS`. The live-events stream takes `?token=` instead.

| Method & path | Who | Purpose |
|---|---|---|
| `POST /api/auth/login` | anyone | `{ username, password }` → `{ token, expiresAt, operator }` (5 failures → 15-minute lock) |
| `POST /api/auth/logout` · `GET /api/auth/me` | operator | Sign out · who am I |
| `GET /api/gates` | operator | All `gate_config` rows |
| `GET /api/gates/:id/config` | anyone | Gate, lane and header text for one gate |
| `GET /api/gates/:id/current` | operator | The gate's latest arrival |
| `GET /api/gates/:id/events` | operator | Server-Sent Events: `transaction` on every change |
| `GET /api/gates/:id/passes?q=` | operator | Find a pass by pass no. / pass id / ref no. / vehicle no. / container no. / name (up to 10, exact first) |
| `POST /api/gates/:id/arrivals` | operator | `{ visitorId, vehicleId?, cargoId? }` from a search result → becomes the gate's current arrival |
| `POST /api/gates/:id/simulate` | operator | Demo scan from the latest visitor (and vehicle / cargo for `{ "mode": "full" }`), marked `remarks = SIMULATED` |
| `POST /api/transactions` | **device** | Report an arrival (below) |
| `GET /api/transactions?gateId=&limit=` | operator | History, newest first |
| `GET /api/transactions/:id` · `/:id/audit` | operator | One arrival · its audit trail |
| `PATCH /api/transactions/:id` | operator | `{ checks?: { visitor?, vehicle?, cargo? }, plateRead?, containers?: [{ seq, number, size, ei }], gateMode? }` |
| `POST /api/transactions/:id/decision` | operator | Record GRANTED / DENIED |
| `GET /api/statistics?gateId=&days=` | operator | Daily statistics |
| `GET /api/alerts[?all=1]` · `POST /api/alerts/:id/acknowledge` | operator | Alerts |
| `GET /api/blacklist` | operator | Blacklist |
| `GET /api/health` | anyone | `{ status: "ok" }` |

### Device integration

```bash
curl -X POST http://localhost:4000/api/transactions \
  -H "X-Device-Key: $DEVICE_KEY" -H "Content-Type: application/json" \
  -d '{ "gateId": 1, "gateMode": "ENTRY",
        "visitorRef": "14785058", "vehicleRef": "14785007", "cargoRef": "14784965",
        "liveFeedImage": "data:image/jpeg;base64,/9j/4AAQ..." }'
```

- **Gate:** give `gateId` (a `gate_config.id`), or `gateName` + `laneName`.
- **Records:** refs match `ref_no` in `visitors`, `vehicles` and `cargo`. Send only `visitorRef` for a visitor-only pass.
- **Images:** a JPEG / PNG data URL is saved to `uploads/captures/`, and its path is written to the record's feed-image column. An `/uploads/...` path is also accepted.
- **Defaults:** `transactionId` is generated if left out. `gateMode` defaults to the lane's last value.

### Images

Image columns may hold a full URL, a `/path`, or a bare file name. Bare file names are served from `gate-server/uploads/`.

## Debug logging

Debug logging is on by default unless `NODE_ENV=production`. Set `DEBUG_LOG=false` (or `true`) in `.env` to change that.

**In the server terminal:**
```
14:41:27 [api] POST /api/transactions → 201 (34.2 ms)
14:41:27 [api]   request body:  { gateId: 1, visitorRef: '14785058', liveFeedImage: '<image/jpeg data URL, 3023 chars>' }
14:41:27 [api]   response:      { id: 7, sections: [ 'visitor' ], checks: { … }, visitor: { … } }
14:41:27 [db] 1.8 ms  SELECT * FROM visitors WHERE ref_no = $1 ORDER BY id DESC LIMIT 1
         params [ '14785058' ]
         → SELECT 1 row(s)
         [ { id: 1, ref_no: '14785058', full_name: 'THIRUMURUGAN', … } ]
14:41:27 [sse] push "transaction" to 1 display(s) on gate 1
```
- **`[api]`:** every API call, with the request body and the JSON response.
- **`[db]`:** every SQL statement, with its parameters, timing, and the rows returned (up to 20 per query).
- **`[sse]`:** displays connecting and disconnecting, and each live update pushed to them.

**In the browser console** (always on with `npm run dev`): each API call appears as a collapsible `[api]` group showing its request and response, and each live update as a `[live]` group. In a production build, run `localStorage.setItem("cisf-debug", "1")` in the console and reload to turn it on.

**What is never printed:** passwords, password hashes, sign-in tokens and the device key are shown as `****`. Long text and base64 images are shortened.

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | — (required) | PostgreSQL connection to `cisf` |
| `JWT_SECRET` | random per start | Signs sign-in tokens. Set it, or everyone is signed out on restart |
| `DEVICE_KEY` | `dev-device-key` | Secret gate devices send as `X-Device-Key` |
| `ALLOW_SIMULATION` | on | `false` disables demo scans (they write real rows) |
| `SESSION_HOURS` | `12` | Sign-in lifetime |
| `DISPLAY_TZ` | `Asia/Kolkata` | Zone for reading and showing pass times |
| `PORT` | `4000` | HTTP port |
| `TEST_DATABASE_URL` | `…/cisf_test` | Database the tests drop and recreate |

## Production checklist

- **Secrets:** set `JWT_SECRET` and `DEVICE_KEY` to long random values, and set `ALLOW_SIMULATION=false`. Simulated scans and their decisions write real rows to `gate_transactions`, `statistics` and `alerts`.
- **Passwords:** all operator passwords should be bcrypt hashes. Use `npm run create-user` to set or reset one. The server logs a warning when a user's hash is in a format it cannot check.
- **Database user:** connect with a user that has only the rights the server needs: SELECT on all the tables listed above; INSERT/UPDATE on `gate_transactions`, `visitors`, `vehicles`, `cargo`, `statistics`, `alerts`, `audit_log`; UPDATE on `users.last_login`. CREATE is needed only the first time, for `audit_log`.
- **HTTPS:** serve over HTTPS, and keep the events URL (it carries the token) out of proxy logs.
- **`jwt_token` column:** the server leaves `gate_transactions.jwt_token` empty. Storing live sign-in tokens in a table would let anyone who can read it act as that operator.
