import * as THREE from 'three';

// GPU-friendly atmospheric clouds and rain. All geometry and alpha maps are
// generated in the browser; no external textures or volumetric ray-marching.
function seeded(seed){
  let n=seed>>>0;
  return ()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
}

export function createCloudTexture(size=192){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=size;
  const context=canvas.getContext('2d');
  const image=context.createImageData(size,size);
  const rand=seeded(145137);
  // Multiple overlapping density lobes, with soft edges instead of a solid
  // polygonal silhouette. Cumulus shapes vary by lobe size and location.
  const lobes=[];
  for(let i=0;i<19;i++){
    const angle=rand()*Math.PI*2;
    const radius=Math.sqrt(rand())*.61;
    lobes.push({x:Math.cos(angle)*radius*.72,y:Math.sin(angle)*radius*.5,
      sx:.21+rand()*.21,sy:.19+rand()*.18,w:.65+rand()*.50});
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1;
    let density=0;
    for(const l of lobes){
      const dx=(u-l.x)/l.sx,dy=(v-l.y)/l.sy;
      density+=Math.exp(-2.25*(dx*dx+dy*dy))*l.w;
    }
    const wisps=.055*Math.sin(u*22+v*7)*Math.sin(v*17-u*8);
    const coverage=THREE.MathUtils.clamp((density+wisps-.14)*.77,0,1);
    // Smooth transparency covers the low-poly artefacts and gives feathered edges.
    const alpha=Math.round(255*coverage*coverage*(3-2*coverage));
    const i=(y*size+x)*4;
    image.data[i]=244;image.data[i+1]=246;image.data[i+2]=247;
    image.data[i+3]=alpha;
  }
  context.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=true;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=4;
  return texture;
}

export class AtmosphericClouds{
  constructor(scene,quality='high'){
    this.scene=scene;
    this.texture=createCloudTexture(quality==='low'?128:192);
    this.groups=[];
    const r=seeded(90127);
    const quadrants=[[-1,-1],[-1,1],[1,-1],[1,1]];
    const perQuadrant=quality==='low'?7:quality==='medium'?13:quality==='high'?20:27;
    const geometry=new THREE.PlaneGeometry(1,1);
    geometry.rotateX(-Math.PI/2);
    this.geometry=geometry;
    const material=new THREE.MeshBasicMaterial({
      map:this.texture,transparent:true,opacity:.75,depthWrite:false,
      depthTest:true,alphaTest:.018,side:THREE.DoubleSide,fog:true,
      color:0xffffff
    });
    this.material=material;
    const dummy=new THREE.Object3D();
    for(const [qx,qz] of quadrants){
      const cloud=new THREE.InstancedMesh(geometry,material,perQuadrant*3);
      cloud.name='Nuvens atmosféricas · manchas suaves';
      let index=0;
      for(let i=0;i<perQuadrant;i++){
        const x=qx*(180+r()*670),z=qz*(180+r()*670);
        const y=175+r()*125,scale=42+r()*55;
        for(let layer=0;layer<3;layer++){
          dummy.position.set(x+(r()-.5)*scale*.85,
            y+layer*(2.5+r()*4),
            z+(r()-.5)*scale*.65);
          dummy.rotation.set(0,r()*Math.PI,0);
          dummy.scale.set(scale*(1.15+r()*.65),
            scale*(1.05+r()*.6),1);
          dummy.updateMatrix();cloud.setMatrixAt(index,dummy.matrix);
          cloud.setColorAt(index,new THREE.Color(layer===2?0xf6f6f1:
            layer===0?0xc3ced6:0xe3e8eb));
          index++;
        }
      }
      cloud.count=index;
      cloud.instanceMatrix.needsUpdate=true;
      if(cloud.instanceColor)cloud.instanceColor.needsUpdate=true;
      cloud.renderOrder=1;
      cloud.castShadow=false;
      cloud.receiveShadow=false;
      cloud.computeBoundingSphere();
      cloud.frustumCulled=true;
      scene.add(cloud);
      this.groups.push(cloud);
    }
    this.clouds=this.groups[0];
    this.time=0;
    this.opacity=material.opacity;
  }
  update(dt,weather='clear',hour=14,paused=false){
    if(!paused)this.time+=Math.max(0,Math.min(.1,dt));
    const day=Math.max(0,Math.sin((hour-6)/24*Math.PI*2));
    const targetOpacity=weather==='rain'?.93:weather==='fog'?.50:.77;
    this.material.opacity=targetOpacity;
    const tint=weather==='rain'?0x89939f:
      day<.14?0x56637b:weather==='fog'?0xaebbc3:0xffffff;
    this.material.color.set(tint);
    for(let i=0;i<this.groups.length;i++){
      this.groups[i].position.x=Math.sin(this.time*.006+i*.4)*35;
      this.groups[i].position.z=Math.cos(this.time*.004+i*.63)*19;
    }
  }
  dispose(){
    for(const cloud of this.groups)this.scene.remove(cloud);
    this.geometry.dispose();this.material.dispose();this.texture.dispose();
  }
}

export class RainStreaks {
  constructor(scene,quality='high'){
    this.scene=scene;
    this.count=quality==='low'?470:quality==='medium'?740:1150;
    this.rng=seeded(160517);
    const points=new Float32Array(this.count*6);
    this.position=new Float32Array(this.count*3);
    this.length=new Float32Array(this.count);
    this.speed=new Float32Array(this.count);
    for(let i=0;i<this.count;i++){
      this.position[i*3]=(this.rng()-.5)*86;
      this.position[i*3+1]=this.rng()*37;
      this.position[i*3+2]=(this.rng()-.5)*86;
      this.length[i]=.6+this.rng()*.95;
      this.speed[i]=23+this.rng()*22;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(points,3));
    this.mesh=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({
      color:0xd5e8ef,transparent:true,opacity:.43,
      depthWrite:false,depthTest:true,fog:true
    }));
    this.mesh.name='Chuva · riscos finos com velocidade e vento';
    this.mesh.visible=false;
    this.mesh.frustumCulled=false;
    this.rebuild();
    scene.add(this.mesh);
  }
  rebuild(){
    const dst=this.mesh.geometry.getAttribute('position').array;
    for(let i=0;i<this.count;i++){
      const j=i*3,k=i*6,y=this.position[j+1],length=this.length[i];
      dst[k]=this.position[j];dst[k+1]=y;dst[k+2]=this.position[j+2];
      dst[k+3]=this.position[j]-.12*length;
      dst[k+4]=y+length;
      dst[k+5]=this.position[j+2]+.07*length;
    }
    this.mesh.geometry.attributes.position.needsUpdate=true;
  }
  update(dt,paused=false){
    if(paused||!this.mesh.visible)return;
    const delta=Math.max(0,Math.min(.12,dt));
    for(let i=0;i<this.count;i++){
      const j=i*3;
      this.position[j+1]-=this.speed[i]*delta;
      this.position[j]+=.85*delta;
      if(this.position[j+1]<-5){
        this.position[j+1]+=43;
        this.position[j]=(this.rng()-.5)*86;
        this.position[j+2]=(this.rng()-.5)*86;
      }
    }
    this.rebuild();
  }
  dispose(){
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();this.mesh.material.dispose();
  }
}
