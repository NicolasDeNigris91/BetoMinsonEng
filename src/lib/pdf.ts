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
  // Se o Chromium morrer (OOM, crash), zera o global pra proxima chamada
  // relançar em vez de tentar usar um handle morto.
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
    // browser ja desconectado/morto — nada a fazer
  }
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 794, height: 1123 } });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "load" });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "12mm",
      bottom: "16mm",
      left: "10mm",
      right: "10mm",
    },
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `
      <div style="font-size:9px;width:100%;text-align:center;color:#555;padding:0 10mm;">
        Página <span class="pageNumber"></span> de <span class="totalPages"></span>
      </div>`,
  });
  await context.close();
  return pdf;
}
