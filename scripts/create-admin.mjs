// Usage: npm run create-admin -- you@example.com "a-long-password" "Your Name"
import pg from "pg";
import { randomBytes, scryptSync } from "node:crypto";

const [email, password, name = "Owner"] = process.argv.slice(2);
if (!email || !password || password.length < 10) {
  console.error('Usage: npm run create-admin -- email "password-min-10-chars" "Full Name"');
  process.exit(1);
}
const salt = randomBytes(16);
const hash = `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(
  `insert into users(email, password_hash, full_name, role) values ($1,$2,$3,'admin')
   on conflict (email) do update set password_hash = excluded.password_hash, role = 'admin', is_active = true, failed_logins = 0, locked_until = null
   returning id`,
  [email, hash, name],
);
console.log("Admin ready:", email, r.rows[0].id);
await c.end();
