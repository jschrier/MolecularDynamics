import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class TrajectoryRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private atoms?: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private box?: THREE.LineSegments;
  private positions?: Float32Array;
  private frameCount = 0;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000); host.append(this.renderer.domElement);
    this.camera.position.set(15, 12, 15);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.AmbientLight(0xffffff, .65));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(1, 1, 1); this.scene.add(keyLight);
    new ResizeObserver(() => this.resize()).observe(host); this.resize(); this.render();
  }
  load(positions: Float32Array, frameCount: number, boxLength: number) {
    this.positions = positions; this.frameCount = frameCount;
    this.atoms?.removeFromParent(); this.atoms?.geometry.dispose(); this.atoms?.material.dispose(); this.box?.removeFromParent();
    const radius = Math.max(boxLength / 100, .06);
    this.atoms = new THREE.InstancedMesh(
      new THREE.SphereGeometry(radius, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x006666, emissiveIntensity: .5, roughness: .48, metalness: .05 }),
      216
    );
    this.atoms.frustumCulled = false;
    this.scene.add(this.atoms);
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(boxLength, boxLength, boxLength));
    this.box = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8 }));
    this.box.position.set(boxLength / 2, boxLength / 2, boxLength / 2); this.scene.add(this.box);
    const distance = boxLength * 1.9; this.camera.position.set(distance, distance * .8, distance); this.controls.target.set(boxLength/2,boxLength/2,boxLength/2); this.controls.update();
    this.show(0);
  }
  show(frame: number) {
    if (!this.positions || !this.atoms) return;
    const index = Math.max(0, Math.min(this.frameCount - 1, frame));
    const offset = index * 216 * 3;
    const matrix = new THREE.Matrix4();
    for (let atom = 0; atom < 216; atom++) {
      const position = offset + atom * 3;
      matrix.makeTranslation(this.positions[position], this.positions[position + 1], this.positions[position + 2]);
      this.atoms.setMatrixAt(atom, matrix);
    }
    this.atoms.instanceMatrix.needsUpdate = true;
  }
  private resize() { const { clientWidth: width, clientHeight: height } = this.host; if (!width || !height) return; this.camera.aspect=width/height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width,height,false); }
  private render = () => { requestAnimationFrame(this.render); this.controls.update(); this.renderer.render(this.scene,this.camera); };
}
