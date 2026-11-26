import React from 'react';
import { X, Check } from 'lucide-react';
import { CAR_MODELS, CarSpec, PAINT_SWATCHES } from '../game/types';

interface GarageModalProps {
  isOpen: boolean;
  selectedCarId: string;
  selectedPaint: string;
  onSelectCar: (car: CarSpec) => void;
  onSelectPaint: (hex: string) => void;
  onClose: () => void;
}

export const GarageModal: React.FC<GarageModalProps> = ({
  isOpen,
  selectedCarId,
  selectedPaint,
  onSelectCar,
  onSelectPaint,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Vehicle Garage"
    >
      <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#0f1623] p-6 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h2 className="font-display text-xl font-bold tracking-wide text-white">
              Vehicle Garage
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose chassis tuning and exterior finish
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close garage"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Car Models */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {CAR_MODELS.map((car) => {
            const active = car.id === selectedCarId;
            return (
              <button
                key={car.id}
                type="button"
                onClick={() => onSelectCar(car)}
                className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-colors ${
                  active
                    ? 'border-cyan-400 bg-cyan-500/10'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-display text-base font-bold text-white">
                    {car.name}
                  </span>
                  {active && <Check className="h-4 w-4 text-cyan-400" />}
                </div>
                <span className="text-xs text-slate-400 mt-0.5">{car.classLabel}</span>

                <div className="mt-3 w-full space-y-1.5 text-[11px] text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Top Speed</span>
                    <span className="font-telemetry">{Math.round(car.maxSpeed * 3.6)} km/h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Accel</span>
                    <span className="font-telemetry">{car.acceleration} m/s²</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Grip</span>
                    <span className="font-telemetry">{car.grip.toFixed(1)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Paint Swatches */}
        <div className="mt-5">
          <p className="text-xs font-medium text-slate-300 mb-2.5">Exterior Paint Finish</p>
          <div className="flex flex-wrap items-center gap-2.5">
            {PAINT_SWATCHES.map((swatch) => {
              const active = selectedPaint.toLowerCase() === swatch.hex.toLowerCase();
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.name}
                  onClick={() => onSelectPaint(swatch.hex)}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                    active
                      ? 'border-cyan-400 bg-white/10 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]'
                  }`}
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-white/25"
                    style={{ backgroundColor: swatch.hex }}
                  />
                  <span>{swatch.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Controls Reference */}
        <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-3.5 text-xs text-slate-300">
          <div className="font-semibold text-white mb-1.5">Keyboard & Touch Controls</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400">
            <div><span className="font-telemetry text-slate-200">W / ↑</span> Accelerate</div>
            <div><span className="font-telemetry text-slate-200">S / ↓</span> Reverse</div>
            <div><span className="font-telemetry text-slate-200">A D / ← →</span> Steer</div>
            <div><span className="font-telemetry text-slate-200">Space</span> Handbrake</div>
            <div><span className="font-telemetry text-slate-200">Shift</span> Nitro Boost</div>
            <div><span className="font-telemetry text-slate-200">C / R</span> Camera / Reset</div>
          </div>
        </div>
      </div>
    </div>
  );
};
