import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { pool } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "aangan_session";
const SESSION_DAYS = 7;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export type Role = "admin" | "front_desk" | "designer" | "viewer";
export type SessionUser = { id: string; email: string; fullName: string; role: Role; canAssign: boolean };

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(pw, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const generic = { ok: false as const, error: "Incorrect email or password." };
  const { rows } = await pool.query(
    "select id, password_hash, is_active, failed_logins, locked_until from users where email = $1",
    [email.trim()],
  );
  const u = rows[0];
  if (!u || !u.is_active) {
    await verifyPassword(password, "scrypt$00$00"); // keep timing similar
    return generic;
  }
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    return { ok: false, error: "Too many attempts. Please try again in a few minutes." };
  }
  if (!(await verifyPassword(password, u.password_hash))) {
    const fails = u.failed_logins + 1;
    await pool.query(
      "update users set failed_logins = $2::int, locked_until = case when $2::int >= $3::int then now() + make_interval(mins => $4::int) else null end where id = $1",
      [u.id, fails, MAX_FAILS, LOCK_MINUTES],
    );
    return generic;
  }
  await pool.query("update users set failed_logins = 0, locked_until = null where id = $1", [u.id]);
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "insert into sessions(token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))",
    [sha256(token), u.id, SESSION_DAYS],
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return { ok: true };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await pool.query("delete from sessions where token_hash = $1", [sha256(token)]);
  jar.delete(COOKIE);
}

/** Role always comes from the database for the session's user; never from the browser. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const { rows } = await pool.query(
    `select u.id, u.email, u.full_name, u.role, u.can_assign_leads
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now() and u.is_active`,
    [sha256(token)],
  );
  const r = rows[0];
  return r
    ? { id: r.id, email: r.email, fullName: r.full_name, role: r.role, canAssign: r.role === "admin" || r.can_assign_leads }
    : null;
});

export async function requireUser(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const u = await requireUser();
  if (!roles.includes(u.role)) redirect("/forbidden");
  return u;
}
