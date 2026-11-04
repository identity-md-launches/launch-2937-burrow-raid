import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BOSS, ROLES, type GameState, type Role } from "../shared/game";

const palette = {
  earth: 0x6e5740,
  edge: 0x49382b,
  moss: 0x526c47,
  grass: 0x78915e,
  wood: 0x4a3b2d,
  brass: 0xc99b56,
  cream: 0xf1ddbb,
  rock: 0x686b53,
  red: 0xb46446,
};
const materials = new Map<string, THREE.MeshStandardMaterial>();
// Batch immutable parts by material; characters retain independent body/weapon
// groups. This keeps the same art while avoiding hundreds of tiny draw calls.
function batchMeshes(parent: THREE.Object3D, recursive = true) {
  parent.updateWorldMatrix(true, true);
  const inverse = parent.matrixWorld.clone().invert();
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  const collect = (o: THREE.Object3D) => {
    if (o instanceof THREE.Mesh && !Array.isArray(o.material)) {
      const list = groups.get(o.material) || [];
      list.push(o);
      groups.set(o.material, list);
    }
  };
  if (recursive) parent.traverse(collect);
  else parent.children.forEach(collect);
  for (const [mat, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((m) =>
      m.geometry
        .clone()
        .applyMatrix4(
          new THREE.Matrix4().multiplyMatrices(inverse, m.matrixWorld),
        ),
    );
    const combined = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!combined) continue;
    const result = new THREE.Mesh(combined, mat);
    result.castShadow = true;
    result.receiveShadow = true;
    meshes.forEach((m) => {
      m.parent?.remove(m);
      m.geometry.dispose();
    });
    parent.add(result);
  }
}
function material(color: number, metalness = 0, roughness = 0.85) {
  const key = `${color}-${metalness}-${roughness}`;
  if (!materials.has(key))
    materials.set(
      key,
      new THREE.MeshStandardMaterial({ color, metalness, roughness }),
    );
  return materials.get(key)!;
}
function mesh(
  geo: THREE.BufferGeometry,
  color: number,
  parent: THREE.Object3D,
  x = 0,
  y = 0,
  z = 0,
  metal = 0,
): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  const m = new THREE.Mesh(geo, material(color, metal));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function sphere(
  p: THREE.Object3D,
  c: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy = sx,
  sz = sx,
) {
  const m = mesh(new THREE.SphereGeometry(1, 16, 12), c, p, x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
function cylinder(
  p: THREE.Object3D,
  c: number,
  x: number,
  y: number,
  z: number,
  rt: number,
  rb: number,
  h: number,
  n = 16,
) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, n), c, p, x, y, z);
}
function box(
  p: THREE.Object3D,
  c: number,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) {
  return mesh(new THREE.BoxGeometry(w, h, d), c, p, x, y, z);
}
function tube(
  p: THREE.Object3D,
  points: THREE.Vector3[],
  c: number,
  r: number,
) {
  return mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, r, 7, false),
    c,
    p,
  );
}
function ring(
  p: THREE.Object3D,
  inner: number,
  outer: number,
  c: number,
  y = 0.03,
) {
  const m = mesh(new THREE.RingGeometry(inner, outer, 96), c, p, 0, y, 0);
  m.rotation.x = -Math.PI / 2;
  return m;
}
function mushroom(
  p: THREE.Object3D,
  x: number,
  z: number,
  s: number,
  color = palette.red,
) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  p.add(g);
  cylinder(g, 0xcbbd8e, 0, 0.48, 0, 0.13, 0.21, 0.96, 9);
  const cap = mesh(
    new THREE.SphereGeometry(0.65, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.53),
    color,
    g,
    0,
    0.9,
    0,
  );
  cap.scale.y = 0.65;
  cylinder(g, 0xd8bf8d, 0, 0.87, 0, 0.64, 0.57, 0.08);
  for (let i = 0; i < 6; i++) {
    const a = i * 2.4;
    const r = i % 2 ? 0.38 : 0.2;
    sphere(
      g,
      0xefdbb3,
      Math.sin(a) * r,
      1.22 - r * 0.25,
      Math.cos(a) * r,
      0.07,
      0.025,
      0.06,
    );
  }
}
function fern(p: THREE.Object3D, x: number, z: number, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  p.add(g);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.256;
    const leaf = mesh(
      new THREE.SphereGeometry(1, 6, 5),
      i % 2 ? palette.moss : palette.grass,
      g,
      Math.sin(a) * 0.28,
      0.35,
      Math.cos(a) * 0.28,
    );
    leaf.scale.set(0.11, 0.55, 0.17);
    leaf.rotation.z = -Math.sin(a) * 0.7;
    leaf.rotation.x = Math.cos(a) * 0.7;
  }
}
function lantern(p: THREE.Object3D, x: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  p.add(g);
  cylinder(g, palette.wood, 0, 0.72, 0, 0.06, 0.08, 1.45, 7);
  tube(
    g,
    [
      new THREE.Vector3(0, 1.4, 0),
      new THREE.Vector3(0, 1.8, 0),
      new THREE.Vector3(0.4, 1.85, 0),
      new THREE.Vector3(0.45, 1.55, 0),
    ],
    palette.brass,
    0.04,
  );
  const lamp = cylinder(g, palette.brass, 0.45, 1.2, 0, 0.2, 0.2, 0.55, 6);
  lamp.material = new THREE.MeshStandardMaterial({
    color: 0xe1ad57,
    emissive: 0xffa331,
    emissiveIntensity: 0.6,
  });
  cylinder(g, 0x5d4b32, 0.45, 1.5, 0, 0.27, 0.2, 0.1, 6);
  cylinder(g, 0x5d4b32, 0.45, 0.9, 0, 0.23, 0.2, 0.1, 6);
  const light = new THREE.PointLight(0xffba68, 10, 5, 2);
  light.position.set(0.45, 1.3, 0);
  g.add(light);
}
type HamsterModel = {
  group: THREE.Group;
  body: THREE.Group;
  weapon: THREE.Group;
  shield: THREE.Mesh;
  halo: THREE.Mesh;
  role: Role;
};
function hamster(role: Role): HamsterModel {
  const group = new THREE.Group(),
    body = new THREE.Group(),
    weapon = new THREE.Group();
  group.add(body);
  body.add(weapon);
  group.scale.setScalar(1.18);
  const fur =
    role === "medic" ? 0xd4b68a : role === "guardian" ? 0xa98a67 : 0xd6a56c;
  sphere(body, fur, 0, 0.65, 0, 0.43, 0.55, 0.36);
  sphere(body, palette.cream, 0, 0.61, 0.245, 0.32, 0.37, 0.15);
  sphere(body, fur, 0, 1.17, 0.05, 0.49, 0.43, 0.41);
  for (const side of [-1, 1]) {
    sphere(body, fur, side * 0.35, 1.48, 0.02, 0.23, 0.25, 0.13);
    sphere(body, 0xc38e7c, side * 0.35, 1.49, 0.115, 0.14, 0.15, 0.045);
    sphere(body, 0x1a2820, side * 0.18, 1.23, 0.4, 0.055, 0.065, 0.045);
    sphere(body, 0xfff3d8, side * 0.167, 1.25, 0.43, 0.015);
    sphere(body, palette.cream, side * 0.17, 1.04, 0.4, 0.2, 0.14, 0.13);
    sphere(body, 0xcc9c79, side * 0.25, 0.14, 0.12, 0.18, 0.12, 0.25);
    sphere(body, fur, side * 0.43, 0.72, 0.1, 0.15, 0.25, 0.17);
    for (let i = 0; i < 2; i++) {
      const whisk = box(
        body,
        0xd9c7a1,
        side * 0.39,
        1.02 + i * 0.07,
        0.45,
        0.28,
        0.014,
        0.014,
      );
      whisk.rotation.z = side * (i - 0.5) * 0.18;
    }
  }
  sphere(body, 0x865746, 0, 1.09, 0.527, 0.07, 0.045, 0.04);
  const scarf = mesh(
    new THREE.TorusGeometry(0.37, 0.075, 7, 18),
    role === "fighter" ? 0xb56d42 : role === "guardian" ? 0x6e9b87 : 0xb07c9c,
    body,
    0,
    0.94,
    0.01,
  );
  scarf.rotation.x = Math.PI / 2;
  const cape = box(
    body,
    role === "fighter" ? 0x895436 : role === "guardian" ? 0x567f6b : 0x81586f,
    0,
    0.61,
    -0.32,
    0.59,
    0.62,
    0.1,
  );
  cape.rotation.x = -0.13;
  if (role === "fighter") {
    weapon.position.set(0.48, 0.65, 0.2);
    const blade = box(weapon, 0xd7dfcf, 0.03, 0.45, 0, 0.13, 0.86, 0.065);
    blade.rotation.z = -0.25;
    box(weapon, palette.brass, -0.03, 0.12, 0, 0.4, 0.07, 0.1);
    cylinder(weapon, 0x6f4730, -0.07, -0.02, 0, 0.045, 0.045, 0.23, 7);
    const helm = mesh(
      new THREE.SphereGeometry(0.48, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45),
      0x7b816a,
      body,
      0,
      1.25,
      0.01,
    );
    helm.scale.y = 0.75;
    box(body, palette.brass, 0, 1.55, 0.03, 0.075, 0.16, 0.52);
  } else if (role === "guardian") {
    const shield = mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.1, 6),
      0x587b66,
      weapon,
      -0.45,
      0.7,
      0.45,
    );
    shield.rotation.x = Math.PI / 2;
    const rim = mesh(
      new THREE.TorusGeometry(0.4, 0.035, 6, 6),
      palette.brass,
      weapon,
      -0.45,
      0.7,
      0.52,
    );
    sphere(weapon, palette.brass, -0.45, 0.7, 0.54, 0.09, 0.09, 0.04);
    box(body, 0x6d8871, 0, 0.73, 0.29, 0.6, 0.47, 0.1);
    rim.rotation.z = Math.PI / 6;
  } else {
    cylinder(weapon, 0x77513b, 0.54, 0.8, 0.1, 0.045, 0.06, 1.35, 8);
    sphere(weapon, 0xb782a0, 0.54, 1.55, 0.1, 0.25, 0.16, 0.25);
    sphere(weapon, 0xf3dec1, 0.54, 1.58, 0.26, 0.055);
    const hat = mesh(
      new THREE.SphereGeometry(0.54, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.47),
      0x927a58,
      body,
      0,
      1.36,
      0,
    );
    hat.scale.y = 0.6;
    sphere(body, 0xb7c68a, 0.25, 1.65, 0, 0.13, 0.04, 0.18);
  }
  const shield = mesh(
    new THREE.SphereGeometry(0.75, 16, 12),
    0x87c9b3,
    group,
    0,
    0.8,
    0,
  );
  shield.material = new THREE.MeshBasicMaterial({
    color: 0x9cdac1,
    transparent: true,
    opacity: 0.16,
    wireframe: true,
  });
  shield.visible = false;
  const halo = ring(
    group,
    0.48,
    0.58,
    Number.parseInt(ROLES[role].color.slice(1), 16),
  );
  batchMeshes(body, false);
  batchMeshes(weapon, false);
  return { group, body, weapon, shield, halo, role };
}
function cableGnawer() {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const seg = sphere(
      g,
      i % 2 ? 0x4f4943 : 0x625b4b,
      0,
      0.95,
      -0.8 + i * 0.4,
      1.18 - i * 0.04,
      0.9,
      0.55,
    );
    seg.rotation.x = 0.15;
    const armor = mesh(
      new THREE.TorusGeometry(0.88 - i * 0.02, 0.085, 6, 16, Math.PI),
      palette.brass,
      g,
      0,
      1.05,
      -0.8 + i * 0.4,
    );
    armor.rotation.z = 0;
    armor.scale.y = 0.7;
  }
  sphere(g, 0x6c624c, 0, 1.1, 1, 1, 0.75, 0.73);
  sphere(g, 0x403d37, 0, 0.83, 1.47, 0.78, 0.37, 0.28);
  for (const side of [-1, 1]) {
    sphere(g, 0xf2ba64, side * 0.48, 1.32, 1.62, 0.17, 0.12, 0.07);
    const eye = mesh(
      new THREE.SphereGeometry(0.1, 10, 8),
      0xffcc65,
      g,
      side * 0.48,
      1.32,
      1.7,
    );
    eye.material = new THREE.MeshStandardMaterial({
      color: 0xffd88c,
      emissive: 0xffa821,
      emissiveIntensity: 1.1,
    });
    const tooth = mesh(
      new THREE.ConeGeometry(0.2, 0.65, 4),
      0xf1dba9,
      g,
      side * 0.38,
      0.77,
      1.85,
    );
    tooth.rotation.x = -1.1;
    tooth.rotation.z = side * 0.4;
    tube(
      g,
      [
        new THREE.Vector3(side * 0.55, 1.7, 1),
        new THREE.Vector3(side * 0.95, 2.1, 1.4),
        new THREE.Vector3(side * 1.2, 2.3, 1.25),
      ],
      0x302f27,
      0.055,
    );
    sphere(g, palette.brass, side * 1.2, 2.3, 1.25, 0.1);
    for (let i = 0; i < 3; i++) {
      tube(
        g,
        [
          new THREE.Vector3(side * 0.8, 0.8, -0.7 + i * 0.8),
          new THREE.Vector3(side * 1.7, 0.5, -0.9 + i * 0.85),
          new THREE.Vector3(side * 1.95, 0.12, -0.4 + i * 0.85),
        ],
        0x3e3c32,
        0.12,
      );
      sphere(g, palette.brass, side * 1.7, 0.5, -0.9 + i * 0.85, 0.17);
    }
  }
  // The chewed cable and brass spool make the silhouette specific to this boss.
  tube(
    g,
    [
      new THREE.Vector3(0, 0.85, -1.2),
      new THREE.Vector3(-0.7, 0.5, -2),
      new THREE.Vector3(0.8, 0.16, -2.3),
      new THREE.Vector3(1.7, 0.12, -1.9),
      new THREE.Vector3(2.2, 0.1, -2.4),
    ],
    0x303c31,
    0.15,
  );
  cylinder(g, palette.brass, 0, 1.95, -0.25, 0.46, 0.46, 0.45, 12);
  cylinder(g, 0x33483c, 0, 2.2, -0.25, 0.55, 0.55, 0.09, 12);
  const core = sphere(g, 0xf2b94f, 0, 2.22, -0.25, 0.26, 0.1, 0.26);
  core.material = new THREE.MeshStandardMaterial({
    color: 0xffcc78,
    emissive: 0xffb443,
    emissiveIntensity: 2.5,
  });
  const glow = new THREE.PointLight(0xffaf52, 3, 5);
  glow.position.set(0, 2, -0.25);
  g.add(glow);
  g.position.set(BOSS.x, 0, BOSS.z);
  batchMeshes(g, false);
  return g;
}
export class RaidScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private observer: ResizeObserver;
  private frame = 0;
  private previous = 0;
  private actors = new Map<string, HamsterModel>();
  private boss: THREE.Group;
  private warning = new THREE.Group();
  private effects = new THREE.Group();
  private fireflies: THREE.Points;
  private reduced = false;
  private lastState: GameState | null = null;
  private lastTick = -1;
  private stopped = false;
  onContextLost: (() => void) | null = null;
  constructor(
    private container: HTMLElement,
    private getState: () => GameState,
    private getLocal: () => string,
  ) {
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.scene.fog = new THREE.FogExp2(0x172b24, 0.018);
    this.camera = new THREE.OrthographicCamera(-13, 13, 13, -13, 0.1, 100);
    this.camera.position.set(14, 21, 22);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xf8e6b3, 0x435547, 2.5));
    const sun = new THREE.DirectionalLight(0xffdda1, 3.5);
    sun.position.set(-8, 18, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xa2c9bd, 1.2);
    fill.position.set(7, 8, -8);
    this.scene.add(fill);
    this.buildArena();
    this.boss = cableGnawer();
    this.scene.add(this.boss, this.warning, this.effects);
    const positions = new Float32Array(75 * 3);
    for (let i = 0; i < 75; i++) {
      positions[i * 3] = Math.sin(i * 13.1) * 12;
      positions[i * 3 + 1] = 0.5 + (i % 13) / 3;
      positions[i * 3 + 2] = Math.cos(i * 7.8) * 11;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.fireflies = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xf0ce81,
        size: 0.055,
        transparent: true,
        opacity: 0.6,
      }),
    );
    this.scene.add(this.fireflies);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.frame = requestAnimationFrame(this.animate);
  }
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.stopped = true;
    cancelAnimationFrame(this.frame);
    this.onContextLost?.();
  };
  setReduced(value: boolean) {
    this.reduced = value;
    this.lastState = null;
  }
  private buildArena() {
    const s = new THREE.Group();
    this.scene.add(s);
    cylinder(s, palette.edge, 0, -0.65, 0, 9.1, 8.7, 1.25, 64);
    cylinder(s, palette.moss, 0, -0.05, 0, 9.2, 9.1, 0.35, 64);
    cylinder(s, palette.earth, 0, 0.1, 0, 8.45, 8.45, 0.15, 64);
    ring(s, 7.9, 8.05, 0x9a8460, 0.19);
    ring(s, 5.9, 5.95, 0x8c7858, 0.19);
    ring(s, 2.5, 2.54, 0x9a8460, 0.19);
    const center = cylinder(s, 0x796347, 0, 0.19, -0.7, 2.3, 2.3, 0.06, 32);
    center.receiveShadow = true;
    ring(s, 2.1, 2.14, 0xab8c57, 0.23).position.z = -0.7;
    for (let i = 0; i < 38; i++) {
      const a = (i * Math.PI * 2) / 38,
        r = 8.75;
      const rock = sphere(
        s,
        i % 3 === 0 ? 0x71805a : 0x59694d,
        Math.sin(a) * r,
        0.12,
        Math.cos(a) * r,
        0.43 + (i % 3) * 0.1,
        0.26 + (i % 4) * 0.07,
        0.4,
      );
      rock.rotation.y = a;
      if (i % 3 === 0)
        fern(s, Math.sin(a) * 9.25, Math.cos(a) * 9.25, 0.8 + (i % 5) * 0.1);
    }
    // Radial inlays and chips keep the floor readable without busy textures.
    for (let i = 0; i < 70; i++) {
      const a = i * 2.399,
        r = 2.8 + ((i % 19) / 19) * 5.2;
      const stone = box(
        s,
        i % 2 ? 0x7b6b4d : 0x867355,
        Math.sin(a) * r,
        0.2,
        Math.cos(a) * r,
        0.18 + (i % 3) * 0.1,
        0.025,
        0.09,
      );
      stone.rotation.y = a;
    }
    for (const [x, z, sc] of [
      [-8, -3, 1.4],
      [7, -5, 1.6],
      [8, 3, 1],
      [-6, 6, 1.1],
      [-3, -8, 1.2],
      [4, 8, 0.8],
    ]) {
      mushroom(s, x, z, sc);
      mushroom(s, x + 0.65, z + 0.4, sc * 0.5, 0xb89560);
      fern(s, x - 0.4, z + 0.7, 1.2);
    }
    for (const [x, z] of [
      [-7, -5],
      [7, 5],
      [2, -8],
      [-7, 5],
    ])
      lantern(s, x, z);
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9;
      const x = Math.sin(a) * 12.5,
        z = Math.cos(a) * 12.5;
      const root = new THREE.Group();
      root.position.set(x, -1.1, z);
      s.add(root);
      const trunk = cylinder(root, 0x344536, 0, 1.7, 0, 0.55, 1.1, 4.4, 7);
      trunk.rotation.z = Math.sin(i) * 0.15;
      for (let j = 0; j < 3; j++) {
        const b = j * 2.1;
        tube(
          root,
          [
            new THREE.Vector3(Math.sin(b) * 2, 0.2, Math.cos(b) * 2),
            new THREE.Vector3(Math.sin(b) * 0.9, 0.6, Math.cos(b) * 0.9),
            new THREE.Vector3(0, 1.7, 0),
          ],
          0x344536,
          0.3,
        );
      }
      sphere(root, 0x294632, 0, 4.3, 0, 2.2, 0.9, 2);
      sphere(root, 0x354d35, 1, 4.7, 0.2, 1.6, 0.8, 1.5);
    }
    // Interwoven roots form the roof of this underground hollow.
    tube(
      s,
      [
        new THREE.Vector3(-10, 0, -8),
        new THREE.Vector3(-9, 4, -8),
        new THREE.Vector3(-5, 6.8, -10),
        new THREE.Vector3(1, 7, -11),
        new THREE.Vector3(7, 5.5, -10),
        new THREE.Vector3(10, 1, -8),
      ],
      0x3b4934,
      0.45,
    );
    tube(
      s,
      [
        new THREE.Vector3(-11, 0, -5),
        new THREE.Vector3(-10, 3, -7),
        new THREE.Vector3(-5, 5.8, -11),
        new THREE.Vector3(3, 6.4, -12),
        new THREE.Vector3(9, 3, -10),
      ],
      0x4a5037,
      0.22,
    );
    // A little expedition camp: supply crate, pennant and fallen brass cable.
    const crate = box(s, 0x725033, -5.8, 0.48, -6.5, 1, 0.8, 0.9);
    crate.rotation.y = 0.3;
    for (const x of [-6.1, -5.5])
      box(s, palette.brass, x, 0.49, -6.03, 0.08, 0.78, 0.035);
    cylinder(s, palette.wood, 5.6, 1.45, -6.9, 0.055, 0.09, 3, 8);
    const banner = box(s, 0xa16d44, 6.1, 2.45, -6.9, 1, 0.65, 0.04);
    banner.rotation.z = -0.05;
    tube(
      s,
      [
        new THREE.Vector3(-8, 0.3, -1),
        new THREE.Vector3(-6, 0.25, -2),
        new THREE.Vector3(-5, 0.22, -3.5),
        new THREE.Vector3(-3, 0.22, -3),
      ],
      0x3e4738,
      0.085,
    );
    for (let i = 0; i < 4; i++) {
      const plank = box(
        s,
        0x70553a,
        Math.sin(i * 0.25) * 0.3,
        0.18,
        8.1 + i * 0.5,
        2.6,
        0.2,
        0.4,
      );
      plank.rotation.y = -0.08;
    }
    batchMeshes(s);
  }
  private resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    const size = w / h < 0.9 ? 12.2 : 11.5;
    this.camera.left = (-size * w) / h;
    this.camera.right = (size * w) / h;
    this.camera.top = size;
    this.camera.bottom = -size;
    this.camera.updateProjectionMatrix();
    // setSize clears WebGL's drawing buffer. A static reduced-motion scene
    // must draw again even when its simulation tick has not changed.
    this.lastState = null;
    this.lastTick = -1;
    this.previous = 0;
  }
  private clear(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (o.material instanceof THREE.MeshBasicMaterial)
            o.material.dispose();
        }
      });
    }
  }
  private updateWarning(g: GameState) {
    this.clear(this.warning);
    const a = g.attack;
    if (!a) return;
    const color = a.resolved ? 0xf0c581 : 0xe9aa57;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: a.resolved ? 0.55 : 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    let m: THREE.Mesh;
    if (a.kind === "slam") {
      m = new THREE.Mesh(new THREE.CircleGeometry(2.35, 48), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(a.x, 0.25, a.z);
      const outline = ring(this.warning, 2.26, 2.35, color, 0.27);
      outline.position.set(a.x, 0.27, a.z);
    } else if (a.kind === "ring") {
      m = new THREE.Mesh(new THREE.RingGeometry(3.4, 6.1, 64), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(BOSS.x, 0.25, BOSS.z);
      const outline = ring(this.warning, 6, 6.1, color, 0.27);
      outline.position.z = BOSS.z;
      const inner = ring(this.warning, 3.4, 3.5, color, 0.27);
      inner.position.z = BOSS.z;
    } else {
      m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 16), mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = a.angle;
      m.position.set(BOSS.x, 0.25, BOSS.z);
    }
    this.warning.add(m);
    if (!a.resolved) {
      const progress = Math.min(1, (g.t - a.start) / (a.end - a.start));
      const indicator = ring(this.warning, 0.1, 0.15, color, 0.28);
      indicator.scale.setScalar(1 + progress * 8);
      indicator.position.set(
        a.kind === "slam" ? a.x : 0,
        0.28,
        a.kind === "slam" ? a.z : BOSS.z,
      );
    }
  }
  private animate = (now: number) => {
    if (this.stopped) return;
    this.frame = requestAnimationFrame(this.animate);
    if (
      document.hidden ||
      (!document.hasFocus() && this.previous > 0) ||
      now - this.previous < 1000 / 30
    )
      return;
    this.previous = now;
    const g = this.getState();
    if (this.reduced && this.lastState === g && this.lastTick === g.tick)
      return;
    this.lastState = g;
    this.lastTick = g.tick;
    const time = this.reduced ? 0 : now * 0.001;
    const ids = new Set(g.actors.map((a) => a.id));
    for (const [id, m] of this.actors) {
      if (!ids.has(id)) {
        this.scene.remove(m.group);
        this.actors.delete(id);
      }
    }
    for (const a of g.actors) {
      let m = this.actors.get(a.id);
      if (m && m.role !== a.role) {
        this.scene.remove(m.group);
        this.actors.delete(a.id);
        m = undefined;
      }
      if (!m) {
        m = hamster(a.role);
        this.actors.set(a.id, m);
        this.scene.add(m.group);
      }
      const target = new THREE.Vector3(a.x, 0.22, a.z);
      m.group.position.lerp(target, g.mode === "live" ? 0.4 : 1);
      m.group.rotation.y = a.facing;
      m.group.visible =
        this.reduced || a.hp > 0 || Math.floor(now / 700) % 2 === 0;
      m.body.rotation.z = a.hp <= 0 ? Math.PI / 2 : 0;
      m.body.position.y =
        a.hp <= 0 ? -0.3 : this.reduced ? 0 : Math.sin(time * 3 + a.x) * 0.035;
      m.weapon.rotation.x = this.reduced
        ? 0
        : Math.sin((a.swing / 0.23) * Math.PI) * -1.3;
      m.shield.visible = a.shield > 0;
      m.halo.visible = a.id === this.getLocal();
      m.halo.material = material(
        a.id === this.getLocal() ? 0xf2d998 : 0x8ea78c,
      );
    }
    this.boss.rotation.z = this.reduced ? 0 : Math.sin(time * 1.4) * 0.025;
    this.boss.scale.y = g.status === "victory" ? 0.3 : 1;
    this.boss.position.y = g.status === "victory" ? -0.12 : 0;
    this.fireflies.visible = !this.reduced;
    this.fireflies.rotation.y = time * 0.015;
    this.updateWarning(g);
    this.clear(this.effects);
    for (const e of g.effects) {
      const age = g.t - e.born;
      if (this.reduced && age > 0.2) continue;
      const color =
        e.kind === "heal"
          ? 0xb9d0a4
          : e.kind === "damage"
            ? 0xeb8e6c
            : e.kind === "shield"
              ? 0x9acdbc
              : 0xf0c682;
      const r = ring(this.effects, 0.6 + age * 2, 0.69 + age * 2, color, 0.3);
      r.position.set(e.x, 0.3, e.z);
      if (e.kind === "hit" || e.kind === "burst")
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + e.id;
          const sp = sphere(
            this.effects,
            color,
            e.x + Math.sin(a) * (0.4 + age * 2),
            1 + age,
            e.z + Math.cos(a) * (0.4 + age * 2),
            0.07,
          );
          sp.castShadow = false;
        }
    }
    this.renderer.render(this.scene, this.camera);
  };
  dispose() {
    this.stopped = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points)
        o.geometry.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
