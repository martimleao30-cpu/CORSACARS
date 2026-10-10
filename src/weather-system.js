// A continuous weather timeline: no per-frame texture/geometry allocation.
// These values represent visual intensity, not a forecast for real locations.
export const WEATHER_PRESETS=Object.freeze({
  clear:Object.freeze({rain:0,fog:0,clouds:.20,wind:.12}),
  cloudy:Object.freeze({rain:0,fog:.15,clouds:.72,wind:.28}),
  fog:Object.freeze({rain:0,fog:1,clouds:.55,wind:.08}),
  rain:Object.freeze({rain:.78,fog:.30,clouds:.90,wind:.45}),
  storm:Object.freeze({rain:1,fog:.44,clouds:1,wind:.92})
});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const weatherKeys=Object.freeze(Object.keys(WEATHER_PRESETS));
export function weatherTransition(current,target,dt,seconds=15){
  if(!Number.isFinite(dt)||dt<=0)return current;
  const alpha=1-Math.exp(-Math.min(dt,.15)*4.605170186/seconds);
  return current+(target-current)*alpha;
}
export class WeatherSystem{
  constructor(initial='clear'){
    this.selected=WEATHER_PRESETS[initial]?initial:'clear';
    this.target=WEATHER_PRESETS[this.selected];
    this.state={...this.target};
    this.elapsed=0;
  }
  setWeather(name){
    if(!WEATHER_PRESETS[name])return false;
    this.selected=name;this.target=WEATHER_PRESETS[name];
    return true;
  }
  update(dt,paused=false,hour=14){
    if(!paused){
      this.elapsed+=Math.max(0,Math.min(dt,.15));
      for(const key of Object.keys(this.target))
        this.state[key]=weatherTransition(this.state[key],this.target[key],dt,
          key==='rain'?11:key==='fog'?21:27);
    }
    // Ground-hugging mist collects in cool early mornings and overnight.
    const h=((hour%24)+24)%24;
    const morning=(h>=4&&h<=9)?Math.sin((h-4)/5*Math.PI):0;
    const night=h>=21||h<=5?.26:0;
    const valleyMist=clamp(morning*.19+night,0,.29);
    return {...this.state,
      fog:clamp(this.state.fog+valleyMist*(1-this.state.rain*.55),0,1),
      storm:this.state.wind>.73&&this.state.rain>.8};
  }
}
