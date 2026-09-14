import { clamp, rgbStr } from './math.js';

/** 横向构图基准宽度；竖屏改用窄基准宽度，让像素粒度保持稳定 */
export const BASE_WIDE = 320;
export const BASE_TALL = 190;

/**
 * 像素舞台：逻辑分辨率随窗口比例变化，但像素颗粒尺寸永远等于屏幕上的一个物理像素块。
 * 做法是固定逻辑宽度、按窗口比例反推逻辑高度，因此画面永远铺满且不会拉伸变形。
 */
export function createStage(canvas, ctx2d) {
  const ctx = ctx2d || canvas.getContext('2d', { alpha: false });
  const state = { W: BASE_WIDE, H: 180, portrait: false };

  function layout() {
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    const winAspect = vw / vh;
    const portrait = winAspect < 1.02;

    const W = portrait ? BASE_TALL : BASE_WIDE;
    const H = Math.round(clamp(W / winAspect, 116, 452));

    state.portrait = portrait;
    state.W = W;
    state.H = H;

    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;

    const dispAspect = W / H;
    let cw;
    let ch;
    if (dispAspect > winAspect) {
      cw = vw;
      ch = vw / dispAspect;
    } else {
      ch = vh;
      cw = vh * dispAspect;
    }
    canvas.style.width = Math.round(cw) + 'px';
    canvas.style.height = Math.round(ch) + 'px';
    return state;
  }

  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 120));

  return {
    canvas,
    ctx,
    state,
    layout,
    get W() { return state.W; },
    get H() { return state.H; },
    get portrait() { return state.portrait; },
    fill(c) {
      ctx.fillStyle = rgbStr(c);
      ctx.fillRect(0, 0, state.W, state.H);
    },
    rect(x, y, w, h, c) {
      ctx.fillStyle = typeof c === 'string' ? c : rgbStr(c);
      ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    },
    line(x1, y1, x2, y2, c, w = 1) {
      ctx.strokeStyle = typeof c === 'string' ? c : rgbStr(c);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
      ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
      ctx.stroke();
    },
  };
}

/** 定长步进主循环，页面切到后台时自动跳过，回到前台继续 */
export function startLoop(frame) {
  let last = performance.now();
  let handle = 0;
  const tick = (now) => {
    const dt = Math.min(0.08, Math.max(0.001, (now - last) / 1000));
    last = now;
    if (!document.hidden) frame(dt, now);
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(handle);
}
