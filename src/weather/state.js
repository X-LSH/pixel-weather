import { approach, clamp } from '../core/math.js';

const START = {
  cloud: 0.18,
  precip: 0,
  snow: 0,
  fog: 0,
  thunder: 0,
  wind: 1.4,
};

const RATE = {
  cloud: 0.24,
  precip: 0.42,
  snow: 0.42,
  fog: 0.3,
  thunder: 0.5,
  wind: 0.22,
};

/**
 * 天气状态机：目标值来自接口，显示值永远滞后并平滑逼近。
 * 于是"雨停了"表现为云慢慢散、雨丝渐渐稀，而不是画面突然换一张。
 */
export function createWeatherState() {
  const cur = { ...START };
  const target = { ...START };
  let temp = 18;
  let tempTarget = 18;

  return {
    cur,
    target,
    get temp() { return temp; },
    label: 'CLEAR',
    lastUpdate: 0,
    offline: true,

    set(w, meta = {}) {
      for (const k of Object.keys(cur)) {
        if (k === 'wind') continue;
        if (typeof w[k] === 'number') target[k] = clamp(w[k], 0, 1.6);
      }
      if (typeof w.wind === 'number') target.wind = clamp(w.wind / 8, 0, 1.4);
      if (typeof meta.temp === 'number') tempTarget = meta.temp;
      if (typeof w.label === 'string') this.label = w.label;
      if (meta.lastUpdate) this.lastUpdate = meta.lastUpdate;
      if (typeof meta.offline === 'boolean') this.offline = meta.offline;
    },

    /** 立即跳到目标值，跳过过渡动画（截图与调试用） */
    snap() {
      for (const k of Object.keys(cur)) cur[k] = target[k];
      temp = tempTarget;
    },

    update(dt) {
      for (const k of Object.keys(cur)) {
        cur[k] = approach(cur[k], target[k], RATE[k], dt);
      }
      temp = approach(temp, tempTarget, 0.5, dt);
    },
  };
}
