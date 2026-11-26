export class AudioEngine {
  private ctx: AudioContext | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private screechGain: GainNode | null = null;
  private nitroGain: GainNode | null = null;
  private muted = false;
  private initialized = false;

  public unlock() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      // Engine synthesizer (dual oscillators -> lowpass filter -> gain)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.value = 52;
      osc2.frequency.value = 104;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 220;
      filter.Q.value = 2.5;

      const gain = ctx.createGain();
      gain.gain.value = 0.0;

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();

      this.engineOsc1 = osc1;
      this.engineOsc2 = osc2;
      this.engineFilter = filter;
      this.engineGain = gain;

      // Shared white noise buffer for tire screech & nitro whoosh
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      // Tire screech bandpass
      const screechSrc = ctx.createBufferSource();
      screechSrc.buffer = noiseBuffer;
      screechSrc.loop = true;
      const screechFilter = ctx.createBiquadFilter();
      screechFilter.type = 'bandpass';
      screechFilter.frequency.value = 1450;
      screechFilter.Q.value = 6.0;
      const screechGain = ctx.createGain();
      screechGain.gain.value = 0;
      screechSrc.connect(screechFilter);
      screechFilter.connect(screechGain);
      screechGain.connect(ctx.destination);
      screechSrc.start();
      this.screechGain = screechGain;

      // Nitro jet whoosh
      const nitroSrc = ctx.createBufferSource();
      nitroSrc.buffer = noiseBuffer;
      nitroSrc.loop = true;
      const nitroFilter = ctx.createBiquadFilter();
      nitroFilter.type = 'bandpass';
      nitroFilter.frequency.value = 540;
      nitroFilter.Q.value = 1.5;
      const nitroGain = ctx.createGain();
      nitroGain.gain.value = 0;
      nitroSrc.connect(nitroFilter);
      nitroFilter.connect(nitroGain);
      nitroGain.connect(ctx.destination);
      nitroSrc.start();
      this.nitroGain = nitroGain;

      this.initialized = true;
    } catch {
      // Ignore audio errors on restricted environments
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (muted && this.ctx) {
      const now = this.ctx.currentTime;
      this.engineGain?.gain.setTargetAtTime(0, now, 0.05);
      this.screechGain?.gain.setTargetAtTime(0, now, 0.05);
      this.nitroGain?.gain.setTargetAtTime(0, now, 0.05);
    }
  }

  public update(rpm: number, throttleActive: boolean, isDrifting: boolean, isNitro: boolean) {
    if (!this.initialized || !this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;
    const baseFreq = 44 + rpm * 138 + (isNitro ? 24 : 0);
    this.engineOsc1?.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.engineOsc2?.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.04);
    this.engineFilter?.frequency.setTargetAtTime(190 + rpm * 640 + (throttleActive ? 140 : 0), now, 0.05);

    const targetEngineVol = throttleActive ? 0.075 + rpm * 0.045 : 0.032 + rpm * 0.02;
    this.engineGain?.gain.setTargetAtTime(targetEngineVol, now, 0.06);

    const targetScreech = isDrifting ? 0.045 : 0;
    this.screechGain?.gain.setTargetAtTime(targetScreech, now, 0.04);

    const targetNitro = isNitro ? 0.08 : 0;
    this.nitroGain?.gain.setTargetAtTime(targetNitro, now, 0.05);
  }

  public playBeep(freq: number, duration = 0.14, gainLevel = 0.09) {
    if (!this.initialized || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(gainLevel, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playCheckpoint() {
    this.playBeep(660, 0.1, 0.08);
    setTimeout(() => this.playBeep(880, 0.18, 0.09), 75);
  }

  public playFinish() {
    this.playBeep(523.25, 0.12, 0.09);
    setTimeout(() => this.playBeep(659.25, 0.12, 0.09), 100);
    setTimeout(() => this.playBeep(783.99, 0.14, 0.1), 200);
    setTimeout(() => this.playBeep(1046.5, 0.35, 0.12), 310);
  }

  public playCrash(intensity = 0.6) {
    if (!this.initialized || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.16);
    gain.gain.setValueAtTime(Math.min(0.16, 0.06 + intensity * 0.1), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public dispose() {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
