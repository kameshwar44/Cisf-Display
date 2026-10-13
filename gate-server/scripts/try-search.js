// Read-only check of the pass search:
//   npm run -s try-search -- <term> [<term> ...]
//   ref:<ref_no> also searches that record's vehicle plate and container no.
import { createPool, one } from "../src/db.js";
import { searchPasses } from "../src/services/gate.js";

const pool = createPool();
try {
  const terms = [];
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("ref:")) {
      terms.push(arg);
      continue;
    }
    const row = await one(
      pool,
      `SELECT v.registration_no, c.container1_number FROM vehicles v
         LEFT JOIN cargo c ON c.ref_no = v.ref_no WHERE v.ref_no = $1 LIMIT 1`,
      [arg.slice(4)],
    );
    if (row?.registration_no) terms.push(row.registration_no);
    if (row?.container1_number) terms.push(row.container1_number);
  }
  for (const term of terms) {
    const hits = await searchPasses(pool, term);
    console.log(`\n"${term}" → ${hits.length} match(es)`);
    for (const h of hits.slice(0, 4)) {
      console.log(
        `  ${h.exact ? "=" : "~"} ref ${h.ref}  ${h.name.padEnd(22)} ${h.passNo.padEnd(24)} ${h.sections.join("+").padEnd(21)} ${h.plate ?? ""} ${h.problem ? `[${h.problem}]` : ""}`,
      );
    }
  }
} finally {
  await pool.end();
}
