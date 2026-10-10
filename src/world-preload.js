// Move expensive world generation out of driving time and into the loading
// screen. Draw calls are still distance/frustum culled; rendering the entire
// 4.1 km world each frame would destroy FPS and GPU memory bandwidth.
const wait=(promise,milliseconds,label)=>{
  if(!promise||typeof promise.then!=='function')return Promise.resolve();
  if(typeof setTimeout!=='function')return promise;
  let timeout;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{
      timeout=setTimeout(()=>reject(new Error(label+' demorou demasiado tempo')),milliseconds);
    })
  ]).finally(()=>clearTimeout(timeout));
};

export async function preloadDrivingWorld({
  world,renderer,camera,graphicsReady=Promise.resolve(),
  loadAssets=()=>Promise.resolve(),
  onProgress=()=>{},yieldFrame=async()=>{}
}){
  const report=(number,message)=>onProgress(Math.round(number),message);
  report(2,'A PREPARAR O MAPA E AS ESTRADAS');
  await yieldFrame();
  await world.sectors.preloadAll((done,total,name)=>{
    report(7+done/Math.max(1,total)*29,
      'A CONSTRUIR CIDADES E QUINTAS · '+done+'/'+total);
  },yieldFrame);
  report(37,'A PREPARAR A FLORESTA COMPLETA');
  await world.forest.preloadAllLods((done,total)=>{
    report(37+done/Math.max(1,total)*43,
      'A PREPARAR ÁRVORES E NÍVEIS DE DETALHE · '+done+'/'+total);
  },yieldFrame);
  // Populate nearby grass and all initial visibility states BEFORE the first
  // playable frame; dynamic wind and animals will start after the main menu.
  world.understory?.updateLocalGrass(camera.position);
  world.updateForest(camera,.2,true);
  report(82,'A INICIALIZAR OS EFEITOS GRÁFICOS');
  await yieldFrame();
  try {
    await wait(graphicsReady,14000,'Os efeitos gráficos');
  } catch(error) {
    console.warn('[CORSACARS] Preparação dos efeitos adiada:',error);
  }
  report(88,'A CARREGAR TEXTURAS E ILUMINAÇÃO');
  try {
    await wait(loadAssets(),18000,'As texturas externas');
  } catch(error) {
    // The offline car and procedural road textures remain fully playable.
    console.warn('[CORSACARS] Recursos opcionais indisponíveis:',error);
  }
  report(95,'A PREPARAR OS SHADERS E O WEBGL');
  await yieldFrame();
  try {
    if(typeof renderer.compileAsync==='function')
      await wait(renderer.compileAsync(world.scene,camera),16000,'Os shaders');
    else if(typeof renderer.compile==='function')
      renderer.compile(world.scene,camera);
  } catch(error){
    // On restricted software WebGL, the normal first render is the fallback.
    console.warn('[CORSACARS] Compilação antecipada limitada:',error);
  }
  report(100,'MUNDO PREPARADO · BOA VIAGEM');
  return {regions:world.sectors.active.size,
    forestChunks:world.forest.chunks.size};
}
