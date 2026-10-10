import * as THREE from 'three';

// Optional post-processing degrades to direct WebGL rendering when unavailable.
// FXAA: shader post anti-aliasing; TAA: sample accumulation. Browser native MSAA
// remains enabled at renderer creation, independent of these optional passes.
export class GraphicsPipeline {
  constructor(renderer, scene, camera, vehicle, world) {
    this.renderer=renderer;this.scene=scene;this.camera=camera;
    this.vehicle=vehicle;this.world=world;
    this.quality='high';this.options={ao:true,reflections:true,antiAlias:'native',bloom:'low'};
    this.composer=null;this.ssao=null;this.taa=null;this.renderPass=null;
    this.fxaa=null;this.bloom=null;
    this.frameCount=0;this.reflectionEnabled=true;
    this.reflectionFace=0;
    this.reflectionCapturePosition=new THREE.Vector3();
    this.reflectionOffset=new THREE.Vector3(0,.6,0);
    this.reflectionTarget=new THREE.WebGLCubeRenderTarget(128,{
      generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter
    });
    this.reflectionCamera=new THREE.CubeCamera(.75,155,this.reflectionTarget);
    this.scene.add(this.reflectionCamera);
    this.vehicle.setReflectionMap(this.reflectionTarget.texture);
    this.ready=false;this.failedPostprocessing=false;this.indirect=null;
  }

  async initialize() {
    try {
      const [{EffectComposer},{RenderPass},{SSAOPass},{OutputPass}] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/SSAOPass.js'),
        import('three/addons/postprocessing/OutputPass.js')
      ]);
      this.composer=new EffectComposer(this.renderer);
      this.renderPass=new RenderPass(this.scene,this.camera);
      this.composer.addPass(this.renderPass);
      this.ssao=new SSAOPass(this.scene,this.camera,
        Math.max(1,window.innerWidth),Math.max(1,window.innerHeight),16);
      this.ssao.kernelRadius=7;
      this.ssao.minDistance=.008;this.ssao.maxDistance=.14;
      this.composer.addPass(this.ssao);

      // One failure in an optional pass must not prevent other effects.
      try{
        const [{UnrealBloomPass}] = await Promise.all([
          import('three/addons/postprocessing/UnrealBloomPass.js')
        ]);
        this.bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.075,.29,.93);
        this.composer.addPass(this.bloom);
      }catch(e){console.warn('[CORSACARS] Bloom indisponível:',e);}
      try{
        const [{ShaderPass},{FXAAShader}] = await Promise.all([
          import('three/addons/postprocessing/ShaderPass.js'),
          import('three/addons/shaders/FXAAShader.js')
        ]);
        this.fxaa=new ShaderPass(FXAAShader);
        this.composer.addPass(this.fxaa);
      }catch(e){console.warn('[CORSACARS] FXAA indisponível:',e);}
      try{
        const {TAARenderPass}=await import('three/addons/postprocessing/TAARenderPass.js');
        this.taa=new TAARenderPass(this.scene,this.camera);
        this.taa.sampleLevel=1;
        this.taa.accumulate=true;
        this.composer.insertPass(this.taa,0);
      }catch(e){console.warn('[CORSACARS] TAA indisponível:',e);}
      this.composer.addPass(new OutputPass());
      this.ready=true;
      this.configureEffects(this.options);
      this.resize();
    }catch(error){
      this.failedPostprocessing=true;
      console.warn('[CORSACARS] Pós-processamento indisponível; renderização direta ativa.',error);
    }
  }

  setQuality(quality,options=this.options) {
    this.quality=quality;
    this.options={...this.options,...options};
    this.reflectionEnabled=['high','ultra'].includes(quality)&&this.options.reflections!==false;
    this.configureEffects(this.options);
  }

  configureEffects(options=this.options) {
    this.options={...this.options,...options};
    const advanced=['high','ultra'].includes(this.quality);
    this.reflectionEnabled=advanced&&this.options.reflections!==false;
    if(this.ssao) this.ssao.enabled=advanced&&this.options.ao!==false;
    if(this.bloom){
      const amount=this.options.bloom==='medium'?.14:.055;
      this.bloom.enabled=advanced&&['low','medium'].includes(this.options.bloom);
      this.bloom.strength=amount;
      this.bloom.radius=.28;
      this.bloom.threshold=.95;
    }
    const taa=this.options.antiAlias==='taa'&&this.quality==='ultra';
    if(this.taa){
      this.taa.enabled=taa;
      if(this.renderPass)this.renderPass.enabled=!taa;
    }
    if(this.fxaa)this.fxaa.enabled=this.options.antiAlias==='fxaa'||
      (this.options.antiAlias==='taa'&&!taa);
    this.resize();
  }

  resize() {
    if(!this.composer)return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(innerWidth,innerHeight);
    if(this.fxaa){
      const size=new THREE.Vector2();
      this.renderer.getDrawingBufferSize(size);
      this.fxaa.material.uniforms.resolution.value.set(1/Math.max(1,size.x),1/Math.max(1,size.y));
    }
  }

  update(dt,active=true){
    // ACES handles bright sun highlights, while exposure gently follows
    // sunrise, midday and overcast rather than blowing out the road texture.
    const targetExposure=this.world.atmosphere?.exposure??1.04;
    this.renderer.toneMappingExposure=THREE.MathUtils.damp(
      this.renderer.toneMappingExposure,targetExposure,1.35,dt);
    this.indirect?.update(this.world.hour,this.world.weather,this.quality);
    this.frameCount++;
    const frequency=this.quality==='ultra'?25:65;
    if(active&&this.reflectionEnabled&&this.frameCount%frequency===0){
      this.reflectionCamera.position.copy(this.vehicle.model.position)
        .add(new THREE.Vector3(0,.6,0));
      const oldCarVisibility=this.vehicle.model.visible;
      const oldWheels=this.vehicle.wheelModels.map(w=>w.visible);
      this.vehicle.model.visible=false;
      for(const wheel of this.vehicle.wheelModels)wheel.visible=false;
      try{
        this.reflectionCamera.update(this.renderer,this.scene);
        if(this.indirect&&!this.indirect.probeAttempted)
          void this.indirect.captureProbe(this.reflectionTarget);
      }catch(error){
        console.warn('[CORSACARS] Reflexos dinâmicos desativados:',error);
        this.reflectionEnabled=false;
      }finally{
        this.vehicle.model.visible=oldCarVisibility;
        this.vehicle.wheelModels.forEach((w,i)=>{w.visible=oldWheels[i];});
      }
    }
  }

  render(){
    const enabled=this.ssao?.enabled||this.taa?.enabled||
      this.fxaa?.enabled||this.bloom?.enabled;
    if(this.composer&&this.ready&&enabled)this.composer.render();
    else this.renderer.render(this.scene,this.camera);
  }
}
