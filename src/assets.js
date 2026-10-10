import * as THREE from 'three';

// The high-detail car is licensed CC BY 4.0 and is hosted by Khronos.
// See CREDITS.md. The simple procedural car remains playable offline.
const CAR_GLB = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb';
const ASPHALT_BASE = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/';

function fetchTexture(url, color = false) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url, texture => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = 16;
      resolve(texture);
    }, undefined, reject);
  });
}

export class AssetUpgrade {
  constructor(vehicle, world, scene, renderer, setStatus = () => {}) {
    this.vehicle = vehicle;
    this.world = world;
    this.scene = scene;
    this.renderer = renderer;
    this.setStatus = setStatus;
    this.started = false;
    this.carLoaded = false;
    this.textureLoaded = false;
    this.asphaltRequest = 0;
    this.modelEnabled = true;
  }

  async start(quality = 'high') {
    if (this.started || window.__CORSACARS_DISABLE_REMOTE_ASSETS__) return;
    this.started = true;
    const tasks = [this.loadPhotographicAsphalt(quality), this.loadCar()];
    await Promise.allSettled(tasks);
    this.setStatus(this.carLoaded
      ? 'CARRO 3D DETALHADO DISPONÍVEL'
      : 'MODO DE CARRO ORIGINAL DISPONÍVEL');
  }

  setQuality(quality) {
    this.quality = quality;
    this.setVisibility();
  }

  setVisibility() {
    this.vehicle.useHighDetail = this.modelEnabled &&
      this.carLoaded && this.quality !== 'low';
  }

  async loadPhotographicAsphalt(quality) {
    // Three true texture resolutions, independent of frame rendering scale.
    // Retain the procedural normal/roughness maps as an offline fallback.
    const resolution = quality === 'ultra' ? '4k' : quality === 'high' ? '2k' : '1k';
    const request = ++this.asphaltRequest;
    try {
      const url = ASPHALT_BASE +
        resolution + '/asphalt_02/asphalt_02_diff_' + resolution + '.jpg';
      const albedo = await fetchTexture(url, true);
      if (request !== this.asphaltRequest) { albedo.dispose(); return; }
      albedo.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy
        ? Math.min(16,this.renderer.capabilities.getMaxAnisotropy()) : 16;
      albedo.minFilter=THREE.LinearMipmapLinearFilter;
      albedo.magFilter=THREE.LinearFilter;
      const roadMaterials=new Set([
        this.world.roadMaterial,
        ...(this.world.network?.materials?.values()||[])
      ].filter(material=>material?.userData?.roadAsphalt));
      if(!roadMaterials.size){albedo.dispose();return;}
      albedo.repeat.set(1,2);
      // Previously ONLY the circular road received the photographic map.
      // Share one calibrated albedo on ALL paved sections and connectors.
      for(const material of roadMaterials){
        material.map=albedo;
        material.color.set(this.world.weather==='rain'?0xb5bfc9:0xffffff);
        material.needsUpdate=true;
      }
      // Dispose the previous remote map once, never the shared procedural
      // fallback maps kept in the texture cache.
      if(this.asphaltTexture&&this.asphaltTexture!==albedo)
        this.asphaltTexture.dispose();
      this.asphaltTexture=albedo;
      this.asphaltResolution=resolution;
      this.textureLoaded=true;
    } catch (e) {
      console.warn('[CORSACARS] Textura fotográfica indisponível; asfalto original ativo.', e);
    }
  }

  async loadCar() {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(CAR_GLB);
      const root = gltf.scene;
      root.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(root);
      if (bounds.isEmpty()) throw new Error('Modelo 3D sem geometria');
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 4.24 / Math.max(size.x, size.z);
      // Rotate only when the longitudinal dimension is along the X axis.
      const yaw = size.x > size.z ? Math.PI / 2 : 0;
      const visual = new THREE.Group();
      const correction = new THREE.Group();
      correction.rotation.y = yaw;
      correction.scale.setScalar(scale);
      visual.add(correction);
      correction.add(root);
      // Recalculate transformed AABB so the model is centered in the physics shell.
      const renderedBounds = new THREE.Box3().setFromObject(visual);
      const center = renderedBounds.getCenter(new THREE.Vector3());
      correction.position.x -= center.x;
      correction.position.y -= renderedBounds.min.y + 0.78;
      correction.position.z -= center.z;
      root.traverse(obj => {
        if (obj.isMesh) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          const wheelMesh = materials.some(mat =>
            /tire(side|tread)?|rim\d|wheel/i.test(mat?.name || '')) ||
            /^wheel[_-]/i.test(obj.name);
          // Use the original raycast-physics wheels for real steering and rotation.
          if (wheelMesh) obj.visible = false;
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (obj.material?.envMapIntensity !== undefined) {
            obj.material.envMapIntensity = 1.4;
          }
        }
      });
      this.vehicle.setImportedCar(visual);
      this.carLoaded = true;
      this.setVisibility();
    } catch (e) {
      this.carLoaded = false;
      console.warn('[CORSACARS] Modelo 3D externo indisponível; carro original mantido.', e);
    }
  }
}
