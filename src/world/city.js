import { clamp, lit, mix3, rgbStr, rgbaStr, makeRng, smoothstep } from '../core/math.js';

/**
 * 生成一排高低错落的楼群。
 * 尺寸全部用画面比例表达，横屏与竖屏才能各自得到合理的城市密度。
 */
export function buildTowers(seed, W, m, cfg) {
  const rng = makeRng(seed);
  const towers = [];
  const targetCount = clamp(Math.round(W / cfg.density), 5, 20);
  const avgW = W / targetCount;
  const hBase = Math.sqrt(W * m.horizonY);
  let x = -Math.round(avgW * 0.5);
  while (x < W + 10) {
    const bw = Math.max(5, Math.round(avgW * (0.42 + rng() * 1.3)));
    const bh = Math.max(8, Math.round(hBase * (cfg.minHR + rng() * (cfg.maxHR - cfg.minHR))));
    const top = m.horizonY - bh;
    const kind = rng();

    const tower = {
      x,
      w: bw,
      top,
      h: bh,
      bulk: kind < 0.14,
      tank: kind >= 0.14 && kind < 0.26,
      step: bw > 14 && kind >= 0.26 && kind < 0.42,
      antenna: rng() < cfg.antenna,
      light: rng() < 0.12,
      wins: [],
    };

    const cols = Math.max(1, Math.floor((bw - 3) / 4));
    const rows = Math.max(1, Math.floor((bh - 5) / 5));
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if (rng() > cfg.winDensity) continue;
        tower.wins.push({
          x: x + 2 + cx * 4,
          y: top + 4 + cy * 5,
          on: rng() < 0.55,
          ph: rng() * 6.283,
        });
      }
    }
    towers.push(tower);
    x += bw + Math.round(avgW * (0.08 + rng() * 0.34));
  }
  return towers;
}

function paintTower(ctx, t, botY, fill, roofFill, edgeFill, sunFill) {
  const h = botY - t.top;
  ctx.fillStyle = fill;
  ctx.fillRect(t.x, t.top, t.w, h);

  ctx.fillStyle = sunFill;
  ctx.fillRect(t.x, t.top, 1, h);
  ctx.fillStyle = edgeFill;
  ctx.fillRect(t.x + t.w - 1, t.top, 1, h);

  ctx.fillStyle = roofFill;
  if (t.bulk) {
    ctx.fillRect(t.x + Math.round(t.w * 0.28), t.top - 4, Math.max(2, Math.round(t.w * 0.44)), 4);
  } else if (t.tank) {
    ctx.fillRect(t.x + Math.round(t.w * 0.2), t.top - 5, Math.max(2, Math.round(t.w * 0.32)), 3);
    ctx.fillRect(t.x + Math.round(t.w * 0.58), t.top - 3, Math.max(2, Math.round(t.w * 0.22)), 2);
  } else if (t.step) {
    ctx.fillRect(t.x + 2, t.top - 3, t.w - 4, 3);
    ctx.fillRect(t.x + 5, t.top - 6, Math.max(2, t.w - 10), 3);
  } else {
    ctx.fillRect(t.x, t.top - 1, t.w, 1);
  }
  if (t.antenna) {
    const ah = Math.max(4, Math.round(t.h * 0.05));
    ctx.fillRect(t.x + Math.round(t.w * 0.68), t.top - ah, 1, ah);
  }
}

/**
 * 城市天际线：靠雾化程度制造纵深，靠屋顶结构打散单调的矩形轮廓。
 * 雾化是向"当前天色的雾色"混合，所以同一座城市在清晨、黄昏、雨天会自动呈现不同色温。
 */
export function drawCity(ctx, env, st) {
  const { m, pal, night } = env;
  const botY = m.railBottom + 3;
  const layers = [
    { towers: st.towersFar, fog: 0.54, base: [106, 116, 142] },
    { towers: st.towersMid, fog: 0.18, base: [72, 82, 110] },
  ];

  for (const layer of layers) {
    const baseCol = mix3(layer.base, [44, 50, 80], night * 0.88);
    const col = lit(baseCol, pal.amb, pal.light);
    const fill = rgbStr(mix3(col, pal.fogColor, layer.fog));
    const roofFill = rgbStr(mix3(mix3(col, [0, 0, 0], 0.24), pal.fogColor, layer.fog));
    const edgeFill = rgbStr(mix3(mix3(col, [0, 0, 0], 0.4), pal.fogColor, layer.fog));
    const sunFill = rgbStr(mix3(mix3(col, [255, 255, 255], 0.14), pal.fogColor, layer.fog));

    for (const t of layer.towers) paintTower(ctx, t, botY, fill, roofFill, edgeFill, sunFill);
  }

  if (night > 0.06) {
    for (const layer of layers) {
      for (const t of layer.towers) {
        for (const win of t.wins) {
          const flick = 0.82 + 0.18 * Math.sin(env.T * 0.7 + win.ph);
          const a = night * (win.on ? 0.95 : 0.2) * flick * (1 - layer.fog * 0.72);
          if (a < 0.08) continue;
          ctx.fillStyle = rgbaStr(win.on ? [255, 214, 140] : [180, 196, 232], a);
          ctx.fillRect(win.x, win.y, 2, 2);
        }
        if (t.light && t.antenna) {
          const a = night * (0.35 + 0.55 * (0.5 + 0.5 * Math.sin(env.T * 2.1 + t.x)));
          ctx.fillStyle = rgbaStr([255, 96, 88], a);
          ctx.fillRect(t.x + Math.round(t.w * 0.68), t.top - Math.max(4, Math.round(t.h * 0.06)) - 1, 1, 1);
        }
      }
    }
  }
}

/** 楼与楼之间缝隙里透出的深层城市与街道灯光 */
export function drawStreetLevel(ctx, env, st) {
  const { m, pal, night, T } = env;
  const top = m.horizonY;
  const bot = m.railBottom + 3;

  const base = lit(mix3([58, 62, 80], [18, 21, 36], night * 0.9), pal.amb, pal.light);
  ctx.fillStyle = rgbStr(mix3(base, pal.fogColor, 0.44));
  ctx.fillRect(0, top, m.W, bot - top);

  const lampOn = smoothstep(clamp(night * 1.6 - 0.15, 0, 1));
  if (lampOn <= 0.04) return;

  const span = Math.max(6, bot - top);
  for (const lamp of st.lamps) {
    const y = top + 2 + Math.round(lamp.dy * (span / Math.max(6, m.railBottom - m.horizonY)) * 0.6);
    ctx.fillStyle = rgbaStr(lamp.warm ? [255, 206, 132] : [186, 214, 255], lampOn * lamp.b * 0.8);
    ctx.fillRect(lamp.x, Math.min(bot - 1, y), lamp.w, 1);
  }
  for (const car of st.cars) {
    const total = m.W + 24;
    const px = ((car.x + T * car.sp) % total + total) % total - 12;
    const y = top + 3 + Math.round((car.dy / Math.max(1, m.railBottom - m.horizonY)) * (span - 6));
    ctx.fillStyle = rgbaStr(car.warm ? [255, 196, 120] : [255, 132, 108], lampOn * 0.8);
    ctx.fillRect(Math.round(px), Math.min(bot - 1, y), 2, 1);
  }
}
