import "dotenv/config";

import { gzipSync, brotliCompressSync, constants } from "node:zlib";

import { chromium } from "@playwright/test";

const PORT = process.env.NAV_PORT ?? "4173";
const TENANT = `http://demodental.localhost:${PORT}/`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const css = [];

  page.on("response", async (response) => {
    if (!response.ok()) {
      return;
    }
    const type = response.headers()["content-type"] ?? "";
    if (
      response.request().resourceType() !== "stylesheet" &&
      !type.includes("text/css")
    ) {
      return;
    }
    const body = await response.body();
    css.push({
      url: response.url(),
      raw: body.byteLength,
      gzip: gzipSync(body, { level: 9 }).byteLength,
      brotli: brotliCompressSync(body, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).byteLength,
      hasProgress: body.toString("utf8").includes("navigationProgress"),
    });
  });

  await page.goto(TENANT, { waitUntil: "load" });
  await browser.close();

  const raw = css.reduce((sum, asset) => sum + asset.raw, 0);
  console.log(
    JSON.stringify(
      {
        port: PORT,
        url: TENANT,
        raw,
        gzip: css.reduce((sum, asset) => sum + asset.gzip, 0),
        brotli: css.reduce((sum, asset) => sum + asset.brotli, 0),
        hasNavigationProgress: css.some((asset) => asset.hasProgress),
        files: css.sort((a, b) => b.raw - a.raw),
      },
      null,
      2
    )
  );
}

await main();
