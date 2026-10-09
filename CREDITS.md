# Recursos externos e licenças — CORSACARS

Este jogo é independente, usa **Three.js + cannon-es** e não utiliza nem modifica Unity ou o projeto Minecraft.

## Modelo de automóvel 3D (CC BY 4.0)

- Título: **Car Concept** (conceito de automóvel).
- Modelo e texturas: **Eric Chadwick**, © 2024 Darmstadt Graphics Group GmbH.
- Fonte: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept
- Ficheiro consumido com carregamento opcional:
  https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb
- Licença: https://creativecommons.org/licenses/by/4.0/
- O modelo é carregado sem redistribuir binários através deste repositório. É dimensionado e alinhado dinamicamente sobre o chassis de física do jogo; alguns materiais recebem ajustes de intensidade ambiental.

O recurso é um **concept car** fictício com elementos gráficos do projeto Khronos, e não uma réplica de um carro automóvel real. Permanece um placeholder original se não houver ligação à Internet ou o pedido falhar.

## Textura fotográfica de asfalto (CC0)

- Título: **Asphalt 02**.
- Fonte: https://polyhaven.com/a/asphalt_02
- Autor: Rob Tuytel / Poly Haven.
- Textura fotográfica difusa de 1K ou 2K servida por Poly Haven.
- Licença: https://polyhaven.com/license (CC0).
- O normal map e o mapa de rugosidade originais, gerados dentro do jogo, continuam ativos.

## HDRI e iluminação ambiente (CC0)

- Título: **Kloofendal 48d Partly Cloudy (Pure Sky)**.
- Fonte: https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky
- Autores: Greg Zaal (original), Jarod Guest (edição do céu), Poly Haven.
- A versão HDRI de 1K é utilizada para iluminação ambiente baseada em imagem quando o navegador a conseguir carregar.
- Licença: https://polyhaven.com/license (CC0).

## Informação importante

Os recursos alojados fora deste repositório requerem Internet, e a qualidade visual depende da GPU e do navegador. Existem **fallbacks funcionais** quando falham.

A iluminação por HDRI e sondas harmónicas esféricas é uma aproximação de iluminação ambiente indireta, **não** um renderizador de iluminação global multirressalto, ray tracing ou path tracing.

O contador de FPS apresenta dados do browser onde o jogo está a correr; não constitui uma medição de desempenho numa RTX 4070 Super sem execução nesse equipamento.
