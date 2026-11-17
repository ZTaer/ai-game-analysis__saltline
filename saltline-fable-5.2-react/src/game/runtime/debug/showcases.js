/** 子系统展示入口与占位输入/玩家。仅 ?show=... 使用；普通游戏仍创建真实子系统。 */
import { Vector3 } from 'three';
import { PLAYER_CONFIG } from '../../config.js';
import { Vg as renderShowcase } from '../../render/renderer.js';
import { qg as materialShowcase } from '../../materials/materials.js';
import { $g as propsShowcase } from '../../props/props.js';
import { cv as levelShowcase } from '../../level/level.js';
import { mv as backdropShowcase } from '../../backdrop/backdrop.js';
import { vv as groundShowcase } from '../../ground/ground.js';
import { Sv as effectsShowcase } from '../../effects/effects.js';
import { PC as showWeapon, createWeapon } from '../../weapon/weapon.js';
import { VC as showEnemies, createEnemies } from '../../enemies/enemies.js';
var showcases = {
  mats: materialShowcase,
  level: levelShowcase,
  backdrop: backdropShowcase,
  ground: groundShowcase,
  fx: effectsShowcase,
  weapon: {
    create: createWeapon,
    showcase: showWeapon,
  },
  enemies: {
    create: createEnemies,
    showcase: showEnemies,
  },
  props: propsShowcase,
  render: renderShowcase,
};
function createShowcaseInput() {
  let noop = () => {};
  return {
    move: {
      x: 0,
      y: 0,
    },
    look: {
      dx: 0,
      dy: 0,
    },
    fire: false,
    ads: false,
    sprint: false,
    crouch: false,
    locked: false,
    touch: false,
    sensitivity: 1,
    down: () => false,
    pressed: () => false,
    update: noop,
    endFrame: noop,
    requestLock: noop,
    exitLock: noop,
  };
}
function createShowcasePlayer(context) {
  return {
    pos: new Vector3(0, 0, 4),
    vel: new Vector3(),
    yaw: 0,
    pitch: 0,
    health: 100,
    maxHealth: 100,
    alive: true,
    onGround: true,
    sprinting: false,
    crouching: false,
    ads: 0,
    speed: 0,
    eye: new Vector3(0, PLAYER_CONFIG.eye, 4),
    forward: new Vector3(0, 0, -1),
    enabled: false,
    reset() {},
    damage() {},
    heal() {},
    addRecoil() {},
    addShake() {},
    update() {},
  };
}
export { showcases, createShowcaseInput, createShowcasePlayer };
