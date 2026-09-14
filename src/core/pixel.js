import { clamp, lit, mix3, rgbStr } from './math.js';

/**
 * 像素画材质系统：每种材质 4 阶色（高光 / 亮面 / 暗面 / 轮廓）。
 *
 * 这是"游戏感"与"低分辨率插画"的分水岭：马里奥、我的世界那一代的像素美术
 * 靠的是明确的 1px 深色轮廓 + 每材质 3~4 阶明暗，而不是"只有色块的形状"。
 * 没有轮廓，物体边界就和背景糊在一起，永远显得廉价。
 */
export function mats(base, pal, opt = {}) {
  const hiAmt = opt.hi == null ? 0.24 : opt.hi;
  const shAmt = opt.sh == null ? 0.32 : opt.sh;
  const lineAmt = opt.line == null ? 0.66 : opt.line;
  return {
    hi: rgbStr(lit(mix3(base, [255, 255, 255], hiAmt), pal.amb, pal.light)),
    base: rgbStr(lit(base, pal.amb, pal.light)),
    sh: rgbStr(lit(mix3(base, [0, 0, 0], shAmt), pal.amb, pal.light)),
    line: rgbStr(lit(mix3(base, [0, 0, 0], lineAmt), pal.amb, pal.light)),
  };
}

/** 单色字符串（不带轮廓） */
export function flat(base, pal) {
  return rgbStr(lit(base, pal.amb, pal.light));
}

/** 太阳在画面哪一侧：>0 在右，<0 在左。决定高光与暗面朝向 */
export function sunSide(env) {
  return (env.sun && env.sun.dir ? env.sun.dir : 0) >= 0 ? 1 : -1;
}

/**
 * 带轮廓的方块。这是最常用的绘制原语：
 * 先铺 1px 轮廓，再在内部铺亮/暗阶，物体立刻从背景里"站"出来。
 */
export function box(ctx, m, x, y, w, h, side = 1, opt = {}) {
  const X = Math.round(x);
  const Y = Math.round(y);
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  const cap = opt.line !== false;

  if (cap) {
    ctx.fillStyle = m.line;
    ctx.fillRect(X - 1, Y - 1, W + 2, H + 2);
  }
  ctx.fillStyle = m.base;
  ctx.fillRect(X, Y, W, H);

  if (W > 2 && H > 2) {
    const hiEdge = side >= 0 ? X + W - 1 : X;
    const shEdge = side >= 0 ? X : X + W - 1;
    ctx.fillStyle = m.hi;
    ctx.fillRect(hiEdge, Y, 1, H);
    if (!opt.noTop) ctx.fillRect(X, Y, W, 1);
    ctx.fillStyle = m.sh;
    ctx.fillRect(shEdge, Y, 1, H);
    if (!opt.noBottom) ctx.fillRect(X, Y + H - 1, W, 1);
  }
  return { X, Y, W, H };
}

/** 带轮廓的圆盘（太阳、月亮、叶片团等） */
export function disc(ctx, m, cx, cy, r, opt = {}) {
  const R = Math.max(1, Math.round(r));
  const rows = [];
  for (let dy = -R; dy <= R; dy++) {
    const hh = Math.sqrt(Math.max(0, R * R - dy * dy));
    if (hh < 0.5) continue;
    rows.push({ dy, h: Math.round(hh) });
  }
  if (!rows.length) return;

  if (opt.line !== false) {
    ctx.fillStyle = m.line;
    for (const row of rows) ctx.fillRect(Math.round(cx) - row.h - 1, Math.round(cy) + row.dy, row.h * 2 + 2, 1);
  }
  ctx.fillStyle = m.base;
  for (const row of rows) ctx.fillRect(Math.round(cx) - row.h, Math.round(cy) + row.dy, row.h * 2, 1);

  const hy = Math.round(cy) - Math.round(R * 0.42);
  const hw = Math.round(R * 0.55);
  ctx.fillStyle = m.hi;
  for (let i = 0; i < Math.max(1, Math.round(R * 0.5)); i++) {
    const t = 1 - i / Math.max(1, R);
    const w = Math.max(1, Math.round(hw * t));
    ctx.fillRect(Math.round(cx) - Math.round(w * 0.2), hy + i, w, 1);
  }
  const sy = Math.round(cy) + Math.round(R * 0.5);
  const sw = Math.round(R * 0.5);
  ctx.fillStyle = m.sh;
  for (let i = 0; i < Math.max(1, Math.round(R * 0.4)); i++) {
    const w = Math.max(1, Math.round(sw * (1 - i / Math.max(1, R))));
    ctx.fillRect(Math.round(cx) - Math.round(w * 0.4), sy + i, w, 1);
  }
}

/**
 * 逐行填充一个由「半宽函数」定义的形状。
 * 用于云、树冠、灌木这类不规则轮廓，能统一加上描边与明暗。
 */
export function shapeRows(ctx, m, cx, cy, rows, opt = {}) {
  if (!rows.length) return;
  if (opt.line !== false) {
    ctx.fillStyle = m.line;
    for (const row of rows) {
      if (row.h < 0.5) continue;
      ctx.fillRect(Math.round(cx - row.h) - 1, Math.round(cy + row.y), Math.round(row.h * 2) + 2, 1);
    }
  }
  ctx.fillStyle = m.base;
  for (const row of rows) {
    if (row.h < 0.5) continue;
    ctx.fillRect(Math.round(cx - row.h), Math.round(cy + row.y), Math.max(1, Math.round(row.h * 2)), 1);
  }
  if (opt.hi !== false) {
    ctx.fillStyle = m.hi;
    const top = rows.find((r) => r.h >= 1);
    if (top) {
      ctx.fillRect(Math.round(cx - top.h * 0.5), Math.round(cy + top.y), Math.max(1, Math.round(top.h * 1.2)), 1);
    }
  }
  if (opt.sh !== false) {
    ctx.fillStyle = m.sh;
    const bot = [...rows].reverse().find((r) => r.h >= 1);
    if (bot) {
      ctx.fillRect(Math.round(cx - bot.h * 0.4), Math.round(cy + bot.y), Math.max(1, Math.round(bot.h * 1.1)), 1);
    }
  }
}

/** 由半径序列生成 shapeRows 用的行数据 */
export function radiiToRows(radii) {
  const rows = [];
  const off = Math.floor(radii.length / 2);
  for (let i = 0; i < radii.length; i++) rows.push({ y: i - off, h: radii[i] });
  return rows;
}

/** 阶梯圆角矩形：像素画里"圆角"就是切掉四角，比直角更有手工感 */
export function roundRect(ctx, m, x, y, w, h, cut = 1, side = 1) {
  const X = Math.round(x);
  const Y = Math.round(y);
  const W = Math.max(2, Math.round(w));
  const H = Math.max(2, Math.round(h));
  const c = Math.min(cut, Math.floor(Math.min(W, H) / 2));
  ctx.fillStyle = m.line;
  ctx.fillRect(X - 1, Y - 1 + c, W + 2, H + 2 - c * 2);
  ctx.fillRect(X - 1 + c, Y - 1, W + 2 - c * 2, H + 2);
  ctx.fillStyle = m.base;
  ctx.fillRect(X + c, Y, W - c * 2, H);
  ctx.fillRect(X, Y + c, W, H - c * 2);
  return { X, Y, W, H };
}

/** 在矩形区域上撒确定性斑点，制造材质颗粒（砖面、水泥、墙皮） */
export function speckle(ctx, color, x, y, w, h, count, rng) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const px = Math.round(x + rng() * w);
    const py = Math.round(y + rng() * h);
    ctx.fillRect(px, py, 1, 1);
  }
}

/** 天光对物体的整体提亮/压暗（用于让物体融入当前时段，但不破坏色阶） */
export function tint(base, pal, k) {
  return mix3(lit(base, pal.amb, pal.light), pal.light, clamp(k, 0, 1));
}
