# CORSACARS — Open Road v0.2

**CORSACARS** é um projeto de jogo de automóveis 3D independente, feito para **navegador** com [Three.js](https://threejs.org/) e [cannon-es](https://pmndrs.github.io/cannon-es/). **Não utiliza Unity** e não partilha quaisquer ficheiros com o projeto Minecraft.

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

## Limitações e próximas fases

Esta versão é um **protótipo funcional em código**, não um simulador automóvel concluído. Os recursos visuais são geométricos e originais; não contém automóveis licenciados nem ativos de jogos comerciais. Falta testar a experiência em execução, melhorar o modelo de pneus, ABS/controlo de tração reais, superfícies físicas distintas, tráfego AI, som gravado, material PBR avançado, interiores detalhados, garagem, remapeamento de teclas, minimapa, zonas do mundo carregadas dinamicamente e publicação pública em Pages.

Próxima prioridade: testar efetivamente em Chrome/Edge, acertar direção/suspensão/travagem e desempenho; depois expandir as estradas e os sistemas de simulação.
