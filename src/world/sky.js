import { clamp, mix3, rgbStr, rgbaStr } from '../core/math.js';
import { skyBand } from '../core/palette.js';

let bandCache = [];
let bandKey = '';

function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  const R = Math.ceil(r);
  for (let dy = -R; dy <= R; dy++) {
    const h = Math.sqrt(Math.max(0, r * r - dy * dy));
    if (h < 0.5) continue;
    ctx.fillRect(Math.round(cx - h), Math.round(cy + dy), Math.max(1, Math.round(h * 2)), 1);
  }
}

/** 天空用 1 像素高的色带堆出来 —— 像素画特有的 banding 层次，比平滑渐变更有质感 */
export function drawSky(ctx, env) {
  const { m, pal } = env;
  const key = `${m.W}/${m.cityBase}/${rgbStr(pal.zen)}|${rgbStr(pal.mid)}|${rgbStr(pal.hor)}`;
  if (key !== bandKey) {
    bandKey = key;
    const bands = [];
    for (let y = 0; y < m.cityBase; y++) {
      const c = rgbStr(skyBand(pal, y, m.cityBase));
      if (bands.length && bands[bands.length - 1].c === c) continue;
      bands.push({ y, c });
    }
    bandCache = bands;
  }
  for (let i = 0; i < bandCache.length; i++) {
    const b = bandCache[i];
    const end = i + 1 < bandCache.length ? bandCache[i + 1].y : m.cityBase;
    ctx.fillStyle = b.c;
    ctx.fillRect(0, b.y, m.W, end - b.y);
  }
}

export function drawStars(ctx, env) {
  const { pal, st, T } = env;
  if (pal.star < 0.12) return;
  for (let i = 0; i < st.stars.length; i++) {
    const s = st.stars[i];
    const tw = 0.5 + 0.5 * Math.sin(T * s.sp + s.ph);
    const a = clamp(pal.star * (0.4 + 0.6 * tw) * s.b * 1.4, 0, 1);
    if (a < 0.06) continue;
    const col = s.warm ? [255, 246, 212] : [228, 240, 255];
    ctx.fillStyle = rgbaStr(col, a);
    ctx.fillRect(s.x, s.y, s.s, s.s);
    if (s.s >= 2 && a > 0.6) {
      ctx.fillStyle = rgbaStr(col, a * 0.4);
      ctx.fillRect(s.x - 1, s.y, 1, 1);
      ctx.fillRect(s.x + s.s, s.y, 1, 1);
      ctx.fillRect(s.x, s.y - 1, 1, 1);
      ctx.fillRect(s.x, s.y + s.s, 1, 1);
    }
  }
}

export function drawSun(ctx, env) {
  const { sun, pal, w } = env;
  if (sun.alt < -5 || sun.outside) return;
  const vis = clamp((sun.alt + 5) / 7, 0, 1) * clamp(1 - w.cloud * 1.25, 0, 1);
  if (vis < 0.04) return;
  const cx = sun.x;
  const cy = sun.y;
  const r = env.m.moonR || 7;

  const halo = [
    [r + 10, 0.05],
    [r + 7, 0.07],
    [r + 5, 0.1],
    [r + 3, 0.16],
    [r + 1, 0.28],
  ];
  for (const [rr, a] of halo) disc(ctx, cx, cy, rr, rgbaStr([255, 224, 136], a * vis));

  disc(ctx, cx, cy, r, rgbStr([255, 234, 150]));
  disc(ctx, cx, cy, Math.max(1, r - 2), rgbStr([255, 252, 226]));
}

/** 按真实月相画月亮：用外缘圆与终止线椭圆的交叠逐行求亮部 */
export function drawMoon(ctx, env) {
  const { moon, st } = env;
  if (!moon.visible || st.moonGlow < 0.22) return;
  const r = moon.r;
  const k = Math.cos(moon.phase * Math.PI * 2);
  const waxing = moon.phase <= 0.5;
  const cx = Math.round(moon.x);
  const cy = Math.round(moon.y);

  disc(ctx, cx, cy, r + 7, rgbaStr([210, 224, 250], 0.05 * st.moonGlow));
  disc(ctx, cx, cy, r + 4, rgbaStr([216, 228, 250], 0.08 * st.moonGlow));
  disc(ctx, cx, cy, r + 2, rgbaStr([226, 236, 252], 0.13 * st.moonGlow));

  const line = rgbaStr([118, 136, 176], 0.85 * st.moonGlow);
  const body = rgbStr([246, 250, 255]);
  const crater = rgbaStr([192, 206, 232], 0.8 * st.moonGlow);

  for (let dy = -r; dy <= r; dy++) {
    const h = Math.sqrt(Math.max(0, r * r - dy * dy));
    if (h < 0.5) continue;
    const x0 = waxing ? k * h : -h;
    const x1 = waxing ? h : -k * h;
    const w = x1 - x0;
    if (w < 0.8) continue;
    const px = Math.round(cx + x0);
    const pw = Math.max(1, Math.round(w));
    ctx.fillStyle = line;
    ctx.fillRect(px - 1, Math.round(cy + dy), pw + 2, 1);
    ctx.fillStyle = body;
    ctx.fillRect(px, Math.round(cy + dy), pw, 1);
  }

  if (r >= 5) {
    ctx.fillStyle = crater;
    ctx.fillRect(cx - Math.round(r * 0.42), cy - Math.round(r * 0.34), 2, 2);
    ctx.fillRect(cx + Math.round(r * 0.12), cy + Math.round(r * 0.18), 2, 1);
    ctx.fillRect(cx - Math.round(r * 0.14), cy + Math.round(r * 0.5), 1, 1);
  }
}

/** 雨的斜向拉丝需要经过风雨两步偏移，单独实现避免和别的粒子共用逻辑 */
/**
 * 楼群之上的阳光散射层。
 * 太阳升到 28° 以上才会完全越过楼顶，此前本体一直被楼挡住 ——
 * 于是日出日落那两段最美的时刻反而什么都看不到。这一层把阳光的散射画在城市之上，
 * 高度越低散射越暖越强，日落时城市背后会透出一片橘光。
 */
export function drawSunGlow(ctx, env) {
  const { sun, w } = env;
  if (sun.alt < -9) return;
  const vis = clamp((sun.alt + 9) / 12, 0, 1) * clamp(1 - w.cloud * 1.2, 0, 1);
  if (vis < 0.05) return;

  const low = 1 - clamp(sun.alt / 42, 0, 1);
  const strength = 0.18 + low * 0.72;
  const r = env.m.moonR || 7;
  const cx = sun.x;
  const cy = Math.min(env.m.railTop, sun.y);

  const layers = [
    [r + 20, 0.045],
    [r + 13, 0.06],
    [r + 7, 0.085],
  ];
  for (const [rr, a] of layers) {
    disc(ctx, cx, cy, rr, rgbaStr([255, 208, 128], a * vis * strength));
  }
}

export function drawCloudShadow(ctx, env) {
  const { m, pal, w } = env;
  if (w.cloud < 0.2) return;
  const a = (w.cloud - 0.2) * 0.28;
  const ctxH = Math.round(m.cityBase * 0.5);
  for (let y = ctxH; y < m.cityBase; y++) {
    const t = (y - ctxH) / Math.max(1, m.cityBase - ctxH);
    ctx.fillStyle = rgbaStr(mix3(pal.hor, [0, 0, 0], 0.35), a * t);
    ctx.fillRect(0, y, m.W, 1);
  }
}
