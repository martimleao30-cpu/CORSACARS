// Windows-only update banner. Works with the secure Electron preload bridge.
// Web builds simply do not see the bridge and never create desktop UI.
const api = window.corsacarsDesktop;

if (api) {
  const style = document.createElement('style');
  style.textContent = [
    '#updateNotice{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);',
    'z-index:30000;background:rgba(10,22,34,.97);color:#f5f8fc;',
    'border:1px solid rgba(210,180,147,.55);border-radius:12px;',
    'padding:16px 18px;box-shadow:0 20px 50px rgba(0,0,0,.5);',
    'width:min(480px,calc(100vw - 24px));font-family:inherit}',
    '#updateNotice[hidden]{display:none}',
    '#updateNotice strong{display:block;color:#d2b493;font-size:15px;margin-bottom:5px}',
    '#updateNotice p{font-size:12px;line-height:1.55;margin:5px 0 12px}',
    '#updateNotice .buttons{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
    '#updateNotice button{border:0;border-radius:6px;padding:10px 14px;',
    'cursor:pointer;font-weight:700;background:#d2b493;color:#071220}',
    '#updateNotice button.secondary{background:transparent;color:#dde8ee;',
    'border:1px solid rgba(255,255,255,.28)}',
    '#updateNotice progress{width:100%;accent-color:#d2b493;margin:4px 0 10px}'
  ].join('');
  document.head.appendChild(style);

  const box = document.createElement('div');
  box.id = 'updateNotice';
  box.hidden = true;
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  box.innerHTML = [
    '<strong id="updateHeading"></strong>',
    '<p id="updateMessage"></p>',
    '<progress id="updateProgress" max="100" value="0" hidden></progress>',
    '<div class="buttons">',
    '<button type="button" id="updateAction"></button>',
    '<button type="button" id="updateLater" class="secondary">Mais tarde</button>',
    '</div>'
  ].join('');
  document.body.appendChild(box);
  const heading = document.getElementById('updateHeading');
  const message = document.getElementById('updateMessage');
  const action = document.getElementById('updateAction');
  const later = document.getElementById('updateLater');
  const progress = document.getElementById('updateProgress');
  let current = { state: 'idle' };
  let dismissedVersion = null;
  let busy = false;

  const settings = document.querySelector('#settingsScreen .settings-panel');
  const manual = document.createElement('button');
  manual.type = 'button';
  manual.className = 'outline';
  manual.textContent = 'PROCURAR ATUALIZAÇÕES';
  const label = document.createElement('p');
  label.style.cssText = 'color:#d2b493;font-size:11px;margin:8px 0 14px;';
  label.setAttribute('aria-live', 'polite');
  label.textContent = 'A consultar a versão instalada e as atualizações...';
  settings?.insertBefore(manual, settings.querySelector('#settingsBack'));
  settings?.insertBefore(label, settings.querySelector('#settingsBack'));
  const releases = document.createElement('a');
  releases.href = 'https://github.com/martimleao30-cpu/CORSACARS/releases/latest';
  releases.target = '_blank';
  releases.rel = 'noopener noreferrer';
  releases.textContent = 'VER ÚLTIMA VERSÃO PUBLICADA';
  releases.style.cssText = 'display:inline-block;color:#d2b493;font-size:11px;margin-bottom:14px;';
  settings?.insertBefore(releases, settings.querySelector('#settingsBack'));

  function present(state) {
    current = state;
    const next = state.nextVersion || '';
    progress.hidden = true;
    action.hidden = false;
    later.hidden = false;
    if (state.state === 'available') {
      label.textContent = 'Instalada: ' + (state.version||'?') + ' · Disponível: ' + next;
      if (dismissedVersion === next) return;
      heading.textContent = 'ATUALIZAÇÃO DISPONÍVEL';
      message.textContent = 'CORSACARS ' + next + ' está disponível. Queres atualizar agora?';
      action.textContent = 'ATUALIZAR AGORA';
      action.disabled = false;
      box.hidden = false;
    } else if (state.state === 'downloading') {
      box.hidden = false;
      heading.textContent = 'A DESCARREGAR ATUALIZAÇÃO';
      message.textContent = 'Progresso: ' + Math.round(state.progress || 0) + '% — podes continuar a jogar.';
      progress.hidden = false;
      progress.value = state.progress || 0;
      action.hidden = true;
      later.hidden = true;
      label.textContent = 'A descarregar: ' + Math.round(state.progress || 0) + '%';
    } else if (state.state === 'ready') {
      box.hidden = false;
      heading.textContent = 'ATUALIZAÇÃO PRONTA';
      message.textContent = 'A versão ' + next +
        ' foi descarregada. Guarda a sessão e reinicia para instalar.';
      action.textContent = 'REINICIAR E INSTALAR';
      action.disabled = false;
      later.hidden = false;
      label.textContent = 'Atualização pronta para instalar';
    } else if (state.state === 'checking') {
      label.textContent = 'A procurar atualizações (instalada: ' + (state.version||'?') + ')...';
    } else if (state.state === 'current') {
      label.textContent = 'Nenhuma atualização mais recente encontrada · versão ' + (state.version || '?') + '. Confirma também em VER ÚLTIMA VERSÃO PUBLICADA.';
    } else if (state.state === 'idle') {
      label.textContent = 'Versão instalada: ' + (state.version || '?') + ' · Aguardando verificação.';
    } else if (state.state === 'error') {
      label.textContent = state.message || 'Não foi possível atualizar.';
      if (!box.hidden) {
        heading.textContent = 'FALHA NA ATUALIZAÇÃO';
        message.textContent = label.textContent;
        action.textContent = 'TENTAR NOVAMENTE';
        action.disabled = false;
        later.hidden = false;
      }
    }
  }

  later.addEventListener('click', () => {
    if (current.state === 'available') dismissedVersion = current.nextVersion;
    box.hidden = true;
  });
  action.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    action.disabled = true;
    try {
      if (current.state === 'available') {
        await api.downloadUpdate();
      } else if (current.state === 'ready') {
        window.dispatchEvent(new Event('corsacars:before-update'));
        await api.installUpdate();
      } else if (current.state === 'error') {
        dismissedVersion = null;
        await api.checkUpdates();
      }
    } catch (error) {
      present({ state: 'error', message: 'Não foi possível iniciar a atualização.' });
    } finally {
      busy = false;
    }
  });
  manual.addEventListener('click', async () => {
    dismissedVersion = null;
    present({ state: 'checking' });
    try { present(await api.checkUpdates()); }
    catch { present({ state: 'error', message: 'Sem ligação ao servidor de atualizações.' }); }
  });

  const off = api.onUpdate(present);
  void api.version().then(present).catch(() => {});
  window.addEventListener('beforeunload', off, { once: true });
}
