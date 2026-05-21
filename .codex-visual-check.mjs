import { createServer } from "vite";
import puppeteer from "puppeteer";

const server = await createServer({
  configFile: "vite.config.ts",
  server: {
    host: "127.0.0.1",
    port: 5000,
    strictPort: true,
  },
});

await server.listen();

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage();
const checks = [
  { name: "home-desktop", path: "/", viewport: { width: 1365, height: 900 } },
  { name: "home-mobile", path: "/", viewport: { width: 390, height: 844 } },
  { name: "login-desktop", path: "/login", viewport: { width: 1365, height: 900 } },
];

const results = [];

for (const check of checks) {
  await page.setViewport({ ...check.viewport, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:5000${check.path}`, { waitUntil: "networkidle0" });
  await page.screenshot({ path: `.codex-${check.name}.png`, fullPage: false });
  results.push({
    route: check.name,
    logos: await page.evaluate(() =>
      Array.from(document.querySelectorAll('img[alt*="EduOnx"], img[alt="EduOnx"]')).map((img) => {
        const rect = img.getBoundingClientRect();
        return {
          src: img.getAttribute("src"),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
        };
      })
    ),
  });
}

await browser.close();
await server.close();

console.log(JSON.stringify(results, null, 2));
