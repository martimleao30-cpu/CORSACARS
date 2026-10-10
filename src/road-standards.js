// Portuguese-inspired design profiles in metres; not a certification that
// the procedural map satisfies every applicable design/safety regulation.
// Motorway: 3.75 m lanes, 4.0 m central reservation, 3.50 m outer shoulders,
// 1.0 m inner refuge. EN: normally 3.50 m per lane. Lower-order roads use
// narrower project-specific sections; unpaved farm tracks aren't highways.
// References: DL 458/85 (motorway); IMT RevisaoNormaDeTracado III.4.2;
// Infraestruturas de Portugal EN326 project 3.50 m lanes / 2.50 m berms.
export const ROAD_PROFILES=Object.freeze({
  highway:Object.freeze({lanes:4,laneWidth:3.75,median:4,
    pavedWidth:19,outerShoulder:3.5,innerShoulder:1,
    designSpeed:120}),
  national:Object.freeze({lanes:2,laneWidth:3.5,median:0,
    pavedWidth:7,outerShoulder:2.5,innerShoulder:0,designSpeed:80}),
  urban:Object.freeze({lanes:2,laneWidth:3.25,median:0,
    pavedWidth:6.5,outerShoulder:1.25,innerShoulder:0,designSpeed:50}),
  ring:Object.freeze({lanes:4,laneWidth:3.5,median:0,
    pavedWidth:14,outerShoulder:2,innerShoulder:0,designSpeed:70}),
  mountain:Object.freeze({lanes:2,laneWidth:3,median:0,
    pavedWidth:6,outerShoulder:1,innerShoulder:0,designSpeed:60}),
  rural:Object.freeze({lanes:2,laneWidth:3.25,median:0,
    pavedWidth:6.5,outerShoulder:1.5,innerShoulder:0,designSpeed:70}),
  farm:Object.freeze({lanes:1,laneWidth:4,median:0,
    pavedWidth:4,outerShoulder:.8,innerShoulder:0,designSpeed:30}),
  gravel:Object.freeze({lanes:2,laneWidth:3,median:0,
    pavedWidth:6,outerShoulder:1,innerShoulder:0,designSpeed:40}),
  ramp:Object.freeze({lanes:1,laneWidth:3.75,median:0,
    pavedWidth:3.75,outerShoulder:2.5,innerShoulder:0,designSpeed:50}),
  test:Object.freeze({lanes:0,laneWidth:0,median:0,
    pavedWidth:13,outerShoulder:1.5,innerShoulder:0,designSpeed:0})
});
export const PROFILE_FOR_ROAD=Object.freeze({
  circular:'ring',nacional:'national',autoestrada:'highway',
  montanha:'mountain',rural:'rural',gravilha:'gravel',terra:'farm',
  provas:'test','serra-norte':'mountain','planicie-sul':'rural',
  'vale-leste':'rural','campos-oeste':'rural',
  'rua-lateral':'urban','rampa-entrada':'ramp','rampa-saida':'ramp'
});
export function roadProfile(road){
  const key=PROFILE_FOR_ROAD[road?.id]||
    (road?.category==='highway'?'highway':
    road?.category==='highway-ramp'?'ramp':
    road?.category==='urban'?'urban':
    road?.category==='mountain'?'mountain':
    road?.category==='dirt'?'farm':
    road?.category==='test'?'test':'rural');
  return ROAD_PROFILES[key];
}
export function officialRoadWidth(road){
  return roadProfile(road).pavedWidth;
}
export const ROAD_LAMP_SPACING_METRES=34;
