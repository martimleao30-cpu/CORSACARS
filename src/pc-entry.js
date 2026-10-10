// CORSACARS PC title sequence: a real press-to-continue gate and update center.
// Windows operations use only the existing secure Electron preload API.
// Browsers receive release information, not a misleading installer action.
const RELEASES='https://github.com/martimleao30-cpu/CORSACARS/releases';
const API_RELEASE='https://api.github.com/repos/martimleao30-cpu/CORSACARS/releases/latest';
const $=id=>document.getElementById(id);

export function setupPCEntry(){
  const overlay=$('entryScreen');
  const continueButton=$('entryContinue');
  const checkButton=$('entryCheckUpdate');
  const action=$('entryUpdateAction');
  const version=$('entryUpdateVersion');
  const status=$('entryUpdateStatus');
  const details=$('entryUpdateDetail');
  const native=window.corsacarsDesktop||null;
  if(!overlay||!continueButton||!checkButton||!action)return null;
  let current={state:'idle'},checking=false,busy=false,entered=false,releaseUrl=RELEASES;
  overlay.classList.remove('hidden');
  const set=(title,description)=>{
    status.textContent=title;details.textContent=description;
  };
  const showUpdate=(state={state:'idle'})=>{
    if(!state||typeof state!=='object')return;
    current=state;
    action.hidden=true;action.disabled=false;
    if(native){
      version.textContent=state.version?'INSTALADO · v'+state.version:'EDIÇÃO WINDOWS';
      if(state.state==='available'){
        set('NOVA ATUALIZAÇÃO · v'+state.nextVersion,
          'Nova versão pronta para descarregar sem perder a tua sessão.');
        action.textContent='DESCARREGAR ATUALIZAÇÃO';action.hidden=false;
        overlay.classList.add('entry-has-update');
      }else if(state.state==='downloading'){
        set('A TRANSFERIR · '+Math.round(state.progress||0)+'%',
          'O jogo continua disponível enquanto o download decorre.');
        overlay.classList.add('entry-has-update');
      }else if(state.state==='ready'){
        set('ATUALIZAÇÃO PRONTA · v'+state.nextVersion,
          'Guarda a sessão antes de reiniciar e instalar a versão.');
        action.textContent='REINICIAR E INSTALAR';action.hidden=false;
        overlay.classList.add('entry-has-update');
      }else if(state.state==='checking'){
        set('A VERIFICAR ATUALIZAÇÕES','A contactar o serviço de atualizações.');
      }else if(state.state==='current'){
        overlay.classList.remove('entry-has-update');
        set('JOGO ATUALIZADO','Não existem novas versões disponíveis.');
      }else if(state.state==='error'){
        set('VERIFICAÇÃO INDISPONÍVEL',state.message||'Tenta novamente mais tarde.');
      }else{
        set('ATUALIZAÇÕES AUTOMÁTICAS','Verificação segura de novas versões do jogo.');
      }
    }else{
      version.textContent='EDIÇÃO WEB · SEM INSTALAÇÃO';
    }
  };
  const webCheck=async()=>{
    if(checking)return;
    checking=true;
    set('A VERIFICAR NOVIDADES','A consultar as versões públicas do CORSACARS.');
    checkButton.disabled=true;
    try{
      const response=await fetch(API_RELEASE,{
        headers:{Accept:'application/vnd.github+json'},cache:'no-store',
        signal:AbortSignal.timeout(6500)
      });
      if(!response.ok)throw new Error('Serviço temporariamente indisponível');
      const data=await response.json();
      if(typeof data.tag_name!=='string'||!/^v?\d+\.\d+\.\d+$/.test(data.tag_name))
        throw new Error('Informação de versão inválida');
      releaseUrl=RELEASES+'/tag/'+encodeURIComponent(data.tag_name);
      set('ÚLTIMO LANÇAMENTO · '+data.tag_name,
        'A versão web atualiza-se ao reabrir a página. Consulta as novidades e o instalador Windows.');
      action.textContent='VER NOVIDADES';action.hidden=false;current={state:'web-release'};
    }catch{
      set('SEM LIGAÇÃO ÀS NOVIDADES',
        'Podes continuar a jogar normalmente. Tenta verificar mais tarde.');
      action.textContent='VER LANÇAMENTOS';action.hidden=false;
      current={state:'web-release'};releaseUrl=RELEASES;
    }finally{
      checking=false;checkButton.disabled=false;
    }
  };
  const check=async()=>{
    if(busy)return;
    if(!native)return webCheck();
    try{
      showUpdate({state:'checking',version:current.version});
      showUpdate(await native.checkUpdates());
    }catch{
      showUpdate({state:'error',message:'Não foi possível verificar a ligação.'});
    }
  };
  checkButton.addEventListener('click',()=>{void check();});
  action.addEventListener('click',async()=>{
    if(busy)return;
    if(!native){
      window.open(releaseUrl,'_blank','noopener,noreferrer');
      return;
    }
    busy=true;action.disabled=true;
    try{
      if(current.state==='available')showUpdate(await native.downloadUpdate());
      else if(current.state==='ready'){
        window.dispatchEvent(new Event('corsacars:before-update'));
        await native.installUpdate();
      }
    }catch{
      showUpdate({state:'error',message:'Falha ao iniciar a atualização.'});
    }finally{busy=false;action.disabled=false;}
  });
  const enter=()=>{
    if(entered)return;
    entered=true;
    overlay.classList.add('enter-leaving');
    overlay.classList.add('hidden');
    $('startScreen')?.querySelector('#startButton')?.focus({preventScroll:true});
  };
  continueButton.addEventListener('click',enter);
  // The introductory gate must also work with a PC controller's A / X button.
  // Poll only while visible; the normal menu handles the controller afterwards.
  if(typeof window.requestAnimationFrame==='function'){
    let previousPress=false;
    const pollPad=()=>{
      if(entered)return;
      const pad=navigator.getGamepads?.()?.find(x=>x?.connected&&x.mapping==='standard');
      const pressed=Boolean(pad?.buttons[0]?.pressed);
      if(pressed&&!previousPress){enter();return;}
      previousPress=pressed;
      window.requestAnimationFrame(pollPad);
    };
    window.requestAnimationFrame(pollPad);
  }
  document.addEventListener('keydown',event=>{
    if(entered||!['Enter','Space'].includes(event.code)||event.repeat)return;
    if(event.target?.closest('#entryCheckUpdate,#entryUpdateAction'))return;
    if(event.target===continueButton||event.target===document.body){
      event.preventDefault();enter();
    }
  });
  const listener=(next)=>showUpdate(next);
  let unsubscribe=()=>{};
  if(native){
    unsubscribe=native.onUpdate(listener)||(()=>{});
    void native.version().then(showUpdate).catch(()=>
      showUpdate({state:'error',message:'Estado da versão não disponível.'}));
  }else{
    showUpdate({state:'web'});
    void webCheck();
  }
  return {enter,check,showUpdate,dispose:()=>unsubscribe()};
}
