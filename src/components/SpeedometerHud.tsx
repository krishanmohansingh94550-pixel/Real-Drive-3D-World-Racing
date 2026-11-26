import React from 'react';

interface SpeedometerHudProps {
  speedKmh: number;
  gear: string;
  rpm: number;
  nitro: number;
  isNitroActive: boolean;
  isDrifting: boolean;
}

export const SpeedometerHud: React.FC<SpeedometerHudProps> = ({
  speedKmh,
  gear,
  rpm,
  nitro,
  isNitroActive,
  isDrifting,
}) => {
  const segments = 14;
  const activeSegments = Math.round(rpm * segments);

  return (
    <div className="rounded-xl border border-white/12 bg-[#0c121e]/90 px-4 py-2.5 shadow-lg min-w-[188px]">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-1.5">
          <span className="font-telemetry text-3xl font-bold tracking-tight text-white">
            {speedKmh}
          </span>
          <span className="text-xs font-medium text-slate-400">km/h</span>
        </div>

        <div className="flex items-center gap-2">
          {isDrifting && (
            <span className="text-[11px] font-display font-semibold tracking-wider text-amber-400 uppercase">
              Drift
            </span>
          )}
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 font-telemetry text-sm font-bold text-amber-400">
            {gear}
          </div>
        </div>
      </div>

      {/* RPM Strip */}
      <div className="mt-2 flex items-center gap-1" aria-label="Engine RPM">
        {Array.from({ length: segments }).map((_, idx) => {
          const lit = idx < activeSegments;
          let color = 'bg-slate-700/70';
          if (lit) {
            if (idx >= 11) color = 'bg-rose-500';
            else if (idx >= 8) color = 'bg-amber-400';
            else color = 'bg-cyan-400';
          }
          return (
            <div
              key={idx}
              className={`h-1.5 flex-1 rounded-xs transition-colors duration-75 ${color}`}
            />
          );
        })}
      </div>

      {/* Nitro Bar */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] font-display font-semibold tracking-wider text-cyan-300 uppercase">
          Nitro
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all duration-100 ${
              isNitroActive ? 'bg-cyan-300' : 'bg-cyan-500'
            }`}
            style={{ width: `${nitro}%` }}
          />
        </div>
        <span className="font-telemetry text-[10px] text-slate-400 w-7 text-right">
          {nitro}%
        </span>
      </div>
    </div>
  );
};
