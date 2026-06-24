import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";

type SessionData = {
  loggedInAt?: number;
};

// Cada rota faz sua propria checagem (session ou token). Sem isso, upload
// publico via token redireciona pra /login e o body grande estoura limite
// do POST /login, devolvendo 500 sem JSON.
const PUBLIC_PATHS = [
  "/login",
  "/f/",
  "/_next/",
  "/favicon.ico",
  "/robots.txt",
  "/api/health",
  "/api/upload",
  "/api/pdf/",
  "/opengraph-image",
];

function readSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET ausente ou com menos de 32 caracteres — middleware não pode rodar.",
    );
  }
  return secret;
}

const sessionOptions = {
  password: readSessionSecret(),
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|eot|css|js|map)).*)",
  ],
};
