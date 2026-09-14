import { clamp } from '../core/math.js';
import { buildTowers, drawCity, drawStreetLevel } from './city.js';
import { buildRoofProps, drawGroundShadow, drawLaundry, drawPlanter, drawRailing, drawRoofGround, drawWaterTank } from './roof.js';
import { drawCloudShadow, drawMoon, drawSky, drawStars, drawSun } from './sky.js';
import {
  buildCityLights,
  buildClouds,
  buildPrecip,
  buildStars,
  drawBirds,
  drawCloudLayer,
  drawFog,
  drawLightning,
  drawRain,
  drawRainbow,
  drawSnow,
  drawSplash,
  updateLightning,
  updatePrecip,
} from '../fx/weather.js';

/**
 * 场景度量：所有构图比例集中在这里。
 * 竖屏把地平线抬高，让天空占到一半以上，天气的变化才有足够舞台。
 */
export function metrics(W, H) {
  const portrait = H / W > 1.02;
  const horizonRatio = portrait ? 0.66 : 0.6;
  const railTopRatio = portrait ? 0.8 : 0.678;
  const railBotRatio = portrait ? 0.86 : 0.8;

  const horizonY = Math.round(H * horizonRatio);
  const railTop = Math.round(H * railTopRatio);
  const railBottom = Math.round(H * railBotRatio);

  return {
    W,
    H,
    portrait,
    horizonY,
    railTop,
    railBottom,
    groundTop: railBottom,
    cityBase: railBottom + 1,
    moonR: clamp(Math.round(H * 0.038), 5, 9),
  };
}

export function createWorld(W, H) {
  const m = metrics(W, H);
  const lights = buildCityLights(W, m);
  const precip = buildPrecip(W, H);

  const st = {
    m,
    towersFar: buildTowers(1337, W, m, {
      density: 22, minHR: 0.06, maxHR: 0.23, winDensity: 0.26, antenna: 0.1,
    }),
    towersMid: buildTowers(4747, W, m, {
      density: 32, minHR: 0.1, maxHR: 0.32, winDensity: 0.42, antenna: 0.22,
    }),
    clouds: buildClouds(W, m),
    stars: buildStars(W, m),
    lamps: lights.lamps,
    cars: lights.cars,
    roof: buildRoofProps(7, m),
    ...precip,
    flash: 0,
    boltLife: 0,
    boltPath: [],
    nextBolt: 3,
    rainbow: 0,
    rainbowTarget: 0,
    moonGlow: 1,
  };
  return st;
}

/**
 * 图层顺序即物理纵深：天 → 天体 → 云 → 城市 → 天台 → 天气粒子 → 大气叠加。
 * 天气粒子分远近两层，近层压在栏杆之前，落雨/落雪才有"穿过画面"的临场感。
 */
export function drawWorld(stage, st, env) {
  const { ctx } = stage;
  const e = { ...env, m: st.m, roof: st.roof };

  drawSky(ctx, e);
  drawStars(ctx, e);
  drawMoon(ctx, e);
  drawSun(ctx, e);

  for (let layer = 0; layer < 3; layer++) drawCloudLayer(ctx, e, st, layer);
  drawBirds(ctx, e, st);

  drawRainbow(ctx, e, st);
  drawStreetLevel(ctx, e, st);
  drawCity(ctx, e, st);
  drawCloudShadow(ctx, e);

  drawRain(ctx, e, st, false);
  drawSnow(ctx, e, st, false);

  drawRoofGround(ctx, e);
  drawGroundShadow(ctx, e);
  drawSplash(ctx, e, st);
  drawWaterTank(ctx, e);
  drawPlanter(ctx, e);
  drawRailing(ctx, e);
  drawLaundry(ctx, e);

  drawRain(ctx, e, st, true);
  drawSnow(ctx, e, st, true);
  drawFog(ctx, e, st);
  drawLightning(ctx, e, st);
}

export function updateWorld(st, env) {
  const e = { ...env, m: st.m, roof: st.roof };
  updatePrecip(e, st);
  updateLightning(e, st);
  st.moonGlow = clamp(1 - env.w.cloud * 0.7 - env.w.fog * 0.6, 0.1, 1);
}
