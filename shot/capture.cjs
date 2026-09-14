const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('D:/Code/rubik-solver/.pwtest/node_modules/playwright-core');

const ROOT = 'D:/Code/pixel-weather';
const OUT = path.join(ROOT, 'shot');
const PORT = 8731;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

const GEO_BODY = JSON.stringify({
  latitude: 31.2304, longitude: 121.4737, city: 'Shanghai', country_code: 'CN', success: true,
});

function makeWeatherBody(temp, code, cloud, wind) {
  return JSON.stringify({
    current: {
      time: new Date().toISOString().slice(0, 16),
      temperature_2m: temp,
      weather_code: code,
      cloud_cover: cloud,
      wind_speed_10m: wind,
      precipitation: 0,
      is_day: 1,
    },
  });
}

const CASES = [
  { name: '01-dawn',       h: 6.1,  temp: 15, label: 'CLEAR',        w: { cloud: 0.2, precip: 0, snow: 0, fog: 0.08, thunder: 0, wind: 1.2 } },
  { name: '02-noon',       h: 12.5, temp: 26, label: 'CLEAR',        w: { cloud: 0.12, precip: 0, snow: 0, fog: 0, thunder: 0, wind: 1.6 } },
  { name: '03-dusk',       h: 17.75, temp: 21, label: 'PARTLY CLOUDY', w: { cloud: 0.42, precip: 0, snow: 0, fog: 0, thunder: 0, wind: 1.8 } },
  { name: '04-night',      h: 22.0, temp: 17, label: 'CLEAR',        w: { cloud: 0.1, precip: 0, snow: 0, fog: 0, thunder: 0, wind: 1.0 } },
  { name: '05-night-rain', h: 21.5, temp: 14, label: 'RAIN',         w: { cloud: 0.92, precip: 0.66, snow: 0, fog: 0.04, thunder: 0, wind: 3.4 } },
  { name: '06-day-storm',  h: 15.0, temp: 24, label: 'HEAVY RAIN',   w: { cloud: 0.96, precip: 1.0, snow: 0, fog: 0.06, thunder: 0.8, wind: 5.2 } },
  { name: '07-day-snow',   h: 10.0, temp: -3, label: 'SNOW',         w: { cloud: 0.9, precip: 0, snow: 0.7, fog: 0.05, thunder: 0, wind: 2.2 } },
  { name: '08-fog',        h: 8.5,  temp: 11, label: 'FOG',          w: { cloud: 0.55, precip: 0, snow: 0, fog: 0.85, thunder: 0, wind: 0.6 } },
  { name: '09-overcast',   h: 14.0, temp: 19, label: 'OVERCAST',     w: { cloud: 0.88, precip: 0, snow: 0, fog: 0.06, thunder: 0, wind: 2.0 } },
  { name: '10-bluehour',   h: 18.35, temp: 18, label: 'MAINLY CLEAR', w: { cloud: 0.24, precip: 0, snow: 0, fog: 0, thunder: 0, wind: 1.4 } },
  { name: '12-shadow-high', h: 11.0, temp: 25, label: 'CLEAR', w: { cloud: 0.08, precip: 0, snow: 0, fog: 0, thunder: 0, wind: 1.2 } },
  { name: '13-shadow-low',  h: 16.6, temp: 24, label: 'CLEAR', w: { cloud: 0.08, precip: 0, snow: 0, fog: 0, thunder: 0, wind: 1.2 } },
];

async function main() {
  const only = process.argv[2] || '';

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

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('[console] ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

  await page.route('**/ipapi.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: GEO_BODY }));
  await page.route('**/ipwho.is/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: GEO_BODY }));
  await page.route('**/api.open-meteo.com/**', (r) => {
    r.fulfill({ status: 200, contentType: 'application/json', body: makeWeatherBody(22, 1, 20, 12) });
  });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => window.__pixelWeather.state());
  console.log('layout:', JSON.stringify(state.layout));
  console.log('metrics:', JSON.stringify(state.metrics));

  const nowH = new Date().getHours() + new Date().getMinutes() / 60;

  for (const c of CASES) {
    if (only && !c.name.includes(only)) continue;
    await page.evaluate(
      ({ h, offsetTo, w, temp, label }) => {
        window.__pixelWeather.setTimeOffsetMs((h - offsetTo) * 3600e3);
        window.__pixelWeather.setWeather({ ...w, label }, { temp });
      },
      { h: c.h, offsetTo: nowH, w: c.w, temp: c.temp, label: c.label },
    );
    await page.waitForTimeout(420);
    await page.screenshot({ path: path.join(OUT, `${c.name}.png`) });
    console.log('shot', c.name);
  }

  await page.evaluate(
    ({ h, offsetTo }) => {
      window.__pixelWeather.setTimeOffsetMs((h - offsetTo) * 3600e3);
      window.__pixelWeather.setWeather(
        { cloud: 0.5, precip: 0.14, snow: 0, fog: 0, thunder: 0, wind: 1.5, label: 'SHOWERS' },
        { temp: 22 },
      );
      window.__pixelWeather.fx({ rainbow: 0.92, rainbowTarget: 0.92 });
    },
    { h: 16.2, offsetTo: nowH },
  );
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(OUT, '14-rainbow.png') });
  console.log('shot 14-rainbow');

  await page.evaluate(() => {
    window.__pixelWeather.setWeather(
      { cloud: 0.96, precip: 0.85, snow: 0, fog: 0.04, thunder: 1, wind: 4.5, label: 'THUNDERSTORM' },
      { temp: 23 },
    );
    window.__pixelWeather.fx({
      rainbow: 0,
      rainbowTarget: 0,
      flash: 1.2,
      boltLife: 1.6,
      boltPath: [
        { x0: 138, y0: 8, x1: 147, y1: 26 },
        { x0: 147, y0: 26, x1: 137, y1: 44 },
        { x0: 137, y0: 44, x1: 145, y1: 62 },
        { x0: 145, y0: 62, x1: 134, y1: 82 },
        { x0: 134, y0: 82, x1: 140, y1: 104 },
      ],
    });
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(OUT, '15-lightning.png') });
  console.log('shot 15-lightning');

  await page.setViewportSize({ width: 390, height: 844 });  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.__pixelWeather.setTimeOffsetMs(0);
    window.__pixelWeather.setWeather(
      { cloud: 0.5, precip: 0, snow: 0, fog: 0, thunder: 0, wind: 1.4, label: 'PARTLY CLOUDY' },
      { temp: 20 },
    );
  });
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(OUT, '11-mobile.png') });
  console.log('shot 11-mobile');

  if (errors.length) {
    console.log('--- ERRORS ---');
    for (const e of errors.slice(0, 12)) console.log(e);
  } else {
    console.log('no page errors');
  }

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
