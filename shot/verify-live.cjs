const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('D:/Code/rubik-solver/.pwtest/node_modules/playwright-core');

const ROOT = 'D:/Code/pixel-weather';
const OUT = path.join(ROOT, 'shot');
const PORT = 8732;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/** 真实网络验证：不拦截任何请求，检查 IP 定位与 Open-Meteo 是否真的可用 */
async function main() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = path.join(ROOT, p);
    fs.readFile(fp, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const seen = [];
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('ipapi') || u.includes('ipwho') || u.includes('open-meteo')) {
      seen.push(`${res.status()} ${u.slice(0, 90)}`);
    }
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  console.log('--- network ---');
  for (const s of seen) console.log(s);

  const st = await page.evaluate(() => window.__pixelWeather.state());
  console.log('--- resolved ---');
  console.log(JSON.stringify(st, null, 2));

  await page.screenshot({ path: path.join(OUT, 'live-real.png') });
  console.log('shot live-real');

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
