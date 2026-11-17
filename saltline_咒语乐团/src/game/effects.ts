import * as THREE from "three";
type Particle = {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  gravity: number;
};
type Transient = {
  object: THREE.Object3D;
  life: number;
  max: number;
  type: "ring" | "beam" | "text";
  scale: number;
  velocity?: THREE.Vector3;
};
export class Effects {
  private particles: Particle[] = [];
  private cursor = 0;
  private mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private transients: Transient[] = [];
  constructor(private scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      650,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < 650; i++) {
      this.particles.push({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        life: 0,
        max: 1,
        size: 0.1,
        gravity: 4,
      });
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, new THREE.Color());
    }
    scene.add(this.mesh);
  }
  burst(
    pos: THREE.Vector3,
    color: THREE.ColorRepresentation,
    count = 18,
    power = 4,
  ) {
    for (let i = 0; i < count; i++) {
      const j = this.cursor++ % 650,
        p = this.particles[j];
      p.p.copy(pos);
      const a = Math.random() * Math.PI * 2,
        r = Math.random() * power;
      p.v.set(
        Math.cos(a) * r,
        Math.random() * power * 0.9 + 1,
        Math.sin(a) * r,
      );
      p.life = p.max = 0.3 + Math.random() * 0.6;
      p.size = 0.035 + Math.random() * 0.075;
      p.gravity = 9;
      this.mesh.setColorAt(
        j,
        new THREE.Color(color).multiplyScalar(1 + Math.random()),
      );
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  ring(
    pos: THREE.Vector3,
    color: THREE.ColorRepresentation,
    radius: number,
    duration = 0.5,
  ) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos);
    m.position.y = 0.06;
    this.scene.add(m);
    this.transients.push({
      object: m,
      life: duration,
      max: duration,
      type: "ring",
      scale: radius,
    });
  }
  beam(
    a: THREE.Vector3,
    b: THREE.Vector3,
    color: THREE.ColorRepresentation,
    width = 0.045,
  ) {
    const d = b.clone().sub(a),
      m = new THREE.Mesh(
        new THREE.CylinderGeometry(width, width, d.length(), 6),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.scene.add(m);
    this.transients.push({
      object: m,
      life: 0.16,
      max: 0.16,
      type: "beam",
      scale: 1,
    });
  }
  number(pos: THREE.Vector3, value: number, color = "#fff0c2", large = false) {
    if (this.transients.filter((t) => t.type === "text").length > 24) return;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const c = canvas.getContext("2d")!;
    c.font = `bold ${large ? 42 : 34}px Georgia`;
    c.textAlign = "center";
    c.lineWidth = 5;
    c.strokeStyle = "#122329";
    c.strokeText(String(Math.round(value)), 64, 44);
    c.fillStyle = color;
    c.fillText(String(Math.round(value)), 64, 44);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    sprite.position
      .copy(pos)
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.9, 0));
    sprite.scale.set(1.2, 0.6, 1);
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    this.transients.push({
      object: sprite,
      life: 0.75,
      max: 0.75,
      type: "text",
      scale: 1,
      velocity: new THREE.Vector3(0, 1.3, 0),
    });
  }
  update(dt: number) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        p.life -= dt;
        p.v.y -= p.gravity * dt;
        p.p.addScaledVector(p.v, dt);
        if (p.p.y < 0.08) {
          p.p.y = 0.08;
          p.v.y = Math.abs(p.v.y) * 0.35;
          p.v.x *= 0.85;
          p.v.z *= 0.85;
        }
        this.dummy.position.copy(p.p);
        this.dummy.rotation.set(p.life * 4, p.life * 5, 0);
        this.dummy.scale.setScalar(p.size * Math.max(0, p.life / p.max));
      } else this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const t = this.transients[i];
      t.life -= dt;
      const a = Math.max(0, t.life / t.max),
        material = (t.object as THREE.Mesh).material as THREE.Material & {
          opacity: number;
          map?: THREE.Texture;
        };
      material.opacity = a;
      if (t.type === "ring") t.object.scale.setScalar(t.scale * (1 - a * 0.85));
      if (t.velocity) t.object.position.addScaledVector(t.velocity, dt);
      if (t.life <= 0) {
        this.scene.remove(t.object);
        if ((t.object as THREE.Mesh).geometry)
          (t.object as THREE.Mesh).geometry.dispose();
        material.map?.dispose();
        material.dispose();
        this.transients.splice(i, 1);
      }
    }
  }
  clear() {
    for (const t of this.transients) {
      this.scene.remove(t.object);
      const o = t.object as THREE.Mesh;
      o.geometry?.dispose();
      const m = o.material as THREE.Material & { map?: THREE.Texture };
      m.map?.dispose();
      m.dispose();
    }
    this.transients = [];
    for (const p of this.particles) p.life = 0;
  }
  dispose() {
    this.clear();
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
