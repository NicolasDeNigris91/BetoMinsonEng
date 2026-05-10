import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getIronSession,
  type IronSession,
  type SessionOptions,
} from "iron-session";
import { timingSafeEqual } from "node:crypto";
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
  const expected = Buffer.from(env.APP_PASSWORD, "utf8");
  const got = Buffer.from(input, "utf8");
  if (expected.length !== got.length) {
    return false;
  }
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
