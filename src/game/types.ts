export type GameMode = 'open-world' | 'racing';
export type CameraMode = 'chase' | 'far' | 'hood';
export type TimeOfDay = 'day' | 'sunset' | 'night';
export type RaceState = 'idle' | 'countdown' | 'racing' | 'finished';

export type HoldAction =
  | 'SteerLeft'
  | 'SteerRight'
  | 'Accelerate'
  | 'Reverse'
  | 'Brake'
  | 'Nitro';

export interface CarSpec {
  id: string;
  name: string;
  classLabel: string;
  acceleration: number;
  reverseAcceleration: number;
  maxSpeed: number; // m/s (1 m/s = 3.6 km/h)
  steeringPower: number; // deg/s
  brakeStrength: number;
  grip: number;
  defaultColor: string;
  accentColor: string;
  bodyStyle: 'coupe' | 'supercar' | 'tuner';
}

export const CAR_MODELS: CarSpec[] = [
  {
    id: 'apex-gt',
    name: 'Apex GT',
    classLabel: 'Sport Coupe',
    acceleration: 24,
    reverseAcceleration: 11,
    maxSpeed: 38, // ~137 km/h (plus nitro)
    steeringPower: 105,
    brakeStrength: 5.2,
    grip: 5.5,
    defaultColor: '#e11d48',
    accentColor: '#f8fafc',
    bodyStyle: 'coupe',
  },
  {
    id: 'valkyrie-rs',
    name: 'Valkyrie RS',
    classLabel: 'Track Supercar',
    acceleration: 30,
    reverseAcceleration: 12,
    maxSpeed: 47, // ~169 km/h (plus nitro)
    steeringPower: 112,
    brakeStrength: 6.4,
    grip: 6.8,
    defaultColor: '#f59e0b',
    accentColor: '#0f172a',
    bodyStyle: 'supercar',
  },
  {
    id: 'titan-drift',
    name: 'Titan Drift',
    classLabel: 'Street Tuner',
    acceleration: 26,
    reverseAcceleration: 12,
    maxSpeed: 41, // ~148 km/h
    steeringPower: 125,
    brakeStrength: 5.5,
    grip: 3.4, // Lower grip for lively drifting
    defaultColor: '#06b6d4',
    accentColor: '#0f172a',
    bodyStyle: 'tuner',
  },
];

export const PAINT_SWATCHES = [
  { name: 'Crimson Rosso', hex: '#e11d48' },
  { name: 'Solar Amber', hex: '#f59e0b' },
  { name: 'Electric Cyan', hex: '#06b6d4' },
  { name: 'Emerald Track', hex: '#10b981' },
  { name: 'Obsidian Matte', hex: '#1e293b' },
  { name: 'Pearl White', hex: '#f1f5f9' },
];

export interface CheckpointDef {
  id: number;
  x: number;
  z: number;
  rotationY: number;
  width: number;
  isFinish: boolean;
  label: string;
}

export interface HudTelemetry {
  speedKmh: number;
  gear: string;
  rpm: number; // 0..1
  nitro: number; // 0..100
  isNitroActive: boolean;
  isDrifting: boolean;
  isBraking: boolean;
  mode: GameMode;
  raceState: RaceState;
  countdownText: string;
  raceTimeMs: number;
  bestTimeMs: number | null;
  currentCheckpoint: number;
  totalCheckpoints: number;
  statusMessage: string;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  activeCheckpoint: { x: number; z: number; isFinish: boolean } | null;
  trafficPositions: Array<{ x: number; z: number }>;
}
