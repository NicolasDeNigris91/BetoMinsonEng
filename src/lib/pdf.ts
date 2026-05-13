import "server-only";
import { chromium, type Browser } from "playwright";

declare global {
  var __pwBrowser: Browser | null | undefined;
}

async function getBrowser(): Promise<Browser> {
  if (!globalThis.__pwBrowser) {
    globalThis.__pwBrowser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return globalThis.__pwBrowser;
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
