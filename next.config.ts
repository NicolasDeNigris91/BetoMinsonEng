import type { NextConfig } from "next";

// Headers base — em todo lugar. NÃO inclui Referrer-Policy (definido abaixo
// por rota: 'no-referrer' nas que carregam token; default no resto).
const baseSecurityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  },
];

// Rotas que carregam share token na URL (page) ou recebem token como query
// param (api/files, api/pdf). 'no-referrer' impede que o token vaze via header
// Referer quando o cliente navega/baixa PDF a partir da página pública.
const tokenRoutes = [
  "/v/:path*",
  "/api/files/:path*",
  "/api/pdf/:path*",
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...baseSecurityHeaders,
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      ...tokenRoutes.map((source) => ({
        source,
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      })),
    ];
  },
};

export default nextConfig;
