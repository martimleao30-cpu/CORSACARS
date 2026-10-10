const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

// Measure completed frames against REAL elapsed wall time (not the median
// interval, physics timestep, or an arbitrary 300 FPS cap).
export class PerformanceMonitor {
  constructor(renderer, node, downgrade) {
    this.renderer = renderer;
    this.node = node;
    this.downgrade = downgrade;
    this.seconds = 0;
    this.frames = 0;
    this.slowSeconds = 0;
    this.cooldown = 0;
    this.current = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 };
  }

  reset() {
    this.seconds = 0;
    this.frames = 0;
  }

  update(elapsedSeconds, quality, auto = false, playing = true) {
    if (!playing) {
      this.reset();
      return;
    }
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return;
    // Sleeping/background browser tabs should never be treated as a long
    // rendered frame or trigger automatic graphics downgrades.
    if (elapsedSeconds > 1) {
      this.reset();
      return;
    }
    this.seconds += elapsedSeconds;
    this.frames++;
    this.cooldown = Math.max(0, this.cooldown - elapsedSeconds);
    if (this.seconds < .75) return;

    const duration = this.seconds;
    const fps = this.frames / duration;
    const frameMs = duration * 1000 / this.frames;
    const drawCalls = this.renderer.info.render.calls;
    const triangles = this.renderer.info.render.triangles;
    this.current = { fps: Math.round(fps), frameMs, drawCalls, triangles };
    this.node.textContent = 'FPS ' + Math.round(fps) + ' · ' +
      frameMs.toFixed(1) + ' ms/fotograma · ' + drawCalls +
      ' draw calls · ' + (triangles / 1000).toFixed(0) + 'k tri · ' + quality.toUpperCase();
    this.reset();
    if (!auto || quality === 'low') {
      this.slowSeconds = 0;
      return;
    }
    if (fps < 29) this.slowSeconds += duration;
    else this.slowSeconds = Math.max(0, this.slowSeconds - duration * 2);
    if (this.slowSeconds > 6 && this.cooldown <= 0) {
      const next = QUALITY_ORDER[Math.max(0, QUALITY_ORDER.indexOf(quality) - 1)];
      this.slowSeconds = 0;
      this.cooldown = 20;
      this.downgrade(next);
    }
  }
}
