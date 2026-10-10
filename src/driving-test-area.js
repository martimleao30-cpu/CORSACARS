import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {roadDeckHeight} from './road-upgrades.js';

const steel=new THREE.MeshStandardMaterial({color:0x6d777e,metalness:.78,roughness:.36});
const white=new THREE.MeshStandardMaterial({color:0xe5e9e6,roughness:.68});
const amber=new THREE.MeshStandardMaterial({color:0xd9a344,roughness:.74});
const wet=new THREE.MeshPhysicalMaterial({color:0x3d444c,roughness:.22,
  clearcoat:1,clearcoatRoughness:.09,metalness:.11});
const dirt=new THREE.MeshStandardMaterial({color:0x756347,roughness:.96});
const gravel=new THREE.MeshStandardMaterial({color:0x8f8576,roughness:.91});

export class DrivingTestArea {
  constructor(scene,physics,network,groundHeight) {
    this.scene=scene;this.physics=physics;this.network=network;
    this.route=network.roads.find(r=>r.id==='provas');
    this.obstacleBodies=[];
    this.samples=[];
    if(!this.route)return;
    this.createMarkers(groundHeight);
    this.createBump(groundHeight);
    this.createObstacles(groundHeight);
    this.paintZones(groundHeight);
  }

  point(u, lateral=0){
    const pts=this.route.points;
    const i=Math.min(pts.length-2,Math.max(1,Math.floor(u*(pts.length-1))));
    const p=pts[i],a=pts[i-1],b=pts[i+1];
    const heading=b.clone().sub(a);heading.y=0;heading.normalize();
    const side=new THREE.Vector3(-heading.z,0,heading.x);
    return {position:p.clone().addScaledVector(side,lateral),
      yaw:Math.atan2(heading.x,heading.z),side};
  }

  createMarkers(groundHeight){
    const marks=[
      [.08,'RETA · ACELERAÇÃO'],
      [.23,'ZONA DE TRAVAGEM'],
      [.37,'CURVAS RÁPIDAS'],
      [.51,'TERRA'],
      [.61,'MOLHADO'],
      [.74,'GRAVILHA'],
      [.91,'OBSTÁCULOS']
    ];
    for(const [u,label] of marks) {
      const sample=this.point(u,this.route.width*.5+2.5);
      const p=sample.position;p.y=groundHeight(p.x,p.z);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.05,.065,3.1,8),steel);
      pole.position.set(p.x,p.y+1.55,p.z);
      const labelCanvas=document.createElement('canvas');
      labelCanvas.width=512;labelCanvas.height=140;
      const ctx=labelCanvas.getContext('2d');
      ctx.fillStyle='#f1d9a4';ctx.fillRect(0,0,512,140);
      ctx.fillStyle='#273544';ctx.fillRect(8,8,496,124);
      ctx.fillStyle='#ffffff';ctx.font='bold 33px sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(label,256,70,480);
      const texture=new THREE.CanvasTexture(labelCanvas);
      texture.colorSpace=THREE.SRGBColorSpace;
      const sign=new THREE.Mesh(new THREE.BoxGeometry(2.8,.8,.08),
        new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
      sign.position.set(p.x,p.y+3,p.z);
      sign.rotation.y=sample.yaw;
      this.scene.add(pole,sign);
      this.samples.push({label,position:p.clone()});
    }
  }

  createBump(groundHeight) {
    const p=this.point(.31);
    const ground=groundHeight(p.position.x,p.position.z)+.23;
    const width=this.route.width*.78;
    const visual=new THREE.Mesh(new THREE.BoxGeometry(width,.13,.67),amber);
    visual.position.set(p.position.x,ground+.065,p.position.z);
    visual.rotation.y=p.yaw;
    visual.receiveShadow=true;
    this.scene.add(visual);
    const body=new CANNON.Body({mass:0});
    body.addShape(new CANNON.Box(new CANNON.Vec3(width/2,.065,.335)));
    body.position.set(p.position.x,ground+.065,p.position.z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),p.yaw);
    this.physics.addBody(body);this.obstacleBodies.push(body);
  }

  createObstacles(groundHeight) {
    // Two physical road edge crates leave a drivable slalom passage.
    for(const [u,side] of [[.87,-1],[.895,1],[.92,-1]]){
      const p=this.point(u,side*this.route.width*.28);
      const y=groundHeight(p.position.x,p.position.z)+.24;
      const visible=new THREE.Mesh(new THREE.BoxGeometry(1,1.15,1),amber);
      visible.position.set(p.position.x,y+.575,p.position.z);
      visible.castShadow=true;visible.receiveShadow=true;
      this.scene.add(visible);
      const body=new CANNON.Body({mass:0});
      body.addShape(new CANNON.Box(new CANNON.Vec3(.5,.575,.5)));
      body.position.set(visible.position.x,visible.position.y,visible.position.z);
      this.physics.addBody(body);this.obstacleBodies.push(body);
    }
  }

  paintZones(groundHeight){
    const patches=[
      [.5,.59,dirt],[.59,.72,wet],[.72,.8,gravel]
    ];
    for(const [start,end,material] of patches){
      const vertices=[],indices=[];
      const points=this.route.points;
      const from=Math.floor(start*(points.length-1));
      const to=Math.ceil(end*(points.length-1));
      for(let i=from;i<=to;i++){
        const p=points[i],prev=points[Math.max(i-1,0)],next=points[Math.min(i+1,points.length-1)];
        const d=next.clone().sub(prev).normalize();
        const s=new THREE.Vector3(-d.z,0,d.x);
        for(const sign of [-1,1]){
          const v=p.clone().addScaledVector(s,sign*this.route.width*.475);
          v.y=roadDeckHeight(groundHeight,v.x,v.z,sign*this.route.width*.475,this.route.width)+.016;
          vertices.push(v.x,v.y,v.z);
        }
        if(i<to){
          const v=(i-from)*2;
          indices.push(v,v+1,v+2,v+1,v+3,v+2);
        }
      }
      const geom=new THREE.BufferGeometry();
      geom.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      geom.setIndex(indices);geom.computeVertexNormals();
      const mesh=new THREE.Mesh(geom,material);
      mesh.receiveShadow=true;mesh.material.side=THREE.DoubleSide;
      this.scene.add(mesh);
    }
  }
}
