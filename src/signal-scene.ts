import * as THREE from "three";
import type { SignalSound } from "./signal-main";
import { SIGNAL_CHAPTERS, signalStoryState } from "./signal-story";

function setOpacity(object: THREE.Object3D, opacity: number) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineLoop)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) { material.transparent = true; material.opacity = opacity; }
  });
}

function createContours() {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0x8b8478, transparent: true, opacity: .46 });
  for (let level = 0; level < 19; level += 1) {
    const points: THREE.Vector3[] = [];
    const inset = level * .075;
    for (let index = 0; index < 96; index += 1) {
      const angle = index / 96 * Math.PI * 2;
      const noise = Math.sin(angle * 3 + level * .71) * .22 + Math.cos(angle * 7 - level * .43) * .1;
      const radius = 1 + noise * (1 - level / 24);
      points.push(new THREE.Vector3(Math.cos(angle) * (4.6 - inset) * radius, level * .055 + Math.sin(angle * 2 + level) * .025, Math.sin(angle) * (3.25 - inset * .62) * radius));
    }
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material));
  }
  const slab = new THREE.Mesh(new THREE.BoxGeometry(9.6, .16, 7), new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vNormal; void main(){ vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vNormal; void main(){ vec2 cell=mod(floor(gl_FragCoord.xy),4.0); float order=mod(cell.x*2.0+cell.y*3.0,5.0)/5.0; float light=dot(normalize(vNormal),normalize(vec3(-0.35,0.82,0.44)))*0.5+0.5; gl_FragColor=vec4(mix(vec3(0.045,0.043,0.035),vec3(0.18,0.095,0.055),step(order,light*0.72)),1.0); }`,
  }));
  slab.position.y = -.12;
  group.add(slab);
  return group;
}

function createBeacon(x: number, z: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xff5a2a });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.2, .018, 8, 48), material);
  ring.rotation.x = Math.PI / 2;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .6, 8), material);
  core.position.y = .3;
  group.add(ring, core);
  group.position.set(x, .98, z);
  return group;
}

function createDevice(width: number, height: number, depth: number) {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color: 0x181713, roughness: .72, metalness: .35 }));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(width * .78, height * .68), new THREE.MeshBasicMaterial({ color: 0x2b160f }));
  screen.position.z = depth / 2 + .006;
  group.add(shell, screen);
  return group;
}

export function initializeSignalScene(sound: SignalSound) {
  const sequence = document.querySelector<HTMLElement>("[data-signal-sequence]");
  const canvas = document.querySelector<HTMLCanvasElement>("[data-signal-canvas]");
  const readout = document.querySelector<HTMLElement>("[data-stage-readout]");
  if (!sequence || !canvas) return;

  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" }); } catch { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x090908, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  camera.position.set(8.7, 7.2, 10.8);
  camera.lookAt(0, .2, 0);
  scene.add(new THREE.HemisphereLight(0xe8e0d0, 0x080807, 1.6));
  const keyLight = new THREE.DirectionalLight(0xff754d, 3.2);
  keyLight.position.set(-4, 8, 5);
  scene.add(keyLight);

  const terrain = createContours(); terrain.rotation.y = -.16; scene.add(terrain);
  const beaconA = createBeacon(-2.2, .7); const beaconB = createBeacon(.9, -1.25); scene.add(beaconA, beaconB);
  const desktop = createDevice(2.5, 1.55, .16); desktop.position.set(-4.7, 2.25, .3); desktop.rotation.y = .46; scene.add(desktop);
  const relay = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.8, 1.25), new THREE.MeshStandardMaterial({ color: 0x080807, roughness: .45, metalness: .65 }));
  relay.position.set(.2, 2.05, -.15);
  relay.add(new THREE.LineSegments(new THREE.EdgesGeometry(relay.geometry), new THREE.LineBasicMaterial({ color: 0x817b70, transparent: true, opacity: .5 })));
  scene.add(relay);
  const phone = createDevice(1.18, 2.25, .13); phone.position.set(4.3, 2.15, -.25); phone.rotation.y = -.38; scene.add(phone);
  const packetMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a2a });
  const packets = Array.from({ length: 11 }, (_, index) => { const packet = new THREE.Mesh(new THREE.BoxGeometry(.075, .075, .075), packetMaterial); packet.userData.offset = index / 11; scene.add(packet); return packet; });

  const clock = new THREE.Clock();
  let progress = 0, frame = 0, pointerX = 0, pointerY = 0, previousChapter = 0;
  let visible = true;
  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / Math.max(innerHeight, 1); camera.updateProjectionMatrix(); };
  const updateProgress = () => { const bounds = sequence.getBoundingClientRect(); progress = Math.min(1, Math.max(0, -bounds.top / Math.max(1, bounds.height - innerHeight))); };
  const onPointer = (event: PointerEvent) => { pointerX = event.clientX / innerWidth - .5; pointerY = event.clientY / innerHeight - .5; };
  const render = () => {
    if (!visible || document.hidden) { frame = 0; return; }
    const elapsed = clock.getElapsedTime();
    const state = signalStoryState(progress);
    if (state.chapter !== previousChapter) { sound.cue(state.chapter === 2 ? "relay" : state.chapter === 3 ? "resolve" : "acquire"); previousChapter = state.chapter; }
    if (readout) readout.textContent = SIGNAL_CHAPTERS[state.chapter];
    terrain.scale.y = Math.max(.015, state.terrain); terrain.rotation.y = -.16 + Math.sin(elapsed * .13) * .025;
    beaconA.scale.setScalar(.72 + Math.sin(elapsed * 2.2) * .08); beaconB.scale.setScalar(.72 + Math.sin(elapsed * 2.2 + 1.1) * .08);
    setOpacity(beaconA, state.terrain); setOpacity(beaconB, state.terrain);
    desktop.scale.setScalar(Math.max(.001, state.devices)); relay.scale.setScalar(Math.max(.001, state.relay)); phone.scale.setScalar(Math.max(.001, state.delivery));
    const packetTravel = Math.max(0, Math.min(1, (progress - .28) / .62));
    for (const packet of packets) {
      const travel = (packetTravel * 1.45 - packet.userData.offset + 1) % 1;
      if (travel < .5) packet.position.lerpVectors(desktop.position, relay.position, Math.min(1, travel * 2)); else packet.position.lerpVectors(relay.position, phone.position, Math.max(0, travel * 2 - 1));
      packet.position.y += Math.sin(elapsed * 3 + packet.userData.offset * 12) * .08;
      packet.visible = progress > .29 && progress < .98;
    }
    camera.position.x = THREE.MathUtils.lerp(8.7, state.chapter === 2 ? 6.6 : 7.5, state.relay) + pointerX * .34;
    camera.position.y = THREE.MathUtils.lerp(7.2, 5.6, state.delivery) - pointerY * .22;
    camera.lookAt(THREE.MathUtils.lerp(-.45, .35, state.delivery), 1, 0);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };

  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible && !frame) frame = requestAnimationFrame(render); });
  observer.observe(sequence);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(document.documentElement);
  addEventListener("scroll", updateProgress, { passive: true }); addEventListener("pointermove", onPointer, { passive: true });
  canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); canvas.classList.remove("is-ready"); });
  canvas.addEventListener("webglcontextrestored", () => canvas.classList.add("is-ready"));
  resize(); updateProgress(); canvas.classList.add("is-ready"); frame = requestAnimationFrame(render);
  addEventListener("pagehide", () => {
    cancelAnimationFrame(frame); observer.disconnect(); resizeObserver.disconnect(); removeEventListener("scroll", updateProgress); removeEventListener("pointermove", onPointer);
    scene.traverse((child) => { if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineLoop || child instanceof THREE.LineSegments)) return; child.geometry.dispose(); (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => material.dispose()); });
    renderer.dispose();
  }, { once: true });
}
