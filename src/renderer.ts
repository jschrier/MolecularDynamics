import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class TrajectoryRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private particles?: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private box?: THREE.LineSegments;
  private positions?: Float32Array;
  private frameCount = 0;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x07131f); host.append(this.renderer.domElement);
    this.camera.position.set(15, 12, 15);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.AmbientLight(0xffffff, 1));
    new ResizeObserver(() => this.resize()).observe(host); this.resize(); this.render();
  }
  load(positions: Float32Array, frameCount: number, boxLength: number) {
    this.positions = positions; this.frameCount = frameCount;
    this.particles?.removeFromParent(); this.box?.removeFromParent();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(216 * 3), 3));
    this.particles = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x70d6ff, size: Math.max(boxLength / 75, .08), sizeAttenuation: true }));
    this.scene.add(this.particles);
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(boxLength, boxLength, boxLength));
    this.box = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x7e9ab4, transparent: true, opacity: .75 }));
    this.box.position.set(boxLength / 2, boxLength / 2, boxLength / 2); this.scene.add(this.box);
    const distance = boxLength * 1.9; this.camera.position.set(distance, distance * .8, distance); this.controls.target.set(boxLength/2,boxLength/2,boxLength/2); this.controls.update();
    this.show(0);
  }
  show(frame: number) {
    if (!this.positions || !this.particles) return;
    const index = Math.max(0, Math.min(this.frameCount - 1, frame));
    const attribute = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
    attribute.array.set(this.positions.subarray(index * 216 * 3, (index + 1) * 216 * 3)); attribute.needsUpdate = true;
  }
  private resize() { const { clientWidth: width, clientHeight: height } = this.host; if (!width || !height) return; this.camera.aspect=width/height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width,height,false); }
  private render = () => { requestAnimationFrame(this.render); this.controls.update(); this.renderer.render(this.scene,this.camera); };
}
