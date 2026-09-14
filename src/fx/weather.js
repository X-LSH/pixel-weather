import { clamp, lit, mix3, rgbStr, rgbaStr, makeRng } from '../core/math.js';

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

export function buildPrecip(W, H) {
  const rng = makeRng(5150);
  const mk = (n, cfg) => {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        x: rng() * (W + 20) - 10,
        y: rng() * H,
        sp: cfg.sp[0] + rng() * (cfg.sp[1] - cfg.sp[0]),
        len: cfg.len[0] + rng() * (cfg.len[1] - cfg.len[0]),
        size: cfg.size,
        sw: 0.5 + rng() * 2.2,
        ph: rng() * 6.283,
        a: 0.45 + rng() * 0.55,
      });
    }
    return arr;
  };
  return {
    rainFar: mk(130, { sp: [3.4, 5.4], len: [3, 5], size: 1 }),
    rainNear: mk(90, { sp: [5.6, 8.4], len: [6, 10], size: 1 }),
    snowFar: mk(110, { sp: [0.5, 0.95], len: [0, 0], size: 1 }),
    snowNear: mk(70, { sp: [0.8, 1.5], len: [0, 0], size: 2 }),
  };
}

function cloudTint(env, c) {
  const { pal, w, night } = env;
  const bright = mix3([250, 249, 245], pal.hor, 0.3);
  const heavy = mix3(mix3([104, 112, 132], [34, 38, 60], night), pal.hor, 0.22);
  const dull = clamp(w.cloud * 0.55 + w.precip * 0.5 + w.fog * 0.2, 0, 1);
  let col = mix3(bright, heavy, dull);
  col = lit(col, clamp(pal.amb * 0.85 + 0.3, 0, 1), pal.light);
  col = mix3(col, pal.hor, 0.16 + 0.1 * c.tint);
  return col;
}

export function drawCloudLayer(ctx, env, st, layer) {
  const { m, w, T, wind } = env;
  const speedK = 1 + wind * 0.2;
  for (let i = 0; i < st.clouds.length; i++) {
    const c = st.clouds[i];
    if (c.layer !== layer) continue;
    const vis = clamp((w.cloud - c.need) / 0.26, 0, 1);
    if (vis <= 0.03) continue;

    const spriteW = CLOUD_SPRITE[0].length * c.scale;
    const span = m.W + spriteW * 2;
    const x = ((c.x0 + T * c.sp * speedK * 6) % span + span) % span - spriteW;
    const col = rgbStr(cloudTint(env, c));

    ctx.fillStyle = col;
    ctx.globalAlpha = vis * 0.92;
    const rows = CLOUD_SPRITE.length;
    for (let r = 0; r < rows; r++) {
      const row = CLOUD_SPRITE[r];
      let run = -1;
      for (let k = 0; k <= row.length; k++) {
        const solid = k < row.length && row[k] === '#';
        if (solid && run < 0) run = k;
        if (!solid && run >= 0) {
          ctx.fillRect(
            Math.round(x + run * c.scale),
            Math.round(c.y + r * c.scale),
            (k - run) * c.scale,
            c.scale,
          );
          run = -1;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}

function advance(list, env, cfg) {
  const { m, w, dt } = env;
  const k = dt * 60;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    p.y += p.sp * cfg.fall * k;
    p.x += w.wind * cfg.drift * k + (cfg.sway ? Math.sin(env.T * p.sw + p.ph) * cfg.sway * k : 0);
    if (p.y > m.H + 10) {
      p.y = -cfg.reset;
      p.x = (p.x + m.W * 0.618) % (m.W + 20) - 10;
    }
    if (p.x > m.W + 12) p.x -= m.W + 24;
    if (p.x < -12) p.x += m.W + 24;
  }
}

export function updatePrecip(env, st) {
  advance(st.rainFar, env, { fall: 1, drift: 0.1, reset: 12 });
  advance(st.rainNear, env, { fall: 1.15, drift: 0.14, reset: 14 });
  advance(st.snowFar, env, { fall: 1, drift: 0.07, reset: 8, sway: 0.24 });
  advance(st.snowNear, env, { fall: 1.2, drift: 0.09, reset: 10, sway: 0.36 });
}

export function drawRain(ctx, env, st, near) {
  const { m, w, pal } = env;
  const amount = clamp(w.precip, 0, 1);
  if (amount < 0.04) return;
  const arr = near ? st.rainNear : st.rainFar;
  const count = Math.floor(arr.length * amount);
  const col = rgbaStr(mix3(pal.fogColor, [255, 255, 255], near ? 0.42 : 0.24), near ? 0.5 : 0.3);
  const dx = clamp(w.wind * 0.1, -0.45, 0.45);

  ctx.fillStyle = col;
  for (let i = 0; i < count; i++) {
    const p = arr[i];
    const len = Math.round(p.len * (near ? 1 : 0.8));
    const x0 = Math.round(p.x);
    const y0 = Math.round(p.y);
    for (let s = 0; s < len; s++) {
      const x = Math.round(x0 + s * dx);
      if (x < 0 || x >= m.W) continue;
      ctx.fillRect(x, y0 + s, 1, 1);
    }
  }
}

export function drawSnow(ctx, env, st, near) {
  const { m, w, pal } = env;
  const amount = clamp(w.snow, 0, 1);
  if (amount < 0.04) return;
  const arr = near ? st.snowNear : st.snowFar;
  const count = Math.floor(arr.length * amount);
  const base = mix3(pal.fogColor, [255, 255, 255], near ? 0.72 : 0.5);

  for (let i = 0; i < count; i++) {
    const p = arr[i];
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x < 0 || x >= m.W || y < 0 || y >= m.H) continue;
    ctx.fillStyle = rgbaStr(base, (near ? 0.9 : 0.66) * p.a);
    ctx.fillRect(x, y, p.size, p.size);
  }
}

let fogKey = '';
let fogLines = null;

/** 雾按行连续渐变：上浓下淡。整行绘制而非分带，否则会露出明显的横向条纹 */
export function drawFog(ctx, env, st) {
  const { m, pal, w } = env;
  const fog = clamp(w.fog, 0, 1);
  const base = 0.05 + fog * 0.44 + w.precip * 0.06;
  if (base < 0.006) return;
  const col = mix3(pal.fogColor, [255, 255, 255], 0.12);

  const key = `${col[0] | 0},${col[1] | 0},${col[2] | 0},${base.toFixed(3)},${m.H}`;
  if (key !== fogKey) {
    fogKey = key;
    fogLines = [];
    for (let y = 0; y < m.H; y++) {
      const a = base * (1 - (y / m.H) * 0.66);
      fogLines.push(a < 0.005 ? null : rgbaStr(col, a));
    }
  }

  for (let y = 0; y < m.H; y++) {
    const c = fogLines[y];
    if (!c) continue;
    ctx.fillStyle = c;
    ctx.fillRect(0, y, m.W, 1);
  }

  if (fog > 0.28) {
    const drift = env.T * 3.4;
    ctx.fillStyle = rgbaStr(mix3(col, [255, 255, 255], 0.2), (fog - 0.28) * 0.15);
    for (let i = 0; i < 5; i++) {
      const span = m.W + 130;
      const band = ((drift * (0.4 + i * 0.13) + i * 61) % span + span) % span - 65;
      const y = Math.round(m.horizonY - 4 + i * 6);
      ctx.fillRect(Math.round(band), y, Math.max(10, 100 - i * 11), 2);
    }
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
