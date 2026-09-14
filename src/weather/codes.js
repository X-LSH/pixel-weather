import { clamp } from '../core/math.js';

/**
 * WMO 天气代码 → 画面参数。
 * cloud/precip/snow/fog/thunder 都是 0..1 的连续量而不是开关，
 * 这样天气变化时云层、降水、雾能各自平滑过渡，不会整幅画面硬切。
 */
export function decodeWeather(code, opts = {}) {
  const apiCloud = clamp((opts.cloudCover == null ? 50 : opts.cloudCover) / 100, 0, 1);
  const temp = opts.temp == null ? 15 : opts.temp;
  const base = {
    cloud: apiCloud,
    precip: 0,
    snow: 0,
    fog: 0,
    thunder: 0,
    label: 'CLEAR',
    zh: '晴',
  };

  if (code === 0) return { ...base, cloud: apiCloud * 0.42 };
  if (code === 1) return { ...base, label: 'MAINLY CLEAR', zh: '晴间多云' };
  if (code === 2) return { ...base, label: 'PARTLY CLOUDY', zh: '多云' };
  if (code === 3) return { ...base, cloud: Math.max(apiCloud, 0.86), label: 'OVERCAST', zh: '阴' };

  if (code === 45 || code === 48) {
    return { ...base, fog: code === 48 ? 0.92 : 0.7, cloud: Math.max(apiCloud, 0.55), label: 'FOG', zh: '雾' };
  }

  if (code >= 51 && code <= 57) {
    const i = code === 51 ? 0.24 : code === 53 ? 0.44 : 0.62;
    return { ...base, cloud: Math.max(apiCloud, 0.78), precip: i, label: 'DRIZZLE', zh: '毛毛雨' };
  }

  if (code >= 61 && code <= 67) {
    const heavy = code === 65 || code === 67;
    const mid = code === 63;
    return {
      ...base,
      cloud: Math.max(apiCloud, 0.9),
      precip: heavy ? 1 : mid ? 0.68 : 0.42,
      label: heavy ? 'HEAVY RAIN' : mid ? 'RAIN' : 'LIGHT RAIN',
      zh: heavy ? '大雨' : mid ? '中雨' : '小雨',
    };
  }

  if (code >= 80 && code <= 82) {
    const heavy = code === 82;
    return {
      ...base,
      cloud: Math.max(apiCloud, 0.86),
      precip: heavy ? 0.95 : code === 81 ? 0.7 : 0.5,
      thunder: heavy ? 0.35 : 0,
      label: heavy ? 'HEAVY SHOWER' : 'SHOWERS',
      zh: heavy ? '暴雨' : '阵雨',
    };
  }

  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    const heavy = code === 75 || code === 86;
    const mid = code === 73 || code === 85;
    return {
      ...base,
      cloud: Math.max(apiCloud, 0.88),
      snow: heavy ? 1 : mid ? 0.66 : 0.4,
      label: heavy ? 'HEAVY SNOW' : mid ? 'SNOW' : 'LIGHT SNOW',
      zh: heavy ? '大雪' : mid ? '中雪' : '小雪',
    };
  }

  if (code >= 95) {
    return {
      ...base,
      cloud: Math.max(apiCloud, 0.96),
      precip: 0.85,
      thunder: 1,
      label: code >= 96 ? 'HAIL STORM' : 'THUNDERSTORM',
      zh: code >= 96 ? '雷暴冰雹' : '雷雨',
    };
  }

  return base;
}

/** 低温时把降雨折算成雨夹雪/降雪，避免出现"零下下雨"的违和画面 */
export function adjustForTemp(w, temp) {
  if (w.precip <= 0 || w.snow > 0) return w;
  if (temp <= 0.5) {
    return { ...w, precip: 0, snow: w.precip * 0.9, label: 'SNOW', zh: '雪' };
  }
  if (temp <= 2.5) {
    return { ...w, precip: w.precip * 0.55, snow: w.precip * 0.45, label: 'SLEET', zh: '雨夹雪' };
  }
  return w;
}
