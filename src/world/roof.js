import { clamp, lit, mix3, rgbStr, rgbaStr, makeRng } from '../core/math.js';

export function buildRoofProps(seed, m) {
  const rng = makeRng(seed ^ 0x5bf03635);
  const st = {};

  st.tank = {
    x: Math.round(m.W * 0.035),
    w: Math.max(20, Math.round(m.W * 0.115)),
    h: Math.round(Math.max(m.W * 0.195, m.H * 0.13)),
  };
  st.planter = {
    x: Math.round(m.W * 0.845),
    w: Math.max(14, Math.round(m.W * 0.062)),
    h: Math.round(Math.max(m.W * 0.05, m.H * 0.035)),
  };

  st.laundry = {
    ropeY: Math.round(m.horizonY * 0.34),
    dropY: Math.round(m.horizonY * 0.3),
    sag: Math.max(3, Math.round(m.W * 0.012)),
    items: [],
  };
  const colors = [
    [242, 240, 232],
    [186, 212, 234],
    [240, 204, 206],
    [222, 228, 214],
  ];
  const slots = [0.12, 0.36, 0.6, 0.84];
  for (let i = 0; i < slots.length; i++) {
    st.laundry.items.push({
      t: slots[i],
      w: Math.max(5, Math.round(m.W * 0.022)) + Math.floor(rng() * 2),
      h: Math.max(8, Math.round(m.W * 0.036)),
      c: colors[i % colors.length],
      ph: rng() * 6.283,
    });
  }

  st.tiles = { step: Math.max(22, Math.round(m.W / 11)) };
  return st;
}

/** 天台地面：压暗、稀疏接缝、靠栏杆处落一道阴影，让它退到背景里去 */
export function drawRoofGround(ctx, env) {
  const { m, pal, night, roof, w } = env;
  const base = mix3([106, 102, 96], [46, 48, 64], night * 0.86);
  const near = mix3([74, 72, 70], [28, 30, 44], night * 0.9);
  const rows = 3;

  for (let r = 0; r < rows; r++) {
    const y0 = Math.round(m.groundTop + ((m.H - m.groundTop) * r) / rows);
    const y1 = Math.round(m.groundTop + ((m.H - m.groundTop) * (r + 1)) / rows);
    const t = r / (rows - 1 || 1);
    ctx.fillStyle = rgbStr(lit(mix3(base, near, t), pal.amb, pal.light));
    ctx.fillRect(0, y0, m.W, y1 - y0 + 1);
  }

  ctx.fillStyle = rgbaStr([0, 0, 0], 0.15);
  for (let r = 1; r < rows; r++) {
    const y = Math.round(m.groundTop + ((m.H - m.groundTop) * r) / rows);
    ctx.fillRect(0, y, m.W, 1);
  }
  for (let x = roof.tiles.step; x < m.W; x += roof.tiles.step) {
    ctx.fillRect(x, m.groundTop + 2, 1, m.H - m.groundTop - 2);
  }

  const wet = clamp((w.precip - 0.22) / 0.7, 0, 1);
  if (wet > 0.01) {
    ctx.fillStyle = rgbaStr(pal.hor, 0.16 * wet);
    ctx.fillRect(0, m.groundTop + 3, m.W, m.H - m.groundTop - 3);
    ctx.fillStyle = rgbaStr(mix3(pal.hor, [255, 255, 255], 0.3), 0.1 * wet);
    ctx.fillRect(0, m.groundTop + 6, m.W, Math.round((m.H - m.groundTop) * 0.16));
  }

  const snowAmt = clamp((w.snow - 0.25) / 0.75, 0, 1);
  if (snowAmt > 0.01) {
    ctx.fillStyle = rgbaStr([228, 234, 246], 0.3 * snowAmt);
    ctx.fillRect(0, m.groundTop, m.W, m.H - m.groundTop);
    ctx.fillStyle = rgbaStr([196, 208, 230], 0.22 * snowAmt);
    ctx.fillRect(0, m.groundTop + Math.round((m.H - m.groundTop) * 0.55), m.W, m.H);
  }

  ctx.fillStyle = rgbaStr([0, 0, 0], 0.26);
  ctx.fillRect(0, m.groundTop, m.W, 2);
}

/**
 * 栏杆在地面的投影。方向随太阳方位角偏转，长度按太阳高度角的余切伸缩，
 * 这是整幅画里"光影在移动"最直观的证据 —— 晴天下午影子会明显拉长并向东偏移。
 */
export function drawGroundShadow(ctx, env) {
  const { m, sun, night, w } = env;
  const openSky = clamp(1 - w.cloud * 1.15 - w.fog * 0.85, 0, 1);
  const strength = clamp((sun.alt - 1) / 9, 0, 1) * openSky * (1 - night);
  if (strength < 0.07) return;

  const groundH = m.H - m.groundTop;
  const railH = m.railBottom - m.railTop;
  const altRad = (Math.max(8, sun.alt) * Math.PI) / 180;
  const len = clamp(railH / Math.tan(altRad), 3, groundH);
  const dir = -Math.sin((sun.az * Math.PI) / 180);
  const skew = dir * len * 0.55;

  const bottom = m.groundTop + Math.round(groundH * 0.72);
  ctx.fillStyle = rgbaStr([0, 0, 0], 0.24 * strength);
  const gap = Math.max(11, Math.round(m.W / 26));
  for (let x = 3; x < m.W; x += gap) {
    for (let i = 0; i < len; i++) {
      const y = m.groundTop + 2 + i;
      if (y > bottom) break;
      const px = Math.round(x + skew * (i / len));
      if (px < 0 || px >= m.W) continue;
      ctx.fillRect(px, y, 1, 1);
    }
  }

  ctx.fillStyle = rgbaStr([0, 0, 0], 0.18 * strength);
  ctx.fillRect(Math.round(Math.min(0, skew)), m.groundTop + 2, Math.round(Math.abs(skew)) + m.W, 2);
}

/** 圆柱形水箱：穹顶 + 中亮侧暗的柱身 + 箍带 + 支架腿 */
export function drawWaterTank(ctx, env) {
  const { m, pal, night, sun, roof } = env;
  const t = roof.tank;
  const baseY = m.groundTop + 4;
  const topY = baseY - t.h;
  const x = t.x;
  const w = t.w;

  const domeH = Math.max(3, Math.round(t.h * 0.15));
  const legH = Math.max(4, Math.round(t.h * 0.11));
  const bodyY = topY + domeH;
  const bodyH = Math.max(6, t.h - domeH - legH);

  const base = mix3([172, 168, 162], [62, 66, 88], night * 0.84);
  const cMid = lit(mix3(base, [255, 255, 255], 0.13), pal.amb, pal.light);
  const cSide = lit(mix3(base, [0, 0, 0], 0.36), pal.amb, pal.light);
  const cEdge = lit(mix3(base, [0, 0, 0], 0.52), pal.amb, pal.light);

  ctx.fillStyle = rgbStr(cSide);
  ctx.fillRect(x, bodyY, w, bodyH);
  ctx.fillStyle = rgbStr(cMid);
  ctx.fillRect(x + 2, bodyY, Math.max(1, w - 4), bodyH);
  ctx.fillStyle = rgbStr(cEdge);
  ctx.fillRect(x, bodyY, 1, bodyH);
  ctx.fillRect(x + w - 1, bodyY, 1, bodyH);

  const gloss = clamp(0.1 + Math.max(0, sun.dir || 0) * 0.12, 0.04, 0.26);
  ctx.fillStyle = rgbaStr([255, 255, 255], gloss);
  ctx.fillRect(x + 3, bodyY + 1, Math.max(1, Math.round(w * 0.1)), bodyH - 2);

  ctx.fillStyle = rgbStr(cEdge);
  ctx.fillRect(x, bodyY + Math.round(bodyH * 0.28), w, 1);
  ctx.fillRect(x, bodyY + Math.round(bodyH * 0.7), w, 1);

  const dome = lit(mix3(base, [255, 255, 255], 0.2), pal.amb, pal.light);
  ctx.fillStyle = rgbStr(dome);
  const tiers = [0.46, 0.74, 0.94];
  const tierH = Math.max(1, Math.round(domeH / 3));
  for (let i = 0; i < 3; i++) {
    const tw = Math.round(w * tiers[i]);
    ctx.fillRect(x + Math.round((w - tw) / 2), topY + i * tierH, tw, tierH);
  }

  const leg = rgbStr(lit(mix3([84, 80, 78], [28, 30, 44], night * 0.9), pal.amb, pal.light));
  ctx.fillStyle = leg;
  ctx.fillRect(x + 1, bodyY + bodyH, 2, legH);
  ctx.fillRect(x + w - 3, bodyY + bodyH, 2, legH);
  ctx.fillRect(x + 1, bodyY + bodyH + Math.round(legH * 0.55), w - 2, 1);
}

const LEAF = [
  [124, 188, 92],
  [84, 156, 60],
  [202, 146, 60],
  [122, 126, 114],
];

function leafBlob(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) {
    const h = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    if (h <= 0) continue;
    ctx.fillRect(Math.round(cx - h), Math.round(cy + dy), h * 2, 1);
  }
}

/** 盆栽：梯形花盆 + 三团叶簇，叶色按季节换，风大时整株摆动 */
export function drawPlanter(ctx, env) {
  const { m, pal, night, roof, season, wind, T } = env;
  const p = roof.planter;
  const baseY = m.groundTop + Math.round((m.H - m.groundTop) * 0.36);
  const x = p.x;
  const w = p.w;
  const potH = p.h;
  const potTop = baseY - potH;

  const potLight = mix3([166, 108, 88], [56, 42, 48], night * 0.82);
  const potShade = mix3([122, 76, 62], [38, 30, 36], night * 0.82);
  for (let i = 0; i < potH; i++) {
    const k = i / Math.max(1, potH);
    const ww = Math.max(2, w * (1 - 0.26 * k));
    ctx.fillStyle = rgbStr(lit(mix3(potLight, potShade, k * 0.55), pal.amb, pal.light));
    ctx.fillRect(Math.round(x + (w - ww) / 2), potTop + i, Math.round(ww), 1);
  }
  ctx.fillStyle = rgbStr(lit(mix3(potShade, [0, 0, 0], 0.16), pal.amb, pal.light));
  ctx.fillRect(x - 1, potTop, w + 2, 2);

  const leafBase = LEAF[clamp(Math.round(season), 0, 3)];
  const leafCol = rgbStr(lit(mix3(leafBase, [26, 30, 46], night * 0.86), pal.amb, pal.light));
  const leafDark = rgbStr(lit(mix3(leafBase, [0, 0, 0], 0.3 + night * 0.36), pal.amb, pal.light));

  const sway = Math.sin(T * 1.05) * (0.6 + wind * 1.5);
  const cx = x + w / 2;

  ctx.fillStyle = leafDark;
  ctx.fillRect(Math.round(cx), potTop - 6, 1, 6);

  leafBlob(ctx, cx - Math.round(w * 0.28) + sway, potTop - 9, Math.max(2, Math.round(w * 0.22)), leafDark);
  leafBlob(ctx, cx + Math.round(w * 0.28) + sway * 1.3, potTop - 10, Math.max(2, Math.round(w * 0.2)), leafDark);
  leafBlob(ctx, cx + sway * 0.8, potTop - 15, Math.max(2, Math.round(w * 0.26)), leafCol);
}

/** 晾衣绳横贯画面上部，两端出画，衣物随风摆 —— 整幅画最直观的风向标 */
export function drawLaundry(ctx, env) {
  const { m, pal, night, roof, wind, T } = env;
  const l = roof.laundry;
  const rope = rgbStr(lit(mix3([204, 200, 190], [92, 96, 118], night * 0.8), pal.amb, pal.light));

  const y0 = l.ropeY;
  const y1 = l.dropY;

  ctx.fillStyle = rope;
  for (let x = 0; x < m.W; x++) {
    const t = x / m.W;
    const y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * l.sag);
    ctx.fillRect(x, y, 1, 1);
  }

  for (const it of l.items) {
    const t = it.t;
    const x = m.W * t;
    const y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * l.sag);
    const swing = Math.round(Math.sin(T * 1.5 + it.ph) * (0.6 + wind * 2.6));
    const cloth = rgbStr(lit(mix3(it.c, [40, 46, 68], night * 0.8), pal.amb, pal.light));
    const neck = rgbStr(lit(mix3(it.c, [0, 0, 0], 0.26 + night * 0.4), pal.amb, pal.light));

    ctx.fillStyle = cloth;
    for (let i = 0; i < it.h; i++) {
      const k = i / it.h;
      const ww = Math.max(1, it.w * (0.7 + 0.3 * k));
      ctx.fillRect(Math.round(x + swing - ww / 2), y + i, Math.round(ww), 1);
    }
    ctx.fillStyle = neck;
    ctx.fillRect(Math.round(x + swing - it.w * 0.3), y, Math.max(1, Math.round(it.w * 0.6)), 2);
  }
}

/** 立杆式金属栏杆，缝隙里透出城市，比实心女儿墙更有层次 */
export function drawRailing(ctx, env) {
  const { m, pal, night } = env;
  const base = mix3([126, 132, 148], [54, 60, 86], night * 0.82);
  const col = lit(base, pal.amb, pal.light);
  const str = rgbStr(col);
  const dark = rgbStr(mix3(col, [0, 0, 0], 0.4));

  const topY = m.railTop;
  const botY = m.railBottom;
  const midY = Math.round(topY + (botY - topY) * 0.54);

  ctx.fillStyle = str;
  ctx.fillRect(0, topY, m.W, 2);
  ctx.fillRect(0, midY, m.W, 1);

  const gap = Math.max(11, Math.round(m.W / 26));
  ctx.fillStyle = dark;
  for (let x = 3; x < m.W; x += gap) {
    ctx.fillRect(x, topY + 2, 1, botY - topY - 2);
  }

  ctx.fillStyle = rgbStr(mix3(lit(mix3([116, 112, 106], [44, 46, 62], night * 0.85), pal.amb, pal.light), [0, 0, 0], 0.12));
  ctx.fillRect(0, botY - 3, m.W, 3);
}
