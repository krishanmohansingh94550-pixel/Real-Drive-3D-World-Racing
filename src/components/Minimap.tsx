import React, { useEffect, useRef } from 'react';

interface MinimapProps {
  playerX: number;
  playerZ: number;
  playerHeading: number;
  activeCheckpoint: { x: number; z: number; isFinish: boolean } | null;
  trafficPositions: Array<{ x: number; z: number }>;
}

export const Minimap: React.FC<MinimapProps> = ({
  playerX,
  playerZ,
  playerHeading,
  activeCheckpoint,
  trafficPositions,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0b111c';
    ctx.fillRect(0, 0, w, h);

    // World extent: X [-200..200], Z [-170..170]
    const cx = w / 2;
    const cy = h / 2;
    const scaleX = (w - 18) / 380;
    const scaleZ = (h - 18) / 320;
    const scale = Math.min(scaleX, scaleZ);

    // Map world (+X left on screen behind car? Let's keep standard top-down North=-Z, East=+X)
    const toMap = (wx: number, wz: number): [number, number] => [
      cx + wx * scale,
      cy + wz * scale,
    ];

    // Inner city avenues
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.5;
    const drawLine = (x1: number, z1: number, x2: number, z2: number) => {
      const [mx1, my1] = toMap(x1, z1);
      const [mx2, my2] = toMap(x2, z2);
      ctx.beginPath();
      ctx.moveTo(mx1, my1);
      ctx.lineTo(mx2, my2);
      ctx.stroke();
    };
    drawLine(0, -135, 0, 135);
    drawLine(-165, 0, 165, 0);
    ctx.lineWidth = 1.5;
    drawLine(-78, -115, -78, 115);
    drawLine(78, -115, 78, 115);
    drawLine(-145, -68, 145, -68);
    drawLine(-145, 68, 145, 68);

    // Outer Highway Loop
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 165 * scale, 135 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Traffic blips
    ctx.fillStyle = '#94a3b8';
    for (const tc of trafficPositions) {
      const [tx, ty] = toMap(tc.x, tc.z);
      ctx.beginPath();
      ctx.arc(tx, ty, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Active checkpoint target
    if (activeCheckpoint) {
      const [ax, ay] = toMap(activeCheckpoint.x, activeCheckpoint.z);
      ctx.fillStyle = activeCheckpoint.isFinish ? '#f43f5e' : '#22d3ee';
      ctx.beginPath();
      ctx.arc(ax, ay, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Player chevron
    const [px, py] = toMap(playerX, playerZ);
    ctx.save();
    ctx.translate(px, py);
    // Forward vector is (sin(yaw), cos(yaw)) -> in canvas X=right, Y=down, angle from -Y is atan2(sin, -cos)
    const mapAngle = Math.atan2(Math.sin(playerHeading), -Math.cos(playerHeading));
    ctx.rotate(mapAngle);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 4.5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4.5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [playerX, playerZ, playerHeading, activeCheckpoint, trafficPositions]);

  return (
    <div className="rounded-xl border border-white/12 bg-[#0b111c]/90 p-1.5 shadow-lg">
      <canvas
        ref={canvasRef}
        width={136}
        height={112}
        className="block rounded-lg"
      />
    </div>
  );
};
