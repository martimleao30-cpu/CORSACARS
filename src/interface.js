import {NavigationHUD} from './gps-navigation.js';
const $ = id => document.getElementById(id);
const HUD_KEY = 'corsacars.hud.v2';
const PROFILES_KEY = 'corsacars.hud.profiles.v1';
const pages = ['startScreen','pauseScreen','settingsScreen','garageScreen',
  'hudEditorScreen','mapScreen','creditsScreen'];
const validStyle = ['glass','digital','analog','racing','minimal','custom'];
const defaultHud = {
  style:'glass',unit:'kmh',color:'#eab56e',scale:1,opacity:0.34,
  showRpm:true,showGear:true,background:true,animations:true,
  posX:null,posY:null
};
function fromStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key,JSON.stringify(value)); } catch {}
}
function safeColor(hex) { return /^#[\da-f]{6}$/i.test(hex) ? hex : defaultHud.color; }
function cleanHud(src) {
  const a={...defaultHud,...(src||{})};
  a.style=validStyle.includes(a.style)?a.style:'glass';
  a.unit=a.unit==='mph'?'mph':'kmh';
  a.scale=Math.min(1.6,Math.max(0.6,Number(a.scale)||1));
  a.opacity=Math.min(1,Math.max(0,Number(a.opacity)??0.82));
  a.color=safeColor(a.color);
  for(const k of ['showRpm','showGear','background','animations']) a[k]=a[k]!==false;
  a.posX=Number.isFinite(a.posX)?Math.min(1,Math.max(0,a.posX)):null;
  a.posY=Number.isFinite(a.posY)?Math.min(1,Math.max(0,a.posY)):null;
  return a;
}

export class PremiumInterface {
  constructor(api) {
    this.api=api;
    this.prefs=cleanHud(fromStorage(HUD_KEY,defaultHud));
    this.draft={...this.prefs};
    this.profiles=fromStorage(PROFILES_KEY,{});
    this.editorOpen=false;
    this.lastGear=null;
    this.shiftTimer=null;
    this.gamepadNavigation=0;
    this.previousPad={accept:false,back:false};
    this.menuAudio=null;
    this.buildPages();
    this.buildSettingsTabs();
    this.createHud();
    this.navigation=new NavigationHUD($('gpsCanvas'),
      this.api.world.network,this.api.world.sectors.regions,$('gpsStatus'));
    this.bindPages();
    this.setHud(this.prefs);
    this.bindDragging();
    document.addEventListener('click',e=>{
      if(e.target.closest('.screen button')) this.playMenuSound();
    });
  }

  playMenuSound() {
    if(!this.api.settings.sound)return;
    try {
      if(!this.menuAudio){
        const AudioContext=window.AudioContext||window.webkitAudioContext;
        if(!AudioContext)return;
        this.menuAudio=new AudioContext();
      }
      const ctx=this.menuAudio;
      if(ctx.state==='suspended')void ctx.resume();
      const oscillator=ctx.createOscillator();
      const gain=ctx.createGain();
      oscillator.type='sine';oscillator.frequency.setValueAtTime(540,ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(410,ctx.currentTime+.095);
      const volume=(this.api.settings.engineVolume??.7)*.016;
      gain.gain.setValueAtTime(volume,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.105);
      oscillator.connect(gain);gain.connect(ctx.destination);
      oscillator.start();oscillator.stop(ctx.currentTime+.11);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }catch{}
  }

    buildPages() {
    const start=$('startScreen').querySelector('.button-stack');
    $('startButton').innerHTML='JOGAR <span>↗</span>';
    start.insertAdjacentHTML('beforeend',`
      <button class="outline" id="garageStart">GARAGEM <span>◉</span></button>
      <button class="outline" id="hudStart">PERSONALIZAR HUD <span>◈</span></button>
      <button class="outline" id="creditsStart">CRÉDITOS <span>©</span></button>
      <button class="outline" id="exitStart">SAIR <span>×</span></button>`);
    const pause=$('pauseScreen').querySelector('.panel');
    $('resumeButton').insertAdjacentHTML('afterend',`
      <button class="outline" id="mapPause">MAPA <span>⌖</span></button>
      <button class="outline" id="testTrackPause">PISTA DE TESTES <span>⚑</span></button>
      <button class="outline" id="garagePause">GARAGEM <span>◉</span></button>
      <button class="outline" id="hudPause">PERSONALIZAR HUD <span>◈</span></button>`);
    document.body.insertAdjacentHTML('beforeend',`
      <section id="garageScreen" class="screen hidden" aria-label="Garagem">
        <div class="darken"></div><div class="panel premium-panel">
          <div class="eyebrow">CORSACARS / GARAGEM</div><h2>GARAGEM<span>.</span></h2>
          <span class="tag">2 VEÍCULOS DISPONÍVEIS</span>
          <label>VEÍCULO <select id="garageModel">
            <option value="coupe">Concept Coupé · protótipo</option>
            <option value="m4">BMW M4 Competition M xDrive · 2025</option>
          </select></label>
          <p class="secondary-info" id="garageDescription">Concept Coupé — veículo de testes com tração traseira.</p>
          <div class="vehicle-info">
            <div><small>MASSA SIMULADA</small><strong id="garageMass">1370 kg</strong></div>
            <div><small>BINÁRIO DE REFERÊNCIA</small><strong id="garageTorque">345 Nm</strong></div>
            <div><small>TRAÇÃO</small><strong id="garageDrive">RWD</strong></div>
            <div><small>CAIXA</small><strong id="garageGears">6 relações</strong></div>
            <div><small>VELOCIDADE MÁXIMA</small><strong id="garageVmax">—</strong></div>
            <div><small>0–100 KM/H OFICIAL</small><strong id="garageSprint">—</strong></div>
          </div>
          <label>Cor da carroçaria <input id="garagePaint" type="color" value="#29445d"></label>
          <p class="minor">O M4 usa uma carroçaria 3D criada para o jogo, não um modelo oficial BMW. Os valores de desempenho são referências; a aceleração real no jogo depende da física.</p>
          <button class="primary" id="garageSelect">USAR ESTE CARRO <span>✓</span></button>
          <button class="outline ui-back" data-ui-back>VOLTAR <span>←</span></button>
        </div>
      </section>

      <section id="hudEditorScreen" class="screen hidden" aria-label="Editor do velocímetro">
        <div class="darken"></div><div class="panel premium-panel">
          <div class="eyebrow">CORSACARS / ESTÚDIO HUD</div><h2>VELOCÍMETRO<span>.</span></h2>
          <p class="secondary-info">Pré-visualização no ecrã. Arrasta o velocímetro com o rato para definir a posição, ou escolhe um canto.</p>
          <div class="option-grid">
            <label>Estilo
              <select id="hudStyle">
                <option value="glass">Vidro e cobre (transparente)</option>
                <option value="digital">Digital moderno</option>
                <option value="analog">Analógico desportivo</option>
                <option value="racing">Racing</option>
                <option value="minimal">Minimalista</option>
                <option value="custom">Personalizado</option>
              </select>
            </label>
            <label>Unidade
              <select id="hudUnit"><option value="kmh">km/h</option><option value="mph">mph</option></select>
            </label>
            <label>Cor de destaque <input id="hudColor" type="color" value="#c9f173"></label>
            <label>Posição
              <select id="hudPosition">
                <option value="default">Canto inferior direito</option>
                <option value="left">Canto inferior esquerdo</option>
                <option value="topRight">Canto superior direito</option>
                <option value="custom">Posição arrastada</option>
              </select>
            </label>
            <label>Tamanho <input id="hudScale" type="range" min="0.6" max="1.6" step="0.05" value="1"></label>
            <label>Opacidade <input id="hudOpacity" type="range" min="0" max="1" step="0.05" value="0.82"></label>
            <label class="check"><input type="checkbox" id="hudRpm" checked> Mostrar RPM</label>
            <label class="check"><input type="checkbox" id="hudGear" checked> Mostrar mudança</label>
            <label class="check"><input type="checkbox" id="hudBg" checked> Fundo do painel</label>
            <label class="check"><input type="checkbox" id="hudMotion" checked> Animações</label>
          </div>
          <div class="button-row">
            <select id="hudProfile" aria-label="Perfil do velocímetro">
              <option value="1">Perfil 1</option><option value="2">Perfil 2</option><option value="3">Perfil 3</option>
            </select>
            <button class="outline" id="profileSave">GUARDAR PERFIL</button>
            <button class="outline" id="profileLoad">CARREGAR PERFIL</button>
          </div>
          <div class="button-row">
            <button class="outline" id="hudReset">REPOR</button>
            <button class="outline" id="hudCancel">CANCELAR</button>
            <button class="primary" id="hudApply">APLICAR <span>✓</span></button>
          </div>
        </div>
      </section>

      <section id="mapScreen" class="screen hidden" aria-label="Mapa do mundo">
        <div class="darken"></div><div class="panel premium-panel">
          <div class="eyebrow">CORSACARS / NAVEGAÇÃO</div><h2>MAPA<span>.</span></h2>
          <p class="secondary-info">Escolhe um destino para ativar o GPS transparente com rota azul-turquesa e orientação em tempo real.</p>
          <label>DESTINO DO GPS <select id="gpsDestination" aria-label="Escolher destino"><option value="">Exploração livre</option></select></label>
          <div class="button-row"><button class="primary" id="gpsGo">INICIAR ROTA <span>↗</span></button><button class="outline" id="gpsClear">LIMPAR</button></div>
          <canvas id="roadMap" width="480" height="400" style="width:100%;height:auto;background:#13232a;border:1px solid rgba(255,255,255,.2)" aria-label="Mapa do circuito"></canvas>
          <button class="outline ui-back" data-ui-back>VOLTAR <span>←</span></button>
        </div>
      </section>

      <section id="creditsScreen" class="screen hidden" aria-label="Créditos">
        <div class="darken"></div><div class="panel premium-panel">
          <div class="eyebrow">CORSACARS / SOBRE</div><h2>CRÉDITOS<span>.</span></h2>
          <p class="secondary-info">CORSACARS: jogo de condução original para navegador, desenvolvido com Three.js e cannon-es.</p>
          <p class="secondary-info">Modelo de veículo: <strong>Car Concept</strong>, Khronos glTF Sample Assets, atribuição CC BY 4.0. Asfalto e HDRI: Poly Haven, CC0. Atribuições e ligações completas no ficheiro CREDITS.md do repositório.</p>
          <button class="outline ui-back" data-ui-back>VOLTAR <span>←</span></button>
        </div>
      </section>`);
    const dial=document.querySelector('.speed-dial');
    dial.insertAdjacentHTML('afterbegin',`<div class="analog-needle" id="analogNeedle"></div>
      <div class="racing-lights" id="racingLights">${Array.from({length:10},()=>'<i></i>').join('')}</div>
      <span class="handbrake" id="handbrakeIndicator" hidden>TRAVÃO MÃO</span>`);
    dial.querySelector('.dial-footer #rpmValue')?.classList.add('rpm-reading');
  }

  buildSettingsTabs() {
    const panel=$('settingsScreen').querySelector('.settings-panel');
    const header=panel.querySelector('h2');
    header.insertAdjacentHTML('afterend',`<nav id="settingsTabs" class="tab-nav" aria-label="Secções">
      <button type="button" data-tab="graphics" aria-selected="true">GRÁFICOS</button>
      <button type="button" data-tab="audio" aria-selected="false">ÁUDIO</button>
      <button type="button" data-tab="controls" aria-selected="false">CONTROLOS</button>
      <button type="button" data-tab="interface" aria-selected="false">INTERFACE</button>
    </nav>`);
    const area=document.createElement('div');area.id='settingsViews';
    area.innerHTML=`<div class="tab-view" data-view="graphics"></div>
      <div class="tab-view" data-view="audio" hidden></div>
      <div class="tab-view" data-view="controls" hidden></div>
      <div class="tab-view" data-view="interface" hidden></div>`;
    const back=$('settingsBack');
    back.before(area);
    const graphics=area.querySelector('[data-view="graphics"]');
    const audio=area.querySelector('[data-view="audio"]');
    const controls=area.querySelector('[data-view="controls"]');
    const visual=area.querySelector('[data-view="interface"]');
    for(const id of ['qualitySelect','fpsSelect','aoToggle','reflectionToggle',
      'modelToggle','autoQualityToggle','weatherSelect','timeRange']) {
      graphics.append($(id).closest('label'));
    }
    graphics.append($('fullscreenButton'),panel.querySelector('.settings-tip'));
    audio.append($('soundToggle').closest('label'));
    const mk=(id,label,html)=>`<label>${label} ${html.replace('%%',id)}</label>`;
    graphics.insertAdjacentHTML('beforeend',`
      <div class="option-grid">
        ${mk('renderScale','ESCALA DE RESOLUÇÃO (RENDERIZAÇÃO)', '<select id="%%"><option value="0.6">60%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.15">115%</option></select>')}
        ${mk('antiAlias','ANTI-ALIASING', '<select id="%%"><option value="native">MSAA nativo</option><option value="fxaa">FXAA</option><option value="taa">TAA experimental</option></select>')}
        ${mk('shadowQuality','SOMBRAS', '<select id="%%"><option value="off">Desligadas</option><option value="low">Baixo</option><option value="medium">Médio</option><option value="high">Alto</option></select>')}
        ${mk('drawDistance','DISTÂNCIA DE RENDERIZAÇÃO', '<select id="%%"><option value="500">500 m</option><option value="950">950 m</option><option value="1500">1500 m</option><option value="1900">1900 m</option></select>')}
        ${mk('vegetation','DENSIDADE DE VEGETAÇÃO', '<select id="%%"><option value="0.3">30%</option><option value="0.6">60%</option><option value="1">100%</option></select>')}
        ${mk('textureQuality','QUALIDADE DE TEXTURAS NOVAS', '<select id="%%"><option value="low">1K</option><option value="high">2K</option></select>')}
        ${mk('bloom','BLOOM', '<select id="%%"><option value="off">Desligado</option><option value="low">Discreto</option><option value="medium">Médio</option></select>')}
        ${mk('displayMode','MODO DE ECRÃ', '<select id="%%"><option value="windowed">Janela</option><option value="fullscreen">Ecrã inteiro (navegador)</option></select>')}
      </div>
      <p class="minor">V-Sync é gerido pelo navegador. Ray tracing e DLSS/FSR não estão disponíveis neste motor WebGL; a escala de resolução é um ajuste real da renderização interna, não DLSS. Motion Blur e DOF ficam desativados nesta versão para preservar legibilidade e FPS.</p>`);
    audio.insertAdjacentHTML('beforeend',`
      <label>VOLUME GERAL DO MOTOR <input type="range" id="engineVolume" min="0" max="1" step=".05" value=".7"></label>
      <p class="minor">Áudio implementado: motor sintetizado. Pneus, música e efeitos ainda não possuem fontes sonoras próprias; não são apresentados controlos falsos.</p>`);
    controls.insertAdjacentHTML('beforeend',`
      <label>SENSIBILIDADE DA DIREÇÃO <input type="range" id="steeringSensitivity" min=".5" max="1.6" step=".1" value="1"></label>
      <label>ZONA MORTA DO ANALÓGICO <input type="range" id="gamepadDeadzone" min=".05" max=".4" step=".01" value=".12"></label>
      <p class="secondary-info">W/S: acelerar/travar · A/D: virar · Espaço: travão de mão · C: câmara · ESC: pausa. O remapeamento completo fica reservado para um sistema de Input Actions. Navegação nos menus: TAB, Enter, setas/D-Pad e A/Cruz no comando.</p>
      <div id="keyBindingGrid" class="option-grid">
        <button class="outline" data-bind="accelerate">ACELERAR: W</button>
        <button class="outline" data-bind="brake">TRAVAR: S</button>
        <button class="outline" data-bind="left">ESQUERDA: A</button>
        <button class="outline" data-bind="right">DIREITA: D</button>
        <button class="outline" data-bind="handbrake">TRAVÃO MÃO: ESPAÇO</button>
        <button class="outline" data-bind="camera">CÂMARA: C</button>
      </div>
      <p class="minor">Clica num botão para escolher outra tecla. ESC cancela. Atalhos de menus e caixa de velocidades ficam reservados.</p>
      <button id="bindingsReset" class="outline">REPOR TECLAS <span>↻</span></button>
      <button id="controlsReset" class="outline">REPOR SENSIBILIDADE <span>↻</span></button>
      <label>TIPO DE PNEUS
        <select id="tyreCompound"><option value="road">Estrada</option>
        <option value="sport">Desportivos</option><option value="track">Pista</option></select>
      </label>
      <label>LINEARIDADE DO ANALÓGICO
        <input id="analogCurve" type="range" min=".6" max="2.2" step=".1" value="1">
      </label>
      <label class="check"><input id="invertSteering" type="checkbox"> INVERTER EIXO DA DIREÇÃO</label>
      <label class="check"><input id="absEnabled" type="checkbox" checked> ABS (travagem antibloqueio)</label>
      <label class="check"><input id="tcsEnabled" type="checkbox" checked> TCS (controlo de tração)</label>
      <label class="check"><input id="escEnabled" type="checkbox" checked> ESC (controlo de estabilidade)</label>
      <label>CAIXA DE VELOCIDADES
        <select id="gearboxMode"><option value="auto">Automática</option><option value="manual">Manual / sequencial</option></select>
      </label>
      <p class="minor">F3: diagnóstico físico. M: alternar caixa. Q/E: reduzir/subir mudanças. No modo manual, N e R são relações reais. As assistências modificam os travões, a força motriz e o contacto dos pneus.</p>`);
    visual.insertAdjacentHTML('beforeend',`
      <label>COR PRINCIPAL DOS MENUS <input type="color" id="menuAccent" value="#c9f173"></label>
      <label>TAMANHO DO HUD <input type="range" id="hudQuickScale" min=".6" max="1.6" step=".05" value="1"></label>
      <button id="settingsHudEditor" class="outline">ABRIR EDITOR DE VELOCÍMETRO <span>↗</span></button>
      <p class="minor">O idioma desta versão é português de Portugal.</p>`);
    for(const tab of $('settingsTabs').querySelectorAll('button')) {
      tab.addEventListener('click',()=>{
        for(const button of $('settingsTabs').querySelectorAll('button')) {
          button.setAttribute('aria-selected',String(button===tab));
        }
        for(const view of area.querySelectorAll('.tab-view')) {
          view.hidden=view.dataset.view!==tab.dataset.tab;
        }
      });
    }
  }

  bindPages() {
    for(const [id,page] of [
      ['garageStart','garageScreen'],['garagePause','garageScreen'],
      ['hudStart','hudEditorScreen'],['hudPause','hudEditorScreen'],
      ['creditsStart','creditsScreen'],['mapPause','mapScreen'],
      ['settingsHudEditor','hudEditorScreen']
    ]) {
      $(id).addEventListener('click',()=>this.open(page));
    }
    for(const button of document.querySelectorAll('[data-ui-back]')) {
      button.addEventListener('click',()=>this.back());
    }
    $('exitStart').addEventListener('click',()=>{
      this.api.toast('Num navegador, fecha o separador para sair. O progresso local mantém-se.');
    });
    $('testTrackPause').addEventListener('click',()=>this.api.teleportToTests());
    for(const region of this.api.world.sectors.regions)
      $('gpsDestination').add(new Option(region.name,region.id));
    $('gpsGo').addEventListener('click',()=>{
      const id=$('gpsDestination').value;
      if(this.navigation.setDestination(id)){
        $('gpsReference').classList.add('hidden');
        this.api.toast('GPS ATIVO · '+this.navigation.destination.name.toUpperCase());
        this.back();
      }else this.api.toast('ESCOLHE UM DESTINO NO MAPA');
    });
    $('gpsClear').addEventListener('click',()=>{
      $('gpsDestination').value='';
      this.navigation.setDestination(null);
      $('gpsReference').classList.remove('hidden');
      this.api.toast('GPS · EXPLORAÇÃO LIVRE');
      this.drawMap();
    });
    $('garageModel').addEventListener('change',()=>this.updateGarage());
    $('garageSelect').addEventListener('click',()=>{
      const id=$('garageModel').value;
      if(!this.api.vehicle.setCarModel(id))return;
      this.api.settings.selectedVehicle=id;
      this.api.vehicle.setPaintColor(this.api.settings.paint||'#29445d');
      this.api.persistSettings();
      this.api.toast(id==='m4'?'BMW M4 COMPETITION · 530 CV · AWD':'CONCEPT COUPÉ SELECIONADO');
      this.back();
    });
    $('garagePaint').addEventListener('input',e=>{
      this.api.vehicle.setPaintColor(e.target.value);
      this.api.settings.paint=e.target.value;
      this.api.persistSettings();
    });
    for(const id of ['hudStyle','hudUnit','hudColor','hudScale','hudOpacity','hudPosition',
      'hudRpm','hudGear','hudBg','hudMotion']) {
      $(id).addEventListener('input',()=>this.updateDraft());
    }
    $('hudApply').addEventListener('click',()=>{
      this.prefs=cleanHud(this.draft);save(HUD_KEY,this.prefs);
      this.editorOpen=false;this.back();
    });
    $('hudCancel').addEventListener('click',()=>this.cancelEditor());
    $('hudReset').addEventListener('click',()=>{
      this.draft={...defaultHud};this.writeEditor();this.setHud(this.draft);
    });
    $('profileSave').addEventListener('click',()=>{
      this.profiles[$('hudProfile').value]=cleanHud(this.draft);
      save(PROFILES_KEY,this.profiles);
      this.api.toast('PERFIL DO HUD GUARDADO');
    });
    $('profileLoad').addEventListener('click',()=>{
      const profile=this.profiles[$('hudProfile').value];
      if(!profile) {this.api.toast('PERFIL AINDA NÃO EXISTE');return;}
      this.draft=cleanHud(profile);this.writeEditor();this.setHud(this.draft);
    });
    this.bindGraphicsSettings();
    this.bindPhysicsSettings();
    this.bindKeyBindings();
  }

  bindPhysicsSettings() {
    const cfg=this.api.settings,vehicle=this.api.vehicle;
    const defaults={tyreCompound:'road',analogCurve:1,invertSteering:false,
      absEnabled:true,tcsEnabled:true,escEnabled:true,gearboxMode:'auto'};
    for(const [key,value] of Object.entries(defaults)){
      if(cfg[key]===undefined)cfg[key]=value;
      const element=$(key);
      if(!element)continue;
      if(element.type==='checkbox')element.checked=cfg[key]!==false;
      else element.value=String(cfg[key]);
      element.addEventListener('change',()=>{
        cfg[key]=element.type==='checkbox'?element.checked :
          element.type==='range'?Number(element.value):element.value;
        vehicle.setTyreCompound(cfg.tyreCompound);
        vehicle.setAssists({
          abs:cfg.absEnabled,tcs:cfg.tcsEnabled,esc:cfg.escEnabled
        });
        vehicle.manual=cfg.gearboxMode==='manual';
        if(!vehicle.manual){vehicle.gear=Math.max(1,vehicle.gear);vehicle.reverse=false;}
        this.api.persistSettings();
        this.api.toast('CONFIGURAÇÃO DE FÍSICA GUARDADA');
      });
    }
  }

  bindGraphicsSettings() {
    const cfg=this.api.settings;
    const defaults={
      renderScale:1,antiAlias:'native',shadowQuality:'high',
      drawDistance:1500,vegetation:1,textureQuality:'low',bloom:'low',
      displayMode:'windowed',engineVolume:.7,steeringSensitivity:1,
      gamepadDeadzone:.12,menuAccent:'#c9f173'
    };
    for(const [key,value] of Object.entries(defaults)) {
      if(cfg[key]===undefined) cfg[key]=value;
      const element=$(key);
      element.value=String(cfg[key]);
      element.addEventListener('input',async()=>{
        cfg[key]=element.type==='range'||['renderScale','drawDistance','vegetation'].includes(key)
          ? Number(element.value) : element.value;
        this.api.persistSettings();
        if(key==='displayMode'){
          try {
            if(cfg[key]==='fullscreen' && !document.fullscreenElement)
              await document.documentElement.requestFullscreen();
            if(cfg[key]==='windowed'&&document.fullscreenElement)
              await document.exitFullscreen();
          }catch{this.api.toast('O navegador recusou o modo pedido.');}
        }
        if(key==='menuAccent') document.documentElement.style.setProperty('--accent',safeColor(element.value));
        if(key==='textureQuality') this.api.reloadTextures?.(cfg[key]);
        if(['renderScale','antiAlias','shadowQuality','drawDistance','vegetation','bloom']
            .includes(key)) this.api.applyQuality();
      });
    }
    document.documentElement.style.setProperty('--accent',safeColor(cfg.menuAccent));
    $('hudQuickScale').value=String(this.prefs.scale);
    $('hudQuickScale').addEventListener('input',e=>{
      this.prefs.scale=Number(e.target.value);save(HUD_KEY,this.prefs);this.setHud(this.prefs);
    });
    $('controlsReset').addEventListener('click',()=>{
      cfg.steeringSensitivity=1;cfg.gamepadDeadzone=.12;
      $('steeringSensitivity').value='1';$('gamepadDeadzone').value='.12';
      this.api.persistSettings();
    });
    document.addEventListener('fullscreenchange',()=>{
      $('displayMode').value=document.fullscreenElement?'fullscreen':'windowed';
    });
  }

  updateGarage(){
    const m4=$('garageModel').value==='m4';
    $('garageDescription').textContent=m4?
      'BMW M4 Competition M xDrive 2025 · seis cilindros 3.0 biturbo, 530 cv, 650 Nm, M Steptronic 8 e AWD.':
      'Concept Coupé · protótipo de testes com seis relações e tração traseira.';
    $('garageMass').textContent=m4?'1850 kg':'1370 kg';
    $('garageTorque').textContent=m4?'650 Nm':'345 Nm';
    $('garageDrive').textContent=m4?'AWD':'RWD';
    $('garageGears').textContent=m4?'8 relações':'6 relações';
    $('garageVmax').textContent=m4?'250 km/h':'Sem limitador';
    $('garageSprint').textContent=m4?'3,5 s (BMW)':'Não divulgado';
  }

  open(page) {
    this.api.showPanel(page);
    if(page==='hudEditorScreen'){
      this.editorOpen=true;
      this.draft={...this.prefs};this.writeEditor();this.setHud(this.draft);
      this.api.showHud(true);
      document.querySelector('.speed-dial').classList.add('drag-ready');
      $('hud').classList.add('editing');
    }
    if(page==='garageScreen'){
      $('garagePaint').value=this.api.settings.paint||'#29445d';
      $('garageModel').value=this.api.vehicle.specId;
      this.updateGarage();
    }
    if(page==='mapScreen'){
      $('gpsDestination').value=this.navigation.destinationId||'';
      this.drawMap();
    }
    $(page).querySelector('button,select,input')?.focus();
  }

  back() {
    if(this.editorOpen){
      this.editorOpen=false;this.setHud(this.prefs);
      document.querySelector('.speed-dial').classList.remove('drag-ready');
      $('hud').classList.remove('editing');
    }
    this.api.backPanel();
    $('hudQuickScale').value=String(this.prefs.scale);
  }

  cancelEditor() {
    this.draft={...this.prefs};
    this.back();
  }

  handleEscape() {
    if(this.editorOpen){this.cancelEditor();return true;}
    if(['garageScreen','mapScreen','creditsScreen'].some(id=>!$(id).classList.contains('hidden'))){
      this.back();return true;
    }
    return false;
  }

  writeEditor() {
    const p=this.draft;
    for(const [id,key] of [['hudStyle','style'],['hudUnit','unit'],['hudColor','color'],
      ['hudScale','scale'],['hudOpacity','opacity']]) $(id).value=String(p[key]);
    $('hudPosition').value=p.posX===null?'default':'custom';
    for(const [id,key] of [['hudRpm','showRpm'],['hudGear','showGear'],
      ['hudBg','background'],['hudMotion','animations']]) $(id).checked=p[key];
  }

  updateDraft(){
    const p=this.draft;
    p.style=$('hudStyle').value;p.unit=$('hudUnit').value;
    p.color=$('hudColor').value;p.scale=Number($('hudScale').value);
    p.opacity=Number($('hudOpacity').value);
    p.showRpm=$('hudRpm').checked;p.showGear=$('hudGear').checked;
    p.background=$('hudBg').checked;p.animations=$('hudMotion').checked;
    const position=$('hudPosition').value;
    if(position==='default'){p.posX=p.posY=null;}
    if(position==='left'){p.posX=.02;p.posY=.66;}
    if(position==='topRight'){p.posX=.70;p.posY=.08;}
    this.setHud(p);
  }

  bindKeyBindings() {
    const cfg=this.api.settings;
    const defaults={
      accelerate:'w',brake:'s',left:'a',right:'d',handbrake:' ',camera:'c'
    };
    cfg.bindings={...defaults,...(cfg.bindings||{})};
    const names={
      accelerate:'ACELERAR',brake:'TRAVAR',left:'ESQUERDA',
      right:'DIREITA',handbrake:'TRAVÃO MÃO',camera:'CÂMARA'
    };
    let recording=null;
    const display=k=>k===' '?'ESPAÇO':k.toUpperCase();
    const refresh=()=>{
      for(const button of document.querySelectorAll('[data-bind]')){
        const k=button.dataset.bind;
        button.textContent=names[k]+': '+display(cfg.bindings[k]);
      }
      const hintElements=$('hud').querySelectorAll('.hud-hints span');
      const entries=[
        ['accelerate','ACELERAR'],['brake','TRAVAR'],
        ['left','VIRAR'],['camera','CÂMARA'],['handbrake','TRAVÃO MÃO']
      ];
      entries.forEach(([key,label],i)=>{
        if(!hintElements[i])return;
        hintElements[i].innerHTML='<kbd>'+display(cfg.bindings[key])+'</kbd> '+label;
      });
    };
    for(const button of document.querySelectorAll('[data-bind]')){
      button.addEventListener('click',()=>{
        recording=button.dataset.bind;
        button.textContent='PREMIR NOVA TECLA...';
      });
    }
    document.addEventListener('keydown',event=>{
      if(!recording)return;
      event.preventDefault();event.stopImmediatePropagation();
      const key=event.key.toLowerCase();
      const binding=recording;recording=null;
      const reserved=['q','e','m','r','n','k','x','z','f','tab'];
      if(key==='escape'){refresh();return;}
      if(!/^[a-z0-9 ]$/.test(key)||reserved.includes(key)||
          Object.entries(cfg.bindings).some(([name,assigned])=>name!==binding&&assigned===key)) {
        this.api.toast('TECLA RESERVADA OU JÁ UTILIZADA');
        refresh();return;
      }
      cfg.bindings[binding]=key;
      this.api.persistSettings();
      refresh();
    },true);
    $('bindingsReset').addEventListener('click',()=>{
      cfg.bindings={...defaults};
      this.api.persistSettings();refresh();
    });
    refresh();
  }

  createHud(){this.dial=document.querySelector('.speed-dial');}

  setHud(p) {
    p=cleanHud(p);
    const dial=this.dial;
    dial.classList.remove('style-glass','style-digital','style-analog','style-racing','style-minimal',
      'style-custom','hide-rpm','hide-gear','no-background','no-motion');
    dial.classList.add('style-'+p.style);
    if(!p.showRpm)dial.classList.add('hide-rpm');
    if(!p.showGear)dial.classList.add('hide-gear');
    if(!p.background)dial.classList.add('no-background');
    if(!p.animations)dial.classList.add('no-motion');
    dial.style.setProperty('--scale',String(p.scale));
    dial.style.setProperty('--dial-opacity',String(p.opacity));
    dial.style.setProperty('--hud-accent',p.color);
    if(p.posX===null){dial.style.left='';dial.style.top='';dial.style.right='';dial.style.bottom='';}
    else{
      dial.style.left=Math.round(p.posX*innerWidth)+'px';
      dial.style.top=Math.round(p.posY*innerHeight)+'px';
      dial.style.right='auto';dial.style.bottom='auto';
    }
    this.api.lastTelemetry&&this.updateTelemetry(this.api.lastTelemetry,this.api.lastHandbrake);
  }

  bindDragging(){
    let drag=null;
    const dial=this.dial;
    dial.addEventListener('pointerdown',e=>{
      if(!this.editorOpen)return;
      const bounds=dial.getBoundingClientRect();
      drag={x:e.clientX-bounds.left,y:e.clientY-bounds.top};dial.setPointerCapture(e.pointerId);
    });
    dial.addEventListener('pointermove',e=>{
      if(!drag||!this.editorOpen)return;
      const left=Math.max(0,Math.min(innerWidth-80,e.clientX-drag.x));
      const top=Math.max(0,Math.min(innerHeight-75,e.clientY-drag.y));
      this.draft.posX=left/innerWidth;this.draft.posY=top/innerHeight;
      dial.style.left=left+'px';dial.style.top=top+'px';
      dial.style.right='auto';dial.style.bottom='auto';
      $('hudPosition').value='custom';
    });
    for(const ev of ['pointerup','pointercancel']) dial.addEventListener(ev,()=>{drag=null;});
    window.addEventListener('resize',()=>this.setHud(this.editorOpen?this.draft:this.prefs));
  }

  updateTelemetry(data,handbrake=false) {
    this.navigation?.update(this.api.vehicle.getPosition(),
      this.api.vehicle.chassis.quaternion,performance.now());
    const p=this.editorOpen?this.draft:this.prefs;
    const speed=p.unit==='mph'?data.speed/1.609344:data.speed;
    $('speedValue').textContent=String(Math.max(0,Math.round(speed)));
    document.querySelector('.speed-row>span').textContent=p.unit==='mph'?'MPH':'KM/H';
    $('rpmValue').textContent=Math.round(data.rpm)+' RPM';
    $('rpmBar').style.width=Math.max(0,Math.min(100,data.rpm/6850*100))+'%';
    $('gearValue').textContent=data.gear;
    $('handbrakeIndicator').hidden=!handbrake;
    $('analogNeedle').style.transform='translateX(-50%) rotate('+(-125+Math.max(0,Math.min(1,speed/(p.unit==='mph'?160:260)))*250)+'deg)';
    const lights=$('racingLights').children;
    for(let i=0;i<lights.length;i++)lights[i].classList.toggle('active',data.rpm/6850>(i+1)/10);
    if(this.lastGear!==null&&this.lastGear!==data.gear&&p.animations){
      this.dial.classList.remove('shift');void this.dial.offsetWidth;this.dial.classList.add('shift');
      clearTimeout(this.shiftTimer);this.shiftTimer=setTimeout(()=>this.dial.classList.remove('shift'),210);
    }
    this.lastGear=data.gear;
  }

  drawMap(){
    const canvas=$('roadMap');const ctx=canvas.getContext('2d');
    const w=canvas.width,h=canvas.height;
    ctx.fillStyle='#10202c';ctx.fillRect(0,0,w,h);
    for(let i=0;i<w;i+=24){ctx.strokeStyle='rgba(255,255,255,.045)';ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,h);ctx.stroke();}
    for(let j=0;j<h;j+=24){ctx.strokeStyle='rgba(255,255,255,.045)';ctx.beginPath();ctx.moveTo(0,j);ctx.lineTo(w,j);ctx.stroke();}
    const project=(p)=>[w/2+p.x*.285,h/2+p.z*.25];
    const roads=this.api.world.network?.roads||[];
    for(const road of roads) {
      ctx.beginPath();
      road.points.forEach((p,i)=>{
        const [x,y]=project(p);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      });
      ctx.strokeStyle=road.surface==='dirt'?'#b18b60':
        road.surface==='gravel'?'#929189':'#94a7ae';
      ctx.lineWidth=road.width*.285+1.2;ctx.stroke();
      ctx.strokeStyle=road.surface==='dry'?'#d8d6bc':'#776a53';
      ctx.lineWidth=1;ctx.stroke();
    }
    if(this.navigation.route?.points.length>1){
      ctx.beginPath();
      this.navigation.route.points.forEach((p,i)=>{
        const [x,y]=project(p);
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      });
      ctx.strokeStyle='#21e7fa';ctx.lineWidth=4;
      ctx.shadowColor='#14dbff';ctx.shadowBlur=12;ctx.stroke();ctx.shadowBlur=0;
    }
    const sites=this.api.world.sectors?.regions||[];
    for(const site of sites) {
      const [x,y]=project(site.point);
      ctx.fillStyle='#f7d28b';ctx.beginPath();ctx.arc(x,y,3.8,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#eeeae0';ctx.font='9px sans-serif';
      ctx.fillText(site.name.slice(0,22),Math.min(w-100,x+6),y-4);
    }
    const [x,y]=project(this.api.vehicle.getPosition());
    ctx.fillStyle='#d8ff7c';ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#e2f1f5';ctx.font='12px sans-serif';ctx.fillText('VEÍCULO',Math.min(w-60,x+12),y-8);
  }

  pollGamepad() {
    const visible=pages.find(page=>!$(page).classList.contains('hidden'));
    if(!visible)return;
    const gp=navigator.getGamepads?.()?.find(p=>p?.connected&&p.mapping==='standard');
    if(!gp)return;
    const focusable=Array.from($(visible).querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled])'))
      .filter(node=>node.getClientRects().length);
    if(!focusable.length)return;
    const now=performance.now();
    const dy=gp.axes[1]||0;
    const up=gp.buttons[12]?.pressed||dy < -.65;
    const down=gp.buttons[13]?.pressed||dy > .65;
    if((up||down)&&now-this.gamepadNavigation>175){
      let i=focusable.indexOf(document.activeElement);
      i=(i+(down?1:-1)+focusable.length)%focusable.length;
      focusable[i].focus();this.gamepadNavigation=now;
    }
    const accept=Boolean(gp.buttons[0]?.pressed);
    const back=Boolean(gp.buttons[1]?.pressed);
    if(accept&&!this.previousPad.accept){
      if(document.activeElement?.click)document.activeElement.click();
      else focusable[0].click();
    }
    if(back&&!this.previousPad.back){
      if(visible==='settingsScreen')this.api.closeSettings();
      else if(visible!=='startScreen'&&visible!=='pauseScreen')this.handleEscape();
    }
    this.previousPad={accept,back};
  }
}
