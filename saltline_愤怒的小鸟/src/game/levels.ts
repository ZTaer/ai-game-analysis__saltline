import type { BlockSpec, Level, Material, PigSpec } from './types';
// Coordinates are authored in a 1600 × 900 world. All structures start on y=735.
function tower(x: number, floors: number, material: Material = 'wood', width = 150): BlockSpec[] {
  const blocks: BlockSpec[] = [];
  for (let n = 0; n < floors; n++) {
    const base = 735 - n * 126;
    blocks.push(
      { x: x - width / 2 + 12, y: base - 52, w: 24, h: 104, material },
      { x: x + width / 2 - 12, y: base - 52, w: 24, h: 104, material },
      { x, y: base - 115, w: width + 24, h: 22, material: n === floors - 1 ? 'wood' : material },
    );
  }
  return blocks;
}
const pig = (x: number, y = 711, helmet = false): PigSpec => ({ x, y, helmet });
export const LEVELS: Level[] = [
  {
    name: '初见绿野',
    subtitle: 'FIRST FLIGHT',
    hint: '拉住红色小鸟向左下拖动，松手发射。试着击中木塔下方。',
    birds: ['red', 'red', 'red'],
    blocks: tower(1110, 2),
    pigs: [pig(1110), pig(1110, 585)],
    thresholds: [13500, 23000],
    palette: 0,
  },
  {
    name: '玻璃花房',
    subtitle: 'FRAGILE THINGS',
    hint: '玻璃易碎。疾风在空中再次点击，可以加速穿过支柱。',
    birds: ['yellow', 'red', 'red'],
    blocks: [...tower(990, 2, 'glass'), ...tower(1300, 1)],
    pigs: [pig(990), pig(990, 585), pig(1300)],
    thresholds: [19500, 29000],
    palette: 0,
  },
  {
    name: '双塔之间',
    subtitle: 'CHAIN REACTION',
    hint: '从左侧开始，让倒下的建筑引发连锁反应。',
    birds: ['red', 'yellow', 'bomb'],
    blocks: [...tower(980, 2), ...tower(1260, 3, 'glass')],
    pigs: [pig(980), pig(1260), pig(1260, 459)],
    thresholds: [22000, 32000],
    palette: 1,
  },
  {
    name: '石头堡垒',
    subtitle: 'HEAVY COMPANY',
    hint: '石头更重也更坚硬。把黑火送进堡垒中央，再点击引爆。',
    birds: ['bomb', 'yellow', 'red'],
    blocks: [...tower(1080, 2, 'stone', 190), ...tower(1360, 1, 'wood', 130)],
    pigs: [pig(1080, 711, true), pig(1080, 585), pig(1360)],
    thresholds: [22000, 33000],
    palette: 1,
  },
  {
    name: '空中楼阁',
    subtitle: 'HIGHER GROUND',
    hint: '提高发射角度。从上方落下的重物也能造成伤害。',
    birds: ['yellow', 'bomb', 'red', 'red'],
    blocks: [
      ...tower(960, 3),
      ...tower(1250, 3, 'glass'),
      { x: 1105, y: 346, w: 330, h: 22, material: 'wood' },
    ],
    pigs: [pig(960), pig(960, 459), pig(1250), pig(1250, 585)],
    thresholds: [32000, 45000],
    palette: 2,
  },
  {
    name: '最后的鸟蛋',
    subtitle: 'BRING THEM HOME',
    hint: '混合材质的最终防线。合理使用技能，把鸟蛋带回家。',
    birds: ['bomb', 'yellow', 'bomb', 'red'],
    blocks: [
      ...tower(920, 2, 'wood', 130),
      ...tower(1140, 3, 'stone', 160),
      ...tower(1390, 2, 'glass', 130),
    ],
    pigs: [pig(920), pig(1140, 711, true), pig(1140, 459, true), pig(1390), pig(1390, 585)],
    thresholds: [36000, 50000],
    palette: 2,
  },
];
