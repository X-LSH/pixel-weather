const RAD = Math.PI / 180;
const J2000 = 2451545.0;
const DAY_MS = 86400000;

/**
 * 太阳/月亮位置（美国海军天文台简化算法）。
 * lonShiftDeg 用于把太阳解当作月亮解：传入月相角即可得到月亮视位置，
 * 新月时二者同向、满月时相差 180 度，精度足够驱动一幅风景画。
 */
export function bodyPosition(date, lat, lon, lonShiftDeg = 0) {
  const jd = date.getTime() / DAY_MS + 2440587.5;
  const n = jd - J2000;

  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g) + lonShiftDeg) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;

  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));

  const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24;
  const ha = (gmst * 15 + lon) * RAD - ra;

  const latR = lat * RAD;
  const sinAlt = Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;

  const az = Math.atan2(
    -Math.cos(dec) * Math.sin(ha),
    Math.sin(dec) * Math.cos(latR) - Math.cos(dec) * Math.sin(latR) * Math.cos(ha),
  ) / RAD;

  return { alt, az: (az + 360) % 360, dec: dec / RAD };
}

const SYNODIC = 29.530588853;

/** 月相 0..1：0 为朔（新月），0.5 为望（满月） */
export function moonPhase(date) {
  const jd = date.getTime() / DAY_MS + 2440587.5;
  const age = (((jd - 2451550.1) % SYNODIC) + SYNODIC) % SYNODIC;
  return age / SYNODIC;
}

/** 夜光强度 0..1：把月亮高度与月相一起折算成夜间照明度 */
export function moonLight(phase) {
  const illum = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  return Math.pow(illum, 1.2);
}

/**
 * 把太阳高度角压缩成画面用的归一化位置。
 * 只取贴近地平线的一段做映射，这样日出日落时天体的移动速度在观感上更接近真实。
 */
export function horizonPlacement(alt, az, horizonY, topY) {
  const t = clamp01((alt + 6) / 66);
  const y = horizonY - t * (horizonY - topY);
  const dir = Math.sin((az - 90) * RAD);
  return { y, t, dir };
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
