import * as THREE from 'three';
import { CarSpec } from './types';

export interface PlayerCarRig {
  root: THREE.Group;
  bodyTiltGroup: THREE.Group;
  paintMaterial: THREE.MeshPhysicalMaterial;
  brakeLightMaterial: THREE.MeshStandardMaterial;
  headlightMaterial: THREE.MeshStandardMaterial;
  headlightLeft: THREE.SpotLight;
  headlightRight: THREE.SpotLight;
  headlightTargetLeft: THREE.Object3D;
  headlightTargetRight: THREE.Object3D;
  nitroFlames: THREE.Mesh[];
  wheelSpinMeshes: THREE.Object3D[];
  frontWheelSteerPivots: THREE.Group[];
  cameraTarget: THREE.Object3D;
  dispose: () => void;
}

function buildChassisShape(style: CarSpec['bodyStyle']): THREE.Shape {
  const s = new THREE.Shape();
  // Side profile in X-Y (X = length along Z after rotation, Y = height)
  // Front is +X in shape space, which will map to +Z in car space
  if (style === 'supercar') {
    s.moveTo(-2.2, 0.28);
    s.lineTo(-2.15, 0.72);
    s.lineTo(-1.55, 0.84);
    s.lineTo(-0.75, 1.12);
    s.lineTo(0.35, 1.12);
    s.lineTo(1.25, 0.74);
    s.lineTo(2.15, 0.54);
    s.lineTo(2.28, 0.34);
    s.lineTo(2.15, 0.24);
    s.lineTo(-2.15, 0.24);
    s.closePath();
  } else if (style === 'tuner') {
    s.moveTo(-2.1, 0.28);
    s.lineTo(-2.05, 0.82);
    s.lineTo(-1.35, 0.9);
    s.lineTo(-0.85, 1.26);
    s.lineTo(0.35, 1.26);
    s.lineTo(1.1, 0.86);
    s.lineTo(2.08, 0.72);
    s.lineTo(2.15, 0.32);
    s.lineTo(2.0, 0.24);
    s.lineTo(-2.0, 0.24);
    s.closePath();
  } else {
    // coupe
    s.moveTo(-2.15, 0.28);
    s.lineTo(-2.1, 0.78);
    s.lineTo(-1.4, 0.88);
    s.lineTo(-0.75, 1.22);
    s.lineTo(0.38, 1.22);
    s.lineTo(1.18, 0.82);
    s.lineTo(2.12, 0.66);
    s.lineTo(2.2, 0.32);
    s.lineTo(2.05, 0.24);
    s.lineTo(-2.05, 0.24);
    s.closePath();
  }
  return s;
}

function createWheelAssembly(radius: number, width: number): {
  pivot: THREE.Group;
  spinGroup: THREE.Group;
} {
  const pivot = new THREE.Group();
  const spinGroup = new THREE.Group();
  pivot.add(spinGroup);

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x16181d,
    roughness: 0.86,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd4dbe6,
    roughness: 0.22,
    metalness: 0.9,
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.35,
    metalness: 0.6,
  });

  // Tire cylinder (aligned along X axis)
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  spinGroup.add(tire);

  // Inner alloy rim drum
  const rimGeo = new THREE.CylinderGeometry(radius * 0.64, radius * 0.64, width + 0.02, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  spinGroup.add(rim);

  // 5-spoke star bar details for visible rotation
  const spokeGeo = new THREE.BoxGeometry(width + 0.035, radius * 1.15, 0.06);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.x = (i * Math.PI) / 3;
    spinGroup.add(spoke);
  }

  // Center brake cap
  const capGeo = new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, width + 0.05, 12);
  capGeo.rotateZ(Math.PI / 2);
  const cap = new THREE.Mesh(capGeo, hubMat);
  spinGroup.add(cap);

  return { pivot, spinGroup };
}

export function createPlayerCar(
  spec: CarSpec,
  paintHex: string,
  contactShadowTex: THREE.Texture,
  isSoftwareGl: boolean
): PlayerCarRig {
  const root = new THREE.Group();
  const bodyTiltGroup = new THREE.Group();
  root.add(bodyTiltGroup);

  // Camera target (follows CarController + CameraFollow pattern from PDF)
  const cameraTarget = new THREE.Object3D();
  cameraTarget.position.set(0, 1.35, 0);
  root.add(cameraTarget);

  // Grounded radial contact shadow beneath chassis
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 5.4),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.62,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.025;
  root.add(shadowPlane);

  // Materials
  const paintMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(paintHex),
    metalness: 0.68,
    roughness: 0.24,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.15,
  });

  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.65,
    metalness: 0.25,
  });

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0b1220,
    roughness: 0.08,
    metalness: 0.15,
    clearcoat: 1.0,
    opacity: 0.92,
    transparent: true,
  });

  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.16,
    metalness: 0.95,
  });

  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef3c7,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  const brakeLightMaterial = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: 0xef4444,
    emissiveIntensity: 0.7,
    roughness: 0.3,
  });

  // 1. Extruded primary chassis (extruded along width then rotated so +X shape aligns to +Z forward)
  const chassisShape = buildChassisShape(spec.bodyStyle);
  const bodyWidth = 1.82;
  const extrudeGeo = new THREE.ExtrudeGeometry(chassisShape, {
    depth: bodyWidth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.06,
    bevelThickness: 0.06,
  });
  extrudeGeo.translate(0, 0, -bodyWidth / 2);
  // Rotate -90 deg around Y so shape +X -> world +Z (car forward)
  extrudeGeo.rotateY(-Math.PI / 2);
  const chassisMesh = new THREE.Mesh(extrudeGeo, paintMaterial);
  chassisMesh.castShadow = true;
  chassisMesh.receiveShadow = true;
  bodyTiltGroup.add(chassisMesh);

  // 2. Dark underbody & front splitter
  const underbody = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.12, 4.32), trimMaterial);
  underbody.position.set(0, 0.25, 0.02);
  underbody.castShadow = true;
  bodyTiltGroup.add(underbody);

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.06, 0.34), trimMaterial);
  splitter.position.set(0, 0.22, 2.18);
  bodyTiltGroup.add(splitter);

  // 3. Tinted cabin windshield & side glass wrap
  const cabinHeight = spec.bodyStyle === 'supercar' ? 0.34 : 0.42;
  const cabinY = spec.bodyStyle === 'supercar' ? 0.96 : 1.04;
  const cabinGlass = new THREE.Mesh(new THREE.BoxGeometry(1.6, cabinHeight, 1.85), glassMaterial);
  cabinGlass.position.set(0, cabinY, -0.18);
  cabinGlass.rotation.x = 0.03;
  bodyTiltGroup.add(cabinGlass);

  // 4. Side mirrors
  const mirrorGeo = new THREE.BoxGeometry(0.22, 0.1, 0.16);
  const leftMirror = new THREE.Mesh(mirrorGeo, paintMaterial);
  leftMirror.position.set(1.02, 0.88, 0.48);
  const rightMirror = new THREE.Mesh(mirrorGeo, paintMaterial);
  rightMirror.position.set(-1.02, 0.88, 0.48);
  bodyTiltGroup.add(leftMirror, rightMirror);

  // 5. Front grille & hood intake
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.18, 0.08), trimMaterial);
  grille.position.set(0, 0.4, 2.22);
  bodyTiltGroup.add(grille);

  // 6. Headlights + SpotLights (used especially at sunset/night)
  const hlGeo = new THREE.BoxGeometry(0.38, 0.1, 0.1);
  const hlLeftMesh = new THREE.Mesh(hlGeo, headlightMaterial);
  hlLeftMesh.position.set(0.66, 0.52, 2.18);
  const hlRightMesh = new THREE.Mesh(hlGeo, headlightMaterial);
  hlRightMesh.position.set(-0.66, 0.52, 2.18);
  bodyTiltGroup.add(hlLeftMesh, hlRightMesh);

  const headlightLeft = new THREE.SpotLight(0xfffbeb, 0, 58, Math.PI / 5, 0.45, 1.4);
  headlightLeft.position.set(0.66, 0.56, 2.22);
  const headlightTargetLeft = new THREE.Object3D();
  headlightTargetLeft.position.set(0.55, 0.0, 22);
  bodyTiltGroup.add(headlightLeft, headlightTargetLeft);
  headlightLeft.target = headlightTargetLeft;

  const headlightRight = new THREE.SpotLight(0xfffbeb, 0, 58, Math.PI / 5, 0.45, 1.4);
  headlightRight.position.set(-0.66, 0.56, 2.22);
  const headlightTargetRight = new THREE.Object3D();
  headlightTargetRight.position.set(-0.55, 0.0, 22);
  bodyTiltGroup.add(headlightRight, headlightTargetRight);
  headlightRight.target = headlightTargetRight;

  // 7. Rear taillights bar
  const tlGeo = new THREE.BoxGeometry(0.52, 0.1, 0.08);
  const tlLeft = new THREE.Mesh(tlGeo, brakeLightMaterial);
  tlLeft.position.set(0.62, 0.62, -2.18);
  const tlRight = new THREE.Mesh(tlGeo, brakeLightMaterial);
  tlRight.position.set(-0.62, 0.62, -2.18);
  bodyTiltGroup.add(tlLeft, tlRight);

  // 8. Rear spoiler wing
  const wingStanchionGeo = new THREE.BoxGeometry(0.06, 0.24, 0.18);
  const stL = new THREE.Mesh(wingStanchionGeo, trimMaterial);
  stL.position.set(0.55, 0.92, -1.96);
  const stR = new THREE.Mesh(wingStanchionGeo, trimMaterial);
  stR.position.set(-0.55, 0.92, -1.96);
  const wingBlade = new THREE.Mesh(
    new THREE.BoxGeometry(spec.bodyStyle === 'supercar' ? 1.96 : 1.78, 0.05, 0.3),
    spec.bodyStyle === 'tuner' ? paintMaterial : trimMaterial
  );
  wingBlade.position.set(0, 1.05, -2.02);
  wingBlade.rotation.x = -0.1;
  wingBlade.castShadow = !isSoftwareGl;
  bodyTiltGroup.add(stL, stR, wingBlade);

  // 9. Dual Chrome Exhausts + Nitro Flame Cones
  const exhaustGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.22, 12);
  exhaustGeo.rotateX(Math.PI / 2);
  const exL = new THREE.Mesh(exhaustGeo, chromeMaterial);
  exL.position.set(0.48, 0.27, -2.22);
  const exR = new THREE.Mesh(exhaustGeo, chromeMaterial);
  exR.position.set(-0.48, 0.27, -2.22);
  bodyTiltGroup.add(exL, exR);

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
  });
  const flameGeo = new THREE.ConeGeometry(0.085, 0.85, 10);
  flameGeo.rotateX(-Math.PI / 2);
  const flameL = new THREE.Mesh(flameGeo, flameMat);
  flameL.position.set(0.48, 0.27, -2.72);
  flameL.visible = false;
  const flameR = new THREE.Mesh(flameGeo, flameMat);
  flameR.position.set(-0.48, 0.27, -2.72);
  flameR.visible = false;
  bodyTiltGroup.add(flameL, flameR);

  // 10. Four multi-part wheels
  const wheelRadius = 0.36;
  const wheelWidth = 0.28;
  const wheelPositions: Array<{ x: number; z: number; isFront: boolean }> = [
    { x: 0.96, z: 1.38, isFront: true },
    { x: -0.96, z: 1.38, isFront: true },
    { x: 0.96, z: -1.36, isFront: false },
    { x: -0.96, z: -1.36, isFront: false },
  ];

  const wheelSpinMeshes: THREE.Object3D[] = [];
  const frontWheelSteerPivots: THREE.Group[] = [];

  for (const wp of wheelPositions) {
    const { pivot, spinGroup } = createWheelAssembly(wheelRadius, wheelWidth);
    pivot.position.set(wp.x, wheelRadius, wp.z);
    root.add(pivot);
    wheelSpinMeshes.push(spinGroup);
    if (wp.isFront) {
      frontWheelSteerPivots.push(pivot);
    }
  }

  return {
    root,
    bodyTiltGroup,
    paintMaterial,
    brakeLightMaterial,
    headlightMaterial,
    headlightLeft,
    headlightRight,
    headlightTargetLeft,
    headlightTargetRight,
    nitroFlames: [flameL, flameR],
    wheelSpinMeshes,
    frontWheelSteerPivots,
    cameraTarget,
    dispose: () => {
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    },
  };
}

export function createTrafficCar(colorHex: number, contactShadowTex: THREE.Texture): THREE.Group {
  const group = new THREE.Group();

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 4.6),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.45,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  group.add(shadow);

  const paintMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.35,
    metalness: 0.55,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.12,
    metalness: 0.3,
  });
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.85,
  });

  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.58, 4.0), paintMat);
  lower.position.y = 0.55;
  lower.castShadow = true;
  group.add(lower);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.48, 2.0), glassMat);
  cabin.position.set(0, 1.04, -0.1);
  cabin.castShadow = true;
  group.add(cabin);

  const hlMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
  const tlMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.05), hlMat);
  hl.position.set(0, 0.56, 2.01);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.05), tlMat);
  tl.position.set(0, 0.56, -2.01);
  group.add(hl, tl);

  const wGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 14);
  wGeo.rotateZ(Math.PI / 2);
  const offsets: Array<[number, number]> = [
    [0.88, 1.25],
    [-0.88, 1.25],
    [0.88, -1.25],
    [-0.88, -1.25],
  ];
  for (const [wx, wz] of offsets) {
    const w = new THREE.Mesh(wGeo, wheelMat);
    w.position.set(wx, 0.32, wz);
    group.add(w);
  }

  return group;
}
