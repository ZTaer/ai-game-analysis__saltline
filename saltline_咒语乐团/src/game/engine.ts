import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { createWorld } from "./world";
import { createWizard, createEnemy, animateActor } from "./actors";
import { SynthAudio } from "./audio";
import { Effects } from "./effects";
import { createEnvironment } from "./environment";
// Preserve the WASM instance across React StrictMode and Vite module replacement.
const physicsRuntime = globalThis as typeof globalThis & {
  __wildspellPhysicsReady?: Promise<void>;
};
import { DURATION, SPELLS, STAGES, UPGRADES } from "./config";
import type { Mode, Season, Snapshot, SpellId, WorldView } from "./types";

type Enemy = {
  id: number;
  kind: "crawler" | "wisp" | "brute" | "boss";
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  frozen: number;
  hitAt: number;
  attack: number;
  phase: number;
};
type Projectile = {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  damage: number;
  life: number;
  radius: number;
  hit: Set<number>;
  pierce: number;
  hostile: boolean;
};
type Pickup = { mesh: THREE.Mesh; value: number; age: number; health: boolean };
type Prop = { mesh: THREE.Object3D; body: RAPIER.RigidBody; ttl?: number };
type Danger = {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  radius: number;
  life: number;
  max: number;
  damage: number;
  enemy: boolean;
};
const clamp = THREE.MathUtils.clamp;
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const VIGNETTE = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uHurt: { value: 0 },
  },
  vertexShader:
    "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uTime;uniform float uHurt;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;vec2 q=vUv-.5;float v=1.-smoothstep(.25,.83,length(q));c*=mix(.63,1.,v);float grain=fract(sin(dot(vUv+fract(uTime),vec2(12.9898,78.233)))*43758.5453);c+=(grain-.5)*.016;c+=vec3(.4,.025,.015)*uHurt*(1.-v);gl_FragColor=vec4(c,1.);}`,
};

/** Fixed-step physics and combat, independent of React's render lifecycle. */
export class GameEngine {
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera();
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private ao!: SSAOPass;
  private grade!: ShaderPass;
  private world!: WorldView;
  private physics!: RAPIER.World;
  private effects!: Effects;
  private wizard!: THREE.Group;
  private playerBody!: RAPIER.RigidBody;
  private audio = new SynthAudio();
  private mode: Mode = "loading";
  private season: Season = "spring";
  private ready = false;
  private destroyed = false;
  private raf = 0;
  private last = 0;
  private accum = 0;
  private uiTimer = 0;
  private ambientTime = 0;
  private fps = 60;
  private health = 100;
  private maxHealth = 100;
  private xp = 0;
  private xpNext = 12;
  private level = 1;
  private time = 0;
  private kills = 0;
  private combo = 0;
  private bestCombo = 0;
  private comboTime = 0;
  private totalDamage = 0;
  private power = 1;
  private haste = 1;
  private magnet = 2.5;
  private xpMult = 1;
  private moveMult = 1;
  private dashCd = 0;
  private dashTime = 0;
  private pulseCd = 0;
  private invulnerable = 0;
  private shake = 0;
  private hurt = 0;
  private spells: Partial<Record<SpellId, number>> = { bolt: 1 };
  private spellTimers: Record<SpellId, number> = {
    bolt: 0,
    frost: 1,
    orbit: 0,
    meteor: 2,
    chain: 1,
    bloom: 3,
  };
  private orbitMeshes: THREE.Mesh[] = [];
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private props: Prop[] = [];
  private dangers: Danger[] = [];
  private nextEnemyId = 1;
  private spawnTimer = 1;
  private bossSpawned = false;
  private bossDefeated = false;
  private boss: Enemy | null = null;
  private shrineProgress = [0, 0, 0];
  private shrineDone = [false, false, false];
  private nearShrine = false;
  private activeShrine = -1;
  private choices: string[] = [];
  private notification = "";
  private notificationTimer = 0;
  private muted = false;
  private quality: "high" | "medium" = "high";
  private keys = new Set<string>();
  private direction = new THREE.Vector3(0, 0, -1);
  private touch = new THREE.Vector2();
  private aim = new THREE.Vector3();
  private mouseDown = false;
  private pointer = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private camTarget = new THREE.Vector3();
  private saveBest = 0;
  private stepTimer = 0;
  private environment?: THREE.WebGLRenderTarget;
  private resizeObserver?: ResizeObserver;
  private sun!: THREE.DirectionalLight;
  private hemisphere!: THREE.HemisphereLight;
  private projectileGeometry = new THREE.IcosahedronGeometry(0.14, 1);
  private pickupGeometry = new THREE.OctahedronGeometry(0.13);
  private boltMaterial = new THREE.MeshBasicMaterial({
    color: 0xffdda0,
    toneMapped: false,
  });
  private hostileMaterial = new THREE.MeshBasicMaterial({
    color: 0xff616c,
    toneMapped: false,
  });
  private xpMaterial = new THREE.MeshStandardMaterial({
    color: 0x8be6c7,
    emissive: 0x37c9b4,
    emissiveIntensity: 1.8,
    roughness: 0.3,
    metalness: 0.4,
  });
  private healMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4a4a7,
    emissive: 0xe5526b,
    emissiveIntensity: 1,
  });
  constructor(
    private canvas: HTMLCanvasElement,
    private onSnapshot: (s: Snapshot) => void,
  ) {
    try {
      const s = JSON.parse(localStorage.getItem("wildspell-settings") || "{}");
      this.muted = !!s.muted;
      this.quality = s.quality === "medium" ? "medium" : "high";
      this.saveBest = Number(localStorage.getItem("wildspell-best") || 0);
    } catch {}
  }
  async init() {
    try {
      await (physicsRuntime.__wildspellPhysicsReady ??= RAPIER.init());
      if (this.destroyed) return;
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: "high-performance",
      });
      this.renderer.setPixelRatio(
        Math.min(devicePixelRatio, this.quality === "high" ? 1.5 : 1),
      );
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.1;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.camera.near = 0.1;
      this.camera.far = 150;
      this.scene.background = new THREE.Color(0x728d8a);
      this.scene.fog = new THREE.FogExp2(0x8fa7a0, 0.016);
      this.hemisphere = new THREE.HemisphereLight(0xd8e9ec, 0x465642, 1.25);
      this.scene.add(this.hemisphere);
      this.sun = new THREE.DirectionalLight(0xffe2b0, 3.5);
      this.sun.position.set(-12, 25, 8);
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      Object.assign(this.sun.shadow.camera, {
        left: -31,
        right: 31,
        top: 31,
        bottom: -31,
        near: 1,
        far: 70,
      });
      this.sun.shadow.bias = -0.0003;
      this.sun.shadow.normalBias = 0.045;
      this.sun.shadow.radius = 2;
      this.scene.add(this.sun, this.sun.target);
      const rim = new THREE.DirectionalLight(0xc7e3ff, 0.8);
      rim.position.set(8, 10, -16);
      this.scene.add(rim);
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.ao = new SSAOPass(this.scene, this.camera, 1, 1, 12);
      this.ao.ssaoMaterial.defines.PERSPECTIVE_CAMERA = 0;
      this.ao.depthRenderMaterial.defines.PERSPECTIVE_CAMERA = 0;
      this.ao.kernelRadius = 0.85;
      this.ao.minDistance = 0.001;
      this.ao.maxDistance = 0.02;
      this.ao.enabled = this.quality === "high";
      this.composer.addPass(this.ao);
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(1, 1),
        0.32,
        0.65,
        1.1,
      );
      this.bloom.enabled = this.quality === "high";
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.grade = new ShaderPass(VIGNETTE);
      this.composer.addPass(this.grade);
      this.effects = new Effects(this.scene);
      this.buildStage();
      this.audio.setMuted(this.muted);
      this.audio.setSeason(this.season);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
      this.resize();
      window.addEventListener("keydown", this.keydown);
      window.addEventListener("keyup", this.keyup);
      window.addEventListener("blur", this.blur);
      document.addEventListener("visibilitychange", this.visibility);
      this.canvas.addEventListener("pointermove", this.pointermove);
      this.canvas.addEventListener("pointerdown", this.pointerdown);
      window.addEventListener("pointerup", this.pointerup);
      this.canvas.addEventListener("contextmenu", this.contextmenu);
      this.ready = true;
      this.mode = "menu";
      this.emit();
      this.raf = requestAnimationFrame(this.frame);
    } catch (e) {
      this.onSnapshot({
        ...this.snapshot(),
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }
  private buildStage() {
    if (this.world) {
      this.clearCombat();
      this.scene.remove(this.world.group);
      this.world.dispose();
      this.physics.free();
      if (this.wizard) {
        this.scene.remove(this.wizard);
        this.disposeObject(this.wizard);
      }
    }
    this.environment?.dispose();
    this.environment = createEnvironment(this.renderer, this.season);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.4;
    const winter = this.season === "winter";
    this.scene.background = new THREE.Color(winter ? 0x5b7b92 : 0x82978c);
    this.scene.fog = new THREE.FogExp2(winter ? 0x8daec2 : 0xa2b7a4, 0.012);
    this.sun.color.set(winter ? 0xdcecff : 0xffe1a8);
    this.sun.intensity = winter ? 2.5 : 3.4;
    this.hemisphere.color.set(winter ? 0xa8c9ec : 0xddeee5);
    this.hemisphere.groundColor.set(winter ? 0x52677c : 0x526247);
    this.world = createWorld(this.scene, this.season);
    if (!this.world.group.parent) this.scene.add(this.world.group);
    this.physics = new RAPIER.World({ x: 0, y: -18, z: 0 });
    this.physics.timestep = 1 / 60;
    this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(50, 0.2, 50)
        .setTranslation(0, -0.2, 0)
        .setFriction(winter ? 0.12 : 0.8),
    );
    for (const o of this.world.obstacles)
      this.physics.createCollider(
        RAPIER.ColliderDesc.cylinder((o.height || 2) / 2, o.radius)
          .setTranslation(o.x, (o.height || 2) / 2, o.z)
          .setFriction(0.4),
      );
    // Tangential boundary walls are actual colliders, not a camera-only boundary.
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      this.physics.createCollider(
        RAPIER.ColliderDesc.cuboid(1.6, 2, 0.3)
          .setTranslation(Math.sin(a) * 23.5, 2, Math.cos(a) * 23.5)
          .setRotation({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }),
      );
    }
    for (const p of this.world.props) {
      const body = this.physics.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(
            p.mesh.position.x,
            p.mesh.position.y,
            p.mesh.position.z,
          )
          .setLinearDamping(0.6)
          .setAngularDamping(0.8),
      );
      this.physics.createCollider(
        RAPIER.ColliderDesc.cuboid(...p.halfSize)
          .setMass(p.mass || 2)
          .setRestitution(0.2)
          .setFriction(winter ? 0.18 : 0.65),
        body,
      );
      this.props.push({ mesh: p.mesh, body });
    }
    this.wizard = createWizard();
    this.scene.add(this.wizard);
    this.playerBody = this.makeBody(0, 0, 0.36);
    this.camTarget.set(0, 0, 0);
    this.shinePlayer();
  }
  private shinePlayer() {
    const light = new THREE.PointLight(0x82e9dc, 2, 5, 2);
    light.position.set(0, 1.4, 0);
    this.wizard.add(light);
  }
  private makeBody(x: number, z: number, r: number) {
    const body = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, 0.25 + r + 0.03, z)
        .enabledTranslations(true, false, true)
        .lockRotations()
        .setLinearDamping(3)
        .setCcdEnabled(true),
    );
    this.physics.createCollider(
      RAPIER.ColliderDesc.capsule(0.25, r)
        .setMass(1.5)
        .setFriction(0.1)
        .setRestitution(0.05),
      body,
    );
    return body;
  }
  private resize() {
    if (!this.renderer) return;
    const w = this.canvas.clientWidth || window.innerWidth,
      h = this.canvas.clientHeight || window.innerHeight;
    const span = w / h < 1 ? 16 : 13;
    this.camera.left = (-span * w) / h;
    this.camera.right = (span * w) / h;
    this.camera.top = span;
    this.camera.bottom = -span;
    this.camera.updateProjectionMatrix();
    // Postprocessing copies the camera matrices during setSize.
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }
  private persist() {
    try {
      localStorage.setItem(
        "wildspell-settings",
        JSON.stringify({ muted: this.muted, quality: this.quality }),
      );
    } catch {}
  }
  setMuted(value: boolean) {
    this.muted = value;
    this.audio.setMuted(value);
    if (!value) void this.audio.unlock();
    this.persist();
    this.emit();
  }
  setQuality(value: "high" | "medium") {
    this.quality = value;
    if (this.renderer) {
      this.renderer.setPixelRatio(
        Math.min(devicePixelRatio, value === "high" ? 1.5 : 1),
      );
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.bloom.enabled = value === "high";
      this.ao.enabled = value === "high";
      this.resize();
    }
    this.persist();
    this.emit();
  }
  selectSeason(season: Season) {
    if (!this.ready || this.mode !== "menu" || this.season === season) return;
    this.season = season;
    this.buildStage();
    this.audio.setSeason(season);
    this.emit();
  }
  start(season: Season = this.season) {
    if (!this.ready) return;
    void this.audio.unlock();
    this.season = season;
    this.buildStage();
    this.health = 100;
    this.maxHealth = 100;
    this.xp = 0;
    this.xpNext = 12;
    this.level = 1;
    this.time = 0;
    this.kills = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.totalDamage = 0;
    this.power = 1;
    this.haste = 1;
    this.magnet = 2.5;
    this.xpMult = 1;
    this.moveMult = 1;
    this.spells = { bolt: 1 };
    this.spellTimers = {
      bolt: 0,
      frost: 1,
      orbit: 0,
      meteor: 2,
      chain: 1,
      bloom: 3,
    };
    this.dashCd = 0;
    this.pulseCd = 0;
    this.invulnerable = 2;
    this.dashTime = 0;
    this.hurt = 0;
    this.shake = 0;
    this.spawnTimer = 2;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.boss = null;
    this.shrineProgress = [0, 0, 0];
    this.shrineDone = [false, false, false];
    this.activeShrine = -1;
    this.nearShrine = false;
    this.keys.clear();
    this.touch.set(0, 0);
    this.mode = "playing";
    this.accum = 0;
    this.audio.setSeason(season);
    this.notify("唤醒三座季节祭坛，迎战守望者", 7);
    this.emit();
  }
  pause() {
    if (this.mode === "playing") {
      this.mode = "paused";
      this.keys.clear();
      this.touch.set(0, 0);
      this.mouseDown = false;
      this.emit();
    }
  }
  resume() {
    if (this.mode === "paused") {
      this.mode = "playing";
      this.accum = 0;
      this.emit();
    }
  }
  returnToMenu() {
    if (!this.ready) return;
    this.mode = "menu";
    this.keys.clear();
    this.touch.set(0, 0);
    this.buildStage();
    this.boss = null;
    this.shrineProgress = [0, 0, 0];
    this.shrineDone = [false, false, false];
    this.nearShrine = false;
    this.activeShrine = -1;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.notification = "";
    this.time = 0;
    this.emit();
  }
  setTouchMove(x: number, z: number) {
    this.touch.set(x, z);
  }
  private keydown = (e: KeyboardEvent) => {
    if (
      this.mode === "playing" &&
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        e.code,
      )
    )
      e.preventDefault();
    if (e.repeat) return;
    if (e.code === "Escape") {
      if (this.mode === "playing") this.pause();
      else if (this.mode === "paused") this.resume();
    }
    if (this.mode === "upgrade" && /^Digit[123]$/.test(e.code)) {
      const id = this.choices[Number(e.code.slice(-1)) - 1];
      if (id) this.chooseUpgrade(id);
    }
    if (this.mode === "playing") {
      this.keys.add(e.code);
      if (e.code === "Space") this.dash();
      if (e.code === "KeyQ") this.pulse();
    }
  };
  private keyup = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private blur = () => this.pause();
  private visibility = () => {
    if (document.hidden) this.pause();
  };
  private contextmenu = (e: Event) => e.preventDefault();
  private pointermove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
  };
  private pointerdown = (e: PointerEvent) => {
    this.pointermove(e);
    if (e.button === 0) this.mouseDown = true;
  };
  private pointerup = () => {
    this.mouseDown = false;
  };
  dash() {
    if (this.mode !== "playing" || this.dashCd > 0) return;
    this.dashCd = 3;
    this.dashTime = 0.23;
    this.invulnerable = 0.45;
    this.audio.play("dash");
    this.effects.ring(this.wizard.position, 0x91ece1, 1.4, 0.3);
    this.effects.burst(this.wizard.position.clone().setY(0.5), 0xa9ead9, 24, 3);
  }
  pulse() {
    if (this.mode !== "playing" || this.pulseCd > 0) return;
    this.pulseCd = 12;
    this.shake = 0.12;
    this.audio.play("pulse");
    const p = this.wizard.position;
    this.effects.ring(p, 0xe9d9a9, 7, 0.65);
    this.effects.ring(p, 0x91d8e1, 5, 0.45);
    this.effects.burst(p.clone().setY(1), 0xc6f4ee, 55, 7);
    for (const e of [...this.enemies]) {
      if (e.mesh.position.distanceTo(p) < 7) {
        this.hit(e, 38 * this.power, p, 12);
        e.frozen = Math.max(e.frozen, 1);
      }
    }
    this.impulseProps(p, 8, 10);
  }
  private notify(text: string, seconds = 3) {
    this.notification = text;
    this.notificationTimer = seconds;
  }
  private frame = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - (this.last || now)) / 1000, 0.05);
    this.last = now;
    this.fps = THREE.MathUtils.lerp(this.fps, 1 / Math.max(dt, 0.001), 0.04);
    this.ambientTime += dt;
    if (this.mode === "playing") {
      this.accum += dt;
      let steps = 0;
      while (this.accum >= 1 / 60 && steps < 4 && this.mode === "playing") {
        this.tick(1 / 60);
        this.accum -= 1 / 60;
        steps++;
      }
    } else this.accum = 0;
    const animated = this.mode === "playing" || this.mode === "menu";
    if (animated) {
      this.world.update(dt, this.ambientTime, this.wizard.position);
      this.effects.update(dt);
      this.audio.update(
        dt,
        this.boss ? 1 : Math.min(1, this.enemies.length / 25),
      );
    }
    if (this.mode === "menu") {
      this.wizard.rotation.y = Math.PI + 0.5;
      animateActor(this.wizard, this.ambientTime, 0, "wizard");
      const a = Math.sin(this.ambientTime * 0.08) * 2;
      this.camera.position.set(14 + a, 25, 19 - a);
      this.camera.lookAt(-1, 0, -1);
    } else {
      this.camTarget.lerp(this.wizard.position, 1 - Math.exp(-dt * 5));
      this.camera.position
        .copy(this.camTarget)
        .add(new THREE.Vector3(12, 23, 18));
      this.shake = Math.max(0, this.shake - dt * 0.8);
      if (this.shake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake;
        this.camera.position.z += (Math.random() - 0.5) * this.shake;
      }
      this.camera.lookAt(this.camTarget);
    }
    this.hurt = Math.max(0, this.hurt - dt * 2);
    this.grade.uniforms.uHurt.value = this.hurt;
    this.grade.uniforms.uTime.value = this.ambientTime;
    this.composer.render();
    this.uiTimer += dt;
    if (this.uiTimer > 0.1) {
      this.uiTimer = 0;
      this.emit();
    }
  };
  private tick(dt: number) {
    this.time += dt;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.pulseCd = Math.max(0, this.pulseCd - dt);
    this.dashTime -= dt;
    this.invulnerable -= dt;
    this.comboTime -= dt;
    if (this.comboTime <= 0) this.combo = 0;
    this.notificationTimer -= dt;
    if (this.notificationTimer <= 0) this.notification = "";
    this.movePlayer(dt);
    this.updateEnemies(dt);
    if (this.mode !== "playing") return;
    this.physics.step();
    const p = this.playerBody.translation();
    this.wizard.position.set(p.x, 0, p.z);
    const velocity = this.playerBody.linvel();
    const speed = Math.hypot(velocity.x, velocity.z);
    animateActor(this.wizard, this.time, speed, "wizard");
    this.wizard.rotation.y = THREE.MathUtils.lerp(
      this.wizard.rotation.y,
      Math.atan2(-this.direction.x, -this.direction.z),
      0.2,
    );
    this.wizard.visible =
      this.invulnerable <= 0 ||
      this.dashTime > 0 ||
      Math.sin(this.time * 40) > -0.3;
    this.stepTimer -= dt;
    if (speed > 1 && this.stepTimer <= 0) {
      this.audio.play("step", 0.3);
      this.stepTimer = 0.32;
    }
    for (let i = this.props.length - 1; i >= 0; i--) {
      const o = this.props[i];
      o.mesh.position.copy(o.body.translation() as THREE.Vector3);
      o.mesh.quaternion.copy(o.body.rotation() as THREE.Quaternion);
      if (o.ttl !== undefined) {
        o.ttl -= dt;
        if (o.ttl <= 0) {
          this.scene.remove(o.mesh);
          this.disposeObject(o.mesh);
          this.physics.removeRigidBody(o.body);
          this.props.splice(i, 1);
        }
      }
    }
    this.updateSpells(dt);
    if (this.mode !== "playing") return;
    this.updateProjectiles(dt);
    if (this.mode !== "playing") return;
    this.updatePickups(dt);
    if (this.mode !== "playing") return;
    this.updateDangers(dt);
    if (this.mode !== "playing") return;
    this.updateObjectives(dt);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const cap = this.boss ? 24 : Math.min(44, 12 + Math.floor(this.time / 8));
      const count = 1 + Math.floor(this.time / 45);
      for (let j = 0; j < count && this.enemies.length < cap; j++)
        this.spawnEnemy();
      this.spawnTimer =
        Math.max(0.65, 2.4 - this.time * 0.008) *
        (this.season === "winter" ? 0.85 : 1);
    }
  }
  private movePlayer(dt: number) {
    let x =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0) +
      this.touch.x;
    let z =
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) -
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) +
      this.touch.y;
    const input = new THREE.Vector3(x, 0, z);
    if (input.length() > 1) input.normalize();
    input.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.588);
    if (input.length() > 0.1) this.direction.copy(input).normalize();
    const v = this.playerBody.linvel();
    if (this.dashTime > 0) {
      this.playerBody.setLinvel(
        { x: this.direction.x * 20, y: 0, z: this.direction.z * 20 },
        true,
      );
      if (Math.random() < 0.5)
        this.effects.burst(
          this.wizard.position.clone().setY(0.5),
          0x98e6dc,
          2,
          0.8,
        );
    } else {
      const ice = this.season === "winter";
      const response = 1 - Math.exp(-dt * (ice ? 9 : 18));
      const speed = 5.7 * this.moveMult;
      this.playerBody.setLinvel(
        {
          x: THREE.MathUtils.lerp(v.x, input.x * speed, response),
          y: 0,
          z: THREE.MathUtils.lerp(v.z, input.z * speed, response),
        },
        true,
      );
    }
  }

  // Combat systems are implemented below.
  private spawnEnemy(kind?: Enemy["kind"]) {
    const p = this.wizard.position;
    let pos = new THREE.Vector3();
    for (let n = 0; n < 24; n++) {
      const a = Math.random() * Math.PI * 2,
        d = 12 + Math.random() * 7;
      pos.set(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d);
      if (
        pos.length() < 21.8 &&
        !this.world.obstacles.some(
          (o) => Math.hypot(o.x - pos.x, o.z - pos.z) < o.radius + 1.2,
        )
      )
        break;
      if (n === 23) pos.set(0, 0, -19);
    }
    const roll = Math.random();
    kind =
      kind ||
      (this.time > 40 && roll < 0.18
        ? "brute"
        : this.time > 18 && roll < 0.4
          ? "wisp"
          : "crawler");
    const radius = kind === "boss" ? 1.45 : kind === "brute" ? 0.68 : 0.38;
    const base =
      kind === "boss"
        ? 1100
        : kind === "brute"
          ? 85
          : kind === "wisp"
            ? 30
            : 38;
    const hp =
      base *
      (this.season === "winter" ? 1.22 : 1) *
      (kind === "boss" ? 1 : 1 + this.time / 330);
    const mesh = createEnemy(kind, this.season);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const body = this.makeBody(pos.x, pos.z, radius);
    const enemy: Enemy = {
      id: this.nextEnemyId++,
      kind,
      mesh,
      body,
      hp,
      maxHp: hp,
      speed:
        kind === "boss"
          ? 1.45
          : kind === "brute"
            ? 1.6
            : kind === "wisp"
              ? 2.1
              : 2.25 + Math.random() * 0.5,
      radius,
      frozen: 0,
      hitAt: 0,
      attack: kind === "boss" ? 2.5 : 2 + Math.random() * 2,
      phase: Math.random() * 6,
    };
    this.enemies.push(enemy);
    this.effects.ring(
      pos,
      this.season === "winter" ? 0x8acff0 : 0xc29d9c,
      radius * 2,
      0.6,
    );
    if (kind === "boss") {
      this.boss = enemy;
      this.bossSpawned = true;
      this.notify(STAGES[this.season].boss + " · 已苏醒", 5);
      this.audio.play("boss");
      this.shake = 0.25;
    }
  }
  private updateEnemies(dt: number) {
    const player = this.wizard.position;
    for (const e of this.enemies) {
      const p = e.body.translation();
      e.mesh.position.set(p.x, 0, p.z);
      e.frozen = Math.max(0, e.frozen - dt);
      e.hitAt = Math.max(0, e.hitAt - dt);
      e.attack -= dt;
      const d = new THREE.Vector3(player.x - p.x, 0, player.z - p.z),
        distance = d.length();
      d.normalize();
      if (e.kind === "wisp" && distance < 6) d.multiplyScalar(-0.3);
      for (const o of this.world.obstacles) {
        const away = new THREE.Vector3(p.x - o.x, 0, p.z - o.z),
          len = away.length(),
          gap = o.radius + e.radius + 1.1;
        if (len < gap && len > 0.01) {
          away.divideScalar(len);
          const tangent = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(
            e.id % 2 ? 1 : -1,
          );
          d.addScaledVector(away, (gap - len) * 2.8).addScaledVector(
            tangent,
            0.7,
          );
        }
      }
      if (d.length() > 1) d.normalize();
      const v = e.body.linvel(),
        rate = 1 - Math.exp(-dt * 4),
        slow = e.frozen > 0 ? 0.12 : 1;
      const rage = e.kind === "boss" && e.hp < e.maxHp * 0.45 ? 1.45 : 1;
      const speed = e.speed * slow * rage;
      e.body.setLinvel(
        {
          x: THREE.MathUtils.lerp(v.x, d.x * speed, rate),
          y: 0,
          z: THREE.MathUtils.lerp(v.z, d.z * speed, rate),
        },
        true,
      );
      e.mesh.rotation.y = Math.atan2(-d.x, -d.z);
      animateActor(e.mesh, this.time + e.phase, speed, e.kind);
      if (distance < e.radius + 0.62 && e.hitAt <= 0) {
        this.hurtPlayer(e.kind === "boss" ? 22 : e.kind === "brute" ? 17 : 9);
        e.hitAt = 0.8;
        const away = new THREE.Vector3(
          p.x - player.x,
          0,
          p.z - player.z,
        ).normalize();
        e.body.applyImpulse({ x: away.x * 4, y: 0, z: away.z * 4 }, true);
      }
      if (e.attack <= 0 && e.frozen <= 0) {
        if (e.kind === "wisp" && distance < 13) {
          this.enemyShot(e, player);
          e.attack = 3.4;
        } else if (e.kind === "boss") {
          const rage = e.hp < e.maxHp * 0.45;
          this.telegraph(player.clone(), rage ? 3.4 : 2.7, 1.25, 25, true);
          if (rage)
            this.telegraph(
              player.clone().add(new THREE.Vector3(3, 0, -3)),
              2.5,
              1.6,
              22,
              true,
            );
          for (let j = 0; j < 8; j++) {
            const a = (j / 8) * Math.PI * 2 + this.time * 0.3;
            this.enemyShot(
              e,
              e.mesh.position
                .clone()
                .add(new THREE.Vector3(Math.cos(a) * 10, 0, Math.sin(a) * 10)),
              4.3,
            );
          }
          e.attack = rage ? 2.8 : 4;
        } else e.attack = 3;
      }
    }
  }
  private hurtPlayer(amount: number) {
    if (this.invulnerable > 0 || this.mode !== "playing") return;
    this.health = Math.max(0, this.health - amount);
    this.invulnerable = 0.75;
    this.hurt = 1;
    this.shake = 0.23;
    this.audio.play("hurt");
    this.effects.number(this.wizard.position, -amount, "#ff8685", true);
    if (this.health <= 0) {
      this.mode = "dead";
      this.wizard.visible = true;
      this.keys.clear();
      this.effects.burst(this.wizard.position.clone().setY(1), 0xd5bc8d, 50, 5);
      this.recordRun();
      this.emit();
    }
  }
  private recordRun() {
    try {
      this.saveBest = Math.max(this.saveBest, this.kills);
      localStorage.setItem("wildspell-best", String(this.saveBest));
    } catch {}
  }
  private hit(e: Enemy, damage: number, origin: THREE.Vector3, force = 2) {
    if (!this.enemies.includes(e)) return;
    const critical = Math.random() < 0.12;
    damage *= critical ? 1.65 : 1;
    e.hp -= damage;
    this.totalDamage += damage;
    const p = e.mesh.position;
    this.effects.number(
      p,
      damage,
      critical ? "#ffe4a0" : e.frozen > 0 ? "#b8edff" : "#f0eadc",
      critical,
    );
    this.effects.burst(
      p.clone().setY(0.8),
      e.frozen > 0 ? 0x9adcfa : 0xe8c497,
      critical ? 12 : 5,
      2,
    );
    this.audio.play("hit", 0.4);
    const d = p.clone().sub(origin).normalize();
    e.body.applyImpulse({ x: d.x * force, y: 0, z: d.z * force }, true);
    if (e.hp <= 0) this.kill(e);
  }
  private kill(e: Enemy) {
    const i = this.enemies.indexOf(e);
    if (i < 0) return;
    const pos = e.mesh.position.clone();
    this.enemies.splice(i, 1);
    this.scene.remove(e.mesh);
    this.disposeObject(e.mesh);
    this.physics.removeRigidBody(e.body);
    this.kills++;
    this.combo++;
    this.comboTime = 2.5;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.audio.play("kill", 0.5);
    this.effects.burst(
      pos.clone().setY(0.6),
      this.season === "spring" ? 0xa7b386 : 0xb7e1ff,
      e.kind === "boss" ? 80 : 16,
      e.kind === "boss" ? 8 : 3,
    );
    this.dropPickup(pos, e.kind === "boss" ? 60 : e.kind === "brute" ? 6 : 3);
    if (Math.random() < 0.065)
      this.dropPickup(
        pos.clone().add(new THREE.Vector3(0.4, 0, 0.4)),
        12,
        true,
      );
    if (e.kind === "boss") {
      this.boss = null;
      this.bossDefeated = true;
      this.effects.ring(pos, 0xffdfac, 12, 1.2);
      this.shake = 0.4;
      this.audio.play("victory");
      this.mode = "victory";
      this.recordRun();
      this.emit();
    }
  }
  private nearest(
    from: THREE.Vector3,
    range = 16,
    exclude = new Set<number>(),
  ) {
    let best: Enemy | undefined,
      d = range * range;
    for (const e of this.enemies) {
      const n = e.mesh.position.distanceToSquared(from);
      if (n < d && !exclude.has(e.id)) {
        d = n;
        best = e;
      }
    }
    return best;
  }
  private updateSpells(dt: number) {
    for (const id of Object.keys(this.spellTimers) as SpellId[])
      this.spellTimers[id] -= dt;
    const pos = this.wizard.position,
      target = this.nearest(pos),
      bolt = this.spells.bolt || 1;
    if (this.spellTimers.bolt <= 0 && (target || this.mouseDown)) {
      let direction: THREE.Vector3;
      if (this.mouseDown) {
        this.raycaster.setFromCamera(this.pointer, this.camera);
        this.raycaster.ray.intersectPlane(ground, this.aim);
        direction = this.aim.clone().sub(pos).setY(0).normalize();
      } else
        direction = target!.mesh.position.clone().sub(pos).setY(0).normalize();
      const count = Math.min(5, bolt);
      for (let j = 0; j < count; j++) {
        const d = direction
          .clone()
          .applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            (j - (count - 1) / 2) * 0.14,
          );
        this.shoot(
          pos,
          d,
          19,
          (20 + bolt * 4) * this.power,
          Math.floor(bolt / 2) + 1,
          false,
        );
      }
      this.audio.play("cast", 0.5);
      this.spellTimers.bolt = 0.65 * this.haste;
      this.wizard.rotation.y = Math.atan2(-direction.x, -direction.z);
    }
    const frost = this.spells.frost || 0;
    if (frost && this.spellTimers.frost <= 0) {
      const radius = 3.5 + frost * 0.75;
      this.effects.ring(pos, 0x94dff7, radius, 0.65);
      this.effects.burst(pos.clone().setY(0.3), 0xa7e9fc, 40, 5);
      for (const e of [...this.enemies])
        if (e.mesh.position.distanceTo(pos) < radius) {
          e.frozen = 2.2 + frost * 0.25;
          this.hit(e, (18 + frost * 10) * this.power, pos, 3);
        }
      this.spellTimers.frost = Math.max(2, 5.8 - frost * 0.3) * this.haste;
      this.audio.play("cast", 0.5);
    }
    const orbit = this.spells.orbit || 0;
    if (orbit) {
      while (this.orbitMeshes.length < orbit + 1) {
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.28),
          new THREE.MeshStandardMaterial({
            color: 0xd2b3ff,
            emissive: 0x9978ed,
            emissiveIntensity: 3,
            metalness: 0.5,
            roughness: 0.25,
          }),
        );
        mesh.scale.set(0.65, 1.7, 0.7);
        this.scene.add(mesh);
        this.orbitMeshes.push(mesh);
      }
      for (let j = 0; j < this.orbitMeshes.length; j++) {
        const a = this.time * 2.4 + (j / this.orbitMeshes.length) * Math.PI * 2,
          r = 2.5 + orbit * 0.13;
        this.orbitMeshes[j].position.set(
          pos.x + Math.cos(a) * r,
          0.8,
          pos.z + Math.sin(a) * r,
        );
        this.orbitMeshes[j].rotation.set(Math.PI * 0.25, a, this.time * 3);
      }
      if (this.spellTimers.orbit <= 0) {
        for (const e of [...this.enemies])
          for (const o of this.orbitMeshes)
            if (
              o.position.distanceTo(e.mesh.position.clone().setY(0.8)) <
              e.radius + 0.55
            ) {
              this.hit(e, (10 + orbit * 6) * this.power, pos, 2);
              break;
            }
        this.spellTimers.orbit = 0.22;
      }
    }
    const meteor = this.spells.meteor || 0;
    if (meteor && target && this.spellTimers.meteor <= 0) {
      this.telegraph(
        target.mesh.position.clone(),
        2.6 + meteor * 0.3,
        0.8,
        (75 + meteor * 20) * this.power,
        false,
      );
      this.spellTimers.meteor = 5.2 * this.haste;
    }
    const chain = this.spells.chain || 0;
    if (chain && target && this.spellTimers.chain <= 0) {
      let from = pos.clone().setY(1),
        next: Enemy | undefined = target;
      const hit = new Set<number>();
      let jumps = 2 + chain;
      for (let j = 0; j < jumps && next; j++) {
        hit.add(next.id);
        const end = next.mesh.position.clone().setY(1);
        const mid = from
          .clone()
          .lerp(end, 0.5)
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 0.6,
              0.3,
              (Math.random() - 0.5) * 0.6,
            ),
          );
        this.effects.beam(from, mid, 0x94d9ff);
        this.effects.beam(mid, end, 0xd7edff);
        if (next.frozen > 0 && j === 0) jumps++;
        this.hit(next, (25 + chain * 12) * this.power, pos, 2);
        from = end;
        next = this.nearest(from, 6, hit);
      }
      this.spellTimers.chain = 2.6 * this.haste;
      this.audio.play("cast", 0.6);
    }
    const bloom = this.spells.bloom || 0;
    if (bloom && this.spellTimers.bloom <= 0) {
      this.health = Math.min(this.maxHealth, this.health + 4 + bloom * 3);
      this.effects.ring(pos, 0xb2db91, 3.2 + bloom * 0.3, 1);
      this.effects.burst(pos.clone().setY(0.3), 0xf2b7cd, 25, 3);
      for (const e of [...this.enemies])
        if (e.mesh.position.distanceTo(pos) < 3.2 + bloom * 0.3)
          this.hit(e, (12 + bloom * 9) * this.power, pos, 4);
      this.spellTimers.bloom = 7 * this.haste;
    }
  }
  private shoot(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number,
    damage: number,
    pierce: number,
    hostile: boolean,
  ) {
    const mesh = new THREE.Mesh(
      this.projectileGeometry,
      hostile ? this.hostileMaterial : this.boltMaterial,
    );
    mesh.position.copy(origin).setY(0.85);
    mesh.scale.setScalar(hostile ? 1.5 : 1);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      v: direction.clone().multiplyScalar(speed),
      damage,
      life: hostile ? 6 : 1.4,
      radius: hostile ? 0.22 : 0.2,
      hit: new Set(),
      pierce,
      hostile,
    });
  }
  private enemyShot(e: Enemy, target: THREE.Vector3, speed = 6) {
    this.shoot(
      e.mesh.position,
      target.clone().sub(e.mesh.position).setY(0).normalize(),
      speed,
      e.kind === "boss" ? 16 : 10,
      1,
      true,
    );
  }
  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i],
        start = p.mesh.position.clone();
      p.life -= dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += dt * 9;
      p.mesh.rotation.y += dt * 8;
      if (!p.hostile && Math.random() < 0.5)
        this.effects.burst(p.mesh.position, 0xeacd99, 1, 0.3);
      const line = new THREE.Line3(start, p.mesh.position),
        closest = new THREE.Vector3();
      if (p.hostile) {
        line.closestPointToPoint(
          this.wizard.position.clone().setY(0.85),
          true,
          closest,
        );
        if (
          closest.distanceTo(this.wizard.position.clone().setY(0.85)) < 0.55
        ) {
          this.hurtPlayer(p.damage);
          p.life = 0;
        }
      } else
        for (const e of [...this.enemies]) {
          if (p.hit.has(e.id)) continue;
          line.closestPointToPoint(
            e.mesh.position.clone().setY(0.85),
            true,
            closest,
          );
          if (
            closest.distanceTo(e.mesh.position.clone().setY(0.85)) <
            e.radius + p.radius
          ) {
            p.hit.add(e.id);
            this.hit(e, p.damage, this.wizard.position, 2.2);
            p.pierce--;
            if (p.pierce <= 0) {
              p.life = 0;
              break;
            }
          }
        }
      if (
        this.world.obstacles.some(
          (o) =>
            Math.hypot(o.x - p.mesh.position.x, o.z - p.mesh.position.z) <
            o.radius,
        )
      ) {
        p.life = 0;
        this.effects.burst(
          p.mesh.position,
          p.hostile ? 0xff7481 : 0xe2d5ae,
          5,
          1.5,
        );
      }
      for (const prop of this.props) {
        if (prop.mesh.position.distanceTo(p.mesh.position) < 0.6) {
          prop.body.applyImpulse(
            { x: p.v.x * 0.1, y: 0.3, z: p.v.z * 0.1 },
            true,
          );
          p.life = 0;
          break;
        }
      }
      if (p.life <= 0 || p.mesh.position.length() > 38) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
  private dropPickup(pos: THREE.Vector3, value: number, health = false) {
    if (this.pickups.length > 180) {
      const old = this.pickups.shift()!;
      this.scene.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(
      this.pickupGeometry,
      health ? this.healMaterial : this.xpMaterial,
    );
    mesh.position.copy(pos).setY(0.25);
    if (health) mesh.scale.setScalar(1.5);
    this.scene.add(mesh);
    this.pickups.push({ mesh, value, age: 0, health });
  }
  private updatePickups(dt: number) {
    const pos = this.wizard.position;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.age += dt;
      p.mesh.position.y = 0.25 + Math.sin(p.age * 3) * 0.1;
      p.mesh.rotation.y += dt * 1.6;
      const distance = Math.hypot(
        p.mesh.position.x - pos.x,
        p.mesh.position.z - pos.z,
      );
      if (distance < this.magnet) {
        const d = pos.clone().setY(0.3).sub(p.mesh.position);
        p.mesh.position.addScaledVector(
          d.normalize(),
          dt * (7 + (this.magnet - distance) * 4),
        );
      }
      if (distance < 0.65) {
        if (p.health) {
          this.health = Math.min(this.maxHealth, this.health + p.value);
          this.effects.ring(pos, 0xeaa3ad, 1.2, 0.4);
        } else this.xp += p.value * this.xpMult;
        this.audio.play("pickup", 0.25);
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }
    if (this.xp >= this.xpNext && this.mode === "playing") this.levelUp();
  }
  private levelUp() {
    this.xp -= this.xpNext;
    this.level++;
    this.xpNext = Math.floor(10 + this.level * 7.5);
    this.health = Math.min(this.maxHealth, this.health + 5);
    this.audio.play("level");
    this.effects.ring(this.wizard.position, 0xf3d794, 4, 1);
    const pool = UPGRADES.filter(
      (u) => !((this.spells[u.id as SpellId] || 0) >= 5),
    )
      .map((u) => ({
        id: u.id,
        weight:
          Math.random() +
          (this.level <= 3 && !(u.id in this.spells) && u.id in SPELLS
            ? 0.3
            : 0),
      }))
      .sort((a, b) => b.weight - a.weight);
    this.choices = pool.slice(0, 3).map((u) => u.id);
    this.mode = "upgrade";
    this.keys.clear();
    this.touch.set(0, 0);
    this.mouseDown = false;
    this.emit();
  }
  chooseUpgrade(id: string) {
    if (this.mode !== "upgrade" || !this.choices.includes(id)) return;
    if (id in SPELLS) {
      const spell = id as SpellId;
      this.spells[spell] = (this.spells[spell] || 0) + 1;
      this.spellTimers[spell] = 0.4;
    } else if (id === "power") this.power *= 1.18;
    else if (id === "haste") {
      this.haste *= 0.88;
      this.moveMult *= 1.05;
    } else if (id === "vitality") {
      this.maxHealth += 25;
      this.health = Math.min(this.maxHealth, this.health + 35);
    } else if (id === "magnet") {
      this.magnet *= 1.5;
      this.xpMult *= 1.12;
    }
    this.choices = [];
    this.mode = "playing";
    this.invulnerable = Math.max(this.invulnerable, 1);
    this.notify(UPGRADES.find((u) => u.id === id)!.name + " · 已铭刻", 2.5);
    this.audio.play("level", 0.5);
    this.emit();
  }
  private telegraph(
    position: THREE.Vector3,
    radius: number,
    duration: number,
    damage: number,
    enemy: boolean,
  ) {
    const color = enemy ? 0xff5e68 : 0xffba72;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.84, radius, 64),
      material,
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(position).setY(0.08);
    this.scene.add(mesh);
    this.dangers.push({
      mesh,
      position: position.clone(),
      radius,
      life: duration,
      max: duration,
      damage,
      enemy,
    });
  }
  private updateDangers(dt: number) {
    for (let i = this.dangers.length - 1; i >= 0; i--) {
      const d = this.dangers[i];
      d.life -= dt;
      const ratio = 1 - d.life / d.max;
      d.mesh.scale.setScalar(0.5 + ratio * 0.5);
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = 0.25 + ratio * 0.6;
      d.mesh.rotation.z += dt * (d.enemy ? 1 : -1);
      if (!d.enemy && d.life < 0.3) {
        const from = d.position
          .clone()
          .add(new THREE.Vector3(1, d.life * 25 + 0.2, 0));
        this.effects.burst(from, 0xffb368, 3, 0.6);
      }
      if (d.life <= 0) {
        this.effects.ring(
          d.position,
          d.enemy ? 0xff7678 : 0xffc789,
          d.radius,
          0.5,
        );
        this.effects.burst(
          d.position.clone().setY(0.3),
          d.enemy ? 0xb7d9ef : 0xffae6b,
          40,
          6,
        );
        if (d.enemy) {
          if (this.wizard.position.distanceTo(d.position) < d.radius)
            this.hurtPlayer(d.damage);
        } else {
          for (const e of [...this.enemies])
            if (e.mesh.position.distanceTo(d.position) < d.radius + e.radius)
              this.hit(e, d.damage * (e.frozen > 0 ? 2 : 1), d.position, 8);
          this.impulseProps(d.position, d.radius + 1, 8);
          this.audio.play("pulse", 0.45);
        }
        this.shake = Math.max(this.shake, 0.09);
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.dangers.splice(i, 1);
      }
    }
  }
  private impulseProps(center: THREE.Vector3, radius: number, force: number) {
    for (const p of this.props) {
      const d = p.mesh.position.clone().sub(center),
        distance = d.length();
      if (distance < radius) {
        d.normalize().multiplyScalar(force * (1 - distance / radius));
        p.body.applyImpulse({ x: d.x, y: force * 0.35, z: d.z }, true);
        p.body.applyTorqueImpulse(
          { x: Math.random() * 2, y: Math.random(), z: Math.random() * 2 },
          true,
        );
      }
    }
  }
  private updateObjectives(dt: number) {
    this.nearShrine = false;
    this.activeShrine = -1;
    for (let i = 0; i < this.world.shrinePositions.length; i++) {
      const shrine = this.world.shrinePositions[i];
      if (this.shrineDone[i]) continue;
      const near =
        Math.hypot(
          shrine.x - this.wizard.position.x,
          shrine.z - this.wizard.position.z,
        ) < 2.9;
      if (near) {
        this.nearShrine = true;
        this.activeShrine = i;
        this.shrineProgress[i] = Math.min(1, this.shrineProgress[i] + dt / 5);
      } else
        this.shrineProgress[i] = Math.max(
          0,
          this.shrineProgress[i] - dt * 0.05,
        );
      this.world.setShrine(i, this.shrineProgress[i], false);
      if (this.shrineProgress[i] >= 1) {
        this.shrineDone[i] = true;
        this.world.setShrine(i, 1, true);
        this.health = Math.min(this.maxHealth, this.health + 25);
        this.xp += 18;
        this.audio.play("shrine");
        const pos = new THREE.Vector3(shrine.x, 0, shrine.z);
        this.effects.ring(pos, 0xf1dca3, 8, 1.2);
        this.effects.burst(pos.clone().setY(1), 0xffe5ac, 70, 7);
        this.notify(
          `祭坛已唤醒 ${this.shrineDone.filter(Boolean).length} / 3 · 生命恢复`,
          4,
        );
        for (let j = 0; j < 5; j++) this.spawnEnemy();
      }
    }
    if (
      !this.bossSpawned &&
      (this.shrineDone.every(Boolean) || this.time >= DURATION)
    ) {
      if (this.time >= DURATION && !this.shrineDone.every(Boolean)) {
        this.shrineDone = [true, true, true];
        this.shrineProgress = [1, 1, 1];
        for (let j = 0; j < 3; j++) this.world.setShrine(j, 1, true);
        this.notify("季节失衡 · 守望者提前降临", 5);
      }
      this.spawnEnemy("boss");
    }
  }
  private snapshot(): Snapshot {
    return {
      mode: this.mode,
      season: this.season,
      ready: this.ready,
      error: null,
      health: this.health,
      maxHealth: this.maxHealth,
      xp: this.xp,
      xpNext: this.xpNext,
      level: this.level,
      time: this.time,
      duration: DURATION,
      kills: this.kills,
      combo: this.combo,
      bestCombo: this.bestCombo,
      damage: Math.round(this.totalDamage),
      dashCooldown: this.dashCd,
      pulseCooldown: this.pulseCd,
      shrines: this.shrineDone.filter(Boolean).length,
      shrineProgress:
        this.activeShrine >= 0 ? this.shrineProgress[this.activeShrine] : 0,
      nearShrine: this.nearShrine,
      bossHealth: this.boss?.hp || 0,
      bossMaxHealth: this.boss?.maxHp || 0,
      bossName: STAGES[this.season].boss,
      wave: Math.floor(this.time / 30) + 1,
      spells: (Object.keys(this.spells) as SpellId[]).map((id) => ({
        ...SPELLS[id],
        level: this.spells[id]!,
      })),
      choices: this.choices.map((id) => UPGRADES.find((u) => u.id === id)!),
      notification: this.notification,
      muted: this.muted,
      quality: this.quality,
      fps: Math.round(this.fps),
      player: {
        x: this.wizard?.position.x || 0,
        z: this.wizard?.position.z || 0,
      },
      enemies: this.enemies.map((e) => ({
        x: e.mesh.position.x,
        z: e.mesh.position.z,
      })),
      shrinePositions: (this.world?.shrinePositions || []).map((p, i) => ({
        ...p,
        active: this.shrineDone[i],
      })),
    };
  }
  private emit() {
    if (!this.destroyed) this.onSnapshot(this.snapshot());
  }
  private disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry)
        mesh.geometry.dispose(); /* Actor palette materials are shared and remain cached. */
    });
  }
  private clearCombat() {
    for (const e of this.enemies) {
      this.scene.remove(e.mesh);
      this.disposeObject(e.mesh);
    }
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const p of this.pickups) this.scene.remove(p.mesh);
    for (const o of this.orbitMeshes) {
      this.scene.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    for (const d of this.dangers) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
    }
    for (const p of this.props)
      if (p.ttl !== undefined) {
        this.scene.remove(p.mesh);
        this.disposeObject(p.mesh);
      }
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.orbitMeshes = [];
    this.dangers = [];
    this.props = [];
    this.effects?.clear();
  }
  dispose() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("blur", this.blur);
    document.removeEventListener("visibilitychange", this.visibility);
    this.canvas.removeEventListener("pointermove", this.pointermove);
    this.canvas.removeEventListener("pointerdown", this.pointerdown);
    window.removeEventListener("pointerup", this.pointerup);
    this.canvas.removeEventListener("contextmenu", this.contextmenu);
    this.clearCombat();
    this.effects?.dispose();
    this.world?.dispose();
    this.physics?.free();
    this.audio.dispose();
    if (this.wizard) this.disposeObject(this.wizard);
    this.composer?.passes.forEach((pass) => pass.dispose());
    this.composer?.dispose();
    this.sun?.shadow.map?.dispose();
    this.environment?.dispose();
    this.renderer?.dispose();
    this.projectileGeometry.dispose();
    this.pickupGeometry.dispose();
    this.boltMaterial.dispose();
    this.hostileMaterial.dispose();
    this.xpMaterial.dispose();
    this.healMaterial.dispose();
  }
}
