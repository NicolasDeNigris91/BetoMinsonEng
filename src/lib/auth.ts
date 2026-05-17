import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getIronSession,
  type IronSession,
  type SessionOptions,
} from "iron-session";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export type SessionData = {
  loggedInAt?: number;
};

export type Session = SessionData;

export const sessionOptions: SessionOptions = {
  password: env.SESSION_SECRET,
  cookieName: "rme_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function isLoggedIn(): Promise<boolean> {
  const session = await getSession();
  return Boolean(session.loggedInAt);
}

export async function requireSession(): Promise<IronSession<SessionData>> {
  const session = await getSession();
  if (!session.loggedInAt) {
    redirect("/login");
  }
  return session;
}

export function passwordMatches(input: string): boolean {
  // Hash dos dois lados antes de comparar. Buffer de 32 bytes garante
  // mesmo tamanho — evita early-return em length que vazaria o tamanho
  // exato da senha esperada via timing.
  const expected = createHash("sha256").update(env.APP_PASSWORD, "utf8").digest();
  const got = createHash("sha256").update(input, "utf8").digest();
  return timingSafeEqual(expected, got);
}

export async function login(): Promise<void> {
  const session = await getSession();
  session.loggedInAt = Date.now();
  await session.save();
}

export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
