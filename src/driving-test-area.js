import * as THREE from 'three';

const steel=new THREE.MeshStandardMaterial({color:0x6d777e,metalness:.78,roughness:.36});

export class DrivingTestArea {
  constructor(scene,physics,network,groundHeight) {
    this.scene=scene;this.physics=physics;this.network=network;
    this.route=network.roads.find(r=>r.id==='provas');
    this.obstacleBodies=[];
    this.samples=[];
    if(!this.route)return;
    this.createMarkers(groundHeight);
    // Keep the test-zone road grip and signposts, but remove yellow cubes,
    // raised blocks and abrupt painted full-width overlays from the road.
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

}
