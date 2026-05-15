import type { NextConfig } from "next";

// Content-Security-Policy.
//
// 'unsafe-inline' em script-src é necessario porque o Next App Router emite
// scripts inline pra hidratação (RSC payload). A alternativa "correta" é
// nonce per-request via middleware, mas isso obriga a rota a ser dinâmica
// (quebra cache de respostas estáticas) e adiciona overhead — vale a pena
// migrar quando houver requisito formal (ex: PCI/auditoria). Hoje o ganho
// real do CSP aqui é bloquear:
//   - <script src="evil.com/x.js">  (script-src 'self' barra cross-origin)
//   - <iframe>...</iframe>          (frame-ancestors 'none', defense em
//                                    profundidade junto com X-Frame-Options)
//   - <form action="evil.com/x">    (form-action 'self')
//   - <object>, <embed>             (object-src 'none')
//
// 'unsafe-inline' em style-src cobre estilos inline gerados por Tailwind
// JIT em runtime e por libs de UI (base-ui usa style attr).
//
// img-src 'self' data: blob:
//   data: → QR code SVG-em-data-uri, fotos previews em base64 (PDF)
//   blob: → object-url de fotos em edição local
const cspParts = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
];

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
  {
    key: "Content-Security-Policy",
    value: cspParts.join("; "),
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
