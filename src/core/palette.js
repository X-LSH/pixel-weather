import { clamp, invLerp, mix3, desat, scale3 } from './math.js';

/**
 * 天色关键帧，按太阳高度角从高到低排列。
 * 每一帧给出天顶色、中天区色、地平线色、环境光色，以及星星可见度与环境亮度。
 * 配色走治愈系路线：夜幕是深蓝紫而非死黑，黄昏保留大量暖橙，这样画面始终"透气"。
 */
const KEYS = [
  { alt: 72, zen: [110, 168, 234], mid: [166, 206, 240], hor: [216, 234, 244], light: [255, 251, 242], amb: 1.00, star: 0 },
  { alt: 34, zen: [100, 160, 231], mid: [156, 201, 239], hor: [208, 229, 243], light: [255, 249, 235], amb: 0.98, star: 0 },
  { alt: 12, zen: [90, 145, 223], mid: [174, 195, 234], hor: [240, 216, 187], light: [255, 240, 216], amb: 0.91, star: 0 },
  { alt: 3.5, zen: [76, 114, 206], mid: [172, 150, 208], hor: [253, 181, 132], light: [255, 221, 178], amb: 0.79, star: 0 },
  { alt: -1.5, zen: [60, 84, 170], mid: [143, 110, 180], hor: [247, 137, 107], light: [255, 193, 152], amb: 0.63, star: 0.06 },
  { alt: -6.5, zen: [39, 52, 128], mid: [95, 82, 152], hor: [152, 102, 141], light: [186, 158, 197], amb: 0.43, star: 0.34 },
  { alt: -13, zen: [20, 28, 78], mid: [47, 53, 110], hor: [80, 73, 134], light: [124, 133, 182], amb: 0.27, star: 0.74 },
  { alt: -34, zen: [10, 15, 47], mid: [26, 32, 78], hor: [46, 48, 103], light: [97, 107, 159], amb: 0.19, star: 1 },
];

const OVERCAST_DAY = [123, 129, 141];
const OVERCAST_NIGHT = [38, 44, 64];

/** 按太阳高度角在关键帧之间连续插值，得到此刻的天色 */
export function sampleSky(alt) {
  if (alt >= KEYS[0].alt) return { ...KEYS[0] };
  const last = KEYS[KEYS.length - 1];
  if (alt <= last.alt) return { ...last };

  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i];
    const b = KEYS[i + 1];
    if (alt <= a.alt && alt >= b.alt) {
      const t = invLerp(a.alt, b.alt, alt);
      return {
        zen: mix3(a.zen, b.zen, t),
        mid: mix3(a.mid, b.mid, t),
        hor: mix3(a.hor, b.hor, t),
        light: mix3(a.light, b.light, t),
        amb: a.amb + (b.amb - a.amb) * t,
        star: a.star + (b.star - a.star) * t,
        alt,
      };
    }
  }
  return { ...last };
}

/**
 * 把云量、降水、雾折算进天色。
 * 阴雨天不是单纯变灰，而是同时降饱和、压暗、并把地平线拉向雾色，
 * 这样"天气变了"这件事在画面上是可读的。
 */
export function applyWeather(pal, w) {
  const cloud = clamp(w.cloud, 0, 1);
  const precip = clamp(w.precip, 0, 1);
  const fog = clamp(w.fog, 0, 1);

  const overcast = clamp(cloud * 0.86 + precip * 0.46 + fog * 0.3, 0, 1);
  const nightT = 1 - clamp(pal.amb * 2.3, 0, 1);
  const base = mix3(OVERCAST_DAY, OVERCAST_NIGHT, nightT);

  let zen = pal.zen;
  let mid = pal.mid;
  let hor = pal.hor;
  let light = pal.light;

  if (overcast > 0.001) {
    zen = mix3(zen, mix3(zen, desat(base, 0.2), 0.68), overcast);
    mid = mix3(mid, mix3(mid, desat(base, 0.25), 0.7), overcast);
    hor = mix3(hor, mix3(hor, desat(base, 0.15), 0.5), overcast);
    light = mix3(light, mix3(light, base, 0.52), overcast);
  }

  const dim = 1 - precip * 0.17 - fog * 0.14 - cloud * 0.07;
  zen = scale3(zen, dim);
  mid = scale3(mid, dim);
  hor = scale3(hor, dim);
  light = scale3(light, 1 - precip * 0.12 - fog * 0.08);

  return {
    zen,
    mid,
    hor,
    light,
    amb: clamp(pal.amb * (1 - precip * 0.15 - fog * 0.2 - cloud * 0.1), 0.06, 1),
    star: pal.star * (1 - Math.min(1, cloud * 1.4)) * (1 - fog * 0.9),
    fogColor: mix3(hor, [255, 255, 255], 0.22),
    alt: pal.alt,
  };
}

/** 天空纵向取色：靠近地平线变化更快，形成像素画特有的色带层次 */
export function skyBand(pal, y, horizonY) {
  const t = Math.pow(clamp(y / Math.max(1, horizonY), 0, 1), 1.32);
  return t < 0.56
    ? mix3(pal.zen, pal.mid, t / 0.56)
    : mix3(pal.mid, pal.hor, (t - 0.56) / 0.44);
}
