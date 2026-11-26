import * as THREE from 'three';

export interface WorldTextures {
  asphalt: THREE.CanvasTexture;
  grass: THREE.CanvasTexture;
  sidewalk: THREE.CanvasTexture;
  buildingDay: THREE.CanvasTexture;
  buildingNight: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  checkerBanner: THREE.CanvasTexture;
  checkpointBanner: THREE.CanvasTexture;
}

function configureColorTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createWorldTextures(maxAnisotropy: number): WorldTextures {
  // 1. Asphalt texture with aggregate grain and subtle lane markings
  const asphaltCanvas = document.createElement('canvas');
  asphaltCanvas.width = 512;
  asphaltCanvas.height = 512;
  const actx = asphaltCanvas.getContext('2d')!;
  actx.fillStyle = '#23272f';
  actx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 26 + Math.floor(Math.random() * 24);
    actx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    actx.fillRect(x, y, 2, 2);
  }
  // Subtle tire wear bands
  actx.fillStyle = 'rgba(15, 17, 22, 0.28)';
  actx.fillRect(95, 0, 52, 512);
  actx.fillRect(365, 0, 52, 512);

  // Edge solid white lines
  actx.fillStyle = '#d1d5db';
  actx.fillRect(14, 0, 8, 512);
  actx.fillRect(490, 0, 8, 512);

  // Center dashed yellow/amber line
  actx.fillStyle = '#f59e0b';
  for (let y = 16; y < 512; y += 64) {
    actx.fillRect(252, y, 8, 36);
  }
  const asphalt = configureColorTexture(asphaltCanvas, maxAnisotropy, 1, 1);

  // 2. Grass / terrain texture
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 512;
  grassCanvas.height = 512;
  const gctx = grassCanvas.getContext('2d')!;
  gctx.fillStyle = '#2d4c2b';
  gctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 7000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const g = 58 + Math.floor(Math.random() * 34);
    gctx.fillStyle = `rgb(${Math.floor(g * 0.56)},${g},${Math.floor(g * 0.5)})`;
    gctx.fillRect(x, y, 3, 3);
  }
  const grass = configureColorTexture(grassCanvas, maxAnisotropy, 60, 60);

  // 3. Sidewalk / concrete plaza texture
  const swCanvas = document.createElement('canvas');
  swCanvas.width = 256;
  swCanvas.height = 256;
  const sctx = swCanvas.getContext('2d')!;
  sctx.fillStyle = '#525866';
  sctx.fillRect(0, 0, 256, 256);
  sctx.strokeStyle = '#3f4451';
  sctx.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) {
    sctx.beginPath();
    sctx.moveTo(i, 0);
    sctx.lineTo(i, 256);
    sctx.stroke();
    sctx.beginPath();
    sctx.moveTo(0, i);
    sctx.lineTo(256, i);
    sctx.stroke();
  }
  const sidewalk = configureColorTexture(swCanvas, maxAnisotropy, 40, 40);

  // 4. Building facade (Day)
  const bDayCanvas = document.createElement('canvas');
  bDayCanvas.width = 256;
  bDayCanvas.height = 512;
  const bdctx = bDayCanvas.getContext('2d')!;
  bdctx.fillStyle = '#364152';
  bdctx.fillRect(0, 0, 256, 512);
  for (let row = 16; row < 496; row += 32) {
    for (let col = 16; col < 240; col += 32) {
      const lit = Math.random() > 0.25;
      bdctx.fillStyle = lit ? '#7dd3fc' : '#475569';
      bdctx.fillRect(col, row, 20, 20);
      bdctx.fillStyle = 'rgba(255,255,255,0.25)';
      bdctx.fillRect(col, row, 20, 4);
    }
  }
  const buildingDay = configureColorTexture(bDayCanvas, maxAnisotropy, 1, 2);

  // 5. Building facade (Night)
  const bNightCanvas = document.createElement('canvas');
  bNightCanvas.width = 256;
  bNightCanvas.height = 512;
  const bnctx = bNightCanvas.getContext('2d')!;
  bnctx.fillStyle = '#18202c';
  bnctx.fillRect(0, 0, 256, 512);
  for (let row = 16; row < 496; row += 32) {
    for (let col = 16; col < 240; col += 32) {
      const r = Math.random();
      if (r > 0.45) {
        bnctx.fillStyle = r > 0.8 ? '#fde68a' : '#38bdf8';
      } else {
        bnctx.fillStyle = '#0f172a';
      }
      bnctx.fillRect(col, row, 20, 20);
    }
  }
  const buildingNight = configureColorTexture(bNightCanvas, maxAnisotropy, 1, 2);

  // 6. Soft radial contact shadow
  const csCanvas = document.createElement('canvas');
  csCanvas.width = 256;
  csCanvas.height = 256;
  const cctx = csCanvas.getContext('2d')!;
  const grad = cctx.createRadialGradient(128, 128, 28, 128, 128, 126);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, 256, 256);
  const contactShadow = new THREE.CanvasTexture(csCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;
  contactShadow.needsUpdate = true;

  // 7. Finish line checker banner
  const chkCanvas = document.createElement('canvas');
  chkCanvas.width = 512;
  chkCanvas.height = 128;
  const chctx = chkCanvas.getContext('2d')!;
  const sq = 32;
  for (let y = 0; y < 128; y += sq) {
    for (let x = 0; x < 512; x += sq) {
      const even = ((x / sq) + (y / sq)) % 2 === 0;
      chctx.fillStyle = even ? '#f8fafc' : '#0f172a';
      chctx.fillRect(x, y, sq, sq);
    }
  }
  chctx.fillStyle = 'rgba(225, 29, 72, 0.9)';
  chctx.fillRect(156, 36, 200, 56);
  chctx.fillStyle = '#ffffff';
  chctx.font = 'bold 34px sans-serif';
  chctx.textAlign = 'center';
  chctx.textBaseline = 'middle';
  chctx.fillText('FINISH', 256, 65);
  const checkerBanner = configureColorTexture(chkCanvas, maxAnisotropy, 1, 1);
  checkerBanner.wrapS = THREE.ClampToEdgeWrapping;
  checkerBanner.wrapT = THREE.ClampToEdgeWrapping;

  // 8. Checkpoint banner
  const cpCanvas = document.createElement('canvas');
  cpCanvas.width = 512;
  cpCanvas.height = 128;
  const cpctx = cpCanvas.getContext('2d')!;
  cpctx.fillStyle = '#0c4a6e';
  cpctx.fillRect(0, 0, 512, 128);
  cpctx.fillStyle = '#06b6d4';
  for (let x = 0; x < 512; x += 48) {
    cpctx.fillRect(x, 0, 24, 18);
    cpctx.fillRect(x + 24, 110, 24, 18);
  }
  cpctx.fillStyle = '#f8fafc';
  cpctx.font = 'bold 34px sans-serif';
  cpctx.textAlign = 'center';
  cpctx.textBaseline = 'middle';
  cpctx.fillText('CHECKPOINT', 256, 65);
  const checkpointBanner = configureColorTexture(cpCanvas, maxAnisotropy, 1, 1);
  checkpointBanner.wrapS = THREE.ClampToEdgeWrapping;
  checkpointBanner.wrapT = THREE.ClampToEdgeWrapping;

  return {
    asphalt,
    grass,
    sidewalk,
    buildingDay,
    buildingNight,
    contactShadow,
    checkerBanner,
    checkpointBanner,
  };
}
