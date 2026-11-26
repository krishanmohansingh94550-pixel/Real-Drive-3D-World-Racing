import * as THREE from 'three';
import { WorldTextures } from './textures';
import { CheckpointDef, TimeOfDay } from './types';

export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RampDef {
  x: number;
  z: number;
  width: number;
  length: number;
  height: number;
  dirX: number; // unit vector of ramp climb direction
  dirZ: number;
}

export interface CheckpointGateVisual {
  def: CheckpointDef;
  group: THREE.Group;
  beaconMesh: THREE.Mesh;
  pillarMat: THREE.MeshStandardMaterial;
  beaconMat: THREE.MeshBasicMaterial;
}

export interface WorldBuildResult {
  worldGroup: THREE.Group;
  colliders: BoxCollider[];
  ramps: RampDef[];
  checkpoints: CheckpointGateVisual[];
  buildingMaterial: THREE.MeshStandardMaterial;
  lampBulbMaterial: THREE.MeshStandardMaterial;
  skyDomeMaterial: THREE.MeshBasicMaterial;
  highwayCurvePoints: THREE.Vector3[];
  sampleHighwayPoint: (t: number, laneOffset: number, outPos: THREE.Vector3, outTangent: THREE.Vector3) => void;
  getGroundHeightAt: (x: number, z: number) => number;
  applyTimeOfDay: (
    tod: TimeOfDay,
    scene: THREE.Scene,
    sunLight: THREE.DirectionalLight,
    hemiLight: THREE.HemisphereLight,
    textures: WorldTextures
  ) => void;
  dispose: () => void;
}

const HIGHWAY_RX = 165;
const HIGHWAY_RZ = 135;
const HIGHWAY_WIDTH = 18;

export function buildWorld(textures: WorldTextures, isSoftwareGl: boolean): WorldBuildResult {
  const worldGroup = new THREE.Group();
  const colliders: BoxCollider[] = [];
  const ramps: RampDef[] = [];
  const checkpoints: CheckpointGateVisual[] = [];

  // 1. Sky Dome
  const skyGeo = new THREE.SphereGeometry(680, 24, 16);
  const skyDomeMaterial = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    side: THREE.BackSide,
    fog: false,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyDomeMaterial);
  worldGroup.add(skyDome);

  // 2. Expansive Ground Terrain
  const groundMat = new THREE.MeshStandardMaterial({
    map: textures.grass,
    roughness: 0.95,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1300, 1300), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  worldGroup.add(ground);

  // Inner city concrete base pad (slightly elevated by 0.02 to avoid z-fighting)
  const plazaMat = new THREE.MeshStandardMaterial({
    map: textures.sidewalk,
    roughness: 0.85,
    metalness: 0.05,
  });
  const cityPad = new THREE.Mesh(new THREE.PlaneGeometry(290, 230), plazaMat);
  cityPad.rotation.x = -Math.PI / 2;
  cityPad.position.y = 0.02;
  cityPad.receiveShadow = true;
  worldGroup.add(cityPad);

  // 3. Road Network (Asphalt material with polygonOffset to guarantee crisp no-z-fighting)
  const roadMat = new THREE.MeshStandardMaterial({
    map: textures.asphalt,
    roughness: 0.78,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  // Helper for straight avenue segments
  const addStraightRoad = (cx: number, cz: number, width: number, length: number, horizontal: boolean) => {
    const texClone = textures.asphalt.clone();
    texClone.needsUpdate = true;
    texClone.repeat.set(1, Math.max(1, Math.round(length / 18)));
    const mat = roadMat.clone();
    mat.map = texClone;

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), mat);
    mesh.rotation.x = -Math.PI / 2;
    if (horizontal) {
      mesh.rotation.z = Math.PI / 2;
    }
    mesh.position.set(cx, 0.05, cz);
    mesh.receiveShadow = true;
    worldGroup.add(mesh);
  };

  // Main Cross Avenues + Secondary Grid
  addStraightRoad(0, 0, 16, 270, false); // North-South main avenue
  addStraightRoad(0, 0, 16, 330, true); // East-West main avenue
  addStraightRoad(-78, 0, 12, 230, false);
  addStraightRoad(78, 0, 12, 230, false);
  addStraightRoad(0, -68, 12, 290, true);
  addStraightRoad(0, 68, 12, 290, true);

  // 4. Outer Elliptical Highway Ring Ribbon
  const segments = 128;
  const highwayCurvePoints: THREE.Vector3[] = [];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = Math.sin(t) * HIGHWAY_RX;
    const z = Math.cos(t) * HIGHWAY_RZ;
    highwayCurvePoints.push(new THREE.Vector3(x, 0, z));

    // Outward normal on ellipse
    const nx = Math.sin(t) / HIGHWAY_RX;
    const nz = Math.cos(t) / HIGHWAY_RZ;
    const nLen = Math.hypot(nx, nz) || 1;
    const ux = nx / nLen;
    const uz = nz / nLen;

    const halfW = HIGHWAY_WIDTH / 2;
    // Inner vertex
    positions.push(x - ux * halfW, 0.06, z - uz * halfW);
    // Outer vertex
    positions.push(x + ux * halfW, 0.06, z + uz * halfW);

    const vCoord = (i / segments) * 42;
    uvs.push(0, vCoord);
    uvs.push(1, vCoord);

    if (i < segments) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const highwayGeo = new THREE.BufferGeometry();
  highwayGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  highwayGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  highwayGeo.setIndex(indices);
  highwayGeo.computeVertexNormals();

  const highwayTex = textures.asphalt.clone();
  highwayTex.needsUpdate = true;
  highwayTex.repeat.set(1, 1);
  const highwayMat = roadMat.clone();
  highwayMat.map = highwayTex;
  const highwayMesh = new THREE.Mesh(highwayGeo, highwayMat);
  highwayMesh.receiveShadow = true;
  worldGroup.add(highwayMesh);

  // Outer Highway Guardrail Posts & Rail Ribbon
  const barrierMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.65,
    roughness: 0.35,
  });
  const barrierStripeMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    roughness: 0.4,
    metalness: 0.2,
  });

  const postGeo = new THREE.BoxGeometry(0.35, 1.0, 0.35);
  const railGeo = new THREE.BoxGeometry(0.25, 0.35, 8.6);
  const postCount = 96;
  const postInst = new THREE.InstancedMesh(postGeo, barrierMat, postCount);
  const railInst = new THREE.InstancedMesh(railGeo, barrierStripeMat, postCount);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < postCount; i++) {
    const t = (i / postCount) * Math.PI * 2;
    const x = Math.sin(t) * (HIGHWAY_RX + HIGHWAY_WIDTH * 0.5 + 1.5);
    const z = Math.cos(t) * (HIGHWAY_RZ + HIGHWAY_WIDTH * 0.5 + 1.5);
    const dx = Math.cos(t) * HIGHWAY_RX;
    const dz = -Math.sin(t) * HIGHWAY_RZ;
    const yaw = Math.atan2(dx, dz);

    dummy.position.set(x, 0.5, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, 0.72, z);
    dummy.updateMatrix();
    railInst.setMatrixAt(i, dummy.matrix);
  }
  postInst.computeBoundingSphere();
  railInst.computeBoundingSphere();
  worldGroup.add(postInst, railInst);

  // 5. City Skyline Buildings (placed cleanly inside block quadrants away from roads)
  const buildingMaterial = new THREE.MeshStandardMaterial({
    map: textures.buildingDay,
    roughness: 0.45,
    metalness: 0.25,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.7,
    metalness: 0.3,
  });
  const trimConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.8,
    metalness: 0.1,
  });

  // Block centers between avenues:
  // X avenues at -78, 0, +78 (half-widths 6..8).
  // Z avenues at -68, 0, +68 (half-widths 6..8).
  // Safe block centers: X in [-112, -39, +39, +112], Z in [-98, -34, +34, +98]
  const blockX = [-112, -39, 39, 112];
  const blockZ = [-98, -34, 34, 98];

  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (const bx of blockX) {
    for (const bz of blockZ) {
      // Leave central-ish plaza open near (-39, -34) or (39, 34) for driving stunts/open space
      if (Math.abs(bx) === 39 && Math.abs(bz) === 34 && rand() > 0.55) {
        continue;
      }
      // Check not overlapping elliptical outer highway
      const normDist = Math.hypot(bx / HIGHWAY_RX, bz / HIGHWAY_RZ);
      if (normDist > 0.78) continue;

      const bw = 20 + rand() * 14;
      const bd = 16 + rand() * 12;
      const bh = 14 + rand() * 34;

      const bGroup = new THREE.Group();
      bGroup.position.set(bx, 0, bz);

      // Base podium
      const podium = new THREE.Mesh(new THREE.BoxGeometry(bw + 2, 3.2, bd + 2), trimConcreteMat);
      podium.position.y = 1.6;
      podium.castShadow = !isSoftwareGl;
      podium.receiveShadow = true;
      bGroup.add(podium);

      // Main tower
      const tower = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildingMaterial);
      tower.position.y = 3.2 + bh / 2;
      tower.castShadow = !isSoftwareGl;
      tower.receiveShadow = true;
      bGroup.add(tower);

      // Rooftop mechanical crown
      const crown = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.55, 2.6, bd * 0.55), roofMat);
      crown.position.y = 3.2 + bh + 1.3;
      bGroup.add(crown);

      worldGroup.add(bGroup);

      colliders.push({
        minX: bx - (bw + 2) / 2,
        maxX: bx + (bw + 2) / 2,
        minZ: bz - (bd + 2) / 2,
        maxZ: bz + (bd + 2) / 2,
      });
    }
  }

  // 6. Two Stunt Ramps in Open World Plaza / Avenues
  const rampMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.5,
    metalness: 0.2,
  });
  const addRamp = (x: number, z: number, width: number, length: number, height: number, rotY: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(length, 0);
    shape.lineTo(length, height);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geo.translate(-length / 2, 0, -width / 2);
    geo.rotateY(rotY - Math.PI / 2);
    const mesh = new THREE.Mesh(geo, rampMat);
    mesh.position.set(x, 0.04, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    worldGroup.add(mesh);

    ramps.push({
      x,
      z,
      width,
      length,
      height,
      dirX: Math.sin(rotY),
      dirZ: Math.cos(rotY),
    });
  };

  addRamp(0, -32, 7.5, 11, 2.2, Math.PI); // Facing North along central avenue
  addRamp(38, 0, 7.5, 11, 2.2, Math.PI / 2); // Facing East along main avenue

  // 7. Instanced Trees & Distant Hills Perimeter (Natural Outdoor Horizon)
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.2, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
  const canopyGeo = new THREE.ConeGeometry(2.6, 5.8, 7);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2e6f40, roughness: 0.8 });

  const treeCoords: Array<[number, number, number]> = [];
  for (let i = 0; i < 140; i++) {
    const angle = (i / 140) * Math.PI * 2 + (rand() - 0.5) * 0.03;
    const distScale = 1.14 + rand() * 0.42;
    const tx = Math.sin(angle) * HIGHWAY_RX * distScale;
    const tz = Math.cos(angle) * HIGHWAY_RZ * distScale;
    const s = 0.85 + rand() * 0.45;
    treeCoords.push([tx, tz, s]);
  }

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCoords.length);
  const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCoords.length);
  const tintColor = new THREE.Color();

  treeCoords.forEach(([tx, tz, s], idx) => {
    dummy.position.set(tx, 1.6 * s, tz);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tx, 5.2 * s, tz);
    dummy.updateMatrix();
    canopyInst.setMatrixAt(idx, dummy.matrix);

    tintColor.setHSL(0.32 + (rand() - 0.5) * 0.05, 0.45, 0.28 + rand() * 0.12);
    canopyInst.setColorAt(idx, tintColor);
  });
  trunkInst.computeBoundingSphere();
  canopyInst.computeBoundingSphere();
  worldGroup.add(trunkInst, canopyInst);

  // Distant Mountain Ridge Ring (Natural Perimeter)
  const hillGeo = new THREE.ConeGeometry(42, 48, 6);
  const hillMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.95,
    flatShading: true,
  });
  const hillCount = 36;
  const hillInst = new THREE.InstancedMesh(hillGeo, hillMat, hillCount);
  for (let i = 0; i < hillCount; i++) {
    const a = (i / hillCount) * Math.PI * 2;
    const r = 320 + rand() * 90;
    const hx = Math.sin(a) * r;
    const hz = Math.cos(a) * r;
    const sx = 1.2 + rand() * 1.4;
    const sy = 0.7 + rand() * 1.3;
    dummy.position.set(hx, 20 * sy, hz);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(sx, sy, sx);
    dummy.updateMatrix();
    hillInst.setMatrixAt(i, dummy.matrix);
  }
  hillInst.computeBoundingSphere();
  worldGroup.add(hillInst);

  // 8. Highway Streetlights (Instanced)
  const lampCount = 40;
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.2, 7.5, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.35 });
  const bulbGeo = new THREE.BoxGeometry(1.4, 0.25, 0.6);
  const lampBulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.2,
  });
  const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, lampCount);
  const bulbInst = new THREE.InstancedMesh(bulbGeo, lampBulbMaterial, lampCount);

  for (let i = 0; i < lampCount; i++) {
    const t = (i / lampCount) * Math.PI * 2;
    const x = Math.sin(t) * (HIGHWAY_RX - HIGHWAY_WIDTH * 0.5 - 1.6);
    const z = Math.cos(t) * (HIGHWAY_RZ - HIGHWAY_WIDTH * 0.5 - 1.6);
    const yaw = Math.atan2(x, z);

    dummy.position.set(x, 3.75, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x + Math.sin(yaw) * 0.7, 7.45, z + Math.cos(yaw) * 0.7);
    dummy.updateMatrix();
    bulbInst.setMatrixAt(i, dummy.matrix);
  }
  poleInst.computeBoundingSphere();
  bulbInst.computeBoundingSphere();
  worldGroup.add(poleInst, bulbInst);

  // 9. Racing Mode Checkpoints + FinishLine (8 sequential gates around the Highway Loop)
  const totalGates = 8;
  for (let i = 1; i <= totalGates; i++) {
    const t = (i / totalGates) * Math.PI * 2;
    const cx = Math.sin(t) * HIGHWAY_RX;
    const cz = Math.cos(t) * HIGHWAY_RZ;
    // Tangent along increasing t
    const tx = Math.cos(t) * HIGHWAY_RX;
    const tz = -Math.sin(t) * HIGHWAY_RZ;
    const rotY = Math.atan2(tx, tz);
    const isFinish = i === totalGates;

    const def: CheckpointDef = {
      id: i,
      x: cx,
      z: cz,
      rotationY: rotY,
      width: 19,
      isFinish,
      label: isFinish ? 'FinishLine' : `Checkpoint ${i}`,
    };

    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = rotY;

    const pillarMat = new THREE.MeshStandardMaterial({
      color: isFinish ? 0xe11d48 : 0x06b6d4,
      emissive: isFinish ? 0xe11d48 : 0x06b6d4,
      emissiveIntensity: 0.65,
      roughness: 0.3,
      metalness: 0.4,
    });

    const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8.2, 0.9), pillarMat);
    leftPillar.position.set(9.2, 4.1, 0);
    const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8.2, 0.9), pillarMat);
    rightPillar.position.set(-9.2, 4.1, 0);
    g.add(leftPillar, rightPillar);

    const bannerMat = new THREE.MeshStandardMaterial({
      map: isFinish ? textures.checkerBanner : textures.checkpointBanner,
      emissive: 0xffffff,
      emissiveMap: isFinish ? textures.checkerBanner : textures.checkpointBanner,
      emissiveIntensity: 0.35,
      roughness: 0.4,
    });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(19.3, 2.2, 0.7), bannerMat);
    banner.position.set(0, 7.6, 0);
    g.add(banner);

    // Tall translucent target beacon visible across the circuit when active
    const beaconMat = new THREE.MeshBasicMaterial({
      color: isFinish ? 0xf43f5e : 0x22d3ee,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beaconMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 42, 16, 1, true), beaconMat);
    beaconMesh.position.y = 21;
    g.add(beaconMesh);

    g.visible = false;
    worldGroup.add(g);

    checkpoints.push({
      def,
      group: g,
      beaconMesh,
      pillarMat,
      beaconMat,
    });
  }

  const sampleHighwayPoint = (
    t: number,
    laneOffset: number,
    outPos: THREE.Vector3,
    outTangent: THREE.Vector3
  ) => {
    const x = Math.sin(t) * HIGHWAY_RX;
    const z = Math.cos(t) * HIGHWAY_RZ;
    const dx = Math.cos(t) * HIGHWAY_RX;
    const dz = -Math.sin(t) * HIGHWAY_RZ;
    const tLen = Math.hypot(dx, dz) || 1;
    outTangent.set(dx / tLen, 0, dz / tLen);

    // Outward normal
    const nx = Math.sin(t) / HIGHWAY_RX;
    const nz = Math.cos(t) / HIGHWAY_RZ;
    const nLen = Math.hypot(nx, nz) || 1;
    outPos.set(x + (nx / nLen) * laneOffset, 0, z + (nz / nLen) * laneOffset);
  };

  const getGroundHeightAt = (x: number, z: number): number => {
    for (const r of ramps) {
      const dx = x - r.x;
      const dz = z - r.z;
      const along = dx * r.dirX + dz * r.dirZ;
      const side = -dx * r.dirZ + dz * r.dirX;
      if (Math.abs(side) <= r.width * 0.5 && Math.abs(along) <= r.length * 0.5) {
        const progress = (along + r.length * 0.5) / r.length; // 0 to 1
        return progress * r.height;
      }
    }
    return 0;
  };

  const applyTimeOfDay = (
    tod: TimeOfDay,
    scene: THREE.Scene,
    sunLight: THREE.DirectionalLight,
    hemiLight: THREE.HemisphereLight,
    tex: WorldTextures
  ) => {
    if (tod === 'day') {
      const skyColor = new THREE.Color(0x93c5fd);
      scene.background = skyColor;
      scene.fog = new THREE.FogExp2(0x93c5fd, 0.0024);
      skyDomeMaterial.color.copy(skyColor);
      sunLight.color.setHex(0xfffbeb);
      sunLight.intensity = 2.2;
      sunLight.position.set(110, 160, 80);
      hemiLight.color.setHex(0xbae6fd);
      hemiLight.groundColor.setHex(0x3f4d3b);
      hemiLight.intensity = 0.85;
      buildingMaterial.map = tex.buildingDay;
      buildingMaterial.emissive.setHex(0x000000);
      buildingMaterial.emissiveIntensity = 0;
      lampBulbMaterial.emissiveIntensity = 0.15;
    } else if (tod === 'sunset') {
      const skyColor = new THREE.Color(0xfb923c);
      scene.background = skyColor;
      scene.fog = new THREE.FogExp2(0xf97316, 0.0028);
      skyDomeMaterial.color.setHex(0xfb923c);
      sunLight.color.setHex(0xffedd5);
      sunLight.intensity = 1.9;
      sunLight.position.set(-160, 48, -110);
      hemiLight.color.setHex(0xfdba74);
      hemiLight.groundColor.setHex(0x27272a);
      hemiLight.intensity = 0.7;
      buildingMaterial.map = tex.buildingNight;
      buildingMaterial.emissive.setHex(0xfde68a);
      buildingMaterial.emissiveMap = tex.buildingNight;
      buildingMaterial.emissiveIntensity = 0.35;
      lampBulbMaterial.emissiveIntensity = 1.4;
    } else {
      const skyColor = new THREE.Color(0x090f1d);
      scene.background = skyColor;
      scene.fog = new THREE.FogExp2(0x090f1d, 0.0034);
      skyDomeMaterial.color.copy(skyColor);
      sunLight.color.setHex(0x93c5fd);
      sunLight.intensity = 0.65;
      sunLight.position.set(80, 120, -90);
      hemiLight.color.setHex(0x1e293b);
      hemiLight.groundColor.setHex(0x090d16);
      hemiLight.intensity = 0.55;
      buildingMaterial.map = tex.buildingNight;
      buildingMaterial.emissive.setHex(0xfef08a);
      buildingMaterial.emissiveMap = tex.buildingNight;
      buildingMaterial.emissiveIntensity = 0.85;
      lampBulbMaterial.emissiveIntensity = 2.6;
    }
    buildingMaterial.needsUpdate = true;
  };

  return {
    worldGroup,
    colliders,
    ramps,
    checkpoints,
    buildingMaterial,
    lampBulbMaterial,
    skyDomeMaterial,
    highwayCurvePoints,
    sampleHighwayPoint,
    getGroundHeightAt,
    applyTimeOfDay,
    dispose: () => {
      worldGroup.traverse((obj) => {
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
