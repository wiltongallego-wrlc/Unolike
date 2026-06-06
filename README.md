# Unolike 🎴

Jogo de cartas **estilo UNO** para celular, **single player** contra bots. Feito como **PWA** (Progressive Web App) com HTML, CSS e JavaScript puro — sem dependências, instalável na tela inicial e jogável offline.

## ✨ Recursos

- 🎮 Single player contra 1 a 3 bots com IA
- 📱 Design **mobile-first** (retrato), pensado para toque
- 🃏 Baralho completo de 108 cartas: números, Pular, Inverter, +2, Curinga e Curinga +4
- 🔔 Regra do **UNO!** (com penalidade de +2 se esquecer)
- 🔊 Efeitos sonoros gerados via WebAudio (sem arquivos) + vibração
- 💾 Funciona **offline** (service worker) e é **instalável** (PWA)
- 🎨 Animações de distribuição, descarte e indicadores de turno

## ▶️ Como rodar

Por ser uma PWA, precisa ser servida por HTTP (service workers não funcionam via `file://`).

```bash
# Opção 1: Python
python3 -m http.server 8080

# Opção 2: Node
npx serve .
```

Depois abra `http://localhost:8080` no navegador. Para testar no celular, use as ferramentas de desenvolvedor (modo dispositivo) ou acesse pelo IP da máquina na mesma rede.

## 📁 Estrutura

```
index.html              # Telas (home, jogo, modais)
css/styles.css          # Estilos mobile-first
js/cards.js             # Baralho, regras de combinação
js/audio.js             # Efeitos sonoros (WebAudio)
js/ai.js                # Decisões dos bots
js/game.js              # Motor do jogo (estado e turnos)
js/ui.js                # Renderização e ligação com o DOM
js/app.js               # Inicialização e navegação
manifest.webmanifest    # Metadados da PWA
sw.js                   # Service worker (offline)
icons/icon.svg          # Ícone do app
```

## 🎯 Como jogar

Combine a carta do topo pela **cor** ou pelo **número/símbolo**. Cartas jogáveis ficam destacadas. Quando ficar com 1 carta, toque em **UNO!** antes que o próximo jogue. Vence quem ficar sem cartas primeiro.

## 🛣️ Próximos passos (ideias)

- Modo multiplayer local (passa-e-joga) ou online
- Placar acumulado e níveis de dificuldade
- Ícones PNG dedicados e splash screens por dispositivo

---

> Projeto independente, sem afiliação com a marca UNO® / Mattel.
