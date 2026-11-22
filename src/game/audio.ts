class GameAudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private volume = 0.55;
  private lastStepAt = 0;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(m: boolean): void {
    this.muted = m;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  public playShoot(gunId: string = 'rifle'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const isShotgun = gunId === 'shotgun';
    const isSniper = gunId === 'sniper';
    const isSmg = gunId === 'smg';

    // Punchy low-mid body
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isSniper ? 'triangle' : 'sawtooth';
    const startFreq = isSniper ? 260 : isShotgun ? 135 : isSmg ? 225 : 175;
    const endFreq = isSniper ? 32 : isShotgun ? 34 : isSmg ? 75 : 48;
    const dur = isSniper ? 0.19 : isShotgun ? 0.16 : isSmg ? 0.065 : 0.09;

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur * 0.92);
    gain.gain.setValueAtTime((isSniper || isShotgun ? 0.34 : isSmg ? 0.19 : 0.24) * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);

    // Crisp noise transient
    const noiseDur = isShotgun ? 0.14 : isSniper ? 0.16 : isSmg ? 0.045 : 0.06;
    const bufSize = Math.floor(ctx.sampleRate * noiseDur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * (isShotgun ? 0.36 : 0.28)));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = isShotgun ? 1150 : isSniper ? 2300 : isSmg ? 2400 : 1800;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime((isShotgun ? 0.36 : isSniper ? 0.32 : 0.26) * this.volume, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur);
    noise.connect(filter).connect(nGain).connect(ctx.destination);
    noise.start(now);
  }

  public playReload(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.22].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(idx === 0 ? 520 : 780, now + offset);
      osc.frequency.exponentialRampToValueAtTime(idx === 0 ? 320 : 960, now + offset + 0.06);
      gain.gain.setValueAtTime(0.14 * this.volume, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.075);
    });
  }

  public playMineTick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(240 + Math.random() * 60, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.045);
    gain.gain.setValueAtTime(0.09 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playBlockBreak(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.11);
    gain.gain.setValueAtTime(0.22 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.125);
  }

  public playBlockPlace(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.07);
    gain.gain.setValueAtTime(0.2 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  public playHitmarker(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1320, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.045);
    gain.gain.setValueAtTime(0.16 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playDamage(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);
    gain.gain.setValueAtTime(0.24 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playStep(sprinting: boolean): void {
    const nowMs = performance.now();
    const interval = sprinting ? 260 : 380;
    if (nowMs - this.lastStepAt < interval) return;
    this.lastStepAt = nowMs;

    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95 + Math.random() * 25, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.04);
    gain.gain.setValueAtTime(0.06 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playPickup(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(1040, now + 0.075);
    gain.gain.setValueAtTime(0.14 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playUiClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.035);
    gain.gain.setValueAtTime(0.09 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }
}

export const audioEngine = new GameAudioEngine();
