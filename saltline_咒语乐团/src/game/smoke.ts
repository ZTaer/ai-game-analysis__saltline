import type { GameEngine } from "./engine";
import type { Season, Snapshot } from "./types";

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}
export interface SmokeReport {
  status: "passed" | "failed";
  passed: number;
  failed: number;
  checks: CheckResult[];
  durationMs: number;
}

/**
 * Development-only integration checks. This module is tree-shaken out of production.
 * The harness drives the real fixed-step simulation and Rapier bodies, rather than
 * substituting a second implementation of movement, combat or objective rules.
 * Private access is deliberately confined to this file; no QA controls are exposed
 * on window and no extra dependencies are needed.
 */
export function runSmoke(engine: GameEngine): SmokeReport {
  // TypeScript private fields remain ordinary JS fields, which allows a narrow test seam.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = engine as any;
  const results: CheckResult[] = [];
  const started = performance.now();
  const settings = localStorage.getItem("wildspell-settings");
  const records = localStorage.getItem("wildspell-best");
  const originalQuality = e.quality as "high" | "medium";
  const originalMuted = e.muted as boolean;
  const extendedOnly =
    new URLSearchParams(location.search).get("qa") === "extended";
  const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message);
  };
  const run = (name: string, check: () => string | void) => {
    try {
      results.push({ name, passed: true, detail: check() || "ok" });
    } catch (error) {
      results.push({
        name,
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const snapshot = () => e.snapshot() as Snapshot;
  const protect = () => {
    e.invulnerable = 999;
    e.spawnTimer = 99999;
  };
  const tick = (count: number) => {
    for (let i = 0; i < count; i++) {
      if (e.mode === "upgrade") {
        engine.chooseUpgrade(e.choices[0]);
        protect();
      }
      assert(
        e.mode === "playing",
        `Simulation stopped in mode ${e.mode} at tick ${i}/${count}`,
      );
      e.tick(1 / 60);
      e.effects.update(1 / 60);
    }
  };
  const teleport = (x: number, z: number) => {
    e.keys.clear();
    e.touch.set(0, 0);
    e.dashTime = 0;
    const height = e.playerBody.translation().y;
    e.playerBody.setTranslation({ x, y: height, z }, true);
    e.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    e.wizard.position.set(x, 0, z);
  };
  const requirePlaying = () => {
    if (e.mode === "upgrade") engine.chooseUpgrade(e.choices[0]);
    assert(e.mode === "playing", `Expected playing, received ${e.mode}`);
    protect();
  };
  const buildState = () =>
    JSON.stringify({
      spells: e.spells,
      power: e.power,
      haste: e.haste,
      maxHealth: e.maxHealth,
      magnet: e.magnet,
    });

  let pre = document.getElementById("qa-results") as HTMLPreElement | null;
  if (!pre) {
    pre = document.createElement("pre");
    pre.id = "qa-results";
    document.body.appendChild(pre);
  }
  pre.setAttribute("role", "status");
  pre.setAttribute("aria-label", "Developer integration test results");
  pre.style.cssText =
    "position:fixed;z-index:9999;right:12px;top:12px;max-width:min(600px,calc(100vw - 24px));max-height:90vh;overflow:auto;padding:16px;margin:0;background:rgba(5,20,16,.97);border:1px solid #8fae76;color:#d4e6c8;font:11px/1.65 monospace;white-space:pre-wrap;pointer-events:auto;user-select:text;";
  pre.textContent =
    "Running real fixed-step / Rapier integration smoke checks…";
  engine.setMuted(true);

  try {
    if (!extendedOnly) {
      for (const season of ["spring", "winter"] as Season[]) {
        run(`${season}: start and reset`, () => {
          engine.start(season);
          protect();
          const s = snapshot();
          assert(
            s.mode === "playing" && s.season === season,
            "Wrong stage or mode",
          );
          assert(
            s.health === 100 &&
              s.maxHealth === 100 &&
              s.level === 1 &&
              s.xp === 0 &&
              s.time === 0 &&
              s.kills === 0,
            "Run counters were not reset",
          );
          assert(
            s.spells.length === 1 &&
              s.spells[0].id === "bolt" &&
              s.spells[0].level === 1,
            "Fresh spell loadout incorrect",
          );
          assert(
            s.shrines === 0 &&
              s.shrinePositions.length === 3 &&
              s.bossMaxHealth === 0,
            "Objectives did not reset",
          );
          assert(
            e.props.length > 0 && e.physics.bodies.len() > 1,
            "Physical scene lacks dynamic props",
          );
          return `${e.physics.bodies.len()} real rigid bodies; ${e.world.obstacles.length} obstacles`;
        });
        run(`${season}: WASD movement through Rapier`, () => {
          requirePlaying();
          const before = e.playerBody.translation();
          e.keys.add("KeyW");
          tick(120);
          e.keys.clear();
          const after = e.playerBody.translation();
          const distance = Math.hypot(after.x - before.x, after.z - before.z);
          assert(
            distance > 2,
            `Player moved only ${distance.toFixed(3)} world units`,
          );
          assert(
            Number.isFinite(after.x) &&
              Number.isFinite(after.y) &&
              Number.isFinite(after.z),
            "Physics produced nonfinite position",
          );
          assert(
            Math.abs(e.wizard.position.x - after.x) < 0.001 &&
              Math.abs(e.wizard.position.z - after.z) < 0.001,
            "Rendered player not synchronized to body",
          );
          return `${distance.toFixed(2)} units in 120 simulation steps`;
        });
        run(`${season}: dash and cooldown`, () => {
          requirePlaying();
          teleport(0, 0);
          const before = e.playerBody.translation();
          engine.dash();
          assert(e.dashCd === 3 && e.dashTime > 0, "Dash did not engage");
          tick(15);
          protect();
          const after = e.playerBody.translation();
          const remaining = e.dashCd;
          engine.dash();
          assert(e.dashCd === remaining, "Dash ignored its cooldown");
          const distance = Math.hypot(after.x - before.x, after.z - before.z);
          assert(
            distance > 1.5,
            `Dash moved only ${distance.toFixed(3)} world units`,
          );
          tick(180);
          assert(e.dashCd === 0, "Dash cooldown did not expire");
          return `${distance.toFixed(2)} units; repeated cast rejected; cooldown expires`;
        });
        run(`${season}: pulse physical impulse and cooldown`, () => {
          requirePlaying();
          const prop = e.props[0];
          const p = prop.body.translation();
          teleport(p.x + 1.1, p.z);
          const initialVelocity = prop.body.linvel();
          engine.pulse();
          const velocity = prop.body.linvel();
          const impulse = Math.hypot(
            velocity.x - initialVelocity.x,
            velocity.y - initialVelocity.y,
            velocity.z - initialVelocity.z,
          );
          assert(e.pulseCd === 12, "Pulse cooldown did not start");
          assert(
            impulse > 0.01,
            "Pulse did not impart physical impulse to a nearby dynamic prop",
          );
          engine.pulse();
          assert(e.pulseCd === 12, "Pulse changed cooldown on a rejected cast");
          return `Dynamic prop velocity changed by ${impulse.toFixed(2)}`;
        });
        run(`${season}: XP upgrade choices and selection`, () => {
          requirePlaying();
          teleport(0, 0);
          const level = e.level;
          e.xp = e.xpNext;
          e.updatePickups(1 / 60);
          assert(
            e.mode === "upgrade" && e.level === level + 1,
            "XP threshold did not open level-up",
          );
          assert(
            e.choices.length === 3 && new Set(e.choices).size === 3,
            "Expected three unique offered upgrades",
          );
          engine.chooseUpgrade("not-an-offered-upgrade");
          assert(e.mode === "upgrade", "Invalid choice was accepted");
          const id = e.choices[0],
            before = buildState();
          engine.chooseUpgrade(id);
          assert(
            e.mode === "playing" && e.choices.length === 0,
            "Choosing a valid upgrade did not resume",
          );
          assert(
            buildState() !== before,
            "Chosen upgrade did not change the build",
          );
          protect();
          return `LV ${e.level}; selected ${id}`;
        });
        for (let i = 0; i < 3; i++)
          run(`${season}: shrine ${i + 1} sustained attunement`, () => {
            requirePlaying();
            const shrine = e.world.shrinePositions[i];
            teleport(shrine.x, shrine.z + 1);
            tick(120);
            assert(
              e.shrineProgress[i] > 0.3 && !e.shrineDone[i],
              "Shrine should be charging, not immediately completed",
            );
            tick(192);
            if (e.mode === "upgrade") {
              engine.chooseUpgrade(e.choices[0]);
              protect();
            }
            assert(
              e.shrineDone[i],
              `Shrine ${i + 1} did not finish after 5.2 simulation seconds; progress=${e.shrineProgress[i]}`,
            );
            assert(
              snapshot().shrines === i + 1,
              "Snapshot shrine count is inconsistent",
            );
            return `Activated after 312 Rapier steps at (${shrine.x}, ${shrine.z + 1})`;
          });
        run(`${season}: guardian spawn and victory`, () => {
          requirePlaying();
          const boss = e.boss;
          assert(
            e.bossSpawned && boss && boss.kind === "boss" && boss.hp > 0,
            "Three shrines did not spawn the guardian",
          );
          const maxHp = boss.maxHp;
          e.hit(boss, maxHp * 10, e.wizard.position.clone(), 0);
          assert(
            e.mode === "victory" && e.bossDefeated && !e.boss,
            "Guardian defeat did not resolve victory",
          );
          assert(
            !e.enemies.includes(boss),
            "Defeated guardian remains in active enemies",
          );
          return `${snapshot().bossName}; ${maxHp} HP; victory reached through hit/kill`;
        });
        run(`${season}: death wins over same-frame healing`, () => {
          engine.start(season);
          e.spawnTimer = 99999;
          teleport(0, 0);
          e.invulnerable = 0;
          e.health = 1;
          e.spells.bloom = 1;
          e.spellTimers.bloom = 0;
          e.dropPickup(e.wizard.position.clone(), 50, true);
          e.spawnEnemy("crawler");
          const attacker = e.enemies[e.enemies.length - 1];
          const height = attacker.body.translation().y;
          attacker.body.setTranslation({ x: 0.2, y: height, z: 0.2 }, true);
          attacker.mesh.position.set(0.2, 0, 0.2);
          attacker.hitAt = 0;
          e.tick(1 / 60);
          assert(
            e.mode === "dead" && e.health === 0,
            `Death overwritten: mode=${e.mode}, health=${e.health}`,
          );
          assert(
            e.pickups.some((p: { health: boolean }) => p.health),
            "Healing pickup ran after lethal contact",
          );
          return "Real contact damage remains lethal despite ready bloom and overlapping health pickup";
        });
        run(`${season}: retry and menu teardown`, () => {
          engine.start(season);
          protect();
          const fresh = snapshot();
          assert(
            fresh.mode === "playing" &&
              fresh.health === 100 &&
              fresh.time === 0 &&
              fresh.kills === 0 &&
              fresh.level === 1,
            "Retry did not reset counters",
          );
          assert(
            fresh.spells.length === 1 &&
              fresh.spells[0].id === "bolt" &&
              fresh.bossMaxHealth === 0,
            "Retry preserved prior build or boss",
          );
          const shrine = e.world.shrinePositions[0];
          teleport(shrine.x, shrine.z + 1);
          tick(6);
          assert(
            snapshot().nearShrine,
            "Menu teardown regression setup did not enter an altar",
          );
          engine.returnToMenu();
          const menu = snapshot();
          assert(
            menu.mode === "menu" &&
              menu.time === 0 &&
              menu.shrines === 0 &&
              menu.enemies.length === 0,
            "Menu retained active combat or objective state",
          );
          assert(
            e.pickups.length === 0 && e.projectiles.length === 0,
            "Menu retained combat objects",
          );
          assert(
            !menu.nearShrine && menu.shrineProgress === 0,
            "Menu retained proximity / attunement state",
          );
          return "Fresh run, clean combat teardown and reset altar state";
        });
      }
      run("settings: medium / high rendering quality", () => {
        engine.setQuality("medium");
        assert(
          snapshot().quality === "medium" && !e.bloom.enabled,
          "Medium quality did not disable bloom",
        );
        assert(
          e.renderer.getPixelRatio() <= 1,
          "Medium quality did not limit pixel density",
        );
        engine.setQuality("high");
        assert(
          snapshot().quality === "high" && e.bloom.enabled,
          "High quality did not restore bloom",
        );
        return "Real renderer density and postprocessing toggled";
      });
    }

    // Isolate each spell from the automatic starter bolt and unrelated wave spawns.
    // Enemy bodies, spell timers, damage handlers and telegraphs are all real.
    const spellFixture = (season: Season = "spring") => {
      engine.start(season);
      protect();
      teleport(0, 0);
      for (const id of Object.keys(e.spellTimers)) e.spellTimers[id] = 9999;
      e.spells = { bolt: 1 };
      e.mouseDown = false;
    };
    const targetAt = (x: number, z = 0, kind: "brute" | "boss" = "brute") => {
      e.spawnEnemy(kind);
      const enemy = e.enemies[e.enemies.length - 1];
      const y = enemy.body.translation().y;
      enemy.body.setTranslation({ x, y, z }, true);
      enemy.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      enemy.mesh.position.set(x, 0, z);
      enemy.hp = 10000;
      enemy.maxHp = 10000;
      enemy.attack = 999;
      return enemy;
    };
    // Remove critical-hit variance only within the compared operations, always restore.
    const withoutCriticals = <T>(operation: () => T): T => {
      const random = Math.random;
      try {
        Math.random = () => 0.5;
        return operation();
      } finally {
        Math.random = random;
      }
    };
    run("spells: frost damages and freezes only targets in range", () => {
      spellFixture();
      const near = targetAt(2.5),
        far = targetAt(8);
      e.spells.frost = 1;
      e.spellTimers.frost = 0;
      withoutCriticals(() => e.updateSpells(1 / 60));
      assert(
        near.hp < near.maxHp && near.frozen > 2,
        "Frost did not damage and freeze its nearby target",
      );
      assert(
        far.hp === far.maxHp && far.frozen === 0,
        "Frost affected a target outside its radius",
      );
      assert(e.spellTimers.frost > 0, "Frost did not enter cooldown");
      return `${near.maxHp - near.hp} damage; ${near.frozen.toFixed(2)}s freeze; distant target unaffected`;
    });
    run("spells: orbit blades rotate and damage on contact", () => {
      spellFixture();
      const contact = targetAt(2.63),
        center = targetAt(0, 0.2);
      e.spells.orbit = 1;
      e.spellTimers.orbit = 0;
      withoutCriticals(() => e.updateSpells(1 / 60));
      assert(
        e.orbitMeshes.length === 2,
        "Level-one orbit did not create its two blades",
      );
      assert(
        contact.hp < contact.maxHp && center.hp === center.maxHp,
        "Orbit hit test does not match blade geometry",
      );
      const first = e.orbitMeshes[0].position.clone();
      e.time = 0.5;
      e.updateSpells(1 / 60);
      assert(
        first.distanceTo(e.orbitMeshes[0].position) > 1,
        "Orbit blades do not travel around the player",
      );
      return `${contact.maxHp - contact.hp} contact damage; two rotating blades; center target untouched`;
    });
    run("spells: meteor telegraph and frost double-damage synergy", () => {
      spellFixture();
      const enemy = targetAt(3);
      e.spells.meteor = 1;
      e.spellTimers.meteor = 0;
      return withoutCriticals(() => {
        e.updateSpells(1 / 60);
        assert(
          e.dangers.length === 1 && !e.dangers[0].enemy,
          "Meteor did not create its friendly impact telegraph",
        );
        assert(
          enemy.hp === enemy.maxHp,
          "Meteor damaged the target before the warning expired",
        );
        e.updateDangers(0.4);
        assert(
          enemy.hp === enemy.maxHp,
          "Meteor impacted before its complete warning duration",
        );
        const before = e.totalDamage;
        e.updateDangers(0.41);
        const ordinary = e.totalDamage - before;
        assert(
          ordinary > 0 && e.dangers.length === 0,
          "Meteor failed to resolve its delayed impact",
        );
        e.spells.frost = 1;
        e.spellTimers.frost = 0;
        e.updateSpells(1 / 60);
        assert(
          enemy.frozen > 0,
          "Real frost cast did not prepare the synergy target",
        );
        delete e.spells.frost;
        e.spellTimers.meteor = 0;
        e.updateSpells(1 / 60);
        const beforeFrozen = e.totalDamage;
        e.updateDangers(0.81);
        const frozen = e.totalDamage - beforeFrozen;
        assert(
          Math.abs(frozen - ordinary * 2) < 0.001,
          `Frozen meteor damage was ${frozen}; normal was ${ordinary}`,
        );
        return `${ordinary} normal / ${frozen} frozen impact damage; 0.8s warning respected`;
      });
    });
    run("spells: chain selects unique targets and gains a frozen jump", () => {
      spellFixture();
      const targets = [2, 4, 6, 8].map((x) => targetAt(x));
      e.spells.chain = 1;
      e.spellTimers.chain = 0;
      return withoutCriticals(() => {
        e.updateSpells(1 / 60);
        const normalHits = targets.filter(
          (target) => target.hp < target.maxHp,
        ).length;
        assert(
          normalHits === 3,
          `Expected three distinct chain targets, received ${normalHits}`,
        );
        const damage = targets[0].maxHp - targets[0].hp;
        assert(
          targets
            .slice(0, 3)
            .every((target) => target.maxHp - target.hp === damage),
          "Chain damaged a target more than once",
        );
        e.spells = { bolt: 1, frost: 1 };
        e.spellTimers.frost = 0;
        e.updateSpells(1 / 60);
        assert(
          targets[0].frozen > 0,
          "Real frost cast did not freeze initial chain target",
        );
        for (const target of targets) target.hp = target.maxHp;
        e.spells = { bolt: 1, chain: 1 };
        e.spellTimers.chain = 0;
        e.updateSpells(1 / 60);
        const frozenHits = targets.filter(
          (target) => target.hp < target.maxHp,
        ).length;
        assert(
          frozenHits === 4,
          `Frozen initial target did not grant another jump; hit ${frozenHits}`,
        );
        return `${normalHits} normal / ${frozenHits} frozen-chain targets; ${damage} damage per target`;
      });
    });
    run(
      "spells: bloom heals, damages nearby enemies and respects cooldown",
      () => {
        spellFixture();
        e.health = 50;
        const near = targetAt(2),
          far = targetAt(7);
        e.spells.bloom = 1;
        e.spellTimers.bloom = 0;
        withoutCriticals(() => e.updateSpells(1 / 60));
        const healed = e.health - 50;
        assert(
          healed > 0 && near.hp < near.maxHp,
          "Bloom did not both heal and damage",
        );
        assert(far.hp === far.maxHp, "Bloom affected a distant target");
        e.updateSpells(1 / 60);
        assert(
          e.health === 50 + healed,
          "Bloom healed again before cooldown expired",
        );
        e.health = e.maxHealth - 1;
        e.spellTimers.bloom = 0;
        e.updateSpells(1 / 60);
        assert(
          e.health === e.maxHealth,
          "Bloom exceeds maximum health or fails to top up",
        );
        return `${healed} healing; ${near.maxHp - near.hp} cumulative nearby damage; cooldown and max-health cap hold`;
      },
    );
    for (const season of ["spring", "winter"] as Season[])
      run(`${season}: guardian body moves without floor penetration`, () => {
        spellFixture(season);
        const boss = targetAt(0, -6, "boss");
        const before = boss.body.translation();
        const initialDistance = Math.hypot(before.x, before.z);
        tick(120);
        const after = boss.body.translation();
        const distance = Math.hypot(after.x - before.x, after.z - before.z);
        assert(
          distance > 0.3,
          `Guardian rigid body is pinned: moved ${distance.toFixed(4)} units in 2 seconds`,
        );
        assert(
          Math.hypot(after.x, after.z) < initialDistance,
          "Guardian did not approach the player",
        );
        assert(
          Math.abs(after.y - before.y) < 0.001,
          "Guardian body height drifted despite constrained planar movement",
        );
        assert(
          after.y >= boss.radius + 0.25,
          "Guardian capsule intersects the floor at rest",
        );
        return `${distance.toFixed(2)} units toward player; body center y=${after.y.toFixed(2)} for radius ${boss.radius}`;
      });
    run(
      "lifecycle: actual frames preserve paused time and resume fixed stepping",
      () => {
        spellFixture();
        engine.dash();
        engine.pulse();
        engine.pause();
        const paused = snapshot(),
          before = e.playerBody.translation();
        const now = performance.now();
        const driveFrame = (time: number) => {
          cancelAnimationFrame(e.raf);
          e.raf = 0;
          e.frame(time);
          cancelAnimationFrame(e.raf);
          e.raf = 0;
        };
        try {
          e.last = now;
          driveFrame(now + 500);
          driveFrame(now + 1500);
          const after = e.playerBody.translation();
          const state = snapshot();
          assert(
            state.mode === "paused" && state.time === paused.time,
            "Paused frame advanced run time",
          );
          assert(
            state.dashCooldown === paused.dashCooldown &&
              state.pulseCooldown === paused.pulseCooldown,
            "Paused frame advanced cooldowns",
          );
          assert(
            after.x === before.x && after.z === before.z,
            "Paused frame stepped player physics",
          );
          engine.resume();
          protect();
          e.keys.add("KeyW");
          driveFrame(now + 1550);
          e.keys.clear();
          const resumed = snapshot();
          assert(
            resumed.mode === "playing" && resumed.time > paused.time,
            "Resume did not restart fixed-step simulation",
          );
          assert(
            resumed.time - paused.time <= 0.051,
            "Resume incorrectly simulated the elapsed paused wall time",
          );
          assert(
            resumed.dashCooldown < paused.dashCooldown,
            "Resume did not restore cooldown updates",
          );
          return `1.5s paused wall time skipped; resumed ${(resumed.time - paused.time).toFixed(3)}s of real simulation`;
        } finally {
          cancelAnimationFrame(e.raf);
          e.last = performance.now();
          e.raf = requestAnimationFrame(e.frame);
        }
      },
    );
  } catch (error) {
    results.push({
      name: "harness execution",
      passed: false,
      detail:
        error instanceof Error ? error.stack || error.message : String(error),
    });
  } finally {
    try {
      engine.returnToMenu();
      engine.setQuality(originalQuality);
      e.muted = originalMuted;
      e.audio.setMuted(originalMuted);
      e.emit();
    } catch (error) {
      results.push({ name: "cleanup", passed: false, detail: String(error) });
    }
    if (settings === null) localStorage.removeItem("wildspell-settings");
    else localStorage.setItem("wildspell-settings", settings);
    if (records === null) localStorage.removeItem("wildspell-best");
    else localStorage.setItem("wildspell-best", records);
  }
  const passed = results.filter((r) => r.passed).length;
  const report: SmokeReport = {
    status: passed === results.length ? "passed" : "failed",
    passed,
    failed: results.length - passed,
    checks: results,
    durationMs: Math.round(performance.now() - started),
  };
  pre.style.borderColor = report.failed ? "#d78878" : "#8fae76";
  pre.textContent = JSON.stringify(report, null, 2);
  pre.dataset.status = report.status;
  return report;
}
