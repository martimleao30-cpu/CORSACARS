import * as THREE from 'three';

// Simple bounded GPU-instanced dust plumes at the physical rear wheel positions.
// Dirt/gravel surface comes from the same wheel surface query used for grip.
export class RoadDust {
  constructor(scene,quality='high'){
    this.quality=quality;
    this.max=96;
    this.particles=[];
    this.elapsed=0;
    this.lastEmission=0;
    this.seed=1337;
    this.material=new THREE.MeshBasicMaterial({
      color:0xc8b69a,transparent:true,opacity:.27,depthWrite:false,
      side:THREE.DoubleSide,fog:true
    });
    this.geometry=new THREE.PlaneGeometry(1,1);
    this.mesh=new THREE.InstancedMesh(this.geometry,this.material,this.max);
    this.mesh.name='Poeira física · Pneus em terra e gravilha';
    this.mesh.count=0;
    this.mesh.frustumCulled=false;
    this.mesh.renderOrder=2;
    scene.add(this.mesh);
    this.transform=new THREE.Object3D();
  }

  random(){
    this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
    return this.seed/4294967296;
  }

  update(dt,car,world,camera,playing=true){
    if(!playing)return;
    const delta=Math.max(0,Math.min(.08,dt));
    this.elapsed+=delta;
    for(const p of this.particles){
      p.life-=delta;
      p.x+=p.vx*delta;
      p.y+=p.vy*delta;
      p.z+=p.vz*delta;
      p.vy+=.22*delta;
    }
    this.particles=this.particles.filter(p=>p.life>0);
    const speed=car?.speedKmh||0;
    if(speed>9&&this.elapsed-this.lastEmission>(this.quality==='low'?.115:.065)){
      this.lastEmission=this.elapsed;
      const wheels=car?.vehicle?.wheelInfos||[];
      const maxNew=this.quality==='low'?1:2;
      for(let j=2;j<4;j++){
        const wheel=wheels[j];
        if(!wheel?.raycastResult?.hasHit)continue;
        const point=wheel.raycastResult.hitPointWorld||wheel.worldTransform?.position;
        if(!point)continue;
        const surface=world?.surfaceAt(point.x,point.z)?.surface;
        if(surface!=='dirt'&&surface!=='gravel')continue;
        const velocity=car.chassis?.velocity;
        for(let i=0;i<maxNew&&this.particles.length<this.max;i++){
          const life=.65+this.random()*.85;
          this.particles.push({
            x:point.x+(this.random()-.5)*.42,
            y:point.y+.19,
            z:point.z+(this.random()-.5)*.42,
            vx:-(velocity?.x||0)*.12+(this.random()-.5)*1.25,
            vy:.2+this.random()*.6,
            vz:-(velocity?.z||0)*.12+(this.random()-.5)*1.25,
            life,maxLife:life,size:.55+this.random()*.55
          });
        }
      }
    }
    this.mesh.count=this.particles.length;
    this.mesh.visible=this.mesh.count>0;
    for(let i=0;i<this.particles.length;i++){
      const p=this.particles[i];
      const life=1-p.life/p.maxLife;
      const scale=p.size*(.4+life*2.15);
      this.transform.position.set(p.x,p.y,p.z);
      if(camera?.quaternion)this.transform.quaternion.copy(camera.quaternion);
      else this.transform.quaternion.identity();
      this.transform.scale.set(scale,scale,scale);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(i,this.transform.matrix);
    }
    if(this.mesh.count){
      this.mesh.instanceMatrix.needsUpdate=true;
      this.mesh.computeBoundingSphere();
    }
  }

  dispose(scene){
    scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
