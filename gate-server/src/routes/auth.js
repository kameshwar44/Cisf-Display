import { Router } from "express";
import {
  checkLoginAllowed,
  clearLoginFailures,
  issueToken,
  publicUser,
  recordLoginFailure,
  requireOperator,
  revokeToken,
  verifyPassword,
} from "../auth.js";
import { config } from "../config.js";
import { one } from "../db.js";
import { HttpError } from "../errors.js";

export default function authRoutes(pool) {
  const router = Router();
  const auth = requireOperator(pool);

  // Signs in against the users table
  router.post("/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
      throw new HttpError(400, "Username and password are required");
    }
    const key = `${req.ip}|${username.trim().toLowerCase()}`;
    checkLoginAllowed(key);

    const user = await one(pool, "SELECT * FROM users WHERE lower(username) = lower($1)", [username.trim()]);
    const ok = user ? await verifyPassword(password, user.password_hash) : false;
    if (ok === null) {
      console.warn(
        `users.password_hash for "${user.username}" is not a bcrypt hash — reset it with: npm run create-user`,
      );
    }
    // Same message either way, so usernames can't be probed
    if (!ok) {
      recordLoginFailure(key);
      throw new HttpError(401, "Incorrect username or password");
    }

    clearLoginFailures(key);
    await pool.query("UPDATE users SET last_login = now() WHERE id = $1", [user.id]);
    res.json({ ...issueToken(user), operator: publicUser(user) });
  });

  router.post("/logout", auth, (req, res) => {
    revokeToken(req.tokenClaims);
    res.status(204).end();
  });

  router.get("/me", auth, (req, res) => {
    res.json({ operator: publicUser(req.user), simulation: config.allowSimulation });
  });

  return router;
}
