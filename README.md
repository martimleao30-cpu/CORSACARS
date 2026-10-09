# CORSACARS — Open Road v0.4

**CORSACARS** é um projeto de jogo de automóveis 3D independente, feito para **navegador** com [Three.js](https://threejs.org/) e [cannon-es](https://pmndrs.github.io/cannon-es/). **Não utiliza Unity** e não partilha quaisquer ficheiros com o projeto Minecraft.

## Abrir online e colocar um atalho no Windows

O jogo é estático e pode correr diretamente num navegador, **sem descarregar o repositório**. Para ativar a publicação pela primeira vez, o proprietário abre [Definições → Pages](https://github.com/martimleao30-cpu/CORSACARS/settings/pages), seleciona **Deploy from a branch** → **main** → **/(root)** e carrega em **Save**.

Depois de o GitHub Pages estar publicado, o endereço será:

https://martimleao30-cpu.github.io/CORSACARS/

Para criar um atalho no ambiente de trabalho do Windows: botão direito no ambiente de trabalho → **Novo → Atalho** → introduzir o endereço acima → **Seguinte** → nome **CORSACARS** → **Concluir**. O atalho abre a versão online mais recente do jogo e não instala Unity nem descarrega o código-fonte.

## Executar o jogo

1. Descarrega/clona este repositório.
2. Na pasta do projeto, inicia um servidor HTTP: `python -m http.server 8080` (Python 3).
3. Abre `http://localhost:8080` num navegador de computador recente com WebGL.
4. Clica em **COMEÇAR A CONDUZIR**.

Também podes publicar o conteúdo estático no GitHub Pages (Settings → Pages → Deploy from branch → `main` → `/(root)`); a publicação tem de estar ativada pelo proprietário. Não é necessário instalar Unity nem dependências npm para jogar, mas **é necessária Internet** para obter as versões das bibliotecas fixadas no import map do HTML.

## Implementado na v0.1 (primeira fase)

- Região gerada por código com cerca de 2 × 2 km de terreno, estrada circular, relevos, árvores, rochas e edifícios simples.
- Física de chassis por `Rigidbody` equivalente em cannon-es (`Body`), com rodas por raycast, suspensão, tração traseira, caixa automática e opção manual, travão e travão de mão.
- Carro 3D provisório, separado da física para permitir substituir o modelo mais tarde.
- Cinco ângulos de câmara: seguimento, exterior afastada, interior provisório, capô e cinematográfica.
- HUD com km/h, rotações e mudança, menu inicial, pausa, opções e ecrã inteiro.
- Comandos de teclado e suporte básico para gamepad padrão (Xbox/PlayStation quando mapeado pelo navegador).
- Ciclo dia/noite, chuva visual, nevoeiro, perda simplificada de aderência na chuva.
- Resolução adaptada à janela/ecrã, perfis de qualidade e limite de FPS.
- Som **sintetizado** de motor (não é áudio gravado realista) com opção para desligar.
- Definições básicas guardadas no armazenamento local.

### Controlos

| Tecla | Ação |
| --- | --- |
| W / S | Acelerar / travar e marcha-atrás |
| A / D | Virar |
| Espaço | Travão de mão |
| C | Trocar câmara |
| M | Alternar caixa manual / automática |
| Q / E | Descer / subir mudança no modo manual |
| N | Alternar dia / noite |
| K | Alternar céu limpo / chuva / nevoeiro |
| R | Recolocar o carro na estrada |
| Esc | Pausa |
| F11 | Ecrã inteiro do navegador; também existe botão nas definições |

No comando: analógico esquerdo para direção, gatilhos para acelerar e travar, botão inferior para travão de mão, botão superior para câmara e Start/Options para pausa. Em modo manual, os botões de ombro mudam de velocidade.

## Testes

Com Node.js 22+:
```bash
npm test
```
O GitHub Actions corre automaticamente verificações de sintaxe e testes estruturais após alterações ao repositório. **Estes testes não substituem os testes reais da física, rendimento e apresentação no navegador.** A primeira versão ainda não foi validada no editor de um motor de jogo (não utiliza um).

## Evolução gráfica v0.2

- Materiais PBR de asfalto e gravilha gerados proceduralmente sem recursos protegidos: mapa de cor, **normal map** para relevo visual e roughness map. Não são texturas fotográficas 4K.
- Asfalto com verniz superficial, rugosidade e cor alteradas no modo chuva; bermas acompanhando as curvas da estrada.
- Carro com **MeshPhysicalMaterial**, pintura metalizada de duas camadas (Clear Coat), vidro transparente e reflexivo, embelezadores laterais, grelha, matrículas provisórias e mais detalhes nas jantes.
- Painel de instrumentos com CanvasTexture atualizado em tempo real; luzes de travagem que acendem durante a travagem; piscas da esquerda/direita alternáveis por Z/X.
- Iluminação ambiente e temperatura de cor do sol dependentes da hora, sombras suaves com correção de normal bias, candeeiros de rua emissivos e pontos de luz ativados à noite perto do veículo.
- Reflexos dinâmicos na pintura/vidros por **CubeCamera**, atualizados com frequência limitada; oclusão ambiente **SSAO** opcional por Three.js addons nos perfis Alto/Ultra (com fallback para renderização direta em navegadores sem suporte).
- Exposição adaptada gradualmente à hora e clima; tone mapping ACES já existente preservado.
- Definições novas para desligar SSAO e reflexos em tempo real, guardadas em localStorage.
- Testes automáticos de sintaxe/estrutura e teste real no Chromium com WebGL, acelerar, trocar de câmara, chuva e pausa.

As melhorias são um avanço visual sobre os materiais básicos, **não equivalem ainda a fotorrealismo AAA**. A luz indireta é aproximada por HemisphereLight (não há iluminação global por ray tracing); os reflexos por cubemap não são ray tracing; SSAO não substitui GI. Os modelos 3D continuam provisórios. O rendimento e compatibilidade gráfica exigem testes em hardware real.

## Evolução gráfica v0.3 — materiais e recursos reais

- **Modelo de veículo detalhado:** carregamento assíncrono do concept car [Car Concept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept) com interior e materiais próprios. Geometria escalada ao chassis existente; rodas do veículo simulado mantidas para animação física. Os modos inferiores continuam a recorrer ao modelo simples. O ficheiro tem cerca de 11 MB e requer Internet.
- **Fototextura de estrada:** asfalto **Asphalt 02** Poly Haven em 1K (ou 2K no modo Ultra); normal map e roughness procedurais preservados caso o pedido externo falhe. Na chuva, o material torna-se mais escuro e ganha verniz/reflexos aproximados.
- **Luz ambiente baseada em imagem:** HDRI de céu Poly Haven e reflexos PBR por ambiente, com uma **LightProbe** de harmónicas esféricas calculada a partir da cena quando os reflexos dinâmicos estão ativos. Esta técnica fornece iluminação indireta aproximada, **não GI física com ray tracing ou múltiplos ressaltos**.
- **Vegetação 3D:** copas orgânicas de múltiplos volumes geométricos e cores variadas, rendidas por instancing em vez de árvores em cone.
- **Otimização:** painel de FPS, ms por frame (mediana), draw calls e triângulos; qualidade adaptativa opcional baixa um escalão se o FPS se mantiver abaixo de 29 durante cerca de 6 segundos, com cooldown. O contador observa a renderização no navegador, **não a GPU do sistema remotamente**.
- **Fallbacks:** sem ficheiros binários no Git; os recursos externos são opcionais para que a física e os menus continuem executáveis sem Internet.
- **Licenças:** consultar [CREDITS.md](CREDITS.md) para a atribuição obrigatória CC BY 4.0 do carro e os recursos CC0 da Poly Haven.

Para ver os recursos de alta qualidade, começa a conduzir com qualidade gráfica **Alto** ou **Ultra** e mantém o acesso à Internet. O topo da interface indica quando o carro 3D é carregado. É possível desligar o carregamento visual e a qualidade adaptativa em Definições.

### Metas ainda não garantidas

A versão 0.3 **ainda não equivale à qualidade de Forza Horizon 5**. Faltam modelos artísticos adicionais de produção, GI multirressalto física, geometria de alta densidade do ambiente, cenários fotogramétricos, LODs automáticos de malha, renderização em consola e validação visual/performance real no computador do jogador (por exemplo RTX 4070 Super, 2560 × 1440). Os testes automáticos do GitHub Actions usam WebGL por software, não a tua placa gráfica.

## Interface Premium v0.4

O jogo continua a ser feito com **Three.js, cannon-es e HTML/CSS nativos**. Não há Unity, React ou dependência de backend para os menus.

- **Menu principal** com fundo 3D cinematográfico e botões Jogar, Garagem, Personalizar HUD, Definições, Créditos e Sair. O navegador não permite fechar separadores abertos pelo utilizador: o botão Sair explica essa limitação, em vez de simular que fecha.
- **Pausa** com tecla ESC e acesso ao mapa do circuito atual, garagem, definições e editor de HUD. A simulação da física é suspensa durante a pausa.
- **Garagem** com um veículo real no jogo (Concept Coupé, 1370 kg, tração traseira, binário de referência 345 Nm). Não apresenta potência ou velocidade máxima inventadas. Permite trocar a cor do modelo físico original; o modelo glTF opcional preserva as texturas licenciadas originais.
- **Velocímetro com cinco estilos** digital, analógico, Racing, minimalista e personalizado. Os valores vêm da telemetria do carro; pode escolher km/h ou mph, cor, escala, opacidade, visibilidade de RPM e mudança, posição arrastável e animações.
- **Editor de HUD** com pré-visualização no jogo; Aplicar guarda, Cancelar reverte; três perfis persistentes, Repor e posição por arrastamento do rato.
- **Definições** em separadores Gráficos, Áudio, Controlos e Interface. Controlo da escala de renderização, resolução efetiva interna, FPS, ecrã inteiro do navegador, sombras, distância de renderização, vegetação, modo gráfico, FXAA, TAA experimental, bloom, SSAO, reflexos dinâmicos, texturas novas 1K/2K, qualidade adaptativa, volume do motor, sensibilidade e zona morta do analógico, remapeamento de teclas, cor da interface e tamanho rápido do HUD.
- **Comando e teclado**: menus navegáveis com TAB/Enter ou direcional/analógico e A/Cruz; B/Círculo para voltar em submenus. O mapeamento usa o perfil padrão Web Gamepad e pode variar conforme navegador/comando.
- **Persistência** em localStorage das definições do jogo, da posição do automóvel e do HUD.

### Limites reais do navegador

- O V-Sync é gerido pelo navegador e não pode ser desligado de forma fiável por JavaScript. O jogo suporta limite de FPS próprio.
- **Não estão implementados** ray tracing, DLSS/FSR ou um sistema de oclusão de geometria de alta complexidade. Frustum culling e instancing padrão do Three.js continuam ativos.
- Motion Blur e Depth of Field não são aplicados nesta versão; evitamos efeitos artificiais e impacto no desempenho do mundo aberto.
- **TAA experimental** está disponível no perfil Ultra quando o addon de pós-processamento funcionar; caso contrário, recua para FXAA ou MSAA nativo.
- A resolução interna é regulada pela escala de pixel ratio, sem simular uma alteração física da resolução do monitor.
- O áudio do motor é sintetizado; não existem ainda pistas independentes para pneus, efeitos, música e ambiente.
- O mapa apresenta a estrada já construída e a posição atual, não ruas que ainda não existem.
- Há apenas um automóvel jogável. A seleção na garagem é real para esse carro, sem apresentar modelos inexistentes.
- Os testes do CI usam Chromium com renderização WebGL por software: **não validam FPS numa RTX 4070 Super**. É preciso medir em hardware real.

## Limitações e próximas fases

Esta versão é um **protótipo funcional em código**, não um simulador automóvel concluído. Os recursos visuais são geométricos e originais; não contém automóveis licenciados nem ativos de jogos comerciais. Falta testar a experiência em execução, melhorar o modelo de pneus, ABS/controlo de tração reais, superfícies físicas distintas, tráfego AI, som gravado, material PBR avançado, interiores detalhados, garagem, remapeamento de teclas, minimapa, zonas do mundo carregadas dinamicamente e publicação pública em Pages.

Próxima prioridade: testar efetivamente em Chrome/Edge, acertar direção/suspensão/travagem e desempenho; depois expandir as estradas e os sistemas de simulação.
