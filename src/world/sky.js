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
    const a = pal.star * (0.35 + 0.65 * tw) * s.b;
    if (a < 0.06) continue;
    ctx.fillStyle = rgbaStr(s.warm ? [255, 244, 218] : [226, 238, 255], a);
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
}

export function drawSun(ctx, env) {
  const { sun, pal, w } = env;
  if (sun.alt < -5 || sun.outside) return;
  const vis = clamp((sun.alt + 5) / 7, 0, 1) * (1 - clamp(w.cloud * 0.88, 0, 0.94));
  if (vis < 0.04) return;
  const cx = sun.x;
  const cy = sun.y;
  const r = env.m.moonR || 7;

  const halo = [
    [r + 4, 0.06],
    [r + 2, 0.1],
    [r + 1, 0.15],
  ];
  for (const [rr, a] of halo) disc(ctx, cx, cy, rr, rgbaStr([255, 238, 178], a * vis));

  const core = mix3([255, 244, 202], [255, 214, 150], clamp(1 - pal.amb * 1.4, 0, 1));
  disc(ctx, cx, cy, r, rgbStr(core));
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

  ctx.fillStyle = rgbaStr([214, 226, 246], 0.1 * st.moonGlow);
  disc(ctx, cx, cy, r + 4, rgbaStr([214, 226, 246], 0.09 * st.moonGlow));
  disc(ctx, cx, cy, r + 2, rgbaStr([222, 232, 250], 0.13 * st.moonGlow));

  const body = rgbStr([236, 240, 248]);
  for (let dy = -r; dy <= r; dy++) {
    const h = Math.sqrt(Math.max(0, r * r - dy * dy));
    if (h < 0.5) continue;
    const x0 = waxing ? k * h : -h;
    const x1 = waxing ? h : -k * h;
    const w = x1 - x0;
    if (w < 0.8) continue;
    ctx.fillStyle = body;
    ctx.fillRect(Math.round(cx + x0), Math.round(cy + dy), Math.max(1, Math.round(w)), 1);
  }
}

/** 雨的斜向拉丝需要经过风雨两步偏移，单独实现避免和别的粒子共用逻辑 */
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
