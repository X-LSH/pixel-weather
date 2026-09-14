import { approach, clamp } from './core/math.js';
import { createStage, startLoop } from './core/canvas.js';
import { applyWeather, sampleSky } from './core/palette.js';
import { bodyPosition, moonLight, moonPhase } from './core/sun.js';
import { createWorld, drawWorld, updateWorld } from './world/scene.js';
import { locate, fetchWeather, searchCity } from './weather/api.js';
import { adjustForTemp, decodeWeather } from './weather/codes.js';
import { createWeatherState } from './weather/state.js';
import { drawHud } from './ui/hud.js';
import { drawForecast } from './ui/panel.js';

const REFRESH_MS = 10 * 60 * 1000;
const STALE_MS = 2 * 60 * 1000;

const canvas = document.getElementById('stage');
const bootEl = document.getElementById('boot');
const stage = createStage(canvas);

const place = { lat: 31.23, lon: 121.47, city: 'SHANGHAI', source: 'tz', accuracy: 0 };
const weather = createWeatherState();

let world = createWorld(stage.W, stage.H);
let layoutKey = `${stage.W}x${stage.H}`;
let simTime = 0;
let timeOffset = 0;
let lastFetch = 0;
let bootDone = false;
let forecast = { hourly: [], daily: [] };
let panelOpen = false;
let panelT = 0;
let dayFlag = true;
let lastSun = null;
let sunTimes = { rise: null, set: null };

function hideBoot() {
  if (bootDone) return;
  bootDone = true;
  bootEl.classList.add('gone');
  setTimeout(() => bootEl.remove(), 1000);
}

/** 季节按纬度判半球：南半球自动把月份相位倒转，植被不会反着长 */
function seasonOf(date, lat) {
  const mo = date.getMonth() + 1;
  let s;
  if (mo >= 3 && mo <= 5) s = 0;
  else if (mo >= 6 && mo <= 9) s = 1;
  else if (mo >= 10 && mo <= 11) s = 2;
  else s = 3;
  return lat < 0 ? (s + 2) % 4 : s;
}

function screenX(az, W) {
  const t = clamp((az - 90) / 180, -0.25, 1.25);
  return W * (0.88 - t * 0.76);
}

function screenY(alt, m) {
  const t = clamp(alt / 55, 0, 1);
  return m.horizonY - 3 - t * (m.horizonY - m.H * 0.07);
}

function buildEnv(dt) {
  const now = new Date(Date.now() + timeOffset);
  const m = world.m;

  const sunPos = bodyPosition(now, place.lat, place.lon, 0);
  const phase = moonPhase(now);
  const moonPos = bodyPosition(now, place.lat, place.lon, phase * 360);

  const pal = applyWeather(sampleSky(sunPos.alt), weather.cur);
  const night = clamp((8 - sunPos.alt) / 10, 0, 1);

  lastSun = {
    alt: Math.round(sunPos.alt * 10) / 10,
    az: Math.round(sunPos.az),
    x: Math.round(screenX(sunPos.az, m.W)),
    y: Math.round(screenY(sunPos.alt, m)),
    moonAlt: Math.round(moonPos.alt * 10) / 10,
    phase: Math.round(phase * 100) / 100,
    night: Math.round(night * 100) / 100,
    zenith: pal.zen.map((v) => Math.round(v)),
    horizon: pal.hor.map((v) => Math.round(v)),
    lat: place.lat,
    lon: place.lon,
    rise: sunTimes.rise,
    set: sunTimes.set,
  };

  return {
    st: world,
    m,
    pal,
    w: weather.cur,
    night,
    T: simTime,
    dt,
    wind: weather.cur.wind,
    season: seasonOf(now, place.lat),
    roof: world.roof,
    sun: {
      alt: sunPos.alt,
      az: sunPos.az,
      x: screenX(sunPos.az, m.W),
      y: screenY(sunPos.alt, m),
      dir: Math.sin((sunPos.az * Math.PI) / 180),
      outside: false,
    },
    moon: {
      alt: moonPos.alt,
      az: moonPos.az,
      x: screenX(moonPos.az, m.W),
      y: screenY(moonPos.alt, m),
      phase,
      r: m.moonR,
      visible: moonPos.alt > -3 && moonLight(phase) > 0.05,
    },
    isDay: dayFlag,
    hud: {
      city: place.city,
      temp: weather.temp,
      label: weather.label,
      offline: weather.offline,
      source: place.source,
    },
  };
}

function frame(dt) {
  simTime += dt;
  panelT = approach(panelT, panelOpen ? 1 : 0, 11, dt);

  const key = `${stage.W}x${stage.H}`;
  if (key !== layoutKey) {
    layoutKey = key;
    world = createWorld(stage.W, stage.H);
  }

  weather.update(dt);
  const env = buildEnv(dt);
  updateWorld(world, env);
  drawWorld(stage, world, env);
  if (panelT < 0.9) drawHud(stage.ctx, env);
  drawForecast(stage.ctx, env, { t: panelT, hourly: forecast.hourly, daily: forecast.daily });
}

async function refresh(initial) {
  if (!initial && Date.now() - lastFetch < STALE_MS) return;
  try {
    const data = await fetchWeather(place.lat, place.lon);
    const decoded = decodeWeather(data.code, { cloudCover: data.cloudCover, temp: data.temp });
    weather.set(adjustForTemp(decoded, data.temp), { temp: data.temp, offline: false });
    weather.set({ wind: data.wind });
    forecast = { hourly: data.hourly || [], daily: data.daily || [] };
    sunTimes = { rise: data.sunrise, set: data.sunset };
    dayFlag = data.isDay !== false;
    lastFetch = Date.now();
  } catch (e) {
    if (initial) {
      weather.set(
        { cloud: 0.3, precip: 0, snow: 0, fog: 0, thunder: 0, wind: 1.6, label: 'OFFLINE' },
        { temp: 18, offline: true },
      );
      weather.snap();
    }
  }
}

async function boot() {
  setTimeout(hideBoot, 4500);
  bindGesture();
  try {
    const loc = await locate();
    place.lat = loc.lat;
    place.lon = loc.lon;
    place.city = loc.city;
    place.source = loc.source || 'ip';
    place.accuracy = loc.accuracy || 0;
  } catch (e) { /* 保留默认坐标 */ }

  await refresh(true);
  hideBoot();

  setInterval(() => refresh(false), REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh(false);
  });
}

/** 轻触切换预报，长按手动指定城市 —— 设置一次之后，日常使用不再需要任何交互 */
function bindGesture() {
  let pressTimer = 0;
  let longFired = false;

  canvas.addEventListener('pointerdown', () => {
    longFired = false;
    pressTimer = window.setTimeout(() => {
      longFired = true;
      pressTimer = 0;
      promptCity();
    }, 650);
  });

  canvas.addEventListener('pointerup', () => {
    if (!pressTimer) return;
    clearTimeout(pressTimer);
    pressTimer = 0;
    if (!longFired) panelOpen = !panelOpen;
  });

  canvas.addEventListener('pointercancel', () => {
    if (!pressTimer) return;
    clearTimeout(pressTimer);
    pressTimer = 0;
  });
}

/** 手动指定城市：定位被运营商或公共 WiFi 带到别的城市时的自救入口 */
async function promptCity() {
  let list = [];
  try {
    const q = window.prompt('输入城市名（拼音或英文，如 beijing / tokyo）');
    if (!q || !q.trim()) return;
    list = await searchCity(q.trim());
  } catch (e) {
    return;
  }
  if (!list.length) {
    window.alert('没有找到这个城市，换个拼写试试');
    return;
  }
  let hit = list[0];
  if (list.length > 1) {
    const opts = list
      .map((c, i) => `${i + 1}. ${c.city}${c.region ? ' / ' + c.region : ''}`)
      .join('\n');
    const pick = window.prompt(`找到 ${list.length} 个结果，输入序号：\n${opts}`, '1');
    const idx = Number(pick) - 1;
    if (!(idx >= 0 && idx < list.length)) return;
    hit = list[idx];
  }
  place.lat = hit.lat;
  place.lon = hit.lon;
  place.city = hit.city;
  place.source = 'manual';
  place.accuracy = 0;
  lastFetch = 0;
  await refresh(true);
}

/** 调试入口：便于外部脚本截图各种天气与时段 */
window.__pixelWeather = {
  setWeather(partial, meta) {
    weather.set(partial, meta || {});
    weather.snap();
  },
  snap() { weather.snap(); },
  setPlace(lat, lon, city) {
    place.lat = lat;
    place.lon = lon;
    if (city) place.city = city;
    place.approx = false;
  },
  setTimeOffsetMs(ms) { timeOffset = ms; },
  setPanel(v) {
    panelOpen = !!v;
    panelT = v ? 1 : 0;
  },
  forecastState() { return { hourly: forecast.hourly, daily: forecast.daily }; },
  /** 直接改动世界状态里的特效字段，用于截图核对彩虹、闪电等偶发效果 */
  fx(partial) { Object.assign(world, partial); },
  state() {
    return {
      place: { ...place },
      weather: { cur: { ...weather.cur }, label: weather.label, temp: weather.temp, offline: weather.offline },
      layout: { W: stage.W, H: stage.H, portrait: stage.portrait },
      metrics: { ...world.m },
      sun: lastSun,
    };
  },
};

startLoop(frame);
boot();
