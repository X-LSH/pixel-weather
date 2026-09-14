const { chromium } = require('D:/Code/rubik-solver/.pwtest/node_modules/playwright-core');

const URL = 'https://x-lsh.github.io/pixel-weather/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** 线上端到端验证：真实网络、真实定位、真实天气，不做任何请求拦截 */
async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  const net = [];
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('ipapi') || u.includes('ipwho') || u.includes('open-meteo')) {
      net.push(`${r.status()} ${u.slice(0, 80)}`);
    }
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(10000);

  console.log('--- requests ---');
  for (const n of net) console.log(n);

  const st = await page.evaluate(() => window.__pixelWeather.state());
  console.log('--- resolved ---');
  console.log('place   :', st.place.city, st.place.lat.toFixed(3), st.place.lon.toFixed(3), 'approx=' + st.place.approx);
  console.log('weather :', st.weather.label, st.weather.temp.toFixed(1) + 'C', 'offline=' + st.weather.offline);
  console.log('cloud   :', st.weather.cur.cloud.toFixed(2), 'precip:', st.weather.cur.precip.toFixed(2));
  console.log('layout  :', JSON.stringify(st.layout));

  await page.screenshot({ path: 'D:/Code/pixel-weather/shot/online-live.png' });
  console.log('shot online-live');

  console.log('--- errors ---');
  console.log(errors.length ? errors.slice(0, 6).join('\n') : 'none');

  await browser.close();
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
