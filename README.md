# XablauCard 🎴

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

## 👤 Cadastro, pontuação e ranking

- **Perfis** de jogadores (nome + avatar), salvos no aparelho. Toque no chip de perfil na tela inicial para criar/trocar.
- **Pontuação** estilo UNO ao vencer: soma dos pontos das cartas que sobraram nas mãos dos oponentes (número = valor, ação = 20, curinga = 50).
- **Ranking** com abas **Local** (no aparelho) e **Global** (via Supabase, opcional).

## ☁️ Backend opcional (Supabase) — ranking global e online

O jogo funciona 100% offline. Para ativar **ranking global** (e, em breve, **jogo online**):

1. Crie um projeto grátis em https://supabase.com
2. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
3. Cole em `js/config.js`:
   ```js
   window.UNOLIKE_CONFIG = {
     supabaseUrl: "https://SEU-PROJETO.supabase.co",
     supabaseAnonKey: "SUA_CHAVE_ANON",
   };
   ```
4. No Supabase, abra **SQL Editor** e rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
5. Em **Authentication → Providers**, habilite **Anonymous sign-ins**.
6. (Para o online, fase 3) Em **Database → Replication**, adicione `rooms` e `room_players` à publicação `supabase_realtime`.

> A chave **anon** é destinada ao front-end e é segura com as políticas de RLS do schema. Nunca use a chave **service_role** no app.

### Status das fases
- ✅ Fase 1: perfis, pontuação e ranking local
- ✅ Fase 2: ranking global (Supabase) — requer suas chaves
- ✅ Fase 3: jogo online — salas por código (Realtime, sem tabela) e partida pública (tabela `rooms`); host autoritativo. Em testes em dispositivos.

#### Como funciona o online
- **Salas por código:** usam apenas canais Realtime (broadcast + presence). Não exigem tabelas nem replicação — só o login anônimo habilitado.
- **Partida pública:** usa a tabela `rooms` para descobrir/criar salas abertas (rode o `schema.sql`).
- O **host** (quem cria a sala) é autoritativo: roda o motor e transmite o estado; os demais enviam ações.
