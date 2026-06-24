import "server-only";
import { chromium, type Browser } from "playwright";

declare global {
  var __pwBrowser: Browser | null | undefined;
}

async function getBrowser(): Promise<Browser> {
  const current = globalThis.__pwBrowser;
  if (current && current.isConnected()) return current;

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  // Zera o handle se o Chromium morrer (OOM, crash).
  browser.on("disconnected", () => {
    if (globalThis.__pwBrowser === browser) {
      globalThis.__pwBrowser = null;
    }
  });
  globalThis.__pwBrowser = browser;
  return browser;
}

export async function closeBrowser(): Promise<void> {
  const current = globalThis.__pwBrowser;
  if (!current) return;
  globalThis.__pwBrowser = null;
  try {
    await current.close();
  } catch {
  }
}

export type RenderPdfOptions = {
  footerTemplate?: string;
};

const DEFAULT_FOOTER = `
  <div style="font-size:9px;width:100%;text-align:center;color:#555;padding:0 10mm;">
    Página <span class="pageNumber"></span> de <span class="totalPages"></span>
  </div>`;

export async function renderHtmlToPdf(
  html: string,
  options: RenderPdfOptions = {},
): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 794, height: 1123 } });
  const page = await context.newPage();
  // SSRF defense: Chromium server-side tem acesso a rede interna (IMDS).
  // Bloqueia tudo exceto data:, about: e Google Fonts.
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.startsWith("data:") ||
      url.startsWith("about:") ||
      url.startsWith("https://fonts.googleapis.com/") ||
      url.startsWith("https://fonts.gstatic.com/")
    ) {
      return route.continue();
    }
    return route.abort();
  });
  await page.setContent(html, { waitUntil: "load" });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "12mm",
      bottom: "18mm",
      left: "10mm",
      right: "10mm",
    },
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: options.footerTemplate ?? DEFAULT_FOOTER,
  });
  await context.close();
  return pdf;
}
