const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

export class PerformanceMonitor {
  constructor(renderer, node, downgrade) {
    this.renderer = renderer;
    this.node = node;
    this.downgrade = downgrade;
    this.samples = [];
    this.windowSeconds = 0;
    this.slowSeconds = 0;
    this.cooldown = 0;
    this.current = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 };
  }

  update(dt, quality, auto = false, playing = true) {
    if (!playing || !Number.isFinite(dt) || dt <= 0) return;
    const ms = dt * 1000;
    this.samples.push(ms);
    if (this.samples.length > 120) this.samples.shift();
    this.windowSeconds += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.windowSeconds < 0.75) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || ms;
    const fps = Math.min(300, 1000 / Math.max(median, 1));
    const drawCalls = this.renderer.info.render.calls;
    const triangles = this.renderer.info.render.triangles;
    this.current = { fps: Math.round(fps), frameMs: median, drawCalls, triangles };
    this.node.textContent = 'FPS ' + Math.round(fps) + ' · ' +
      median.toFixed(1) + ' ms · ' + drawCalls +
      ' draw calls · ' + (triangles / 1000).toFixed(0) + 'k tri · ' + quality.toUpperCase();
    this.windowSeconds = 0;
    if (!auto || quality === 'low') {
      this.slowSeconds = 0;
      return;
    }
    if (fps < 29) this.slowSeconds += 0.75;
    else this.slowSeconds = Math.max(0, this.slowSeconds - 1.5);
    if (this.slowSeconds > 6 && this.cooldown <= 0) {
      const next = QUALITY_ORDER[Math.max(0, QUALITY_ORDER.indexOf(quality) - 1)];
      this.slowSeconds = 0;
      this.cooldown = 20;
      this.downgrade(next);
    }
  }
}
