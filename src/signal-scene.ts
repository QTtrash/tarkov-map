import * as THREE from "three";

function makeRoute(points: THREE.Vector3[], color = 0xff5a2a, opacity = 0.8) {
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.28);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(100)), material);
  return { curve, line, material };
}

export function initializeSignalScene() {
  const host = document.querySelector<HTMLElement>("[data-signal-atlas]");
  const canvas = document.querySelector<HTMLCanvasElement>("[data-signal-canvas]");
  if (!host || !canvas) return;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x090908, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x090908, 0.032);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(5.8, 6.5, 10.7);

  const field = new THREE.Group();
  field.position.set(2.2, -0.65, -0.4);
  field.rotation.set(-0.96, 0, -0.11);
  scene.add(field);

  const texture = new THREE.TextureLoader().load("/maps/svg/Customs.svg", () => canvas.classList.add("is-ready"));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const mapGeometry = new THREE.PlaneGeometry(10.4, 6.2, 72, 48);
  const positions = mapGeometry.attributes.position as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index),
      y = positions.getY(index);
    positions.setZ(index, Math.sin(x * 0.8) * 0.065 + Math.cos(y * 1.2) * 0.05 + Math.sin((x + y) * 1.65) * 0.025);
  }
  mapGeometry.computeVertexNormals();
  const mapMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uMap: { value: texture }, uSignal: { value: new THREE.Color(0xff5a2a) } },
    vertexShader: `varying vec2 vUv; varying vec3 vNormalView; varying vec3 vLocal; void main(){vUv=uv;vLocal=position;vNormalView=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uSignal; varying vec2 vUv; varying vec3 vNormalView; varying vec3 vLocal; void main(){vec4 tex=texture2D(uMap,vUv);float luma=dot(tex.rgb,vec3(.299,.587,.114));float light=clamp(dot(vNormalView,normalize(vec3(-.25,.75,.58)))*.4+.58,0.,1.);vec3 mapTone=mix(vec3(luma),tex.rgb,.42)*.72+vec3(.018);float gridX=1.-smoothstep(.0,.018,abs(fract((vLocal.x+5.2)*.46)-.5));float gridY=1.-smoothstep(.0,.018,abs(fract((vLocal.y+3.1)*.46)-.5));vec3 color=mapTone*light+uSignal*(gridX+gridY)*.025;gl_FragColor=vec4(color,.24);}`,
  });
  const map = new THREE.Mesh(mapGeometry, mapMaterial);
  field.add(map);

  const local = new THREE.Vector3(-3.35, -1.25, 0.13);
  const relay = new THREE.Vector3(0.15, 0.35, 0.16);
  const squad = [
    new THREE.Vector3(3.05, 1.35, 0.15),
    new THREE.Vector3(3.75, -0.45, 0.15),
    new THREE.Vector3(2.15, -1.8, 0.15),
  ];
  const inbound = makeRoute([
    local,
    new THREE.Vector3(-2.25, -0.88, 0.15),
    new THREE.Vector3(-1.05, -0.15, 0.16),
    relay,
  ]);
  field.add(inbound.line);
  const outbound = squad.map((point, index) => {
    const route = makeRoute(
      [relay, new THREE.Vector3(1.05 + index * 0.18, 0.2 - index * 0.45, 0.17), point],
      index === 1 ? 0xe8e0d0 : 0xff5a2a,
      0.55,
    );
    field.add(route.line);
    return route;
  });

  const beaconMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a2a });
  const markerPoints = [local, relay, ...squad];
  const beacons = markerPoints.map((point, index) => {
    const group = new THREE.Group();
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(index === 1 ? 0.16 : 0.105, 0), beaconMaterial.clone());
    const halo = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 36 }, (_, step) => {
          const angle = (step / 36) * Math.PI * 2;
          return new THREE.Vector3(
            Math.cos(angle) * (index === 1 ? 0.34 : 0.23),
            Math.sin(angle) * (index === 1 ? 0.34 : 0.23),
            0,
          );
        }),
      ),
      new THREE.LineBasicMaterial({ color: index === 1 ? 0xe8e0d0 : 0xff5a2a, transparent: true, opacity: 0.5 }),
    );
    group.add(diamond, halo);
    group.position.copy(point);
    field.add(group);
    return group;
  });

  const packetMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a2a });
  const packets = Array.from({ length: 9 }, (_, index) => {
    const packet = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), packetMaterial);
    packet.userData.offset = index / 9;
    field.add(packet);
    return packet;
  });

  let mode = 0;
  let visible = true;
  let frameId = 0;
  let pointerX = 0;
  let pointerY = 0;
  const onMode = (event: Event) => {
    mode = Number((event as CustomEvent<number>).detail) || 0;
  };
  const onPointer = (event: PointerEvent) => {
    pointerX = event.clientX / innerWidth - 0.5;
    pointerY = event.clientY / innerHeight - 0.5;
  };
  document.addEventListener("raid-signal:mode", onMode);
  addEventListener("pointermove", onPointer, { passive: true });

  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / Math.max(bounds.height, 1);
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frameId) frameId = requestAnimationFrame(render);
    },
    { threshold: 0.01 },
  );
  observer.observe(host);

  const clock = new THREE.Clock();
  const desiredCamera = new THREE.Vector3();
  function render() {
    if (!visible || document.hidden) {
      frameId = 0;
      return;
    }
    const elapsed = clock.getElapsedTime();
    inbound.material.opacity = THREE.MathUtils.lerp(inbound.material.opacity, mode === 0 ? 0.94 : 0.48, 0.07);
    outbound.forEach((route) => {
      route.material.opacity = THREE.MathUtils.lerp(route.material.opacity, mode === 2 ? 0.86 : 0.14, 0.07);
    });
    beacons.forEach((beacon, index) => {
      const target = mode === 0 ? (index === 0 ? 1 : 0.45) : mode === 1 ? (index < 2 ? 1 : 0.38) : 1;
      const scale = THREE.MathUtils.lerp(beacon.scale.x, target, 0.08);
      beacon.scale.setScalar(scale * (1 + Math.sin(elapsed * 2.1 + index) * 0.025));
    });
    packets.forEach((packet) => {
      const progress = (elapsed * 0.12 + packet.userData.offset) % 1;
      const route =
        mode === 2 ? outbound[Math.floor(packet.userData.offset * outbound.length) % outbound.length] : inbound;
      packet.position.copy(route.curve.getPointAt(progress));
      packet.visible = mode > 0;
      packet.rotation.z += 0.04;
    });
    desiredCamera.set(5.8 + pointerX * 0.3 + mode * 0.16, 6.5 - pointerY * 0.22 - mode * 0.2, 10.7 - mode * 0.35);
    camera.position.lerp(desiredCamera, 0.035);
    camera.lookAt(1.25 + mode * 0.2, -0.15, 0);
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(render);
  }

  resize();
  frameId = requestAnimationFrame(render);
  addEventListener(
    "pagehide",
    () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("raid-signal:mode", onMode);
      removeEventListener("pointermove", onPointer);
      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineLoop)) return;
        child.geometry.dispose();
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => material.dispose());
      });
      texture.dispose();
      renderer.dispose();
    },
    { once: true },
  );
}
