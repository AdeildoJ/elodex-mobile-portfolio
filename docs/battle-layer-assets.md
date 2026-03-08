# EloDex Battle Layer Assets

Este documento define o contrato de assets de batalha em camadas usado no mobile.

## Ordem de render

1. sky
2. background
3. ground
4. enemy platform
5. player platform
6. pokemon sprites
7. weather overlay
8. UI (HUD, menu, caixa de texto)

## Chaves suportadas em `battleAssets`

### Camadas principais

- `skyDay`
- `skyNight`
- `sky` (fallback geral)
- `backgroundDay`
- `backgroundNight`
- `background` (fallback geral)
- `groundDay`
- `groundNight`
- `ground` (fallback geral)

### Plataformas

- `platformPlayer`
- `platformEnemy`

### Overlay de clima (visual)

- `overlayRain`
- `overlaySnow`
- `overlaySandstorm`
- `overlaySunny`

### Compatibilidade legada (ainda aceito)

- `backgroundRain`
- `backgroundSunny`
- `backgroundSandstorm`
- `backgroundSnow`

Esses campos legados sao usados como fallback de fundo por clima quando nao existir uma camada nova equivalente.

## Regras de fallback (resumo)

- Se houver clima ativo, o sistema tenta primeiro as camadas/overlays de clima.
- Sem clima, usa day/night conforme horario local.
- Se day/night nao existir, usa os fallbacks gerais (`sky`, `background`, `ground`).
- Se nao houver plataforma por asset, usa a plataforma desenhada por codigo.

## Recomendacoes de arte

- Formato: PNG/WEBP (GIF apenas quando realmente necessario).
- Fundo/camadas: 16:9.
- Plataforma: PNG com transparencia.
- Evitar texto embutido no asset.
