import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AudioEngine } from './audioEngine';
import { createPlayerCar, createTrafficCar, PlayerCarRig } from './carModel';
import { createWorldTextures, WorldTextures } from './textures';
import {
  CameraMode,
  CAR_MODELS,
  CarSpec,
  GameMode,
  HoldAction,
  HudTelemetry,
  RaceState,
  TimeOfDay,
} from './types';
import { buildWorld, WorldBuildResult } from './worldBuilder';

// Pre-allocated math helpers for zero GC inside render loop
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();

interface TrafficUnit {
  mesh: THREE.Group;
  t: number;
  laneOffset: number;
  speed: number; // rad/s parametric speed
  x: number;
  z: number;
}

const BEST_TIME_STORAGE_KEY = 'realdrive_best_lap_ms';

export class RealDriveEngine {
  private container: HTMLElement;
  private onTelemetry: (t: HudTelemetry) => void;
  private onContextLostChange?: (lost: boolean) => void;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private isSoftwareGl: boolean;

  private textures: WorldTextures;
  private world: WorldBuildResult;
  private audio = new AudioEngine();

  private currentCarSpec: CarSpec = CAR_MODELS[0];
  private currentPaintHex: string = CAR_MODELS[0].defaultColor;
  private carRig: PlayerCarRig;

  // Vehicle physics state
  private pos = new THREE.Vector3(0, 0, 135);
  private vel = new THREE.Vector3(0, 0, 0);
  private yaw = Math.PI / 2; // Facing +X along South Straight
  private velY = 0;
  private isGrounded = true;
  private wheelSpinAngle = 0;
  private visualSteerAngle = 0;
  private chassisPitch = 0;
  private chassisRoll = 0;
  private nitro = 100;

  // Input state (merged keyboard + HoldButton pointers)
  private keyMap = new Set<string>();
  private holdCounts: Record<HoldAction, number> = {
    SteerLeft: 0,
    SteerRight: 0,
    Accelerate: 0,
    Reverse: 0,
    Brake: 0,
    Nitro: 0,
  };

  // Game modes & settings
  private mode: GameMode = 'open-world';
  private cameraMode: CameraMode = 'chase';
  private timeOfDay: TimeOfDay = 'day';
  private raceState: RaceState = 'idle';
  private countdownTimer = 0;
  private lastCountdownBeep = 4;
  private raceTimeMs = 0;
  private bestTimeMs: number | null = null;
  private currentCheckpointIndex = 0; // 0..7
  private statusMessage = 'Free Drive Mode — Explore City & Highway';
  private statusTimer = 0;

  // Traffic AI
  private traffic: TrafficUnit[] = [];

  // Loop management
  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private lastHudEmit = 0;

  constructor(
    container: HTMLElement,
    onTelemetry: (t: HudTelemetry) => void,
    onContextLostChange?: (lost: boolean) => void
  ) {
    this.container = container;
    this.onTelemetry = onTelemetry;
    this.onContextLostChange = onContextLostChange;

    try {
      const saved = localStorage.getItem(BEST_TIME_STORAGE_KEY);
      if (saved) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed) && parsed > 0) this.bestTimeMs = parsed;
      }
    } catch {
      // ignore storage failure
    }

    // 1. Software WebGL probe
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // WebGL context safety listeners
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    // 3. Scene & Camera
    this.scene = new THREE.Scene();
    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.2, 950);

    // 4. Studio Environment Map (RoomEnvironment)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 5. Three-Point / Outdoor Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x3f4d3b, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    this.sunLight.position.set(110, 160, 80);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    const d = 110;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 420;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 6. Procedural Textures & World
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createWorldTextures(maxAniso);
    this.world = buildWorld(this.textures, this.isSoftwareGl);
    this.scene.add(this.world.worldGroup);
    this.world.applyTimeOfDay(this.timeOfDay, this.scene, this.sunLight, this.hemiLight, this.textures);

    // 7. Player Car
    this.carRig = createPlayerCar(
      this.currentCarSpec,
      this.currentPaintHex,
      this.textures.contactShadow,
      this.isSoftwareGl
    );
    this.scene.add(this.carRig.root);
    this.syncCarTransform();

    // Place camera immediately behind car (no snap on frame 1)
    this.camera.position.set(this.pos.x - 7.5, 3.4, this.pos.z);
    this.camera.lookAt(this.pos.x + 8, 1.3, this.pos.z);

    // 8. Traffic AI Vehicles on the outer highway
    const trafficColors = [0x64748b, 0x3b82f6, 0x10b981, 0xf8fafc, 0xf97316, 0x8b5cf6];
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * Math.PI * 2 + 0.25;
      const lane = i % 2 === 0 ? 4.4 : -4.4;
      const speedDir = i % 2 === 0 ? 1 : -1;
      const mesh = createTrafficCar(trafficColors[i % trafficColors.length], this.textures.contactShadow);
      this.scene.add(mesh);
      this.traffic.push({
        mesh,
        t,
        laneOffset: lane,
        speed: speedDir * (0.095 + (i % 3) * 0.015),
        x: 0,
        z: 0,
      });
    }
    this.updateTraffic(0);

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Event listeners
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    // Start loop
    this.lastTime = performance.now();
    this.tick();
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.onContextLostChange?.(true);
  };

  private handleContextRestored = () => {
    this.onContextLostChange?.(false);
  };

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    this.audio.unlock();
    const code = e.code;
    this.keyMap.add(code);

    if (code === 'KeyC') {
      this.cycleCameraMode();
    } else if (code === 'KeyR') {
      this.resetCar();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keyMap.delete(e.code);
  };

  // Called by React HoldButton components (faithful to HoldButton.cs)
  public setHoldAction(action: HoldAction, pressed: boolean) {
    if (pressed) this.audio.unlock();
    if (pressed) {
      this.holdCounts[action] += 1;
    } else {
      this.holdCounts[action] = Math.max(0, this.holdCounts[action] - 1);
    }
  }

  public clearAllHoldActions() {
    (Object.keys(this.holdCounts) as HoldAction[]).forEach((k) => {
      this.holdCounts[k] = 0;
    });
  }

  public setMuted(muted: boolean) {
    this.audio.setMuted(muted);
  }

  public setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
  }

  public cycleCameraMode(): CameraMode {
    const order: CameraMode[] = ['chase', 'far', 'hood'];
    const idx = order.indexOf(this.cameraMode);
    this.cameraMode = order[(idx + 1) % order.length];
    return this.cameraMode;
  }

  public setTimeOfDay(tod: TimeOfDay) {
    this.timeOfDay = tod;
    this.world.applyTimeOfDay(tod, this.scene, this.sunLight, this.hemiLight, this.textures);
    const hlOn = tod === 'night' || tod === 'sunset';
    this.carRig.headlightLeft.intensity = hlOn ? 18 : 0;
    this.carRig.headlightRight.intensity = hlOn ? 18 : 0;
    this.carRig.headlightMaterial.emissiveIntensity = hlOn ? 3.2 : 1.0;
  }

  public setCarModel(carId: string, paintHex?: string) {
    const found = CAR_MODELS.find((c) => c.id === carId) ?? CAR_MODELS[0];
    this.currentCarSpec = found;
    this.currentPaintHex = paintHex ?? found.defaultColor;

    this.scene.remove(this.carRig.root);
    this.carRig.dispose();

    this.carRig = createPlayerCar(
      this.currentCarSpec,
      this.currentPaintHex,
      this.textures.contactShadow,
      this.isSoftwareGl
    );
    this.scene.add(this.carRig.root);
    this.setTimeOfDay(this.timeOfDay);
    this.syncCarTransform();
  }

  public setCarPaint(paintHex: string) {
    this.currentPaintHex = paintHex;
    this.carRig.paintMaterial.color.set(paintHex);
  }

  public setMode(mode: GameMode) {
    this.audio.unlock();
    this.mode = mode;

    if (mode === 'open-world') {
      this.raceState = 'idle';
      this.countdownTimer = 0;
      this.raceTimeMs = 0;
      this.statusMessage = 'Open World — Free Drive';
      this.statusTimer = 2.5;
      this.world.checkpoints.forEach((cp) => {
        cp.group.visible = false;
      });
    } else {
      this.startRace();
    }
  }

  public startRace() {
    this.audio.unlock();
    this.mode = 'racing';
    this.raceState = 'countdown';
    this.countdownTimer = 3.2;
    this.lastCountdownBeep = 4;
    this.raceTimeMs = 0;
    this.currentCheckpointIndex = 0;
    this.nitro = 100;

    // Position car right before South Straight heading East toward Checkpoint 1
    this.pos.set(-14, 0, 135);
    this.vel.set(0, 0, 0);
    this.velY = 0;
    this.yaw = Math.PI / 2;
    this.syncCarTransform();

    this.statusMessage = 'Get Ready!';
    this.statusTimer = 1.5;

    // Show first checkpoint + subtle upcoming gate
    this.updateCheckpointVisibility();
  }

  public resetCar() {
    this.vel.set(0, 0, 0);
    this.velY = 0;
    if (this.mode === 'racing') {
      this.startRace();
    } else {
      this.pos.set(0, 0, 135);
      this.yaw = Math.PI / 2;
      this.statusMessage = 'Vehicle Reset';
      this.statusTimer = 1.8;
      this.syncCarTransform();
    }
  }

  private updateCheckpointVisibility() {
    this.world.checkpoints.forEach((cp, idx) => {
      if (this.mode !== 'racing') {
        cp.group.visible = false;
        return;
      }
      if (idx === this.currentCheckpointIndex) {
        cp.group.visible = true;
        cp.beaconMesh.visible = true;
        cp.pillarMat.emissiveIntensity = 1.4;
      } else if (idx === this.currentCheckpointIndex + 1) {
        cp.group.visible = true;
        cp.beaconMesh.visible = false;
        cp.pillarMat.emissiveIntensity = 0.25;
      } else {
        cp.group.visible = false;
      }
    });
  }

  private getInputs() {
    const left =
      this.holdCounts.SteerLeft > 0 ||
      this.keyMap.has('KeyA') ||
      this.keyMap.has('ArrowLeft');
    const right =
      this.holdCounts.SteerRight > 0 ||
      this.keyMap.has('KeyD') ||
      this.keyMap.has('ArrowRight');
    const gas =
      this.holdCounts.Accelerate > 0 ||
      this.keyMap.has('KeyW') ||
      this.keyMap.has('ArrowUp');
    const rev =
      this.holdCounts.Reverse > 0 ||
      this.keyMap.has('KeyS') ||
      this.keyMap.has('ArrowDown');
    const brake =
      this.holdCounts.Brake > 0 || this.keyMap.has('Space');
    const nitroPressed =
      this.holdCounts.Nitro > 0 ||
      this.keyMap.has('ShiftLeft') ||
      this.keyMap.has('ShiftRight');

    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    const throttle = (gas ? 1 : 0) - (rev ? 1 : 0);
    return { steer, throttle, brake, nitroPressed };
  }

  private stepPhysics(dt: number) {
    const { steer, throttle, brake, nitroPressed } = this.getInputs();

    // During race countdown, lock car launch until GO!
    const lockedByCountdown = this.mode === 'racing' && this.raceState === 'countdown';

    const effectiveSteer = lockedByCountdown ? 0 : steer;
    const effectiveThrottle = lockedByCountdown ? 0 : throttle;
    const effectiveBrake = lockedByCountdown ? true : brake;

    const canNitro =
      !lockedByCountdown && nitroPressed && effectiveThrottle > 0 && this.nitro > 1;
    if (canNitro) {
      this.nitro = Math.max(0, this.nitro - 28 * dt);
    } else {
      this.nitro = Math.min(100, this.nitro + 9 * dt);
    }

    // Forward and Right vectors in XZ plane
    _forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const forwardSpeed = this.vel.dot(_forward);
    const lateralSpeed = this.vel.dot(_right);
    const speedMag = Math.hypot(this.vel.x, this.vel.z);

    // Acceleration / Reverse (matches CarController.cs)
    const spec = this.currentCarSpec;
    const maxSpd = spec.maxSpeed * (canNitro ? 1.32 : 1.0);
    const accelForce = spec.acceleration * (canNitro ? 1.65 : 1.0);

    if (effectiveThrottle > 0 && speedMag < maxSpd) {
      this.vel.addScaledVector(_forward, effectiveThrottle * accelForce * dt);
    } else if (effectiveThrottle < 0) {
      // Reverse or slow down
      if (forwardSpeed > 1.5) {
        this.vel.addScaledVector(_forward, effectiveThrottle * spec.brakeStrength * 5.2 * dt);
      } else if (speedMag < 18) {
        this.vel.addScaledVector(_forward, effectiveThrottle * spec.reverseAcceleration * dt);
      }
    }

    // Braking
    if (effectiveBrake) {
      const factor = Math.max(0, 1 - spec.brakeStrength * dt);
      this.vel.multiplyScalar(factor);
    }

    // Rolling drag when coasting
    if (effectiveThrottle === 0 && !effectiveBrake) {
      const drag = Math.max(0, 1 - 0.55 * dt);
      this.vel.multiplyScalar(drag);
    }

    // Lateral grip / drift damping (matches CarController.cs localVelocity.x lerp)
    const newForward = this.vel.dot(_forward);
    const newLateral = this.vel.dot(_right);
    const dampedLateral = THREE.MathUtils.lerp(
      newLateral,
      0,
      Math.min(1, spec.grip * dt)
    );
    this.vel
      .copy(_forward)
      .multiplyScalar(newForward)
      .addScaledVector(_right, dampedLateral);

    // Steering rotation (SteerLeft = -1 increases yaw toward +X left, SteerRight = +1 decreases yaw)
    const speedFactor = THREE.MathUtils.clamp(speedMag / 3.0, 0, 1);
    const direction = forwardSpeed >= -0.5 ? 1 : -1;
    const turnRad = THREE.MathUtils.degToRad(
      effectiveSteer * spec.steeringPower * speedFactor * direction * dt
    );
    this.yaw -= turnRad;

    // Move horizontally
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // Ground & Ramp elevation physics
    const groundY = this.world.getGroundHeightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= groundY + 0.05 && this.velY <= 0) {
      // Climbing ramp imparts upward velocity proportional to forward speed
      const prevGround = this.world.getGroundHeightAt(
        this.pos.x - this.vel.x * dt,
        this.pos.z - this.vel.z * dt
      );
      const slopeVy = (groundY - prevGround) / Math.max(dt, 0.001);
      this.pos.y = groundY;
      this.velY = Math.max(0, slopeVy * 0.92);
      this.isGrounded = true;
    } else {
      this.velY -= 24 * dt; // Gravity
      this.pos.y += this.velY * dt;
      if (this.pos.y <= groundY) {
        this.pos.y = groundY;
        this.velY = 0;
        this.isGrounded = true;
      } else {
        this.isGrounded = false;
      }
    }

    // Collisions against buildings (AABB push-out)
    const carRadius = 1.65;
    for (const box of this.world.colliders) {
      const closestX = THREE.MathUtils.clamp(this.pos.x, box.minX, box.maxX);
      const closestZ = THREE.MathUtils.clamp(this.pos.z, box.minZ, box.maxZ);
      const dx = this.pos.x - closestX;
      const dz = this.pos.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < carRadius * carRadius) {
        const dist = Math.sqrt(distSq) || 0.001;
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = carRadius - dist;
        this.pos.x += nx * overlap;
        this.pos.z += nz * overlap;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          this.vel.x -= 1.35 * vn * nx;
          this.vel.z -= 1.35 * vn * nz;
          this.vel.multiplyScalar(0.75);
          if (Math.abs(vn) > 6) this.audio.playCrash(Math.min(1, Math.abs(vn) / 25));
        }
      }
    }

    // Outer elliptical highway barrier clamp (rx = 175.5, rz = 145.5)
    const boundRx = 174.5;
    const boundRz = 144.5;
    const ellipNorm = Math.hypot(this.pos.x / boundRx, this.pos.z / boundRz);
    if (ellipNorm > 1) {
      const scaleBack = 1 / ellipNorm;
      const nx = (this.pos.x / (boundRx * boundRx));
      const nz = (this.pos.z / (boundRz * boundRz));
      const nLen = Math.hypot(nx, nz) || 1;
      const ux = -nx / nLen;
      const uz = -nz / nLen;

      this.pos.x *= scaleBack;
      this.pos.z *= scaleBack;

      const vn = this.vel.x * ux + this.vel.z * uz;
      if (vn < 0) {
        this.vel.x -= 1.2 * vn * ux;
        this.vel.z -= 1.2 * vn * uz;
        this.vel.multiplyScalar(0.84);
        if (Math.abs(vn) > 6) this.audio.playCrash(Math.min(1, Math.abs(vn) / 25));
      }
    }

    // Traffic car collision
    for (const tc of this.traffic) {
      const dx = this.pos.x - tc.x;
      const dz = this.pos.z - tc.z;
      const distSq = dx * dx + dz * dz;
      const minSep = 2.6;
      if (distSq < minSep * minSep) {
        const dist = Math.sqrt(distSq) || 0.01;
        const nx = dx / dist;
        const nz = dz / dist;
        this.pos.x += nx * (minSep - dist);
        this.pos.z += nz * (minSep - dist);
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          this.vel.x -= 1.4 * vn * nx;
          this.vel.z -= 1.4 * vn * nz;
          this.vel.multiplyScalar(0.7);
          if (Math.abs(vn) > 5) this.audio.playCrash(0.75);
        }
      }
    }

    // Visual animations: Wheel spin, steering angle, body pitch/roll, taillights, nitro flames
    const spinDelta = (forwardSpeed / 0.36) * dt;
    this.wheelSpinAngle += spinDelta;
    for (const w of this.carRig.wheelSpinMeshes) {
      w.rotation.x = this.wheelSpinAngle;
    }

    const targetWheelSteer = -effectiveSteer * 0.42;
    this.visualSteerAngle = THREE.MathUtils.damp(this.visualSteerAngle, targetWheelSteer, 14, dt);
    for (const p of this.carRig.frontWheelSteerPivots) {
      p.rotation.y = this.visualSteerAngle;
    }

    // Subtle suspension pitch & roll
    const targetPitch = (effectiveBrake && speedMag > 3 ? 0.035 : -effectiveThrottle * 0.022) * (canNitro ? 1.5 : 1);
    const targetRoll = THREE.MathUtils.clamp(-lateralSpeed * 0.012, -0.07, 0.07);
    this.chassisPitch = THREE.MathUtils.damp(this.chassisPitch, targetPitch, 9, dt);
    this.chassisRoll = THREE.MathUtils.damp(this.chassisRoll, targetRoll, 10, dt);
    this.carRig.bodyTiltGroup.rotation.x = this.chassisPitch;
    this.carRig.bodyTiltGroup.rotation.z = this.chassisRoll;

    // Brake light intensity
    const brakingLight = effectiveBrake || effectiveThrottle < 0;
    this.carRig.brakeLightMaterial.emissiveIntensity = brakingLight ? 2.6 : 0.65;

    // Nitro flames
    for (const fl of this.carRig.nitroFlames) {
      fl.visible = canNitro;
      if (canNitro) {
        const flicker = 0.85 + Math.random() * 0.45;
        fl.scale.set(1, flicker, 1);
      }
    }

    this.syncCarTransform();

    // Update shadow camera to track player car so shadows stay razor-sharp across the whole city
    if (!this.isSoftwareGl) {
      this.sunLight.target.position.set(this.pos.x, 0, this.pos.z);
      this.sunLight.position.set(this.pos.x + 90, 140, this.pos.z + 70);
    }

    // Audio synthesizer update
    const rpmNorm = THREE.MathUtils.clamp((speedMag / maxSpd) * 0.85 + (effectiveThrottle > 0 ? 0.15 : 0), 0.06, 1);
    const isDrifting = Math.abs(lateralSpeed) > 4.2 || (effectiveBrake && speedMag > 10);
    this.audio.update(rpmNorm, effectiveThrottle !== 0, isDrifting && this.isGrounded, canNitro);

    // Race / Checkpoint state machine
    this.updateRaceLogic(dt);
  }

  private syncCarTransform() {
    this.carRig.root.position.copy(this.pos);
    this.carRig.root.rotation.set(0, this.yaw, 0);
  }

  private updateTraffic(dt: number) {
    for (const tc of this.traffic) {
      tc.t = (tc.t + tc.speed * dt + Math.PI * 2) % (Math.PI * 2);
      this.world.sampleHighwayPoint(tc.t, tc.laneOffset, _vec3A, _vec3B);
      if (tc.speed < 0) _vec3B.negate();
      tc.mesh.position.copy(_vec3A);
      tc.mesh.rotation.y = Math.atan2(_vec3B.x, _vec3B.z);
      tc.x = _vec3A.x;
      tc.z = _vec3A.z;
    }
  }

  private updateRaceLogic(dt: number) {
    if (this.statusTimer > 0) {
      this.statusTimer = Math.max(0, this.statusTimer - dt);
    }

    if (this.mode !== 'racing') return;

    if (this.raceState === 'countdown') {
      this.countdownTimer -= dt;
      const ceilSec = Math.ceil(this.countdownTimer);
      if (ceilSec < this.lastCountdownBeep && ceilSec >= 1) {
        this.lastCountdownBeep = ceilSec;
        this.audio.playBeep(440, 0.14, 0.1);
      }
      if (this.countdownTimer <= 0) {
        this.raceState = 'racing';
        this.audio.playBeep(880, 0.25, 0.12);
        this.statusMessage = 'GO!';
        this.statusTimer = 1.4;
      }
      return;
    }

    if (this.raceState === 'racing') {
      this.raceTimeMs += dt * 1000;
      const activeGate = this.world.checkpoints[this.currentCheckpointIndex];
      if (!activeGate) return;

      // Rotate beacon gently
      activeGate.beaconMesh.rotation.y += dt * 1.4;

      // Trigger check (distance to checkpoint gate)
      const dx = this.pos.x - activeGate.def.x;
      const dz = this.pos.z - activeGate.def.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 11.5) {
        if (activeGate.def.isFinish) {
          this.raceState = 'finished';
          this.statusMessage = 'Race finished!';
          this.statusTimer = 6.0;
          this.audio.playFinish();
          activeGate.group.visible = false;

          if (this.bestTimeMs === null || this.raceTimeMs < this.bestTimeMs) {
            this.bestTimeMs = Math.round(this.raceTimeMs);
            try {
              localStorage.setItem(BEST_TIME_STORAGE_KEY, String(this.bestTimeMs));
            } catch {
              // ignore
            }
          }
        } else {
          this.currentCheckpointIndex += 1;
          this.statusMessage = 'Checkpoint reached!';
          this.statusTimer = 2.0;
          this.audio.playCheckpoint();
          this.updateCheckpointVisibility();
        }
      }
    }
  }

  private updateCamera(dt: number) {
    _forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const speedMag = Math.hypot(this.vel.x, this.vel.z);

    if (this.cameraMode === 'hood') {
      _camDesired
        .copy(this.pos)
        .addScaledVector(_forward, 0.9)
        .add(_vec3C.set(0, 1.45, 0));
      _camLookAt
        .copy(this.pos)
        .addScaledVector(_forward, 26)
        .add(_vec3C.set(0, 1.15, 0));
      this.camera.position.lerp(_camDesired, 1 - Math.exp(-26 * dt));
      this.camera.lookAt(_camLookAt);
    } else {
      const distBack = this.cameraMode === 'far' ? 11.5 : 7.4;
      const heightUp = this.cameraMode === 'far' ? 4.8 : 3.2;

      _camDesired
        .copy(this.pos)
        .addScaledVector(_forward, -distBack)
        .add(_vec3C.set(0, heightUp, 0));

      const followLambda = 7.5;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camDesired.x, followLambda, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camDesired.y, followLambda, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camDesired.z, followLambda, dt);

      _camLookAt
        .copy(this.pos)
        .addScaledVector(_forward, 4.5)
        .add(_vec3C.set(0, 1.3, 0));
      this.camera.lookAt(_camLookAt);
    }

    // Subtle speed FOV punch
    const targetFov = 62 + THREE.MathUtils.clamp((speedMag / 55) * 16, 0, 16);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private emitTelemetry(now: number) {
    if (now - this.lastHudEmit < 50) return; // ~20Hz crisp React HUD refresh
    this.lastHudEmit = now;

    const { throttle, brake, nitroPressed } = this.getInputs();
    _forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const forwardSpeed = this.vel.dot(_forward);
    const lateralSpeed = this.vel.dot(_right);
    const speedMag = Math.hypot(this.vel.x, this.vel.z);
    const speedKmh = Math.round(speedMag * 3.6);

    let gear = 'N';
    if (forwardSpeed < -0.6) gear = 'R';
    else if (speedKmh > 135) gear = '6';
    else if (speedKmh > 105) gear = '5';
    else if (speedKmh > 75) gear = '4';
    else if (speedKmh > 48) gear = '3';
    else if (speedKmh > 22) gear = '2';
    else if (speedKmh > 2 || throttle > 0) gear = '1';

    const maxKmh = this.currentCarSpec.maxSpeed * 3.6;
    const rpm = THREE.MathUtils.clamp(speedKmh / maxKmh, 0.08, 1);

    const activeCp =
      this.mode === 'racing' && this.raceState !== 'finished'
        ? this.world.checkpoints[this.currentCheckpointIndex]?.def ?? null
        : null;

    let countdownText = '';
    if (this.mode === 'racing' && this.raceState === 'countdown') {
      const c = Math.ceil(this.countdownTimer);
      countdownText = c > 0 ? String(c) : 'GO!';
    }

    this.onTelemetry({
      speedKmh,
      gear,
      rpm,
      nitro: Math.round(this.nitro),
      isNitroActive: nitroPressed && throttle > 0 && this.nitro > 1,
      isDrifting: Math.abs(lateralSpeed) > 4.2 && speedMag > 8,
      isBraking: brake || throttle < 0,
      mode: this.mode,
      raceState: this.raceState,
      countdownText,
      raceTimeMs: Math.round(this.raceTimeMs),
      bestTimeMs: this.bestTimeMs,
      currentCheckpoint: this.currentCheckpointIndex,
      totalCheckpoints: this.world.checkpoints.length,
      statusMessage: this.statusTimer > 0 ? this.statusMessage : '',
      playerX: this.pos.x,
      playerZ: this.pos.z,
      playerHeading: this.yaw,
      activeCheckpoint: activeCp
        ? { x: activeCp.x, z: activeCp.z, isFinish: activeCp.isFinish }
        : null,
      trafficPositions: this.traffic.map((t) => ({ x: t.x, z: t.z })),
    });
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(rawDt, 0.06); // Clamp delta to prevent physics tunneling

    this.stepPhysics(dt);
    this.updateTraffic(dt);
    this.updateCamera(dt);
    this.emitTelemetry(now);

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.audio.dispose();
    this.carRig.dispose();
    this.world.dispose();
    Object.values(this.textures).forEach((t) => t.dispose());
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
