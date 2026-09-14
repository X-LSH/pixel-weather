const GEO_TIMEOUT = 4500;

const GEO_SOURCES = [
  {
    url: 'https://ipapi.co/json/',
    pick: (j) => ({ lat: j.latitude, lon: j.longitude, city: j.city, cc: j.country_code }),
  },
  {
    url: 'https://ipwho.is/',
    pick: (j) => (j.success === false ? null : { lat: j.latitude, lon: j.longitude, city: j.city, cc: j.country_code }),
  },
];

/** 时区兜底表：IP 接口全部不可用时，用浏览器时区推一个合理坐标，保证画面照常成立 */
const TZ_FALLBACK = {
  'Asia/Shanghai': [31.23, 121.47, 'SHANGHAI'],
  'Asia/Chongqing': [29.56, 106.55, 'CHONGQING'],
  'Asia/Urumqi': [43.83, 87.62, 'URUMQI'],
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

function withTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(timer));
}

function timezoneFallback() {
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) { /* 保持 UTC */ }
  const hit = TZ_FALLBACK[tz];
  if (hit) return { lat: hit[0], lon: hit[1], city: hit[2], cc: '', approx: true };
  return { lat: 31.23, lon: 121.47, city: 'SHANGHAI', cc: '', approx: true };
}

function sanitizeCity(city, cc) {
  if (typeof city === 'string' && /^[\x20-\x7E]{2,}$/.test(city)) {
    return city.toUpperCase().replace(/[^A-Z0-9 \-'.]/g, '').trim().slice(0, 16) || 'LOCAL';
  }
  return (cc && /^[A-Z]{2}$/.test(cc)) ? cc : 'LOCAL';
}

/** 依次尝试多个 IP 地理接口，全部失败就退回时区推断 —— 任何情况下都有坐标可用 */
export async function locate() {
  for (const src of GEO_SOURCES) {
    try {
      const res = await withTimeout(src.url, GEO_TIMEOUT);
      if (!res.ok) continue;
      const json = await res.json();
      const raw = src.pick(json);
      if (!raw || typeof raw.lat !== 'number' || typeof raw.lon !== 'number') continue;
      return {
        lat: raw.lat,
        lon: raw.lon,
        city: sanitizeCity(raw.city, raw.cc),
        cc: raw.cc || '',
        approx: false,
      };
    } catch (e) { /* 尝试下一个源 */ }
  }
  return timezoneFallback();
}

/** Open-Meteo 免密钥、开放 CORS，是纯静态托管的唯一干净选择 */
export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,weather_code,cloud_cover,wind_speed_10m,precipitation,is_day',
    timezone: 'auto',
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const res = await withTimeout(url, 8000);
  if (!res.ok) throw new Error('weather http ' + res.status);
  const json = await res.json();
  const cur = json.current;
  if (!cur) throw new Error('weather payload missing');
  return {
    temp: cur.temperature_2m,
    code: cur.weather_code,
    cloudCover: cur.cloud_cover,
    wind: cur.wind_speed_10m,
    precip: cur.precipitation,
    isDay: cur.is_day === 1,
    at: Date.now(),
  };
}
