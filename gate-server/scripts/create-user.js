// Creates an operator in the users table, or resets an existing user's
// password (bcrypt hash).
// Usage: npm run create-user -- <username> <password> ["Full Name"] [role]
import { hashPassword } from "../src/auth.js";
import { createPool } from "../src/db.js";

const [username, password, fullName, role = "operator"] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: npm run create-user -- <username> <password> ["Full Name"] [role]');
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const pool = createPool();
try {
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           full_name = COALESCE($3, users.full_name),
           role = COALESCE($5, users.role)
     RETURNING id, (xmax = 0) AS created`,
    [username, await hashPassword(password), fullName ?? null, role, process.argv[5] ?? null],
  );
  console.log(`${rows[0].created ? "Created" : "Updated"} user "${username}" (id ${rows[0].id}).`);
} catch (err) {
  console.error("ERROR:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
