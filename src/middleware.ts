import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";

type SessionData = {
  loggedInAt?: number;
};

const PUBLIC_PATHS = ["/login", "/v/", "/_next/", "/favicon.ico", "/robots.txt"];

const sessionOptions = {
  password: process.env.SESSION_SECRET ?? "",
  cookieName: "rme_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  },
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p,
  );

  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");

  if (isPublic) {
    return res;
  }

  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  if (!session.loggedInAt) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
