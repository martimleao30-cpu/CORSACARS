# CORSACARS — Open Road v0.7

**CORSACARS** é um projeto de jogo de automóveis 3D independente, disponível em **aplicação Windows (.exe) e navegador** com [Three.js](https://threejs.org/) e [cannon-es](https://pmndrs.github.io/cannon-es/). **Não utiliza Unity** e não partilha quaisquer ficheiros com o projeto Minecraft.

## Cinco categorias de vias — urbanas, autoestradas, serra, rural e terra
A classificação `category` das estradas é efetiva em `src/road-network.js`.
O módulo `src/road-environments.js` constrói decoração tridimensional
com `InstancedMesh` e alguns colisores em `cannon-es`:
- Urbana (EN 201): passeios com espessura e malha de colisão, lancis,
  passadeiras 3D, tampas e sarjetas, baías de estacionamento, cruzamento
  por uma rua lateral fisicamente ligada e semáforos com ciclo de cores.
- Autoestrada (A1): duas vias em cada sentido na secção principal, linhas
  de separação, separador central com colisões, barreiras laterais, placas
  e duas rampas percorríveis para a estrada circular. Ainda não existe IA
  que cumpra os semáforos e a navegação entre faixas.
- Serra Alta: curvas e relevo existentes preservados, guardas com colisão,
  rochas e sinalização de curva.
- Caminho do Pinhal: asfalto envelhecido, bermas de terra, vegetação 3D instanciada e postes rurais
  e ramal de terra acessível pela estrada circular.
- Pedreira e Trilho de Terra do Vale: gravilha e terra com relevo físico
  irregular, pedras instanciadas, rastos estáticos e aderência própria.
  Poeira ao conduzir em superfícies soltas é gerada em tempo real, limitada a 96 partículas instanciadas e ativada pelo contacto dos pneus em terra/gravilha.

As rampas, o cruzamento e o percurso de terra fazem parte do índice espacial
e das colisões Cannon. A renderização mantém Three.js/WebGL, sem Unity.
A física e os testes de geometria não equivalem ainda à homologação da
segurança viária ou à simulação completa de trânsito.

## Estradas realistas 3D — atualização de pavimentos
As sete vias existentes mantêm as ligações e os colisores cannon-es. A estrada circular
e as seis ligações regionais usam agora secções 3D com ligeiro abaulamento central
(camber), espessura visível nas laterais e coordenadas UV por metros percorridos,
para evitar texturas esticadas. O contacto dos pneus continua a ser calculado
sobre a malha física do pavimento, não sobre uma simples imagem.

O asfalto PBR é gerado localmente com variação de grão, fissuras, mapas de
normais e rugosidade e três estados (novo, envelhecido, desgastado).
Os mapas são partilhados entre vias para reduzir memória e custo de geração;
cada via conserva controlo próprio do aspeto molhado. Existem remendos,
marcas de pneus e poeira de berma com instancing e máscaras de transparência.
As estradas regionais têm bermas de gravilha acompanhando o terreno.

Os detalhes são aproximações procedurais, não fotogrametria nem asfalto
cinematicamente perfeito. Os testes de geometria e materiais correm em
`npm test`. A aparência e os FPS ainda precisam de validação na GPU real.

## Mundo aberto e dinâmica automóvel — primeira região 0.7

A atualização do pedido **Física Realista e Mundo Aberto 2.0** foi iniciada com uma região explorável e uma base de física mais sofisticada. Não significa que todos os requisitos do documento estejam terminados.

### Sistemas efetivamente integrados

- **Dinâmica em passos fixos de 1/60 s**, com vários subpassos quando os FPS diminuem; forças no chassis Cannon em vez de deslocações de posição inventadas.
- **Parâmetros mecânicos independentes** no perfil `CAR_SPECS.coupe`: massa, distribuição de peso, centro de gravidade nominal, entre-eixos, via, raio de roda, binário, relações, diferencial, transmissão, coeficiente aerodinâmico e resistência ao rolamento. A distribuição de forças admite FWD/RWD/AWD no módulo de física, mas só o cupé RWD está configurado como veículo jogável.
- **Motor e caixa:** curva de binário dependente das RPM, potência calculada em kW, resposta progressiva do acelerador, limitador, relações automáticas e manual/sequencial com ponto morto e marcha-atrás, tempo de mudança e embraiagem simplificada.
- **Pneus e controlos:** quatro pontos de contacto, física dos amortecedores do RaycastVehicle, curva suave de força de pneu para diagnóstico, Ackermann no eixo dianteiro, barra estabilizadora física, intervenções de ABS/TCS/ESC sobre binário/travões. Tipos de pneu: estrada, desportivo e pista. Grip variável em **asfalto seco, molhado, terra, gravilha e relva**, amostrado por roda.
- **Controlo personalizável:** caixas de seleção ABS/TCS/ESC, tipo de pneu, caixa de velocidades, curva do analógico, deadzone, sensibilidade, inversão de direção e remapeamento do teclado.
- **Rede de estradas fisicamente percorríveis:** estrada circular original ligada a nacional, autoestrada, estrada de serra, caminho rural, acesso de gravilha e **centro de testes**, todos com geometria e colisores. A procura do material do piso usa um índice espacial de estradas.
- **Setores regionais progressivos:** área de serviço, vila, miradouro, quinta e pedreira carregam/descarregam geometria e colisores de edifícios em função da distância do carro. A tecla **F** permite interagir com os locais próximos (pneus, garagem, câmara e diagnóstico).
- **Centro de testes:** acesso pelo menu de pausa; sinalização das áreas de aceleração, travagem, curva, terra, piso molhado, gravilha e obstáculos. Há uma lomba e obstáculos com colisores Cannon.
- **Mapa e diagnóstico:** mapa de todas as vias e pontos de interesse; **F3** mostra grip, RPM, slip dos pneus, força motriz, suspensão, contacto das rodas, tempo de física, FPS, draw calls e uso aproximado de recursos do renderer.

### Como executar os testes

`npm test` verifica as fórmulas mecânicas, o mapa, os setores e uma simulação real com rodas RaycastVehicle em cannon-es. `npm run test:browser` valida a condução e os menus num Chromium WebGL. As compilações Windows usam Vite e Electron com atualizações via GitHub Releases.

### Funcionalidades ainda em desenvolvimento

- Pneus de alta fidelidade tipo Pacejka completos, dinâmica de chassis validada em telemetria real, calibração rigorosa da inércia e da transferência de carga, motorizações e embraiagens individualizadas por automóvel.
- Sistema completo de danos, colisões com veículos de trânsito autónomos, IA de tráfego e pedestres, semáforos com gestão de tráfego, pontes/túneis complexos, cruzamentos e rotundas com navegação segura.
- Expansão por centenas de quilómetros, streaming de todo o terreno e das ruas, carregamento assíncrono de texturas em blocos, construção de estradas urbanas complexas e testes de travagem homologáveis.
- Ensaios de estabilidade e de desempenho na RTX 4070 Super do utilizador. Os testes CI correm com hardware de servidor e Chromium por software e não demonstram **60 FPS garantidos em 1440p**.
## Aplicação Windows com atualizações automáticas — v0.6

O CORSACARS dispõe agora de um instalador Windows **NSIS** gerado no GitHub Actions. Instala o jogo localmente, cria um atalho no ambiente de trabalho e passa a procurar atualizações automaticamente ao arrancar (e, durante sessões longas, de hora a hora).

1. **Uma única instalação inicial:** abre [GitHub Releases](https://github.com/martimleao30-cpu/CORSACARS/releases/latest) e descarrega o ficheiro **CORSACARS-Setup-0.7.x-x64.exe** da última versão publicada (quando a primeira publicação terminar). Os executáveis NSIS ainda não têm uma assinatura digital comercial, pelo que o Windows poderá apresentar um aviso.
2. Executa o instalador, escolhe a pasta e abre o atalho **CORSACARS** que é criado no ambiente de trabalho.
3. Quando houver uma versão nova, surge um aviso **ATUALIZAÇÃO DISPONÍVEL** dentro do jogo. Carrega em **ATUALIZAR AGORA** para descarregar, ou **Mais tarde** para continuares a conduzir.
4. Quando terminar, carrega em **REINICIAR E INSTALAR**. O jogo guarda a sessão antes de reiniciar. Também há um botão **PROCURAR ATUALIZAÇÕES** nas Definições.
5. Continua a jogar no mesmo atalho; deixa de ser necessário descarregar manualmente os executáveis de cada nova versão.

**Importante:** o antigo executável portátil **0.5.0** não suporta atualizações automáticas. Tens de instalar a versão 0.6 com instalador **uma única vez** para ativar o sistema.

### Funcionamento e segurança

- As atualizações são publicadas automaticamente como **GitHub Releases** na rama `main` quando se altera o código desktop; cada build recebe uma versão única `0.7.N`.
- A aplicação usa o serviço `electron-updater` do Electron Builder, metadata `latest.yml` e verificação SHA-512 dos ficheiros descarregados.
- A aplicação pergunta antes de descarregar e pergunta antes de reiniciar. Se não houver Internet, continua jogável.
- Não está configurada assinatura de código paga. Para uma distribuição de produção, deve ser adicionada assinatura Authenticode.
- Ao atualizar, o Electron reinstala o executável e preserva os dados persistidos na mesma aplicação; não altera o teu projeto Minecraft.
- Não é um site encapsulado: os ficheiros 3D, física e interface estão compilados e instalados no computador. Os recursos gráficos opcionais externos ainda precisam de Internet.

## Aplicação Windows (CORSACARS.exe) — jogo instalado no computador

O executável Windows **não abre o GitHub Pages**: inclui os ficheiros do jogo, Three.js e cannon-es compilados localmente com Vite, dentro de uma aplicação Electron com janela própria. Não precisa de Unity.

### Instalar e jogar

1. Abre [CORSACARS — Compilações Windows](https://github.com/martimleao30-cpu/CORSACARS/actions/workflows/windows-desktop.yml).
2. Escolhe uma execução terminada com sucesso e, em **Artifacts**, descarrega **CORSACARS-Windows-EXE**.
3. Extrai o ZIP e executa **CORSACARS-Windows-0.5.0-x64.exe**.
4. Para ter um atalho: botão direito no executável → **Enviar para → Ambiente de trabalho (criar atalho)**.

Uma aplicação tem de ser descarregada **uma vez** para funcionar no computador. A versão básica pode funcionar sem Internet; os recursos opcionais mais detalhados (modelos e HDRI/texturas fotográficas) podem precisar de acesso à Internet.

Para testar a versão desktop localmente: `npm install`, depois `npm run desktop:run`.
Para criar o executável no Windows: `npm run desktop:build` e `npm run desktop:package`.
O executável é colocado em `release/`. A versão **0.5 portátil** não atualiza automaticamente; instala a versão **0.6 NSIS** descrita acima para receber atualizações. Os builds continuam sem assinatura digital comercial.

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

## Evolução gráfica — estradas, natureza, automóvel e clima

As melhorias seguintes estão **implementadas no código real** do jogo, tanto para a versão WebGL como para a aplicação Windows. Não são imagens geradas, mockups ou um cenário pré-renderizado.

- **Automóvel:** materiais PBR de pintura e vidro com Clear Coat; reflexos dinâmicos existentes preservados. Mais guarnições, escapes, rodas com **36 blocos de piso por pneu** através de InstancedMesh, discos de travão, bancos com encostos, tecido e couro, peças de metal escovado e iluminação do painel. Foi acrescentada uma sombra suave de contacto sob o chassis seguindo a altura das rodas. Faróis, piscas, luzes de travagem, matrícula e instrumentos continuam funcionais. O modelo opcional Khronos mantém as peças originais licenciadas.
- **Estrada:** asfalto com mapas de cor, rugosidade e relevo calculados localmente em **256 px (baixo), 512 px (normal) ou 1024 px (Ultra)**, para além da fototextura opcional; bordas de gravilha, guardas metálicas instanciadas e sinais direcionais. A chuva aumenta gradualmente o Clear Coat e reduz a rugosidade em vez de mudar instantaneamente.
- **Vegetação:** relva verdadeira com lâminas triangulares tridimensionais e vento calculado no shader; zonas instanciadas desligadas à distância; arbustos 3D, flores, espécies folhosas e coníferas, escala e rotação variáveis, folhagem com vento por GPU.
- **Terreno:** maior resolução geométrica nos perfis altos, material procedural texturizado e normal map que varia localmente, vegetação dispersa e rochas 3D. A textura do solo mistura-se com os gradientes de cores aplicados aos vértices nas montanhas.
- **Atmosfera:** grupos geométricos de nuvens animadas, ciclo dia/noite com duração aproximada de **20 minutos reais**, amanhecer/entardecer, cor da luz e céu variáveis, estrelas noturnas existentes e névoa que se ajusta progressivamente; chuva visual, poças 3D e efeito de molhamento/secagem gradativo.
- **Desempenho:** geometria partilhada, instancing dos elementos repetidos, regiões de relva por células, frustum culling destas regiões e ativação por distância, LOD de detalhes das rodas e densidade vegetal ligada às definições gráficas.
- **Velocímetro:** novo estilo **Vidro e cobre**, inspirado no exemplo enviado, com **painel translúcido em vez de fundo preto**, velocidade real e RPM da simulação; continua configurável no editor de HUD.

### Limites reais

Isto é uma atualização importante dos visuais do protótipo, **não fotorrealismo AAA completo**: as árvores, estradas, montanhas e nuvens são geometria/procedimentos simplificados, não levantamentos fotogramétricos nem nuvens volumétricas físicas. A iluminação e os reflexos são aproximações próprias de WebGL (sem ray tracing), e as poças não têm reflexão planar exata. O desempenho ainda requer medição e afinação no hardware do utilizador.

Os testes automáticos incluem compilação/sintaxe, ensaios de vegetação, LOD, vento, molhamento/secagem e condução em Chromium WebGL, além do empacotamento Windows através do GitHub Actions.

## Limitações e próximas fases

Esta versão é um **protótipo funcional em código**, não um simulador automóvel concluído. Os recursos visuais são geométricos e originais; não contém automóveis licenciados nem ativos de jogos comerciais. Falta testar a experiência em execução, melhorar o modelo de pneus, ABS/controlo de tração reais, superfícies físicas distintas, tráfego AI, som gravado, material PBR avançado, interiores detalhados, garagem, remapeamento de teclas, minimapa, zonas do mundo carregadas dinamicamente e publicação pública em Pages.

Próxima prioridade: testar efetivamente em Chrome/Edge, acertar direção/suspensão/travagem e desempenho; depois expandir as estradas e os sistemas de simulação.


## Florestas naturais — árvores 3D com quatro LOD

O CORSACARS continua a usar Three.js/WebGL. O antigo sistema de troncos
cilíndricos e copas geométricas em `src/world.js` foi substituído pelo
`ForestSystem` de `src/forest-system.js`.

- **Espécies:** carvalho, bétula e pinheiro, com geometrias de tronco,
  ramificação e distribuição de folhas próprias.
- **Idades:** jovens, adultas e antigas; alteram altura, volume de copa,
  espessura e raízes expostas de forma ligeira nos modelos de proximidade.
- **LOD 0:** troncos irregulares com relevo de casca procedural, ramos
  principais e secundários, folhagem 3D com midribs/veios, projeção de sombras.
- **LOD 1:** geometria orgânica simplificada e folhagem em menor quantidade.
- **LOD 2:** copa e tronco de geometria simplificada a média/larga distância.
- **LOD 3:** representação ultraleve a longa distância, ou não renderizada
  se estiver fora da distância de corte ou do campo de visão.
- **Otimização:** InstancedMesh por espécie, idade, região e LOD. As geometrias
  mais detalhadas são criadas quando a região aparece perto da câmara; lotes
  fora do frustum são ocultados. Câmera distante não obriga a construir LOD 0.
- **Dinâmica:** deformação pelo vento nos shaders GPU, rajadas e resposta
  visual à chuva/nevoeiro. A simulação pára quando o jogo está em pausa.
- **Colocação:** distribuição determinista com variações de densidade, altitude,
  tamanho, silhueta e orientação; respeita estradas e a área urbanizada.
- **Sem downloads obrigatórios:** as texturas procedurais da casca e as máscaras
  recortadas das folhas são geradas localmente.

Os testes de distribuição, geometria, LOD, frustum e clima correm em
`npm run test:forest`. O desempenho real deve ser medido no jogo em GPU.


## Sinalização rodoviária 3D — pavimento real

`src/road-signage.js` gera linhas contínuas, descontínuas e duplas a
partir **dos vértices da própria estrada**, usando a mesma malha que o carro
percorre. A pintura acompanha curvas, alterações de altura e o abaulamento
transversal, evitando o efeito de marcas retas, flutuantes ou com z-fighting.
Uma distância constante de ~18 mm, `polygonOffset` e profundidade de leitura
protegida evitam as marcas desaparecerem no asfalto. Os tracejados são
medidos por metros de percurso, e não por índice da malha.

Inclui linhas laterais contínuas, marcações centrais duplas nas vias
adequadas, descontínuas nas restantes, separações de vias da autoestrada,
setas direcionais e passadeiras com largura variável à da estrada. As
linhas usam geometria de faixas em GPU, não caixas 3D esticadas.
Os materiais são partilhados e a sinalização é gerada uma única vez.

`src/road-environments.js` mantém as placas 3D e acrescenta sinais
circulares de limite de velocidade, sinais de perigo triangulares e
semáforos com ciclos alternados de verde/amarelo/vermelho por sentido,
incluindo fases de vermelho para os dois sentidos. São sinais funcionais
visualmente; os carros da IA ainda não cumprem automaticamente sinais.

Verificação: `npm run test:roads` testa também encaixe geométrico,
linhas, setas, passadeiras, sinais verticais e fases semafóricas.


## Gráficos do mundo 3.0 — nuvens, terreno, vegetação e chuva

- **Nuvens:** máscaras de densidade geradas localmente, com camadas suaves e
  sem cubos/icosaedros gigantes; grupos espaciais `InstancedMesh`, transparência
  recortada e cor alterada pelo clima e pelo ciclo do dia.
- **Terreno:** estratos de relevo suave nas serras e mistura cromática por
  declive, altitude e humidade; o cálculo da altura é partilhado pela malha,
  pelos pneus, pelas estradas e pela vegetação. Maior resolução geométrica nos
  perfis Médio/Alto/Ultra e granulação de solo/rocha no material PBR.
- **Relva:** tufos de três lâminas 3D curvadas, com vértices intermédios,
  cores alternadas, vento GPU e densidade por configuração.
- **Chuva:** traços finos com comprimento e velocidade individuais, reciclados
  à volta da câmara; reflexos e poças existentes ficam dependentes de humidade
  progressiva, e a luz solar é mais difusa em tempo chuvoso.
- **Desempenho:** grupos de nuvens limitados, geometria instanciada e sem
  dependência de ativos externos. A qualidade e os FPS devem ser inspecionados
  em GPU real; o Chromium em CI usa software WebGL.


## Realismo dos objetos do cenário — redução do aspeto de desenho animado

O módulo `src/natural-assets.js` substitui os arbustos de icosaedros por
folhagem individual inclinada, flores esféricas por pétalas 3D e rochas de
polígonos planos por blocos erosionados com tons minerais. As fachadas dos
prédios passam a apresentar janelas separadas com molduras, vidros, peitoris,
portas e parapeitos; o mesmo sistema é usado na pequena vila dinâmica.

Os novos detalhes partilham geometrias e instâncias para reduzir draw calls.
Os colisores dos prédios não foram modificados. O objetivo é retirar o aspeto
cartoon sem prometer fotorrealismo de jogos AAA: edifícios procedurais ainda
não substituem fotogrametria, bibliotecas PBR fotográficas e arte profissional.
Testar em `node tests/natural-assets.mjs` e `npm test`.

As paredes dos edifícios urbanos também utilizam agora textura local de
reboco/betão com relevo suave (bump) e tons menos saturados. A textura é
partilhada entre edifícios do mesmo acabamento, em vez de criada por prédio.


## Iluminação cinematográfica — sol e atmosfera 3D

O sistema `src/cinematic-lighting.js` substitui o céu liso por uma
atmosfera em shader com gradiente do zénite ao horizonte, **disco solar de
ângulo realista** e halo suave dependente da altitude do sol. Amanhecer e
pôr do sol passam a produzir tons quentes, o meio-dia é neutro e a chuva
reduz a luz direta e arrefece as cores. A neblina combina com o horizonte
para evitar uma linha de recorte.

A iluminação do automóvel, vegetação, terreno e estradas usa o mesmo vetor
do sol que o céu; as sombras ficam centradas no veículo, com frustum mais
preciso e `normalBias` ajustado. Respeita a opção de sombras desligadas,
as dimensões de shadow map e o perfil de qualidade. A conversão de cores é
sRGB e o tonemapping ACESFilmic já existente é preservado, com exposição
adaptada à hora do dia. SSAO e bloom são ajustados para manter contraste
sem causar brilho artificial. Utilizadores com preferências antigas
`bloom: off` mantêm essa escolha.

A dispersão solar é uma aproximação atmosférica procedural em WebGL — não
ray tracing. Os testes `tests/cinematic-lighting.mjs` verificam dia,
crepúsculo, chuva, nevoeiro, noite, céu e sombras.


## Estradas limpas, vegetação sem invasões e cercas com aberturas

`src/roadside-clearance.js` cria uma máscara de ocupação para **todas** as
vias transitáveis: circular, autoestrada, estrada nacional, rural, montanha,
terra, pistas de teste, rampas e rua lateral. Deteta entroncamentos e
cruzamentos pela geometria das estradas, além dos acessos à quinta, vila,
área de serviço, miradouro e pedreira. Relva, flores, arbustos, árvores,
pedras nas bermas e vegetação rural passam por esta máscara antes de serem
gerados; cada espécie tem uma margem de segurança própria.

As vedações rurais têm postes cilíndricos de madeira, duas travessas
horizontais e fio metálico, cada peça posicionada ao longo da inclinação
do terreno. Barreiras metálicas e separadores de autoestrada também usam
peças e suportes individualizados; são interrompidos nos cruzamentos,
entradas e saídas, juntamente com os respetivos corpos físicos Cannon.
A estrada circular usa estas guardas no lugar das velhas vigas decorativas.
Os controlos de densidade e LOD existentes foram preservados.

Teste: `node tests/roadside-clearance.mjs` e `npm run test:roads`.


## Prado natural 2.0 — relva em 3D

- Relva modelada com 4 a 8 lâminas curvas e afuniladas por tufo, perfil
  irregular, alturas e espessuras independentes e tons distintos até às pontas.
- Semente fixa para aglomerados naturais, falhas e zonas abertas; variação de
  humidade e secura em várias escalas, sem faixas repetidas ao longo da estrada.
- Junto das bermas o tufo fica mais curto, menos denso e parcialmente seco;
  mais longe cresce livre, com gradientes de verde e tons castanhos.
- Exclusão de plantas no asfalto, caminhos, cruzamentos e entradas através de
  `RoadsideClearance`, com raio adicional para toda a geometria da planta.
- Vento GPU modesto e variável por tufo, com flexão quadrática e onda secundária,
  aplicado sobretudo às pontas; a relva baixa abana menos.
- `InstancedMesh` organizado em quadrículas de 145 m, distância de corte por
  qualidade e opção de densidade mantida para controlar FPS. Cada qualidade
  partilha uma única geometria e um único material de relva.
- Testes de geometria, paleta, distribuição, máscaras de circulação e vento em
  `tests/meadow-grass.mjs` e `tests/world-details.mjs`.


## Área de Serviço Vale — Autoestrada A1

O setor dinâmico `service` foi substituído por uma infraestrutura orientada
pela direção da autoestrada, sem marcas comerciais: quatro bombas com visores,
mangueiras, ilhas e proteções; cobertura metálica com quatro pilares,
iluminação LED; loja/café com montras, porta e entrada coberta; dez lugares
pintados, dois acessos revestidos à autoestrada, passeio, separadores, zona
técnica, bancos e sinalização de entrada e de serviços a 500 m.

A praça, a entrada e a saída têm superfícies 3D conformadas com o relevo e
colisões por malha Cannon. Os elementos sólidos essenciais também têm
colisões. A iluminação real só é ligada à noite e quando o carro se aproxima.
A estação só é carregada quando o jogador se aproxima do setor e descarrega
corpos físicos, texturas e materiais quando se afasta. A máscara viária reserva
as dimensões da praça para impedir vegetação no parque e nas bombas.

Ficheiros: `src/highway-services.js`, `src/world-sectors.js`,
`src/road-environments.js` e `src/roadside-clearance.js`.
Testes: `node tests/highway-services.mjs` e `npm run test:roads`.


## Iluminação LED moderna — ruas, estradas e acessos

`src/modern-road-lighting.js` substitui os postes simples da estrada
circular por candeeiros metálicos contemporâneos, com corpo cónico,
base, colar, braço inclinado e luminárias LED detalhadas. A iluminação
estende-se à EN 201, rua lateral da vila, acessos, rampas e troços da A1
junto à área de serviço, sem iluminar artificialmente toda a autoestrada.
A colocação respeita a rede de estradas, entradas e cruzamentos, evitando
postes no asfalto ou a obstruir acessos.

Os elementos são `InstancedMesh` agrupados por material: centenas de peças
visuais custam poucas chamadas à GPU. Apenas os 4–8 postes mais próximos do
carro utilizam luzes dinâmicas reais, sem sombras em tempo real; ao amanhecer,
as lentes LED deixam de emitir luz e as luzes reais desligam. A estação de
serviço mantém a sua iluminação específica. Tudo é configurável por
qualidade gráfica; o teste `tests/modern-road-lighting.mjs` valida
posicionamento, geometria, alternância dia/noite e limpeza dos recursos.


## Pavimento de cruzamentos e prevenção de estradas sobrepostas

`src/road-junctions.js` identifica cruzamentos ao nível do solo entre todas
as vias, e atribui uma hierarquia entre os respetivos pavimentos. O eixo
principal mantém uma superfície contínua; o pavimento secundário é cortado
com precisão ao longo da faixa principal para criar entroncamentos e
cruzamentos sem duas superfícies sobrepostas. Os muros laterais, bermas,
marcações e colisores Cannon são igualmente recortados. Os pavimentos
originais são preservados como fonte de amostragem das marcações para não
perder a precisão das faixas em curvas. A separação por altura impede
tratar falsamente passagens superiores como cruzamentos ao mesmo nível.


## GPS transparente e rotas ativas

O novo módulo `src/gps-navigation.js` mostra um mapa dinâmico, transparente,
com ruas próximas a cinzento claro, orientação do automóvel e trajeto em azul
luminoso como na referência enviada. No menu de pausa → MAPA é possível
escolher um destino (vila, área de serviço, quinta, miradouro, pedreira).
O GPS calcula uma rota curta por uma rede de caminhos ligada nos
cruzamentos ao mesmo nível e reajusta a rota quando o automóvel muda de via.
A imagem original enviada, convertida para WebP com transparência em `assets/ui/gps-reference.webp`, mantém o estilo do
exemplo em modo de exploração sem rota. Sem serviços externos ou localização
pessoal. Testes: `node tests/gps-navigation.mjs`.


## Linha ferroviária regional

`src/regional-railway.js` cria uma linha em circuito panorâmico por todas
as zonas do mapa (vale, zona urbana, autoestrada, bosque e encostas). Carris
metálicos, leito de balastro e milhares de travessas são gerados por instancing.
Nas zonas onde cruza estradas a via ganha altura progressivamente, com pilares
em zonas seguras, para evitar novamente superfícies viárias sobrepostas.
Duas estações com plataformas, faixas táteis, abrigos, montras, iluminação
natural e edifício de bilheteira. Uma automotora com duas carruagens viaja
pela linha, com animação e paragens. O comboio é um elemento animado — não um
simulador ferroviário com cabine controlável e colisões ferroviárias completas.
Testes: `node tests/regional-railway.mjs`.


## Florestas e vegetação silvestre mais densas

As três espécies de árvores com tronco e folhagem tridimensional já existentes
passam a distribuir-se por todo o mapa em vez de esgotarem a capacidade no
extremo ocidental. A densidade máxima foi aumentada e os sistemas de LOD,
instancing e culling são preservados. `src/wild-groundcover.js` adiciona
arbustos, flores espontâneas e relva em blocos naturais, com centenas de
aglomerados independentes no mapa, excluindo vias rodoviárias, acessos e
carril ferroviário. A opção de densidade da vegetação atua sobre ambos.


## BMW M4 Competition M xDrive — 2025

A garagem inclui o Coupé original e o BMW M4 Competition M xDrive 2025, com
modelo 3D procedural original inspirado nas proporções reais, incluindo
grelha dupla, faróis LED, vidro, spoiler, saídas de escape e tejadilho.
Não é um modelo digital oficial da BMW nem uma digitalização fotorrealista.
A escolha e a cor da carroçaria persistem nas definições locais.

Dados oficiais BMW Portugal: 390 kW (530 cv), 650 Nm, motor de seis cilindros
3.0 biturbo, caixa automática M Steptronic 8, tração M xDrive AWD, massa de
referência 1850 kg (EU), aceleração homologada 0–100 km/h em 3,5 s e limite
de velocidade de fábrica 250 km/h. A física simula o binário, relações,
travagem, suspensão, resistência aerodinâmica e um limitador físico de 250
km/h; o valor 3,5 s é o dado do fabricante, não um tempo exato garantido
pela física Cannon do jogo.

Fonte: https://www.bmw.pt/pt/all-models/m-series/4-modelos/bmw-m4-coupe-technical-data.html


## Ecrã de entrada premium e renderização de alta definição

O jogo abre num ecrã cinematográfico "Premir para continuar" (teclado/Enter
ou rato) com centro de atualizações. No Windows, as operações reais de pesquisa,
download e instalação utilizam a ponte segura do updater Electron existente,
sem instalar nada sem confirmação. No navegador, o jogo atualiza ao reabrir a
página e apresenta a informação da última release pública do GitHub.

Os menus de início, pausa, garagem, mapa, definições e HUD seguem uma nova
identidade de PC: azul-grafite e metal/âmbar, tipografia ampla, animações
suaves e navegação por teclado e comando. Removido o antigo verde-lima.

A renderização utiliza agora uma escala de 112% em Alto e 140% em Ultra,
com escolha opcional de supersampling até 150% e segurança de framebuffer
limitada a 5120 píxeis no maior lado. Texturas PBR procedurais: Alto 768,
Ultra 1536, detalhe do terreno 512 e anisotropia 16. Estas alterações
melhoram a nitidez mas aumentam o custo de GPU/VRAM e não transformam
modelos 3D em digitalizações fotorrealistas.
