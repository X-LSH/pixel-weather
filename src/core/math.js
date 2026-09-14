export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));

export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export const approach = (cur, tar, rate, dt) =>
  cur + (tar - cur) * (1 - Math.exp(-rate * dt));

export const mix3 = (a, b, t) => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

export const scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

export const luma = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;

export const desat = (c, k) => {
  const g = luma(c);
  return mix3(c, [g, g, g], clamp(k, 0, 1));
};

export const rgbStr = (c) =>
  `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

export const rgbaStr = (c, a) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

/** 确定性伪随机，保证每次刷新星空、楼群分布一致 */
export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** 一维平滑噪声，用于云层边缘与光强抖动 */
export function makeNoise(seed) {
  const rnd = makeRng(seed);
  const table = new Float64Array(512);
  for (let i = 0; i < 512; i++) table[i] = rnd();
  const at = (i) => table[((i % 512) + 512) % 512];
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return lerp(at(i), at(i + 1), u);
  };
}

/**
 * 把物件基色放进当前环境光里染色。
 * amb 是环境亮度 0..1，light 是环境光颜色。
 * 夜晚不是简单压黑，而是带冷色偏移，这样画面才不会变成一团死黑。
 */
export function lit(base, amb, light) {
  const shadow = [12, 15, 30];
  const gain = mix3(shadow, light, 0.34 + 0.66 * clamp(amb, 0, 1));
  return [
    clamp((base[0] * gain[0]) / 255, 0, 255),
    clamp((base[1] * gain[1]) / 255, 0, 255),
    clamp((base[2] * gain[2]) / 255, 0, 255),
  ];
}
