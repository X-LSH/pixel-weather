const GEO_OPTS = { enableHighAccuracy: false, timeout: 11000, maximumAge: 600000 };
const NET_TIMEOUT = 6000;
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** 时区兜底表：定位全链路失败时，用浏览器时区推一个合理坐标，保证画面照常成立 */
const TZ_FALLBACK = {
  'Asia/Shanghai': [31.23, 121.47, 'SHANGHAI'],
  'Asia/Chongqing': [29.56, 106.55, 'CHONGQING'],
  'Asia/Urumqi': [43.83, 87.62, 'URUMQI'],
  'Asia/Harbin': [45.8, 126.53, 'HARBIN'],
  'Asia/Hong_Kong': [22.32, 114.17, 'HONG KONG'],
  'Asia/Taipei': [25.03, 121.57, 'TAIPEI'],
  'Asia/Tokyo': [35.68, 139.69, 'TOKYO'],
  'Asia/Seoul': [37.57, 126.98, 'SEOUL'],
  'Asia/Singapore': [1.35, 103.82, 'SINGAPORE'],
  'Asia/Bangkok': [13.76, 100.5, 'BANGKOK'],
  'Asia/Kolkata': [22.57, 88.36, 'KOLKATA'],
  'Asia/Dubai': [25.2, 55.27, 'DUBAI'],
  'Europe/London': [51.51, -0.13, 'LONDON'],
  'Europe/Paris': [48.86, 2.35, 'PARIS'],
  'Europe/Berlin': [52.52, 13.4, 'BERLIN'],
  'Europe/Moscow': [55.75, 37.62, 'MOSCOW'],
  'America/New_York': [40.71, -74.01, 'NEW YORK'],
  'America/Chicago': [41.88, -87.63, 'CHICAGO'],
  'America/Denver': [39.74, -104.99, 'DENVER'],
  'America/Los_Angeles': [34.05, -118.24, 'LOS ANGELES'],
  'America/Sao_Paulo': [-23.55, -46.63, 'SAO PAULO'],
  'Australia/Sydney': [-33.87, 151.21, 'SYDNEY'],
  'Pacific/Auckland': [-36.85, 174.76, 'AUCKLAND'],
};

function withTimeout(url, ms, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...(opts || {}), signal: ctrl.signal, cache: 'no-store' })
    .finally(() => clearTimeout(timer));
}

function tidyName(s) {
  if (typeof s !== 'string') return '';
  const clean = s.replace(/[^A-Za-z0-9 \-'.]/g, '').trim().toUpperCase();
  return clean.length >= 2 ? clean.slice(0, 16) : '';
}

/**
 * 浏览器定位：精度可到几十米，是移动端唯一可靠的位置来源。
 * IP 定位的出口常落在省会机房，手机上会把人定位到完全不相干的城市，所以只作兜底。
 */
function geolocate() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    setTimeout(() => finish(null), GEO_OPTS.timeout + 800);
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 0),
      }),
      () => finish(null),
      GEO_OPTS,
    );
  });
}

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&localityLanguage=en`;
    const res = await withTimeout(url, NET_TIMEOUT);
    if (!res.ok) return '';
    const j = await res.json();
    return tidyName(j.city || j.locality || j.principalSubdivision || '');
  } catch (e) {
    return '';
  }
}

const IP_SOURCES = [
  {
    url: 'https://ipapi.co/json/',
    pick: (j) => ({ lat: j.latitude, lon: j.longitude, city: j.city, cc: j.country_code }),
  },
  {
    url: 'https://ipwho.is/',
    pick: (j) => (j.success === false ? null : { lat: j.latitude, lon: j.longitude, city: j.city, cc: j.country_code }),
  },
];

async function locateByIp() {
  for (const src of IP_SOURCES) {
    try {
      const res = await withTimeout(src.url, NET_TIMEOUT);
      if (!res.ok) continue;
      const raw = src.pick(await res.json());
      if (!raw || typeof raw.lat !== 'number' || typeof raw.lon !== 'number') continue;
      return {
        lat: raw.lat,
        lon: raw.lon,
        city: tidyName(raw.city) || (raw.cc || 'LOCAL'),
        source: 'ip',
      };
    } catch (e) { /* 尝试下一个源 */ }
  }
  return null;
}

function locateByTimezone() {
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) { /* 保持 UTC */ }
  const hit = TZ_FALLBACK[tz] || [31.23, 121.47, 'SHANGHAI'];
  return { lat: hit[0], lon: hit[1], city: hit[2], source: 'tz' };
}

/** 三级定位：浏览器精确定位 → IP 定位 → 时区推断，任何情况下都有坐标可用 */
export async function locate() {
  const precise = await geolocate();
  if (precise) {
    const city = await reverseGeocode(precise.lat, precise.lon);
    return {
      lat: precise.lat,
      lon: precise.lon,
      city: city || 'MY LOCATION',
      source: 'gps',
      accuracy: precise.accuracy,
    };
  }
  const byIp = await locateByIp();
  if (byIp) return byIp;
  return locateByTimezone();
}

/** 城市搜索：供手动修正定位用（Open-Meteo 官方 geocoding，免密钥） */
export async function searchCity(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const res = await withTimeout(url, NET_TIMEOUT);
  if (!res.ok) return [];
  const j = await res.json();
  return (j.results || []).map((r) => ({
    lat: r.latitude,
    lon: r.longitude,
    city: tidyName(r.name) || 'CITY',
    region: tidyName(r.admin1) || '',
  }));
}

function weekdayOf(dateStr) {
  const parts = String(dateStr).split('-').map(Number);
  if (parts.length < 3) return '';
  const idx = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
  return WEEKDAYS[idx] || '';
}

function hourLabel(isoStr) {
  const t = String(isoStr).split('T')[1] || '';
  return t.slice(0, 2) || '';
}

/**
 * Open-Meteo：免密钥、开放 CORS，是纯静态托管的唯一干净选择。
 * 一次请求同时取回当前天气、逐小时预报与逐日预报。
 */
export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,weather_code,cloud_cover,wind_speed_10m,precipitation,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
    forecast_days: '7',
    timezone: 'auto',
  });
  const res = await withTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, 9000);
  if (!res.ok) throw new Error('weather http ' + res.status);
  const j = await res.json();
  const cur = j.current;
  if (!cur) throw new Error('weather payload missing');

  const h = j.hourly || {};
  const d = j.daily || {};
  const nowIso = String(cur.time || '').slice(0, 13);

  const hourly = [];
  if (Array.isArray(h.time)) {
    const startIdx = h.time.findIndex((t) => t >= nowIso);
    const from = startIdx < 0 ? 0 : startIdx;
    const take = Math.min(8, h.time.length - from);
    for (let i = from; i < from + take; i++) {
      hourly.push({
        label: hourLabel(h.time[i]),
        temp: h.temperature_2m ? h.temperature_2m[i] : null,
        code: h.weather_code ? h.weather_code[i] : 0,
        pop: h.precipitation_probability ? h.precipitation_probability[i] : null,
      });
    }
  }

  const daily = [];
  if (Array.isArray(d.time)) {
    for (let i = 0; i < Math.min(7, d.time.length); i++) {
      daily.push({
        label: i === 0 ? 'TODAY' : weekdayOf(d.time[i]),
        hi: d.temperature_2m_max ? d.temperature_2m_max[i] : null,
        lo: d.temperature_2m_min ? d.temperature_2m_min[i] : null,
        code: d.weather_code ? d.weather_code[i] : 0,
      });
    }
  }

  return {
    temp: cur.temperature_2m,
    code: cur.weather_code,
    cloudCover: cur.cloud_cover,
    wind: cur.wind_speed_10m,
    precip: cur.precipitation,
    isDay: cur.is_day === 1,
    sunrise: d.sunrise && d.sunrise[0] ? String(d.sunrise[0]).slice(11, 16) : null,
    sunset: d.sunset && d.sunset[0] ? String(d.sunset[0]).slice(11, 16) : null,
    hourly,
    daily,
    at: Date.now(),
  };
}
