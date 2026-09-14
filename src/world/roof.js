import { clamp, makeRng, mix3, rgbaStr, rgbStr } from '../core/math.js';
import { box, disc, mats, sunSide } from '../core/pixel.js';

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
    [246, 244, 236],
    [188, 214, 236],
    [242, 206, 208],
    [226, 230, 216],
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

  // 地面斑驳必须先算好：否则每帧重算会闪烁
  st.speckles = [];
  const count = Math.round(m.W * 0.85);
  for (let i = 0; i < count; i++) {
    st.speckles.push({
      x: Math.round(rng() * m.W),
      y: Math.round(m.groundTop + rng() * (m.H - m.groundTop)),
      d: rng() < 0.5,
    });
  }

  return st;
}

/** 天台地面：错缝砖砌 + 近大远小的伪透视 + 斑驳，比纯色块多出十倍的材质信息 */
export function drawRoofGround(ctx, env) {
  const { m, pal, night, roof, w } = env;
  const groundH = m.H - m.groundTop;
  const rows = 3;
  const base = mix3([132, 124, 112], [42, 46, 64], night * 0.86);

  const weights = [0.22, 0.32, 0.46];
  let acc = 0;
  for (let r = 0; r < rows; r++) {
    const y0 = m.groundTop + Math.round(groundH * acc);
    acc += weights[r];
    const y1 = m.groundTop + Math.round(groundH * acc);
    const rh = Math.max(2, y1 - y0);
    const depth = r / Math.max(1, rows - 1);
    const M = mats(mix3(base, mix3(base, [26, 28, 40], 0.3), depth), pal, { hi: 0.22, sh: 0.34, line: 0.72 });

    const tileW = Math.max(6, Math.round(m.W / (17 - r * 5)));
    const offset = (r % 2) * Math.round(tileW / 2);

    for (let x = -offset; x < m.W + tileW; x += tileW) {
      ctx.fillStyle = M.line;
      ctx.fillRect(x, y0, 1, rh);
      ctx.fillStyle = M.base;
      ctx.fillRect(x + 1, y0, tileW - 1, rh);
      ctx.fillStyle = M.hi;
      ctx.fillRect(x + 1, y0, tileW - 1, 1);
      ctx.fillStyle = M.sh;
      ctx.fillRect(x + 1, y0 + rh - 1, tileW - 1, 1);
    }
    ctx.fillStyle = M.line;
    ctx.fillRect(0, y0, m.W, 1);
  }

  for (const s of roof.speckles) {
    ctx.fillStyle = s.d ? rgbaStr([0, 0, 0], 0.16) : rgbaStr([255, 255, 255], 0.06);
    ctx.fillRect(s.x, s.y, 1, 1);
  }

  const wet = clamp((w.precip - 0.22) / 0.7, 0, 1);
  if (wet > 0.01) {
    ctx.fillStyle = rgbaStr(mix3(pal.hor, [88, 138, 200], 0.45), 0.32 * wet);
    ctx.fillRect(0, m.groundTop + 2, m.W, m.H - m.groundTop - 2);
    ctx.fillStyle = rgbaStr(mix3(pal.hor, [255, 255, 255], 0.45), 0.22 * wet);
    ctx.fillRect(0, m.groundTop + 5, m.W, Math.round((m.H - m.groundTop) * 0.16));
  }

  const snowAmt = clamp((w.snow - 0.2) / 0.8, 0, 1);
  if (snowAmt > 0.01) {
    ctx.fillStyle = rgbaStr([240, 244, 252], 0.72 * snowAmt);
    ctx.fillRect(0, m.groundTop, m.W, m.H - m.groundTop);
    ctx.fillStyle = rgbaStr([198, 210, 232], 0.5 * snowAmt);
    ctx.fillRect(0, m.groundTop + Math.round((m.H - m.groundTop) * 0.6), m.W, m.H);
  }

  ctx.fillStyle = rgbaStr([0, 0, 0], 0.34);
  ctx.fillRect(0, m.groundTop, m.W, 2);
}

/**
 * 栏杆投影。方向随太阳方位角偏转，长度按太阳高度角的余切伸缩，
 * 这是整幅画里"光影在移动"最直观的证据。
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
  const gap = Math.max(10, Math.round(m.W / 28));
  const bottom = m.groundTop + Math.round(groundH * 0.78);

  ctx.fillStyle = rgbaStr([8, 12, 26], 0.34 * strength);
  for (let x = 3; x < m.W; x += gap) {
    for (let i = 0; i < len; i++) {
      const y = m.groundTop + 2 + i;
      if (y > bottom) break;
      const px = Math.round(x + skew * (i / len));
      if (px < 0 || px >= m.W) continue;
      ctx.fillRect(px, y, 1, 1);
    }
  }

  ctx.fillStyle = rgbaStr([8, 12, 26], 0.2 * strength);
  ctx.fillRect(Math.round(Math.min(0, skew)), m.groundTop + 2, Math.round(Math.abs(skew)) + m.W, 2);
}

/** 不锈钢水箱：轮廓 + 柱面高光 + 箍带 + 阶梯穹顶，从"灰盒子"变成有体积的物件 */
export function drawWaterTank(ctx, env) {
  const { m, pal, night, roof } = env;
  const t = roof.tank;
  const side = sunSide(env);
  const baseY = m.groundTop + 6;
  const topY = baseY - t.h;
  const domeH = Math.max(4, Math.round(t.h * 0.17));
  const legH = Math.max(5, Math.round(t.h * 0.13));
  const bodyY = topY + domeH;
  const bodyH = Math.max(8, t.h - domeH - legH);
  const x = t.x;
  const w = t.w;

  const steel = mix3([182, 190, 200], [54, 60, 84], night * 0.84);
  const M = mats(steel, pal, { hi: 0.32, sh: 0.38, line: 0.7 });

  box(ctx, M, x + 2, bodyY + bodyH - 2, 3, legH + 2, side);
  box(ctx, M, x + w - 5, bodyY + bodyH - 2, 3, legH + 2, side);

  box(ctx, M, x, bodyY, w, bodyH, side);

  const glossX = side >= 0 ? x + Math.round(w * 0.6) : x + Math.round(w * 0.24);
  ctx.fillStyle = M.hi;
  ctx.fillRect(glossX, bodyY + 1, Math.max(2, Math.round(w * 0.14)), bodyH - 2);

  ctx.fillStyle = M.line;
  ctx.fillRect(x, bodyY + Math.round(bodyH * 0.3), w, 1);
  ctx.fillRect(x, bodyY + Math.round(bodyH * 0.74), w, 1);

  const tiers = [0.42, 0.7, 0.94];
  const tierH = Math.max(1, Math.round(domeH / 3));
  for (let i = 0; i < 3; i++) {
    const tw = Math.round(w * tiers[i]);
    const tx = x + Math.round((w - tw) / 2);
    box(ctx, M, tx, topY + i * tierH, tw, tierH, side, { noBottom: i < 2 });
  }
}

const LEAF = [
  [128, 194, 88],
  [86, 168, 62],
  [206, 148, 54],
  [126, 132, 120],
];

/** 盆栽：梯形陶盆 + 三团带轮廓的叶簇，季节与风都作用在它身上 */
export function drawPlanter(ctx, env) {
  const { m, pal, night, roof, season, wind, T } = env;
  const p = roof.planter;
  const side = sunSide(env);
  const baseY = m.groundTop + Math.round((m.H - m.groundTop) * 0.46);
  const x = p.x;
  const w = p.w;
  const potH = p.h;
  const potTop = baseY - potH;

  const clay = mix3([196, 112, 82], [54, 38, 44], night * 0.82);
  const P = mats(clay, pal, { hi: 0.28, sh: 0.36, line: 0.68 });

  for (let i = 0; i < potH; i++) {
    const k = i / Math.max(1, potH);
    const ww = Math.max(2, w * (1 - 0.3 * k));
    const xx = x + (w - ww) / 2;
    ctx.fillStyle = P.line;
    ctx.fillRect(Math.round(xx) - 1, potTop + i, Math.round(ww) + 2, 1);
    ctx.fillStyle = P.base;
    ctx.fillRect(Math.round(xx), potTop + i, Math.round(ww), 1);
    const hiX = side >= 0 ? Math.round(xx + ww - 2) : Math.round(xx + 1);
    const shX = side >= 0 ? Math.round(xx + 1) : Math.round(xx + ww - 2);
    ctx.fillStyle = P.hi;
    ctx.fillRect(hiX, potTop + i, 2, 1);
    ctx.fillStyle = P.sh;
    ctx.fillRect(shX, potTop + i, 2, 1);
  }

  ctx.fillStyle = P.line;
  ctx.fillRect(x - 2, potTop - 2, w + 4, 2);
  ctx.fillStyle = P.hi;
  ctx.fillRect(x - 1, potTop - 1, w + 2, 1);

  const leafBase = LEAF[clamp(Math.round(season), 0, 3)];
  const LM = mats(mix3(leafBase, [28, 34, 52], night * 0.86), pal, { hi: 0.32, sh: 0.36, line: 0.64 });
  const sway = Math.sin(T * 1.05) * (0.6 + wind * 1.5);
  const cx = x + w / 2;
  const r = Math.max(2, Math.round(w * 0.27));

  ctx.fillStyle = LM.line;
  ctx.fillRect(Math.round(cx), potTop - 8, 1, 8);

  disc(ctx, LM, cx - Math.round(w * 0.32) + sway, potTop - 10, r, { line: true });
  disc(ctx, LM, cx + Math.round(w * 0.32) + sway * 1.3, potTop - 11, r - 1, { line: true });
  disc(ctx, LM, cx + sway * 0.8, potTop - 16, r + 1, { line: true });
}

/** 立杆式金属栏杆：立柱用「暗-亮-中」三列模拟圆柱，横杆覆压其上 */
export function drawRailing(ctx, env) {
  const { m, pal, night } = env;
  const side = sunSide(env);
  const M = mats(mix3([154, 162, 180], [46, 52, 76], night * 0.84), pal, { hi: 0.36, sh: 0.38, line: 0.72 });

  const topY = m.railTop;
  const botY = m.railBottom;
  const midY = Math.round(topY + (botY - topY) * 0.56);

  const gap = Math.max(10, Math.round(m.W / 28));
  for (let x = 3; x < m.W; x += gap) {
    ctx.fillStyle = M.line;
    ctx.fillRect(x - 1, topY, 3, botY - topY);
    ctx.fillStyle = M.hi;
    ctx.fillRect(x, topY, 1, botY - topY);
    ctx.fillStyle = M.base;
    ctx.fillRect(x + 1, topY, 1, botY - topY);
  }

  ctx.fillStyle = M.line;
  ctx.fillRect(0, topY - 1, m.W, 4);
  ctx.fillStyle = M.hi;
  ctx.fillRect(0, topY, m.W, 1);
  ctx.fillStyle = M.base;
  ctx.fillRect(0, topY + 1, m.W, 2);

  ctx.fillStyle = M.line;
  ctx.fillRect(0, midY - 1, m.W, 3);
  ctx.fillStyle = M.hi;
  ctx.fillRect(0, midY, m.W, 1);
  ctx.fillStyle = M.base;
  ctx.fillRect(0, midY + 1, m.W, 1);

  const C = mats(mix3([126, 120, 110], [40, 44, 62], night * 0.86), pal, { hi: 0.2, sh: 0.34, line: 0.72 });
  box(ctx, C, -2, botY - 3, m.W + 4, 3, side, { line: false });
  ctx.fillStyle = C.line;
  ctx.fillRect(0, botY - 1, m.W, 2);
}

/** 晾衣绳：绳横贯画面上部，衣物上窄下宽并有领口，随风摆 */
export function drawLaundry(ctx, env) {
  const { m, pal, night, roof, wind, T } = env;
  const l = roof.laundry;
  const R = mats(mix3([206, 202, 190], [88, 94, 116], night * 0.8), pal, { hi: 0.3, sh: 0.34, line: 0.66 });

  const y0 = l.ropeY;
  const y1 = l.dropY;

  ctx.fillStyle = R.line;
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
    const C = mats(mix3(it.c, [44, 50, 72], night * 0.78), pal, { hi: 0.3, sh: 0.32, line: 0.62 });

    for (let i = 0; i < it.h; i++) {
      const k = i / it.h;
      const ww = Math.max(2, it.w * (0.7 + 0.3 * k));
      const xx = x + swing - ww / 2;
      ctx.fillStyle = C.line;
      ctx.fillRect(Math.round(xx) - 1, y + i, Math.round(ww) + 2, 1);
      ctx.fillStyle = C.base;
      ctx.fillRect(Math.round(xx), y + i, Math.round(ww), 1);
    }
    ctx.fillStyle = C.sh;
    ctx.fillRect(Math.round(x + swing - it.w * 0.3), y, Math.max(1, Math.round(it.w * 0.6)), 2);
    ctx.fillStyle = C.hi;
    ctx.fillRect(Math.round(x + swing - it.w * 0.42), y + 2, 1, Math.max(1, it.h - 3));
  }
}
