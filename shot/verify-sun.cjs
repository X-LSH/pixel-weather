const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('D:/Code/rubik-solver/.pwtest/node_modules/playwright-core');

const ROOT = 'D:/Code/pixel-weather';
const PORT = 8733;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const HOURS = [0, 3, 6, 7, 8, 10, 12, 14, 16, 17, 18, 20, 23];
const PLACES = [
  { city: 'BEIJING', lat: 39.9, lon: 116.4 },
  { city: 'SHANGHAI', lat: 31.23, lon: 121.47 },
  { city: 'GUANGZHOU', lat: 23.13, lon: 113.26 },
  { city: 'SYDNEY', lat: -33.87, lon: 151.21 },
];

async function main() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    fs.readFile(path.join(ROOT, p), (err, data) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  const weatherBody = JSON.stringify({
    current: {
      time: new Date().toISOString().slice(0, 13) + ':00',
      temperature_2m: 20, weather_code: 0, cloud_cover: 5,
      wind_speed_10m: 8, precipitation: 0, is_day: 1,
    },
    hourly: { time: [], temperature_2m: [], weather_code: [], precipitation_probability: [] },
    daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], sunrise: [], sunset: [] },
  });
  await page.route('**/ipapi.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"latitude":31.23,"longitude":121.47,"city":"Shanghai","country_code":"CN"}' }));
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: weatherBody }));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const nowH = new Date().getHours() + new Date().getMinutes() / 60;

  console.log('=== A. 同一地点(SHANGHAI)，一天内不同时刻 ===');
  console.log('hour   alt      az     sunX  sunY   zenith RGB        horizon RGB');
  await page.evaluate(({ lat, lon }) => window.__pixelWeather.setPlace(lat, lon, 'SHANGHAI'), { lat: 31.23, lon: 121.47 });
  for (const h of HOURS) {
    await page.evaluate(
      ({ h, offsetTo }) => window.__pixelWeather.setTimeOffsetMs((h - offsetTo) * 3600e3),
      { h, offsetTo: nowH },
    );
    await page.waitForTimeout(120);
    const s = await page.evaluate(() => window.__pixelWeather.state().sun);
    console.log(
      `${String(h).padStart(4)}  ${String(s.alt).padStart(7)}  ${String(s.az).padStart(4)}  ` +
      `${String(s.x).padStart(4)}  ${String(s.y).padStart(4)}   ${String(s.zenith).padEnd(14)} ${String(s.horizon)}`,
    );
  }

  console.log('');
  console.log('=== B. 同一时刻(当地正午 12:00)，不同纬度 ===');
  console.log('city         lat      alt     az');
  for (const pl of PLACES) {
    await page.evaluate(({ lat, lon, city }) => {
      window.__pixelWeather.setPlace(lat, lon, city);
    }, pl);
    await page.evaluate(
      ({ offsetTo }) => window.__pixelWeather.setTimeOffsetMs((12 - offsetTo) * 3600e3),
      { offsetTo: nowH },
    );
    await page.waitForTimeout(120);
    const s = await page.evaluate(() => window.__pixelWeather.state().sun);
    console.log(`${pl.city.padEnd(12)} ${String(pl.lat).padStart(6)}  ${String(s.alt).padStart(6)}  ${String(s.az).padStart(5)}`);
  }

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
