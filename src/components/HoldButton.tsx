import React, { useRef, useState } from 'react';
import { HoldAction } from '../game/types';

interface HoldButtonProps {
  action: HoldAction;
  label: string;
  icon?: React.ReactNode;
  onHoldChange: (action: HoldAction, pressed: boolean) => void;
  variant?: 'steer' | 'gas' | 'brake' | 'reverse' | 'nitro';
  className?: string;
}

export const HoldButton: React.FC<HoldButtonProps> = ({
  action,
  label,
  icon,
  onHoldChange,
  variant = 'steer',
  className = '',
}) => {
  const [pressed, setPressed] = useState(false);
  const activePointerId = useRef<number | null>(null);

  const release = () => {
    if (activePointerId.current !== null) {
      activePointerId.current = null;
      setPressed(false);
      onHoldChange(action, false);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (activePointerId.current !== null) return;
    activePointerId.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture unsupported
    }
    setPressed(true);
    onHoldChange(action, true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (activePointerId.current === e.pointerId) {
      release();
    }
  };

  const variantClasses: Record<NonNullable<HoldButtonProps['variant']>, string> = {
    steer: pressed
      ? 'bg-slate-200 text-slate-950 border-white'
      : 'bg-[#0f1623]/90 text-slate-100 border-white/15 hover:bg-[#172133]',
    gas: pressed
      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
      : 'bg-[#0f1623]/90 text-emerald-400 border-emerald-500/40 hover:bg-emerald-950/60',
    brake: pressed
      ? 'bg-rose-500 text-white border-rose-300'
      : 'bg-[#0f1623]/90 text-rose-400 border-rose-500/40 hover:bg-rose-950/60',
    reverse: pressed
      ? 'bg-amber-400 text-slate-950 border-amber-200'
      : 'bg-[#0f1623]/90 text-amber-300 border-amber-500/35 hover:bg-amber-950/60',
    nitro: pressed
      ? 'bg-cyan-400 text-slate-950 border-cyan-200'
      : 'bg-[#0f1623]/90 text-cyan-300 border-cyan-500/45 hover:bg-cyan-950/60',
  };

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      className={`touch-control flex flex-col items-center justify-center rounded-xl border font-display font-semibold tracking-wide transition-transform duration-100 active:scale-95 focus-visible:outline-2 focus-visible:outline-cyan-400 ${variantClasses[variant]} ${className}`}
    >
      {icon && <span className="pointer-events-none">{icon}</span>}
      <span className="pointer-events-none text-[11px] uppercase leading-none mt-1">
        {label}
      </span>
    </button>
  );
};
