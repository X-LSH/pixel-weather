import { clamp, rgbaStr, rgbStr } from '../core/math.js';
import { drawText, measureText } from './hud.js';

const BG = [12, 16, 30];
const INK = [230, 238, 250];
const DIM = [140, 156, 188];
const HOT = [252, 208, 122];

/* ── 程序化天气图标：11~13px 见方，与画面的像素颗粒同一套语言 ── */

function cloudBody(ctx, x, y, s, col, dark) {
  ctx.fillStyle = col;
  ctx.fillRect(x, y + s * 2, s * 6, s * 2);
  ctx.fillRect(x + s, y + s, s * 2, s * 2);
  ctx.fillRect(x + s * 3, y, s * 2, s * 3);
  ctx.fillRect(x + s * 5, y + s, s * 2, s * 2);
  ctx.fillStyle = dark;
  ctx.fillRect(x, y + s * 3, s * 6, s);
}

function sunShape(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  ctx.fillRect(cx - r, cy - r + 1, r * 2, r * 2 - 2);
  ctx.fillRect(cx - r + 1, cy - r, r * 2 - 2, r * 2);
  ctx.fillRect(cx - r - 1, cy - 1, 1, 2);
  ctx.fillRect(cx + r, cy - 1, 1, 2);
  ctx.fillRect(cx - 1, cy - r - 1, 2, 1);
  ctx.fillRect(cx - 1, cy + r, 2, 1);
}

function moonShape(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) {
    const h = Math.sqrt(Math.max(0, r * r - dy * dy));
    if (h < 0.5) continue;
    const x0 = -h;
    const x1 = h * 0.34;
    if (x1 - x0 < 0.8) continue;
    ctx.fillRect(Math.round(cx + x0), Math.round(cy + dy), Math.max(1, Math.round(x1 - x0)), 1);
  }
}

function iconFor(ctx, x, y, s, code, isDay) {
  const white = rgbStr([238, 244, 252]);
  const grey = rgbStr([176, 188, 208]);
  const sunCol = rgbStr([250, 206, 96]);
  const moonCol = rgbStr([222, 230, 246]);
  const rainCol = rgbStr([122, 178, 238]);
  const snowCol = rgbStr([236, 244, 255]);
  const fogCol = rgbStr([186, 198, 216]);

  const cx = x + s * 3;
  const cy = y + s * 2;

  if (code === 0 || code === 1) {
    if (isDay) sunShape(ctx, cx, cy, s, sunCol);
    else moonShape(ctx, cx, cy, s, moonCol);
    if (code === 1) cloudBody(ctx, x + s * 2, y + s * 2, s, grey, rgbStr([146, 158, 180]));
    return;
  }

  if (code === 2) {
    if (isDay) sunShape(ctx, x + s * 4, y + s, s - 1, sunCol);
    else moonShape(ctx, x + s * 4, y + s, s - 1, moonCol);
    cloudBody(ctx, x, y + Math.round(s * 1.6), s, white, grey);
    return;
  }

  if (code === 3) {
    cloudBody(ctx, x, y + s, s, white, grey);
    cloudBody(ctx, x + s, y + Math.round(s * 0.2), s, white, grey);
    return;
  }

  if (code === 45 || code === 48) {
    ctx.fillStyle = fogCol;
    ctx.fillRect(x, y + s, s * 6, s - 1);
    ctx.fillRect(x + s, y + s * 3, s * 6, s - 1);
    ctx.fillRect(x, y + s * 5, s * 6, s - 1);
    return;
  }

  if (code >= 95) {
    cloudBody(ctx, x, y, s, white, grey);
    ctx.fillStyle = rgbStr([250, 214, 96]);
    ctx.fillRect(x + s * 3, y + s * 4, s, s);
    ctx.fillRect(x + s * 2, y + s * 4, s, s);
    ctx.fillRect(x + s * 2, y + s * 5, s, s);
    ctx.fillRect(x + s, y + s * 5, s, s);
    return;
  }

  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    cloudBody(ctx, x, y, s, white, grey);
    ctx.fillStyle = snowCol;
    for (let i = 0; i < 3; i++) {
      const px = x + s * (i * 2);
      ctx.fillRect(px, y + s * 5, s - 1, s - 1);
      ctx.fillRect(px + 1, y + s * 6, s - 1, s - 1);
    }
    return;
  }

  cloudBody(ctx, x, y, s, white, grey);
  const heavy = code === 65 || code === 67 || code === 82;
  const n = heavy ? 4 : 3;
  ctx.fillStyle = rainCol;
  for (let i = 0; i < n; i++) {
    const px = x + i * Math.round((s * 5) / (n - 1 || 1));
    const ph = heavy ? s * 3 : s * 2;
    ctx.fillRect(px, y + s * 4, s - 1, ph - 1);
  }
}

/* ── 面板本体 ── */

export function drawForecast(ctx, env, panel) {
  const t = clamp(panel.t, 0, 1);
  if (t <= 0.01) return;
  const { m } = env;
  const ease = 1 - Math.pow(1 - t, 3);

  const padY = 5;
  const blockH = 7 + 1 + 11 + 1 + 7;
  const panelH = padY * 2 + blockH * 2 + 12;
  const y0 = m.H - Math.round(panelH * ease);

  ctx.fillStyle = rgbaStr(BG, 0.95 * Math.min(1, t * 1.4));
  ctx.fillRect(0, y0, m.W, panelH);
  ctx.fillStyle = rgbaStr([90, 110, 150], 0.5 * t);
  ctx.fillRect(0, y0, m.W, 1);

  const padX = 5;
  const avail = m.W - padX * 2;
  const isDay = env.isDay !== false;

  const hours = panel.hourly || [];
  const hCols = Math.max(3, Math.min(hours.length, Math.floor(avail / 34)));
  const hw = avail / Math.max(1, hCols);
  for (let i = 0; i < hCols && i < hours.length; i++) {
    const h = hours[i];
    const cx = padX + hw * i + hw / 2;
    const top = y0 + padY;
    const lw = measureText(h.label, 1);
    drawText(ctx, cx - lw / 2, top, h.label, rgbStr(i === 0 ? HOT : DIM), 1);
    iconFor(ctx, Math.round(cx - 6), top + 8, 2, h.code, isDay);
    const tt = h.temp == null ? '--' : String(Math.round(h.temp));
    const tw = measureText(tt, 1);
    drawText(ctx, cx - tw / 2, top + 20, tt, rgbStr(i === 0 ? INK : DIM), 1);
  }

  const midY = y0 + padY + blockH + 5;
  ctx.fillStyle = rgbaStr([90, 110, 150], 0.28 * t);
  ctx.fillRect(padX, midY, avail, 1);

  const days = panel.daily || [];
  const dCols = Math.max(1, Math.min(days.length, 7));
  const dw = avail / dCols;
  for (let i = 0; i < dCols && i < days.length; i++) {
    const d = days[i];
    const cx = padX + dw * i + dw / 2;
    const top = midY + 6;
    const label = i === 0 ? 'TDY' : d.label;
    const lw = measureText(label, 1);
    drawText(ctx, cx - lw / 2, top, label, rgbStr(i === 0 ? HOT : DIM), 1);
    iconFor(ctx, Math.round(cx - 6), top + 8, 2, d.code, true);
    const tt = d.hi == null ? '--' : `${Math.round(d.hi)}`;
    const bt = d.lo == null ? '' : `${Math.round(d.lo)}`;
    const tw = measureText(tt, 1);
    drawText(ctx, cx - tw / 2, top + 20, tt, rgbStr(INK), 1);
    if (bt) {
      const bw = measureText(bt, 1);
      const need = tw / 2 + bw / 2 + 2;
      if (need < dw - 2) {
        drawText(ctx, cx + tw / 2 + 3, top + 20, bt, rgbStr(DIM), 1);
      }
    }
  }
}
