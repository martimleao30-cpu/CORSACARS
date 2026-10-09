import * as THREE from 'three';

// Image-based environment lighting and a low-frequency irradiance probe.
// This is indirect illumination from a captured environment, not path-traced multi-bounce GI.
const HDRI = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr';

export class IndirectLighting {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.probe = null;
    this.available = false;
    this.initialized = false;
    this.loading = null;
    this.envTarget = null;
    this.probeAttempted = false;
  }

  async load() {
    if (this.loading) return this.loading;
    this.loading = this.loadEnvironment();
    return this.loading;
  }

  async loadEnvironment() {
    try {
      const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
      const source = await new RGBELoader().loadAsync(HDRI);
      source.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envTarget = pmrem.fromEquirectangular(source);
      this.scene.environment = this.envTarget.texture;
      this.available = true;
      source.dispose();
      pmrem.dispose();
      return true;
    } catch (error) {
      console.warn('[CORSACARS] HDRI remoto indisponível; luz ambiente original mantida.', error);
      return false;
    }
  }

  async captureProbe(reflectionTarget) {
    if (this.probeAttempted) return;
    this.probeAttempted = true;
    try {
      const { LightProbeGenerator } =
        await import('three/addons/lights/LightProbeGenerator.js');
      const probe = await Promise.resolve(LightProbeGenerator.fromCubeRenderTarget(
        this.renderer, reflectionTarget
      ));
      probe.intensity = 0.3;
      this.probe = probe;
      this.scene.add(probe);
    } catch (error) {
      console.warn('[CORSACARS] Sonda SH indisponível; iluminação hemisférica mantida.', error);
    }
  }

  update(hour, weather, quality) {
    const daylight = Math.max(0, Math.sin(((hour - 6) / 24) * Math.PI * 2));
    if (this.available) {
      this.scene.environmentIntensity = (0.08 + 0.75 * daylight) *
        (weather === 'rain' ? 0.65 : 1);
    }
    if (this.probe) {
      this.probe.intensity = quality === 'low' ? 0 :
        (0.035 + daylight * 0.22) * (weather === 'rain' ? 0.7 : 1);
    }
  }
}
