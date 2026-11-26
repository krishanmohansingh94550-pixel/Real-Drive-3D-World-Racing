import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Camera,
  Car,
  Flame,
  Gamepad2,
  Moon,
  RotateCcw,
  Square,
  Sun,
  Sunset,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GarageModal } from './components/GarageModal';
import { HoldButton } from './components/HoldButton';
import { Minimap } from './components/Minimap';
import { SpeedometerHud } from './components/SpeedometerHud';
import { RealDriveEngine } from './game/RealDriveEngine';
import {
  CameraMode,
  CAR_MODELS,
  CarSpec,
  GameMode,
  HoldAction,
  HudTelemetry,
  TimeOfDay,
} from './game/types';

function formatRaceTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(
    hundredths
  ).padStart(2, '0')}`;
}

const INITIAL_TELEMETRY: HudTelemetry = {
  speedKmh: 0,
  gear: 'N',
  rpm: 0.08,
  nitro: 100,
  isNitroActive: false,
  isDrifting: false,
  isBraking: false,
  mode: 'open-world',
  raceState: 'idle',
  countdownText: '',
  raceTimeMs: 0,
  bestTimeMs: null,
  currentCheckpoint: 0,
  totalCheckpoints: 8,
  statusMessage: '',
  playerX: 0,
  playerZ: 135,
  playerHeading: Math.PI / 2,
  activeCheckpoint: null,
  trafficPositions: [],
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RealDriveEngine | null>(null);

  const [telemetry, setTelemetry] = useState<HudTelemetry>(INITIAL_TELEMETRY);
  const [contextLost, setContextLost] = useState(false);

  const [mode, setMode] = useState<GameMode>('open-world');
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const [muted, setMuted] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState(true);
  const [garageOpen, setGarageOpen] = useState(false);
  const [selectedCar, setSelectedCar] = useState<CarSpec>(CAR_MODELS[0]);
  const [selectedPaint, setSelectedPaint] = useState<string>(CAR_MODELS[0].defaultColor);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const engine = new RealDriveEngine(
      el,
      (t) => setTelemetry(t),
      (lost) => setContextLost(lost)
    );
    engineRef.current = engine;

    const handleBlur = () => engine.clearAllHoldActions();
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('blur', handleBlur);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleHoldChange = useCallback((action: HoldAction, pressed: boolean) => {
    engineRef.current?.setHoldAction(action, pressed);
  }, []);

  const handleModeSwitch = (nextMode: GameMode) => {
    setMode(nextMode);
    engineRef.current?.setMode(nextMode);
  };

  const handleCycleCamera = () => {
    if (!engineRef.current) return;
    const next = engineRef.current.cycleCameraMode();
    setCameraMode(next);
  };

  const handleCycleTime = () => {
    const order: TimeOfDay[] = ['day', 'sunset', 'night'];
    const next = order[(order.indexOf(timeOfDay) + 1) % order.length];
    setTimeOfDay(next);
    engineRef.current?.setTimeOfDay(next);
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.setMuted(next);
  };

  const handleReset = () => {
    engineRef.current?.resetCar();
  };

  const handleSelectCar = (car: CarSpec) => {
    setSelectedCar(car);
    setSelectedPaint(car.defaultColor);
    engineRef.current?.setCarModel(car.id, car.defaultColor);
  };

  const handleSelectPaint = (hex: string) => {
    setSelectedPaint(hex);
    engineRef.current?.setCarPaint(hex);
  };

  const cameraLabel: Record<CameraMode, string> = {
    chase: 'Chase Cam',
    far: 'Far Cam',
    hood: 'Hood Cam',
  };

  const TimeIcon = timeOfDay === 'day' ? Sun : timeOfDay === 'sunset' ? Sunset : Moon;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#090d14] select-none">
      {/* Dedicated WebGL Mount Container */}
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#090d14] p-6 text-center">
          <div className="max-w-sm rounded-2xl border border-white/15 bg-[#0f1623] p-6">
            <h2 className="font-display text-lg font-bold text-white">Graphics Context Interrupted</h2>
            <p className="mt-2 text-sm text-slate-400">
              Restoring 3D viewport. Reload if the scene does not resume automatically.
            </p>
          </div>
        </div>
      )}

      {/* Top HUD Bar */}
      <header className="pointer-events-none absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2">
        {/* Brand + Mode Switch */}
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/12 bg-[#0b111c]/90 px-3.5 py-2 shadow-lg">
          <span className="font-display text-base font-bold tracking-wider text-white whitespace-nowrap shrink-0">
            REAL DRIVE
          </span>
          <div className="h-4 w-px bg-white/15" aria-hidden="true" />
          <div className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => handleModeSwitch('open-world')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                mode === 'open-world'
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Open World
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('racing')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                mode === 'racing'
                  ? 'bg-rose-500 text-white font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Circuit Race
            </button>
          </div>
        </div>

        {/* Utility Controls */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/12 bg-[#0b111c]/90 p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => setGarageOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
            title="Vehicle Garage"
          >
            <Car className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">{selectedCar.name}</span>
          </button>

          <button
            type="button"
            onClick={handleCycleTime}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
            title="Cycle Time of Day"
          >
            <TimeIcon className="h-3.5 w-3.5 text-cyan-300" />
            <span className="hidden md:inline capitalize">{timeOfDay}</span>
          </button>

          <button
            type="button"
            onClick={handleCycleCamera}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
            title="Switch Camera (C)"
          >
            <Camera className="h-3.5 w-3.5 text-slate-300" />
            <span className="hidden md:inline">{cameraLabel[cameraMode]}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTouchControls((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              showTouchControls
                ? 'bg-white/15 text-white'
                : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
            title="Toggle On-Screen Hold Buttons"
          >
            <Gamepad2 className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Touch UI</span>
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 transition-colors shrink-0"
            title={muted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={handleReset}
            aria-label="Reset vehicle"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 transition-colors shrink-0"
            title="Reset Car (R)"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Top-Left Minimap */}
      <div className="pointer-events-none absolute top-[68px] left-3 z-20 hidden sm:block">
        <Minimap
          playerX={telemetry.playerX}
          playerZ={telemetry.playerZ}
          playerHeading={telemetry.playerHeading}
          activeCheckpoint={telemetry.activeCheckpoint}
          trafficPositions={telemetry.trafficPositions}
        />
      </div>

      {/* Top-Right Compact Speedometer on small mobile viewports */}
      <div className="pointer-events-none absolute top-[68px] right-3 z-20 sm:hidden">
        <div className="rounded-xl border border-white/12 bg-[#0c121e]/90 px-3 py-1.5 text-right">
          <div className="flex items-baseline justify-end gap-1">
            <span className="font-telemetry text-xl font-bold text-white">
              {telemetry.speedKmh}
            </span>
            <span className="text-[10px] text-slate-400">km/h</span>
            <span className="ml-1.5 font-telemetry text-xs font-bold text-amber-400">
              {telemetry.gear}
            </span>
          </div>
        </div>
      </div>

      {/* Racing Telemetry Strip */}
      {mode === 'racing' && (
        <div className="pointer-events-none absolute top-[68px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 rounded-xl border border-white/12 bg-[#0b111c]/90 px-4 py-2 shadow-lg">
          <div className="text-center">
            <div className="text-[10px] text-slate-400">Checkpoint</div>
            <div className="font-telemetry text-sm font-bold text-cyan-300">
              {Math.min(telemetry.currentCheckpoint + 1, telemetry.totalCheckpoints)} /{' '}
              {telemetry.totalCheckpoints}
            </div>
          </div>
          <div className="h-6 w-px bg-white/10" aria-hidden="true" />
          <div className="text-center">
            <div className="text-[10px] text-slate-400">Lap Time</div>
            <div className="font-telemetry text-sm font-bold text-white">
              {formatRaceTime(telemetry.raceTimeMs)}
            </div>
          </div>
          {telemetry.bestTimeMs !== null && (
            <>
              <div className="h-6 w-px bg-white/10" aria-hidden="true" />
              <div className="text-center hidden sm:block">
                <div className="text-[10px] text-slate-400">Best</div>
                <div className="font-telemetry text-sm font-bold text-amber-400">
                  {formatRaceTime(telemetry.bestTimeMs)}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Center Countdown & Checkpoint / Finish Notifications */}
      {telemetry.countdownText && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="font-display text-7xl font-bold tracking-wider text-amber-400 drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">
            {telemetry.countdownText}
          </div>
        </div>
      )}

      {telemetry.statusMessage && !telemetry.countdownText && telemetry.raceState !== 'finished' && (
        <div className="pointer-events-none absolute top-32 left-1/2 -translate-x-1/2 z-20 rounded-xl border border-cyan-400/30 bg-[#0b111c]/90 px-5 py-2 text-center shadow-lg">
          <span className="font-display text-sm font-bold tracking-wide text-cyan-300">
            {telemetry.statusMessage}
          </span>
        </div>
      )}

      {/* Race Finished Summary Card */}
      {mode === 'racing' && telemetry.raceState === 'finished' && (
        <div className="pointer-events-auto absolute top-32 left-1/2 -translate-x-1/2 z-30 w-[min(90vw,340px)] rounded-2xl border border-rose-500/40 bg-[#0c121e]/95 p-5 text-center shadow-2xl">
          <h2 className="font-display text-2xl font-bold text-white">Race Finished</h2>
          <p className="mt-1 text-xs text-slate-400">
            All {telemetry.totalCheckpoints} circuit gates cleared
          </p>
          <div className="mt-4 flex items-center justify-center gap-6 border-y border-white/10 py-3">
            <div>
              <div className="text-[11px] text-slate-400">Final Time</div>
              <div className="font-telemetry text-xl font-bold text-white">
                {formatRaceTime(telemetry.raceTimeMs)}
              </div>
            </div>
            {telemetry.bestTimeMs !== null && (
              <div>
                <div className="text-[11px] text-slate-400">Best Lap</div>
                <div className="font-telemetry text-xl font-bold text-amber-400">
                  {formatRaceTime(telemetry.bestTimeMs)}
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => engineRef.current?.startRace()}
              className="rounded-lg bg-rose-500 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-400 transition-colors"
            >
              Race Again
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('open-world')}
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors"
            >
              Free Drive
            </button>
          </div>
        </div>
      )}

      {/* Bottom Center Speedometer & Keyboard Hint */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-20 hidden sm:flex flex-col items-center gap-2">
        <SpeedometerHud
          speedKmh={telemetry.speedKmh}
          gear={telemetry.gear}
          rpm={telemetry.rpm}
          nitro={telemetry.nitro}
          isNitroActive={telemetry.isNitroActive}
          isDrifting={telemetry.isDrifting}
        />
        <div className="rounded-lg bg-[#0b111c]/80 px-3 py-1 text-[11px] text-slate-400">
          <span className="text-slate-200 font-medium">WASD / Arrows</span> Drive
          <span className="mx-1.5" aria-hidden="true">·</span>
          <span className="text-slate-200 font-medium">Space</span> Brake
          <span className="mx-1.5" aria-hidden="true">·</span>
          <span className="text-slate-200 font-medium">Shift</span> Nitro
          <span className="mx-1.5" aria-hidden="true">·</span>
          <span className="text-slate-200 font-medium">C</span> Camera
        </div>
      </div>

      {/* Mobile / Touch HoldButtons (mirroring HoldButton.cs) */}
      {showTouchControls && (
        <>
          {/* Left Side: SteerLeft & SteerRight */}
          <div className="pointer-events-auto fixed bottom-4 left-3 sm:left-5 z-20 flex items-center gap-2.5">
            <HoldButton
              action="SteerLeft"
              label="Left"
              variant="steer"
              icon={<ArrowLeft className="h-6 w-6" />}
              onHoldChange={handleHoldChange}
              className="h-16 w-16 sm:h-[70px] sm:w-[70px]"
            />
            <HoldButton
              action="SteerRight"
              label="Right"
              variant="steer"
              icon={<ArrowRight className="h-6 w-6" />}
              onHoldChange={handleHoldChange}
              className="h-16 w-16 sm:h-[70px] sm:w-[70px]"
            />
          </div>

          {/* Right Side: Nitro, Brake, Reverse, Gas */}
          <div className="pointer-events-auto fixed bottom-4 right-3 sm:right-5 z-20 flex items-end gap-2">
            <div className="flex flex-col gap-2">
              <HoldButton
                action="Nitro"
                label="Nitro"
                variant="nitro"
                icon={<Flame className="h-4 w-4" />}
                onHoldChange={handleHoldChange}
                className="h-12 w-14 sm:h-13 sm:w-16"
              />
              <HoldButton
                action="Brake"
                label="Brake"
                variant="brake"
                icon={<Square className="h-4 w-4" />}
                onHoldChange={handleHoldChange}
                className="h-14 w-14 sm:h-16 sm:w-16"
              />
            </div>

            <HoldButton
              action="Reverse"
              label="Rev"
              variant="reverse"
              icon={<ArrowDown className="h-5 w-5" />}
              onHoldChange={handleHoldChange}
              className="h-16 w-14 sm:h-[72px] sm:w-16"
            />

            <HoldButton
              action="Accelerate"
              label="Gas"
              variant="gas"
              icon={<ArrowUp className="h-6 w-6" />}
              onHoldChange={handleHoldChange}
              className="h-24 w-16 sm:h-28 sm:w-[74px]"
            />
          </div>
        </>
      )}

      {/* Vehicle Garage Modal */}
      <GarageModal
        isOpen={garageOpen}
        selectedCarId={selectedCar.id}
        selectedPaint={selectedPaint}
        onSelectCar={handleSelectCar}
        onSelectPaint={handleSelectPaint}
        onClose={() => setGarageOpen(false)}
      />
    </div>
  );
}
