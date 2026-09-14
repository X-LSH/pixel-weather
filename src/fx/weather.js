import { clamp, lit, mix3, rgbStr, rgbaStr, makeRng } from '../core/math.js';
import { mats } from '../core/pixel.js';

const CLOUD_SPRITE = [
  '     ####      ',
  '   ########    ',
  '  ###########  ',
  ' ##############',
  '###############',
  ' ############# ',
];

const RAINBOW = [
  [236, 118, 108],
  [244, 162, 96],
  [246, 216, 128],
  [150, 212, 146],
  [128, 182, 234],
  [156, 146, 224],
];

export function buildClouds(W, m) {
  const rng = makeRng(90210);
  const clouds = [];
  for (let i = 0; i < 18; i++) {
    const layer = Math.floor(rng() * 3);
    clouds.push({
      x0: rng() * (W + 90) - 45,
      y: Math.round(10 + rng() * (m.horizonY * 0.74)),
      scale: layer === 0 ? 1 : layer === 1 ? 2 : 2 + Math.floor(rng() * 2),
      layer,
      sp: 0.5 + layer * 0.85 + rng() * 0.5,
      need: layer === 0 ? 0.05 : layer === 1 ? 0.22 : 0.46,
      tint: rng(),
    });
  }
  return clouds;
}

export function buildStars(W, m) {
  const rng = makeRng(31337);
  const stars = [];
  const n = Math.round((W * m.horizonY) / 260);
  for (let i = 0; i < n; i++) {
    stars.push({
      x: Math.round(rng() * W),
      y: Math.round(rng() * m.horizonY * 0.94),
      s: rng() < 0.12 ? 2 : 1,
      b: 0.35 + rng() * 0.65,
      sp: 0.5 + rng() * 2.2,
      ph: rng() * 6.283,
      warm: rng() < 0.22,
    });
  }
  return stars;
}

export function buildCityLights(W, m) {
  const rng = makeRng(6060);
  const lamps = [];
  const cars = [];
  const span = Math.max(6, m.railBottom - m.horizonY);
  for (let i = 0; i < Math.round(W / 5); i++) {
    lamps.push({
      x: Math.round(rng() * W),
      dy: Math.round(rng() * span),
      w: rng() < 0.2 ? 2 : 1,
      h: 1,
      b: 0.35 + rng() * 0.6,
      warm: rng() < 0.72,
    });
  }
  for (let i = 0; i < Math.round(W / 22); i++) {
    cars.push({
      x: rng() * W,
      dy: Math.round(rng() * span),
      sp: (rng() < 0.5 ? -1 : 1) * (14 + rng() * 26),
      warm: rng() < 0.7,
    });
  }
  return { lamps, cars };
}

export function buildPrecip(W, H, m) {
  const rng = makeRng(5150);

  // 雨：1px 宽 × 3px 高的线性粒子。池子按上限 120 预生成，实际用量由强度决定
  const rain = [];
  for (let i = 0; i < 120; i++) {
    rain.push({
      x: rng() * (W + 24) - 12,
      y: rng() * H,
      sp: 5.2 + rng() * 2.8,
    });
  }

  // 雪：单像素粒子，横向做正弦摆动，落地后停留 2~3 帧再消失
  const snow = [];
  for (let i = 0; i < 100; i++) {
    snow.push({
      x: rng() * (W + 20) - 10,
      y: rng() * H,
      sp: 0.45 + rng() * 0.8,
      sw: 0.6 + rng() * 2.4,
      ph: rng() * 6.283,
      a: 0.6 + rng() * 0.4,
      land: 0,
    });
  }

  // 雾：不做粒子，用天空层上一组低透明度横向条纹缓慢水平漂移
  const groundTop = m ? m.groundTop : Math.round(H * 0.8);
  const fogBands = [];
  for (let i = 0; i < 26; i++) {
    fogBands.push({
      x0: rng() * (W + 140) - 70,
      y: Math.round(rng() * groundTop),
      len: 30 + Math.round(rng() * 78),
      h: 1 + Math.round(rng() * 2),
      sp: 1.3 + rng() * 3.6,
      a: 0.12 + rng() * 0.26,
    });
  }

  // 晴天光斑：暖色椭圆，缓慢水平漂移，模拟阳光穿过枝叶洒下的斑
  const skyH = m ? m.horizonY : Math.round(H * 0.6);
  const sunSpots = [];
  for (let i = 0; i < 5; i++) {
    sunSpots.push({
      x0: rng() * (W + 180) - 90,
      y: Math.round(skyH * (0.08 + rng() * 0.78)),
      rx: 15 + Math.round(rng() * 26),
      ry: 6 + Math.round(rng() * 10),
      sp: 1.1 + rng() * 2.4,
      ph: rng() * 6.283,
      a: 0.1 + rng() * 0.1,
    });
  }

  const splashes = [];
  for (let i = 0; i < 46; i++) {
    splashes.push({ x: rng() * W, y: rng(), ph: rng(), max: 2 + rng() * 5 });
  }
  const birds = [];
  for (let i = 0; i < 3; i++) {
    birds.push({
      x0: rng() * (W + 80) - 40,
      sp: 3 + rng() * 4,
      y: Math.round(H * (0.07 + rng() * 0.15)),
      flap: 1.6 + rng() * 1.8,
      ph: rng() * 6.283,
    });
  }

  return { rain, snow, fogBands, sunSpots, splashes, birds };
}

function cloudPalette(env) {
  const { pal, w, night } = env;
  const dull = clamp(w.cloud * 0.5 + w.precip * 0.55 + w.fog * 0.2, 0, 1);
  const bright = mix3([252, 253, 255], pal.hor, 0.16);
  const stormy = mix3(mix3([120, 130, 154], [32, 38, 60], night), pal.hor, 0.24);
  return mats(mix3(bright, stormy, dull), pal, { hi: 0.36, sh: 0.24, line: 0.48 });
}

/** 云：1px 轮廓 + 上缘高光 + 下缘暗面，把它从"色块"变成有体积的团 */
function drawCloudShape(ctx, x, y, scale, M, vis) {
  const rows = CLOUD_SPRITE.length;
  const runs = [];
  for (let r = 0; r < rows; r++) {
    const row = CLOUD_SPRITE[r];
    let start = -1;
    for (let k = 0; k <= row.length; k++) {
      const solid = k < row.length && row[k] === '#';
      if (solid && start < 0) start = k;
      if (!solid && start >= 0) {
        runs.push({ r, a: start, b: k });
        start = -1;
      }
    }
  }
  if (!runs.length) return;
  const maxR = Math.max(...runs.map((q) => q.r));

  ctx.globalAlpha = vis;
  ctx.fillStyle = M.line;
  for (const run of runs) {
    ctx.fillRect(
      Math.round(x + run.a * scale) - 1,
      Math.round(y + run.r * scale) - 1,
      (run.b - run.a) * scale + 2,
      scale + 2,
    );
  }
  ctx.fillStyle = M.base;
  for (const run of runs) {
    ctx.fillRect(Math.round(x + run.a * scale), Math.round(y + run.r * scale), (run.b - run.a) * scale, scale);
  }
  ctx.fillStyle = M.sh;
  for (const run of runs) {
    if (run.r < maxR - 1) continue;
    ctx.fillRect(Math.round(x + run.a * scale), Math.round(y + run.r * scale), (run.b - run.a) * scale, scale);
  }
  ctx.fillStyle = M.hi;
  for (const run of runs) {
    if (run.r > 1) continue;
    ctx.fillRect(Math.round(x + run.a * scale), Math.round(y + run.r * scale), Math.max(1, (run.b - run.a) * scale), 1);
  }
  ctx.globalAlpha = 1;
}

export function drawCloudLayer(ctx, env, st, layer) {
  const { m, w, T, wind } = env;
  const speedK = 1 + wind * 0.2;
  const M = cloudPalette(env);

  for (let i = 0; i < st.clouds.length; i++) {
    const c = st.clouds[i];
    if (c.layer !== layer) continue;
    const vis = clamp((w.cloud - c.need) / 0.24, 0, 1);
    if (vis <= 0.03) continue;

    const spriteW = CLOUD_SPRITE[0].length * c.scale;
    const span = m.W + spriteW * 2;
    const x = ((c.x0 + T * c.sp * speedK * 6) % span + span) % span - spriteW;
    drawCloudShape(ctx, x, c.y, c.scale, M, vis * 0.95);
  }
}

export function updatePrecip(env, st) {
  const { m, w, dt } = env;
  const k = dt * 60;

  for (const p of st.rain) {
    p.y += p.sp * k;
    p.x += w.wind * 0.24 * k;
    if (p.y > m.H + 6) {
      p.y = -6;
      p.x = (p.x + m.W * 0.618) % (m.W + 24) - 12;
    }
    if (p.x > m.W + 14) p.x -= m.W + 28;
    if (p.x < -14) p.x += m.W + 28;
  }

  for (const p of st.snow) {
    if (p.land > 0) {
      p.land -= k;
      if (p.land <= 0) {
        p.y = -4;
        p.x = (p.x + m.W * 0.618) % (m.W + 20) - 10;
      }
      continue;
    }
    p.y += p.sp * k;
    p.x += Math.sin(env.T * p.sw + p.ph) * 0.55 * k + w.wind * 0.1 * k;
    if (p.y >= m.groundTop) {
      p.y = m.groundTop;
      p.land = 2 + (p.ph % 2 > 1 ? 1 : 0);
    }
    if (p.x > m.W + 12) p.x -= m.W + 24;
    if (p.x < -12) p.x += m.W + 24;
  }
}

const RAIN_RGB = [176, 196, 206];
const RAIN_ALPHA = 0.26;

/** 雨：1px 宽 × 3px 高的线性粒子，斜向下落，数量随强度在 60~120 之间 */
export function drawRain(ctx, env, st) {
  const { m, w } = env;
  const amt = clamp(w.precip, 0, 1);
  if (amt < 0.03) return;

  const count = Math.round(60 + amt * 60);
  const dx = clamp(0.3 + w.wind * 0.18, 0.12, 0.78);
  ctx.fillStyle = rgbaStr(RAIN_RGB, RAIN_ALPHA);

  for (let i = 0; i < count; i++) {
    const p = st.rain[i];
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (y < -4 || y > m.H) continue;
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(Math.round(x + dx), y + 1, 1, 1);
    ctx.fillRect(Math.round(x + dx * 2), y + 2, 1, 1);
  }
}

/** 雪：单像素粒子，横向正弦摆动；落地后停留 2~3 帧再消失 */
export function drawSnow(ctx, env, st) {
  const { m, w } = env;
  const amt = clamp(w.snow, 0, 1);
  if (amt < 0.03) return;

  const count = Math.round(48 + amt * 52);
  for (let i = 0; i < count; i++) {
    const p = st.snow[i];
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x < 0 || x >= m.W || y < -2 || y >= m.H) continue;
    const landed = p.land > 0;
    const a = (landed ? 0.95 : 0.72) * p.a * (0.42 + amt * 0.58);
    ctx.fillStyle = rgbaStr([244, 248, 255], a);
    ctx.fillRect(x, y, 1, 1);
  }
}

function fillEllipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    const t = 1 - (dy * dy) / (ry * ry);
    if (t <= 0) continue;
    const h = Math.sqrt(t) * rx;
    ctx.fillRect(Math.round(cx - h), Math.round(cy + dy), Math.max(1, Math.round(h * 2)), 1);
  }
}

/** 晴天光斑：天空层上几个缓慢移动的暖色椭圆，模拟阳光穿过枝叶洒下的斑 */
export function drawSunSpots(ctx, env, st) {
  const { m, w, night, T } = env;
  const clear = clamp(1 - w.cloud * 1.35 - w.precip * 1.6 - w.fog * 1.3, 0, 1);
  if (clear < 0.2 || night > 0.45) return;

  for (const s of st.sunSpots) {
    const span = m.W + s.rx * 4;
    const x = ((s.x0 + T * s.sp) % span + span) % span - s.rx * 2;
    const y = s.y + Math.sin(T * 0.22 + s.ph) * 3;
    const base = s.a * clear;
    fillEllipse(ctx, x, y, s.rx * 1.4, s.ry * 1.6, rgbaStr([255, 222, 146], base * 0.42));
    fillEllipse(ctx, x - s.rx * 0.18, y - 1, s.rx, s.ry, rgbaStr([255, 234, 178], base * 0.8));
    fillEllipse(ctx, x - s.rx * 0.3, y - 2, s.rx * 0.55, s.ry * 0.5, rgbaStr([255, 246, 214], base));
  }
}

/** 雾：不做粒子，而是在天空层叠一组低透明度横向条纹，缓慢水平漂移 */
export function drawFog(ctx, env, st) {
  const { m, pal, w, T } = env;
  const fog = clamp(w.fog, 0, 1);
  if (fog < 0.04) return;
  const col = mix3(pal.fogColor, [255, 255, 255], 0.1);

  // 浓雾时整体压一层，保证远景真的被吃掉
  if (fog > 0.25) {
    ctx.fillStyle = rgbaStr(col, (fog - 0.25) * 0.52);
    ctx.fillRect(0, 0, m.W, m.H);
  }

  for (const b of st.fogBands) {
    const span = m.W + b.len * 2;
    const x = ((b.x0 + T * b.sp) % span + span) % span - b.len;
    ctx.fillStyle = rgbaStr(col, b.a * fog * 1.7);
    ctx.fillRect(Math.round(x), b.y, b.len, b.h);
  }
}

export function drawRainbow(ctx, env, st) {
  if (st.rainbow <= 0.02) return;
  const { m } = env;
  const cx = m.W * 0.5;
  const cy = m.horizonY + 10;
  const r0 = m.H * 0.52;
  const alpha = st.rainbow * 0.52;

  for (let b = 0; b < RAINBOW.length; b++) {
    const R = r0 + b * 4;
    ctx.fillStyle = rgbaStr(RAINBOW[b], alpha);
    for (let y = 0; y < m.horizonY; y++) {
      const dy = y - cy;
      const s = R * R - dy * dy;
      if (s <= 0) continue;
      const dx = Math.sqrt(s);
      const xa = Math.max(0, Math.round(cx - dx));
      const xb = Math.min(m.W, Math.round(cx + dx));
      if (xb <= xa) continue;
      ctx.fillRect(xa, y, xb - xa, 1);
    }
  }
}

export function drawLightning(ctx, env, st) {
  const { m } = env;
  if (st.flash > 0.01) {
    ctx.fillStyle = rgbaStr([238, 242, 255], st.flash * 0.5);
    ctx.fillRect(0, 0, m.W, m.H);
  }
  if (st.boltLife > 0 && st.boltPath.length) {
    const a = Math.min(1, st.boltLife) * 0.85;
    ctx.fillStyle = rgbaStr([255, 252, 226], a);
    for (const seg of st.boltPath) {
      const steps = Math.max(Math.abs(seg.x1 - seg.x0), Math.abs(seg.y1 - seg.y0));
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        ctx.fillRect(Math.round(seg.x0 + (seg.x1 - seg.x0) * t), Math.round(seg.y0 + (seg.y1 - seg.y0) * t), 1, 1);
      }
    }
  }
}

/** 雨滴落地的涟漪：扩散即消失，雨天最能让画面"活"起来的细节之一 */
export function drawSplash(ctx, env, st) {
  const { m, w, pal } = env;
  const amt = clamp(w.precip, 0, 1);
  if (amt < 0.18) return;
  const groundH = m.H - m.groundTop;
  const col = mix3(pal.hor, [255, 255, 255], 0.55);

  for (const s of st.splashes) {
    const ph = (env.T * 0.9 + s.ph) % 1;
    const r = 1 + ph * s.max;
    const a = (1 - ph) * 0.78 * amt;
    if (a < 0.05) continue;
    ctx.fillStyle = rgbaStr(col, a);
    const cx = Math.round(s.x);
    const cy = Math.round(m.groundTop + 3 + s.y * Math.max(4, groundH - 5));
    const rw = Math.max(1, Math.round(r * 1.7));
    const rh = Math.max(1, Math.round(r * 0.5));
    ctx.fillRect(cx - rw, cy, rw * 2, 1);
    ctx.fillRect(cx - rw, cy - rh, 1, rh);
    ctx.fillRect(cx + rw, cy - rh, 1, rh);
  }
}

/** 晴天的飞鸟：给静态画面一个活物，只在一侧掠过 */
export function drawBirds(ctx, env, st) {
  const { m, night, w } = env;
  if (night > 0.45 || w.cloud > 0.72 || w.precip > 0.25 || w.fog > 0.4) return;
  const span = m.W + 80;
  for (const b of st.birds) {
    const x = (((b.x0 + env.T * b.sp) % span) + span) % span - 40;
    const y = b.y + Math.sin(env.T * b.flap + b.ph) * 1.5;
    const flap = Math.sin(env.T * 7 + b.ph) > 0 ? 1 : -1;
    ctx.fillStyle = rgbaStr([54, 64, 86], 0.72);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    ctx.fillRect(Math.round(x) - 2, Math.round(y) - flap, 2, 1);
    ctx.fillRect(Math.round(x) + 1, Math.round(y) - flap, 2, 1);
  }
}

export function updateLightning(env, st) {
  const { w, m, dt } = env;
  st.flash = Math.max(0, st.flash - dt * 6);
  st.boltLife = Math.max(0, st.boltLife - dt * 7);
  st.rainbow = clamp(st.rainbow + dt * (st.rainbowTarget - st.rainbow) * 0.4, 0, 1);

  if (w.thunder < 0.2) {
    st.nextBolt = Math.min(st.nextBolt, 2.2);
    return;
  }
  st.nextBolt -= dt;
  if (st.nextBolt > 0) return;

  st.nextBolt = 2.4 + Math.random() * 5.2;
  st.flash = 0.55 + Math.random() * 0.45;
  const x0 = Math.round(m.W * (0.15 + Math.random() * 0.7));
  const y0 = Math.round(m.horizonY * (0.1 + Math.random() * 0.3));
  const path = [];
  let x = x0;
  let y = y0;
  const target = m.horizonY - 4;
  while (y < target) {
    const nx = x + (Math.random() - 0.5) * 14;
    const ny = y + 5 + Math.random() * 8;
    path.push({ x0: x, y0: y, x1: nx, y1: Math.min(ny, target) });
    x = nx;
    y = ny;
  }
  st.boltPath = path;
  st.boltLife = 0.55;
}
