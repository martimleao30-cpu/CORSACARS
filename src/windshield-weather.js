// A transparent glass-only Canvas2D pass. No external image assets, no
// per-frame texture downloads, no interception of keyboard/mouse input.
export class WindshieldWeather{
  constructor(parent=document.body,count=105){
    this.canvas=document.createElement('canvas');
    this.canvas.id='windshieldWeather';
    this.canvas.setAttribute('aria-hidden','true');
    Object.assign(this.canvas.style,{
      position:'fixed',inset:'0',width:'100%',height:'100%',
      pointerEvents:'none',zIndex:'3',display:'none'
    });
    parent.appendChild(this.canvas);
    this.ctx=this.canvas.getContext('2d',{alpha:true});
    this.time=0;this.accumulator=0;this.intensity=0;
    this.randomSeed=190713;
    this.drops=Array.from({length:count},()=>this.spawn(true));
    this.wiperProgress=0;
  }
  random(){
    this.randomSeed=(Math.imul(this.randomSeed,1664525)+1013904223)>>>0;
    return this.randomSeed/4294967296;
  }
  spawn(initial=false){
    return {x:this.random(),y:initial?this.random():-this.random()*.13,
      radius:1.2+this.random()*2.7,
      velocity:.15+this.random()*.31,
      trail:this.random()*.35,phase:this.random()*Math.PI*2};
  }
  resize(){
    const dpr=Math.min(2,typeof devicePixelRatio==='number'?devicePixelRatio:1);
    const w=Math.max(1,Math.round(innerWidth*dpr));
    const h=Math.max(1,Math.round(innerHeight*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){
      this.canvas.width=w;this.canvas.height=h;
    }
    return {w,h,dpr};
  }
  update(dt,{rain=0,wind=0}={},speedKmh=0,cameraMode=0,playing=true){
    this.intensity=Math.max(0,Math.min(1,rain));
    const visible=playing&&cameraMode===2&&this.intensity>.06;
    this.canvas.style.display=visible?'block':'none';
    if(!visible)return;
    const delta=Math.max(0,Math.min(.12,dt));
    this.time+=delta;
    this.accumulator+=delta;
    // Heavy droplets at 30 Hz, independent of the GPU render framerate.
    if(this.accumulator<1/30)return;
    const step=Math.min(this.accumulator,.12);
    this.accumulator=0;
    this.paint(step,Math.max(0,speedKmh),wind);
  }
  paint(dt,speedKmh,wind){
    const ctx=this.ctx;if(!ctx)return;
    const {w,h,dpr}=this.resize();
    ctx.clearRect(0,0,w,h);
    const active=Math.round(this.drops.length*this.intensity);
    const airflow=Math.min(2.5,speedKmh/115);
    const tilt=Math.min(.7,wind*.3+airflow*.12);
    for(let i=0;i<active;i++){
      const drop=this.drops[i];
      drop.y+=(drop.velocity+airflow*.28)*dt;
      drop.x+=tilt*dt*.07;
      if(drop.y>1.05||drop.x>1.1)this.drops[i]=this.spawn(false);
      const x=drop.x*w,y=drop.y*h,r=drop.radius*dpr;
      ctx.beginPath();
      ctx.ellipse(x,y,r*.72,r*(1.2+airflow*.46),tilt,0,Math.PI*2);
      ctx.fillStyle='rgba(196,220,238,.22)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x,y);
      ctx.lineTo(x-tilt*8*dpr,y-r*(2+drop.trail*6));
      ctx.strokeStyle='rgba(172,203,224,.16)';
      ctx.lineWidth=Math.max(.6,dpr*.65);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x-r*.18,y-r*.35,Math.max(.45,r*.20),Math.max(.45,r*.23),0,0,Math.PI*2);
      ctx.fillStyle='rgba(251,254,255,.32)';
      ctx.fill();
    }
    // Automated intermittent wipe across the interior windscreen; no dark
    // opaque sweep or fullscreen blurring that would spoil the cockpit.
    const cycle=(this.time%3.1)/3.1;
    if(cycle<.37){
      const sweep=cycle/.37;
      ctx.save();
      ctx.globalCompositeOperation='destination-out';
      ctx.translate(w*.56,h*.93);
      ctx.rotate(-.98+sweep*1.92);
      ctx.beginPath();
      ctx.ellipse(0,-h*.47,w*.43,h*.44,0,0,Math.PI*2);
      ctx.fillStyle='rgba(0,0,0,.75)';
      ctx.fill();
      ctx.restore();
    }
  }
  dispose(){
    this.canvas.remove();
    this.drops.length=0;
  }
}
