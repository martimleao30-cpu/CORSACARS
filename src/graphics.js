import * as THREE from 'three';

// Performance-aware optional effects: failure to load postprocessing never stops driving.
export class GraphicsPipeline {
  constructor(renderer, scene, camera, vehicle, world) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.vehicle = vehicle;
    this.world = world;
    this.quality = 'high';
    this.composer = null;
    this.ssao = null;
    this.frameCount = 0;
    this.reflectionEnabled = true;
    this.reflectionTarget = new THREE.WebGLCubeRenderTarget(128, {
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter
    });
    this.reflectionCamera = new THREE.CubeCamera(0.75, 155, this.reflectionTarget);
    this.scene.add(this.reflectionCamera);
    this.vehicle.setReflectionMap(this.reflectionTarget.texture);
    this.ready = false;
    this.failedPostprocessing = false;
  }

  async initialize() {
    try {
      const [{ EffectComposer }, { RenderPass }, { SSAOPass }, { OutputPass }] =
        await Promise.all([
          import('three/addons/postprocessing/EffectComposer.js'),
          import('three/addons/postprocessing/RenderPass.js'),
          import('three/addons/postprocessing/SSAOPass.js'),
          import('three/addons/postprocessing/OutputPass.js')
        ]);
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.ssao = new SSAOPass(this.scene, this.camera,
        Math.max(1, window.innerWidth), Math.max(1, window.innerHeight), 16);
      this.ssao.kernelRadius = 10;
      this.ssao.minDistance = 0.004;
      this.ssao.maxDistance = 0.11;
      this.composer.addPass(this.ssao);
      this.composer.addPass(new OutputPass());
      this.ready = true;
      this.resize();
    } catch (error) {
      // Optional effect: unsupported hardware/CDN errors should not crash gameplay.
      this.failedPostprocessing = true;
      console.warn('[CORSACARS] Oclusão ambiente indisponível:', error);
    }
  }

  setQuality(quality) {
    this.quality = quality;
    this.reflectionEnabled = quality === 'high' || quality === 'ultra';
    if (this.ssao) this.ssao.enabled = this.reflectionEnabled;
    if (this.composer) this.resize();
  }

  resize() {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  update(dt, active = true) {
    const daytime = Math.max(0, Math.sin(((this.world.hour - 6) / 24) * Math.PI * 2));
    let targetExposure = 0.86 + 0.3 * daytime;
    if (this.world.weather === 'fog') targetExposure += 0.08;
    if (this.world.weather === 'rain') targetExposure -= 0.08;
    this.renderer.toneMappingExposure = THREE.MathUtils.damp(
      this.renderer.toneMappingExposure, targetExposure, 0.8, dt
    );
    this.frameCount++;
    const frequency = this.quality === 'ultra' ? 25 : 65;
    if (active && this.reflectionEnabled && this.frameCount % frequency === 0) {
      this.reflectionCamera.position.copy(this.vehicle.model.position)
        .add(new THREE.Vector3(0, 0.6, 0));
      const oldCarVisibility = this.vehicle.model.visible;
      const oldWheels = this.vehicle.wheelModels.map(w => w.visible);
      this.vehicle.model.visible = false;
      for (const wheel of this.vehicle.wheelModels) wheel.visible = false;
      try {
        this.reflectionCamera.update(this.renderer, this.scene);
      } catch (error) {
        console.warn('[CORSACARS] Reflexos dinâmicos desativados:', error);
        this.reflectionEnabled = false;
      } finally {
        this.vehicle.model.visible = oldCarVisibility;
        this.vehicle.wheelModels.forEach((w, i) => { w.visible = oldWheels[i]; });
      }
    }
  }

  render() {
    if (this.composer && this.ssao?.enabled && this.ready) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
