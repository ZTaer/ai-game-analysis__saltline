/**
 * Saltline / combat/combat
 * 从原版游戏按职责提取；保留原始算法、参数、着色器与执行顺序。
 */
import { Vector3 } from 'three';
/**
 * 战斗判定与统计：提供同步命中结果，HUD/音效/警戒等反馈通过事件分发。
 * 创建时只登记接口和击杀订阅；调用射击方法时，physics/player/enemies 必须已初始化。
 * @param {object} context 游戏运行上下文；本模块不独立注册逐帧更新。
 * @returns {object} 射击/爆炸入口及本轮 stats；任务重试通过 reset() 清空统计。
 */
function createCombat(context) {
  let stats = {
    shots: 0,
    hits: 0,
    kills: 0,
  };
  // 击杀由敌人死亡事件统计，避免一次射击与其后续爆炸重复计算同一目标。
  context.events.on('enemy:killed', () => {
    stats.kills++;
  });
  return {
    stats: stats,
    reset() {
      stats.shots = stats.hits = stats.kills = 0;
    },
    /**
     * @param {import('three').Vector3} origin 世界坐标射线起点。
     * @param {import('three').Vector3} direction 归一化世界方向。
     * @param {object} [options] damage 为基础伤害、range 为世界距离；武器会显式传入它们。
     * @returns {object|null} 命中载荷或 null，供武器确定曳光弹终点。
     */
    playerShot(origin, direction, { damage = 28, range = 300, impulse = 1 } = {}) {
      stats.shots++;
      // 先取得最近场景表面，用它限制敌人检测距离，避免穿墙命中。
      let worldHit = context.physics.raycast(origin, direction, range),
        enemyHit = context.enemies.raycast(origin, direction, worldHit ? worldHit.dist : range);
      if (enemyHit) {
        stats.hits++;
        let weakPointMultiplier = enemyHit.part === 'weak' ? 2.2 : 1,
          killed =
            enemyHit.enemy.damage(
              damage * weakPointMultiplier,
              enemyHit.point,
              direction,
              enemyHit.part,
            ) === true,
          impact = {
            point: enemyHit.point,
            normal: enemyHit.normal || direction.clone().negate(),
            dist: enemyHit.dist,
            surface: 'enemy',
            enemy: enemyHit.enemy,
            part: enemyHit.part,
            dir: direction,
            from: 'player',
            killed: killed,
          };
        // 物理命中反馈与玩家命中提示分开发送；敌人 damage() 内部负责死亡事件。
        context.events.emit('impact', impact);
        context.events.emit('player:hitEnemy', {
          enemy: enemyHit.enemy,
          part: enemyHit.part,
          killed: killed,
          weak: enemyHit.part === 'weak',
        });
        return impact;
      }
      if (worldHit) {
        let impact = {
          point: worldHit.point,
          normal: worldHit.normal,
          dist: worldHit.dist,
          surface: worldHit.surface,
          enemy: null,
          dir: direction,
          from: 'player',
        };
        context.events.emit('impact', impact);
        return impact;
      }
      return null;
    },
    /** 敌人射线同样受世界遮挡限制；命中玩家返回 true，由 player.damage() 发布受击事件。 */
    enemyShot(origin, direction, { damage = 6, range = 200 } = {}) {
      let worldHit = context.physics.raycast(origin, direction, range),
        maxDistance = worldHit ? worldHit.dist : range,
        player = context.player;
      if (player && player.alive) {
        let playerCenter = scratchTarget.copy(player.pos);
        playerCenter.y += 1;
        let projectedDistance = playerCenter.sub(origin).dot(direction);
        if (projectedDistance > 0 && projectedDistance < maxDistance) {
          scratchHit.copy(origin).addScaledVector(direction, projectedDistance);
          let verticalDistance = Math.abs(scratchHit.y - (player.pos.y + 0.95));
          if (
            Math.hypot(scratchHit.x - player.pos.x, scratchHit.z - player.pos.z) < 0.38 &&
            verticalDistance < 0.95
          ) {
            player.damage(damage, origin);
            return true;
          }
        }
      }
      if (worldHit) {
        context.events.emit('impact', {
          point: worldHit.point,
          normal: worldHit.normal,
          dist: worldHit.dist,
          surface: worldHit.surface,
          enemy: null,
          dir: direction,
          from: 'enemy',
        });
      }
      return false;
    },
    // 爆炸同时检查距离和视线；按距离线性衰减，并保留玩家受到一半基础伤害的规则。
    explode(position, radius = 5, damage = 80, source = 'player') {
      for (let enemy of context.enemies.list) {
        if (!enemy.alive) continue;
        let c = enemy.pos.distanceTo(position);
        if (
          c < radius &&
          context.physics.lineOfSight(
            position,
            scratchTarget.copy(enemy.pos).setY(enemy.pos.y + 0.5),
          )
        ) {
          enemy.damage(
            damage * (1 - c / radius),
            enemy.pos,
            scratchHit.copy(enemy.pos).sub(position).normalize(),
            'body',
          );
        }
      }
      let player = context.player;
      if (player && player.alive) {
        let distance = scratchTarget
          .copy(player.pos)
          .setY(player.pos.y + 1)
          .distanceTo(position);
        if (
          distance < radius &&
          context.physics.lineOfSight(
            position,
            scratchTarget.copy(player.pos).setY(player.pos.y + 1),
          )
        ) {
          player.damage(damage * 0.5 * (1 - distance / radius), position);
        }
      }
    },
  };
}
// 同步判定复用临时向量以避免每发子弹分配对象；返回载荷不直接暴露这些临时对象。
var scratchTarget = new Vector3(),
  scratchHit = new Vector3();
export { createCombat };
