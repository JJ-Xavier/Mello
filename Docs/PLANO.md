# Plano de implementação do Mello

> **Status:** planejamento aprovado em 21/10/2026 (plano, propostas P1 a P17 e telas novas 10 a 16). **Etapas 1 e 2 concluídas em 21/10/2026, etapa 3 em 22/10/2026, etapa 4 em 23/10/2026, etapa 5 em 24/10/2026, etapa 7 em 24/10/2026, etapa 6 em 26/10/2026, etapa 8 em 28/10/2026 etapa 9 em 29/10/2026 e etapa 10 em 29/10/2026**; a etapa 10 aguarda o commit. A 7 foi feita antes da 6, por decisão de 24/10/2026 (uma etapa de cada vez, a 7 primeiro).
> **Fonte da verdade visual:** [Mello — Protótipo de Telas](https://claude.ai/artifact/Jg9Y5yXZyw5fn8E7CdMuy9) (versão `1792610028-933e`; as telas 10 a 16, na área "Telas novas", foram aprovadas em 21/10/2026).
> **Regras de negócio completas:** [Regras.txt](Regras.txt). Os códigos citados aqui (`ENV-05`, `REP-08`…) são de lá.

## Sumário

1. [Decisões](#1-decisões)
2. [Stack](#2-stack)
3. [Estrutura de pastas](#3-estrutura-de-pastas)
4. [Processos e IPC](#4-processos-e-ipc)
5. [Modelo de dados](#5-modelo-de-dados)
6. [Regras de negócio centrais](#6-regras-de-negócio-centrais)
7. [Etapas de implementação](#7-etapas-de-implementação)
8. [Como cada etapa é conferida](#8-como-cada-etapa-é-conferida)
9. [Riscos](#9-riscos)
10. [Documentação por etapa](#10-documentação-por-etapa)

---

## 1. Decisões

### 1.1 Já tomadas

| Assunto | Decisão | Origem |
|---|---|---|
| Tipo de app | Monólito local: Electron + SQLite, um usuário, um computador, sem rede | `Docs/Arquitetura.txt` |
| Plataforma | Só Windows (instalador NSIS) | `Docs/Arquitetura.txt` |
| Front-end | React + TypeScript, com Vite (electron-vite) | `Docs/Definicao-da-Stack.txt` |
| Fora do escopo | Caixa de entrada, Planejador, Membros, Compartilhar, comentários | Briefing |
| Navegação | Quadro, Calendário e "Mudar de quadros" só na barra flutuante de baixo | Briefing |
| Nota | Uma por card, rich text com **TipTap**, salva sozinha | Briefing + 21/10 |
| Arquivos | Copiados para a pasta do app (`%APPDATA%\Mello\arquivos`), o banco guarda a referência | 21/10 |
| Calendário | Tela própria e parte central do app; abre pelo Início e pela barra do quadro | 21/10 |
| **Finalizado** | Card finalizado = está na área de finalizado **e** com o ✓ marcado. Arrastar para a área marca o ✓; tirar de lá desmarca (`FIN-01..03`) | 21/10 (substitui o "✓ **ou** lista" do briefing) |
| ✓ sem mover | Card com ✓ fora da área de finalizado continua envelhecendo (`FIN-04`) | 21/10 |
| Escopo extra | Busca, lembretes, modelos e capa do card entram na primeira versão | 21/10 |
| App fechado | Repetições perdidas: cria só a mais recente (`REP-10`) | 21/10 |
| Licença | MIT (arquivo `LICENSE` na etapa 1) | 21/10 |
| Primeira abertura | Início vazio, com o convite "Criar seu primeiro quadro" (`QUA-09`) | 21/10 |
| Telas sem protótipo | Desenhadas no canvas do protótipo, numa área separada ("Telas novas"), e aprovadas por você (telas 10 a 16, aprovadas em 21/10) | 21/10 |
| Dados no desenvolvimento | `npm run dev` usa `%APPDATA%\Mello-dev`; o app instalado usa `%APPDATA%\Mello` | Etapa 1, 21/10 |
| Barra de título | Barra nativa do Windows, no tema escuro, acima do cabeçalho de 56 px | Etapa 1, 21/10 |
| Instalação do Electron | Script próprio (`scripts/instalar-electron.mjs`), sem exigir o Visual C++ Redistributable (ver `Pipeline.txt`) | Etapa 1, 21/10 |
| Criar quadro | Popover com a prévia e o título; só cria ao confirmar (`QUA-10`) | Etapa 2, 21/10 |
| Card novo em lista de conclusão | Nasce sem o ✓; o automático é só para quem chega arrastado ou movido (`FIN-02`) | Etapa 3, 22/10 |
| Campos do modal | Etiquetas, prioridade e data só aparecem quando preenchidas; o "Adicionar" inclui (`CAR-09`) | Etapa 4, 23/10 |
| Arquivar pelo modal | O modal continua aberto, com o aviso e Restaurar (`CAR-10`) | Etapa 4, 23/10 |
| Ordem das etapas 6 e 7 | Uma de cada vez: a 7 (calendário) antes da 6 (envelhecimento) | 24/10 |
| Relógio de teste | Só no modo de desenvolvimento: Ctrl+Alt+→ e ← (1 dia), com Shift (1 hora), Ctrl+Alt+0 (relógio real) e um selo no canto; o main e a tela adiantam juntos | Etapa 6, 24/10 |
| Versão da etapa 6 | 0.7.1, porque veio depois da 7; as próximas seguem 0.N.0 | Etapa 6, 25/10 |
| Envelhecimento em card baixo | Abaixo de 100 px de altura, as manchas do `fog()` encolhem na proporção da altura; de 100 px para cima, o desenho é o do protótipo (`ENV-09`) | Etapa 6, 26/10 |

### 1.2 Propostas (aprovadas em 21/10/2026)

Quando não houve resposta direta, adotei o caminho abaixo. Todas foram aprovadas em 21/10/2026.

| # | Proposta | Por quê |
|---|---|---|
| P1 | A "área de finalizado" é a opção **"Lista de conclusão"** no menu "…" da lista, já ligada em Concluído e Entregue. "Não envelhece" continua sendo uma opção separada. | Renomear a lista não quebra a regra, e dá para ter mais de uma área de finalizado. |
| P2 | O calendário aberto **pelo Início** mostra todos os quadros, com seletor de quadro. Aberto **pela barra do quadro**, mostra aquele quadro. | É uma tela só, e ganha uma visão geral dos prazos. |
| P3 | Clicar num **card** no calendário abre o modal. Clicar numa **tarefa** marca ou desmarca o item. | Pela regra FIN-01, marcar o ✓ pelo calendário não finalizaria o card. |
| P4 | **Fechar a janela mantém o Mello na bandeja** (para lembretes e repetições), com opção para desligar. "Iniciar com o Windows" fica opcional e desligado. | Sem isso, lembrete só funciona com a janela aberta. |
| P5 | Lembrete: as opções do protótipo (Nenhum, No horário, 1 dia antes). Data sem hora lembra às 09:00. Os perdidos com o app fechado aparecem agrupados ao abrir. | O protótipo não detalha esses casos. |
| P6 | Modelos: card-modelo (selo "Modelo", não envelhece, fora do calendário) e quadro-modelo (copia listas, etiquetas, fundo e, se você quiser, os cards). | Não há tela de modelos no protótipo. Segue o comportamento do Trello. |
| P7 | Capa: cor (paleta das etiquetas) ou imagem (enviada ou tirada dos anexos), em faixa no topo do card. | Não há tela de capa no protótipo. |
| P8 | Sai o "Acompanhar card" (olho) e sai a contagem de comentários da face do card. | Sem outras pessoas e sem comentários, não têm função. |
| P9 | A descrição usa o mesmo editor da nota, em modo leitura com o botão "Editar". | Reaproveita o TipTap e mantém um padrão só. |
| P10 | **CSS Modules + variáveis CSS** no lugar do Tailwind. | As paletas e os estilos do protótipo são CSS puro e passam direto, sem tradução. |
| P11 | **Calendário próprio** no lugar do FullCalendar. | Só existe visão mensal, e o visual (tracejado, riscado, tarefas, repetições fantasma) exigiria refazer quase tudo do FullCalendar. |
| P12 | **Playwright** só como ferramenta de desenvolvimento, para tirar capturas do app e comparar com o protótipo. | O briefing pede conferência visual a cada etapa. |
| P13 | **Sem CI.** Os testes rodam no seu computador antes de cada aviso de "pronto". O CI seria um serviço do GitHub usado só durante o desenvolvimento (não afeta o app) e fica como opção futura. | O projeto não deve depender de serviços externos, e você mesmo faz o push. |
| P14 | O ícone do instalador (`.ico`) é gerado a partir do **logo do protótipo** na etapa 12. Os arquivos atuais de `Assets/Icon-Mello-Formatos/` não são apagados. | O logo do protótipo e o ícone atual têm cores e desenho diferentes. |
| P15 | **Branches, commits e push são seus** e a **parada ao fim de cada etapa** (decididos em 21/10). Ao fim de cada etapa eu paro e aviso que ela está pronta, com os arquivos alterados, o resumo e uma sugestão de mensagem. Você faz commit e push e me libera para a próxima. | Mantém um commit por etapa, o que permite reverter uma funcionalidade inteira. |
| P16 | Os dados de exemplo usados nas capturas e testes são **fictícios**. Não reproduzo os nomes reais do protótipo. | O repositório é público (ver `LGPD.txt`). |
| P17 | `Docs/Arquitetura.md` vira `Docs/Arquitetura.txt` na etapa 1, atualizado. Toda a documentação, inclusive os documentos novos, fica direto em `Docs/`, sem subpasta. A versão antiga fica no histórico do Git. | O briefing pede `.txt`, e a pasta `Docs/` já cumpre esse papel. |

As propostas menores de regra (ENV-06, FIN-06, LEM-02, LEM-07, NOT-07, CAL-02, CAL-11, CAR-08) estão marcadas com "(aprovada 21/10)" no `Regras.txt`.

---

## 2. Stack

Detalhes, justificativas e alternativas descartadas estão em [Definicao-da-Stack.txt](Definicao-da-Stack.txt).

| Camada | Escolha |
|---|---|
| App desktop | Electron (versão estável atual, fixada na etapa 1) |
| Linguagem | TypeScript em tudo |
| Build e dev | electron-vite (Vite) |
| Instalador | electron-builder, NSIS, Windows x64 |
| Banco | SQLite + better-sqlite3 + Drizzle ORM (schema e migrações) |
| Validação do IPC | Zod |
| Interface | React, React Router (HashRouter), TanStack Query, Zustand |
| Arrastar | dnd-kit |
| Editor da nota e da descrição | TipTap (StarterKit, TaskList, Link) |
| Estilo | CSS Modules + variáveis CSS do protótipo; fonte Inter local (@fontsource/inter) |
| Datas | date-fns (pt-BR) |
| Ordenação | fractional-indexing |
| Logs | electron-log |
| Testes | Vitest (+ Testing Library e jsdom); Playwright só para capturas |
| Qualidade | ESLint + Prettier (sem CI, P13) |

---

## 3. Estrutura de pastas

```
Mello/
├── Assets/                    # identidade visual e imagens de referência (já existe)
├── Docs/                      # documentação, inclusive este PLANO.md (já existe)
├── build/                     # ícone do instalador
├── scripts/
│   ├── instalar-electron.mjs  # postinstall: baixa o Electron sem exigir o VC++ Redistributable
│   └── capturar-telas.mts     # abre o app com dados fictícios e salva as capturas (Playwright)
├── src/
│   ├── main/                  # processo principal (Node.js)
│   │   ├── index.ts           # ciclo de vida, janela, instância única
│   │   ├── paths.ts           # pastas de dados (banco, arquivos, backups, logs)
│   │   ├── tray.ts            # ícone e menu da bandeja
│   │   ├── protocol.ts        # mello-arquivo:// → serve só arquivos de %APPDATA%\Mello\arquivos
│   │   ├── scheduler.ts       # relógio: repetições, lembretes, backup, recálculo do envelhecimento
│   │   ├── db/
│   │   │   ├── client.ts      # conexão, pragmas, função unaccent para a busca
│   │   │   ├── schema.ts      # tabelas (Drizzle)
│   │   │   ├── migrate.ts     # aplica as migrações (tabela _migrations)
│   │   │   ├── open.ts        # abre o banco: backup se preciso, depois migra
│   │   │   └── migrations/    # SQL gerado pelo drizzle-kit
│   │   ├── modules/           # regras + consultas, um arquivo por assunto
│   │   │   ├── boards.ts  lists.ts  cards.ts  labels.ts  checklists.ts  position.ts
│   │   │   ├── activity.ts  files.ts  attachments.ts  covers.ts
│   │   │   ├── recurrence.ts  reminders.ts  calendar.ts  search.ts
│   │   │   ├── templates.ts  settings.ts  backup.ts  export.ts
│   │   └── ipc/               # handler.ts (Zod + Result), routes.ts (canais, sem Electron), index.ts
│   ├── preload/
│   │   └── index.ts           # expõe window.mello
│   ├── shared/                # código puro, usado pelo main, pela tela e pelos testes
│   │   ├── result.ts  text.ts # Result/AppError e removeAccents
│   │   ├── ipc/               # contratos: canais, tipos e schemas Zod, por domínio
│   │   └── rules/             # aging.ts finished.ts priority.ts recurrence.ts
│   │                          # calendar.ts dates.ts background.ts tone.ts filter.ts
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── app/           # rotas, providers, cabeçalho, barra flutuante
│           ├── features/
│           │   ├── home/      # Início, quadros fechados, modelos
│           │   ├── board/     # Kanban, listas, cards, arrastar, filtro
│           │   ├── card/      # modal, checklist, nota, atividade, anexos, capa
│           │   ├── calendar/  # calendário mensal
│           │   ├── recurrence/# diálogo Repetir e aviso de repetição pulada
│           │   ├── background/# editor de fundo
│           │   ├── settings/  # Configurações
│           │   └── search/    # busca do topo
│           ├── components/    # Popover, Modal, Button, PriorityIcon, Logo, DatePicker…
│           ├── lib/           # fog.ts (do protótipo), api.ts, queryKeys.ts, format.ts
│           ├── styles/        # themes.css (paletas literais), base.css, fonts.css
│           └── test/          # preparação dos testes da tela (API real, imitação do popover)
├── electron.vite.config.ts  vitest.config.mts  electron-builder.yml  drizzle.config.ts
├── eslint.config.mjs  tsconfig*.json  package.json  LICENSE  README.md
```

Os testes ficam ao lado do código (`aging.test.ts` junto de `aging.ts`). As regras de `shared/rules/` são funções puras, sem banco e sem relógio próprio (o "agora" chega por parâmetro), e por isso são testadas isoladamente.

---

## 4. Processos e IPC

```
Tela (React)  →  window.mello (preload)  →  ipc/ (Zod)  →  modules/  →  SQLite
                                               ↑
                          scheduler (main) ────┘  → avisa a tela pelo evento "data:changed"
```

- Todo canal é requisição e resposta (`invoke`/`handle`), com a entrada validada por Zod e a resposta num envelope `Result` (`{ ok: true, data }` ou `{ ok: false, error }`).
- A tela nunca acessa arquivo, banco ou Node. Imagens e anexos chegam por `mello-arquivo://<hash>`, um protocolo que só entrega arquivos da pasta do app.
- Segurança: `contextIsolation`, `sandbox`, sem `nodeIntegration`, CSP `default-src 'self'; img-src 'self' mello-arquivo: data:`, links externos só pelo navegador padrão.

### Canais

| Domínio | Canais |
|---|---|
| Quadros | `boards:list`, `boards:get`, `boards:create`, `boards:update`, `boards:move`, `boards:close`, `boards:reopen`, `boards:delete`, `boards:listClosed`, `boards:setBackground`, `boards:archived` |
| Listas | `lists:create`, `lists:update`, `lists:move`, `lists:copy`, `lists:moveToBoard`, `lists:sort`, `lists:archive`, `lists:archiveCards`, `lists:restore` |
| Cards | `cards:get`, `cards:create`, `cards:update`, `cards:move`, `cards:setDone`, `cards:copy`, `cards:archive`, `cards:restore`, `cards:delete`, `cards:setLabels`, `cards:saveNote`, `cards:setCover`, `cards:activity` |
| Etiquetas | `labels:list`, `labels:create`, `labels:update`, `labels:delete` |
| Checklist | `checklists:create`, `checklists:update`, `checklists:delete`, `checklists:move`, `items:create`, `items:update`, `items:toggle`, `items:move`, `items:delete` |
| Arquivos | `files:pickAndImport`, `files:importDropped`, `attachments:add`, `attachments:remove`, `attachments:open` |
| Repetição | `recurrence:get`, `recurrence:save`, `recurrence:remove`, `recurrence:preview`, `recurrence:createAnyway`, `recurrence:dismiss` |
| Calendário | `calendar:month` |
| Busca | `search:query` |
| Modelos | `templates:setCard`, `templates:listCards`, `templates:createCard`, `templates:setBoard`, `templates:createBoard` |
| Configurações | `settings:get`, `settings:set` |
| App | `app:info` (versão, pasta de dados, se é desenvolvimento; criado na etapa 1); `dev:clock` e `dev:setClock` (relógio de teste do modo de desenvolvimento, etapa 6) |
| Dados | `data:backupNow`, `data:backups` (era `data:listBackups`), `data:restore`, `data:export`, `data:openFolder`, `data:chooseBackupFolder`, `data:deleteAll`, `data:notices` (etapa 10) |
| Eventos (main → tela) | `data:changed`, `app:openCard` (clique na notificação), `tray:notice`, `backup:notice` (etapa 10; o `theme:changed` não foi preciso: a tela segue o `prefers-color-scheme`) |

---

## 5. Modelo de dados

Convenções: IDs são UUID em texto. `created_at`, `updated_at` e os demais campos `*_at` numéricos são epoch em milissegundos (UTC). Datas de entrega são texto local sem fuso. Booleanos são `INTEGER` 0/1. `position` é uma chave de *fractional indexing*. Chaves estrangeiras ficam ligadas (`PRAGMA foreign_keys = ON`), em modo WAL.

### `board` — quadros

| Campo | Tipo | Observação |
|---|---|---|
| `id` | TEXT PK | |
| `title` | TEXT NOT NULL | QUA-01 |
| `position` | TEXT NOT NULL | ordem manual |
| `is_favorite` | INTEGER NOT NULL DEFAULT 0 | QUA-06 |
| `is_template` | INTEGER NOT NULL DEFAULT 0 | MOD-04 |
| `closed_at` | INTEGER NULL | quadro fechado (QUA-04) |
| `bg_kind` | TEXT NOT NULL DEFAULT 'gradient' | `image` \| `color` \| `gradient` |
| `bg_value` | TEXT NOT NULL DEFAULT 'mello' | hex, id do gradiente ou id do arquivo |
| `bg_auto` | INTEGER NOT NULL DEFAULT 1 | ajuste automático ligado |
| `bg_focus` | INTEGER NOT NULL DEFAULT 4 | 0–8 (grade 3 × 3) |
| `bg_zoom` | INTEGER NOT NULL DEFAULT 100 | 100–200 |
| `bg_dim` | INTEGER NOT NULL DEFAULT 0 | 0–70 |
| `bg_blur` | INTEGER NOT NULL DEFAULT 0 | 0–20 |
| `bg_tone` | TEXT NOT NULL | tom do envelhecimento (FUN-09) |
| `created_at`, `updated_at` | INTEGER NOT NULL | |

### `list` — listas

| Campo | Tipo | Observação |
|---|---|---|
| `id` | TEXT PK | |
| `board_id` | TEXT NOT NULL → `board` ON DELETE CASCADE | |
| `title` | TEXT NOT NULL | |
| `position` | TEXT NOT NULL | |
| `freezes_aging` | INTEGER NOT NULL DEFAULT 0 | "Não envelhece" |
| `is_done_list` | INTEGER NOT NULL DEFAULT 0 | "Lista de conclusão" (P1) |
| `archived_at` | INTEGER NULL | |
| `created_at`, `updated_at` | INTEGER NOT NULL | |

### `card` — cards

| Campo | Tipo | Observação |
|---|---|---|
| `id` | TEXT PK | também é a semente do `fog()` |
| `list_id` | TEXT NOT NULL → `list` ON DELETE CASCADE | |
| `title` | TEXT NOT NULL | |
| `position` | TEXT NOT NULL | |
| `description_html` | TEXT NOT NULL DEFAULT '' | HTML filtrado (NOT-04) |
| `description_text` | TEXT NOT NULL DEFAULT '' | texto puro, para busca e filtro |
| `note_html` | TEXT NOT NULL DEFAULT '' | a nota |
| `note_text` | TEXT NOT NULL DEFAULT '' | texto puro da nota |
| `is_done` | INTEGER NOT NULL DEFAULT 0 | o ✓ circular |
| `done_at` | INTEGER NULL | |
| `priority` | INTEGER NULL CHECK (priority BETWEEN 1 AND 5) | NULL = sem prioridade |
| `due_at` | TEXT NULL | `AAAA-MM-DD` ou `AAAA-MM-DDTHH:mm` |
| `reminder` | TEXT NOT NULL DEFAULT 'none' | `none` \| `at_time` \| `day_before` |
| `reminder_fired_at` | INTEGER NULL | volta a NULL quando a data ou o lembrete mudam |
| `cover_kind` | TEXT NULL | `color` \| `image` |
| `cover_value` | TEXT NULL | hex ou id do arquivo |
| `is_template` | INTEGER NOT NULL DEFAULT 0 | MOD-01 |
| `recurrence_id` | TEXT NULL → `recurrence` ON DELETE SET NULL | série a que pertence |
| `occurrence_date` | TEXT NULL | dia da repetição que criou o card |
| `last_activity_at` | INTEGER NOT NULL | base do envelhecimento (ENV-01) |
| `archived_at` | INTEGER NULL | |
| `created_at`, `updated_at` | INTEGER NOT NULL | |

### `label` e `card_label` — etiquetas

| Tabela | Campos |
|---|---|
| `label` | `id` PK, `board_id` → `board` CASCADE, `name` TEXT NULL, `color` TEXT NOT NULL, `position` TEXT NOT NULL |
| `card_label` | `card_id` → `card` CASCADE, `label_id` → `label` CASCADE, PK (`card_id`, `label_id`) |

### `checklist` e `checklist_item`

| Tabela | Campos |
|---|---|
| `checklist` | `id` PK, `card_id` → `card` CASCADE, `title` TEXT NOT NULL, `position` TEXT NOT NULL, `hide_checked` INTEGER NOT NULL DEFAULT 0 |
| `checklist_item` | `id` PK, `checklist_id` → `checklist` CASCADE, `text` TEXT NOT NULL, `is_done` INTEGER NOT NULL DEFAULT 0, `due_date` TEXT NULL (`AAAA-MM-DD` ou `AAAA-MM-DDTHH:mm`, com hora desde 28/10/2026), `show_in_calendar` INTEGER NOT NULL DEFAULT 1, `position` TEXT NOT NULL, `created_at`, `updated_at` |

### `activity` — histórico do card

`id` PK, `card_id` → `card` CASCADE, `kind` TEXT NOT NULL (`created`, `moved`, `done`, `undone`, `archived`, `restored`, `copied`, `from_template`, `from_recurrence`, `recurrence_skipped`, `recurrence_missed`), `data` TEXT NOT NULL (JSON: nomes das listas, datas…), `created_at`.

### `file` e `attachment` — arquivos

| Tabela | Campos |
|---|---|
| `file` | `id` TEXT PK (SHA-256 do conteúdo), `ext` TEXT, `mime` TEXT, `size` INTEGER, `width` INTEGER NULL, `height` INTEGER NULL, `avg_color` TEXT NULL (imagens), `created_at` |
| `attachment` | `id` PK, `card_id` → `card` CASCADE, `file_id` → `file` RESTRICT, `name` TEXT NOT NULL (nome original), `created_at` |

O arquivo físico fica em `%APPDATA%\Mello\arquivos\<sha256>.<ext>`. Fundo, capa e anexo apontam para `file.id`. Arquivos sem referência são limpos na abertura seguinte (DAD-08).

### `recurrence` e `recurrence_occurrence` — repetição

| Campo de `recurrence` | Tipo | Observação |
|---|---|---|
| `id` | TEXT PK | |
| `board_id` | TEXT NOT NULL → `board` CASCADE | |
| `freq` | TEXT NOT NULL | `daily` \| `weekly` \| `monthly` \| `every_n` |
| `weekdays` | INTEGER NOT NULL DEFAULT 0 | máscara de bits: dom = 1, seg = 2, … sáb = 64 |
| `month_day` | INTEGER NULL | 1–31 |
| `interval_days` | INTEGER NULL | 1–365 |
| `anchor_date` | TEXT NOT NULL | dia em que foi salva (base do "a cada N") |
| `time` | TEXT NOT NULL | `HH:mm` |
| `target_list_id` | TEXT NULL → `list` ON DELETE SET NULL | NULL = pausada (REP-16) |
| `copy_labels_priority`, `copy_description`, `copy_checklist`, `copy_due_date` | INTEGER NOT NULL | REP-04 |
| `if_previous_open` | TEXT NOT NULL DEFAULT 'skip' | `skip` \| `create` |
| `ends_kind` | TEXT NOT NULL DEFAULT 'never' | `never` \| `on_date` \| `after_count` |
| `ends_on` | TEXT NULL | |
| `ends_after` | INTEGER NULL | |
| `due_count` | INTEGER NOT NULL DEFAULT 0 | ocorrências que já venceram (REP-06) |
| `last_processed` | TEXT NULL | última ocorrência processada (`AAAA-MM-DDTHH:mm`) |
| `created_at`, `updated_at` | INTEGER NOT NULL | |

`recurrence_occurrence`: `id` PK, `recurrence_id` → `recurrence` CASCADE, `occurrence_date` TEXT NOT NULL, `status` TEXT NOT NULL (`created` \| `skipped` \| `missed` \| `created_anyway`), `card_id` NULL → `card` SET NULL (card criado), `notice_card_id` NULL → `card` SET NULL (card que mostra o aviso), `dismissed_at` INTEGER NULL, `created_at`. UNIQUE (`recurrence_id`, `occurrence_date`).

### `setting` — configurações

`key` TEXT PK, `value` TEXT NOT NULL (JSON). Chaves: `theme`, `aging.enabled`, `calendar.showTasks`, `calendar.strikeDone`, `calendar.weekStart`, `tray.keep`, `app.autoStart`, `backup.folder`, `backup.lastAt`.

### Índices

`list(board_id, position)`, `card(list_id, position)`, `card(due_at)`, `card(recurrence_id)`, `card(is_template)`, `label(board_id)`, `checklist(card_id, position)`, `checklist_item(checklist_id, position)`, `checklist_item(due_date)`, `activity(card_id, created_at)`, `attachment(card_id)`, `recurrence_occurrence(recurrence_id, occurrence_date)`.

### Migrações

- O schema completo acima entrou como a migração **`0000_esquema_inicial`** na etapa 1 (o drizzle-kit numera a partir de 0000). O que mudar depois vira uma migração nova (0001, 0002…), mesmo durante o desenvolvimento, para praticar o fluxo real.
- Na etapa 1 entraram também índices nas colunas de chave estrangeira que não tinham índice (`card_label.label_id`, `attachment.file_id`, `recurrence.board_id`, `recurrence.target_list_id`, `recurrence_occurrence.card_id` e `notice_card_id`), para as exclusões em cascata não varrerem tabelas inteiras.
- As migrações são geradas pelo drizzle-kit em SQL, entram no código do app no build e rodam na abertura, dentro de uma transação, **depois de um backup automático** quando o banco já tem dados (DAD-01).
- Uma migração aplicada nunca é editada. Os detalhes ficam em `Docs/Modelo-de-Dados.txt`.

---

## 6. Regras de negócio centrais

As quatro regras que mais têm lógica, em forma testável. As demais estão no `Regras.txt`.

### 6.1 Nível de envelhecimento (`shared/rules/aging.ts`)

```
nivelDoCard(card, lista, config, agora):
  se config.envelhecimentoDesligado      → 0  (congelado: "desligado")
  se lista.freezes_aging                 → 0  (congelado: "lista")
  se finalizado(card, lista)             → 0  (congelado: "finalizado")
  se card.is_template                    → 0  (congelado: "modelo")
  dias = floor((agora − card.last_activity_at) / 86 400 000)
  dias < 3 → 0 | < 6 → 1 | < 9 → 2 | < 12 → 3 | < 14 → 4 | senão → 5
```

Casos de teste obrigatórios: os limites 2→3, 5→6, 8→9, 11→12, 13→14 dias (um milissegundo antes e no ponto exato); cada motivo de congelamento; card com ✓ fora da lista de conclusão envelhece (FIN-04); 100 dias → nível 5.

Na etapa 6, a regra ficou em `agingOf` e é calculada na tela, com o "agora" dela (a mesma conta serve ao quadro e ao indicador do modal).

### 6.2 Eventos que zeram (ENV-05 e ENV-06)

Cada função de `modules/cards.ts`, `checklists.ts`, `attachments.ts`, `covers.ts` e `recurrence.ts` que altera um card chama `touch(cardId, agora)` dentro da mesma transação. O teste percorre **uma tabela de eventos**: para cada evento de ENV-05, executa e confere que `last_activity_at` = agora; para cada evento de ENV-06, executa e confere que não mudou. Se um evento novo for criado e não entrar na tabela, o teste de cobertura da tabela falha.

"Soltar no mesmo lugar" é detectado **na tela**: se a lista e os vizinhos não mudaram, nenhuma chamada é feita. O main também confere (CAR-03), caso a chamada chegue.

### 6.3 O que conta como finalizado (`shared/rules/finished.ts`)

```
finalizado(card, lista) = lista.is_done_list E card.is_done
tarefaFinalizada(item)  = item.is_done

ao mover o card da lista A para a lista B:
  se  B.is_done_list e não A.is_done_list → is_done = 1, done_at = agora   (FIN-02)
  se  A.is_done_list e não B.is_done_list → is_done = 0, done_at = NULL    (FIN-03)
  senão                                  → is_done fica como está
```

A mesma função alimenta o calendário (riscado), o envelhecimento (congelado), a repetição ("anterior concluído"), os lembretes (não dispara) e o atraso (não atrasa).

### 6.4 Agendador de repetição (`shared/rules/recurrence.ts` + `modules/recurrence.ts`)

Funções puras:

```
ocorrenciasEntre(regra, depoisDe, ateInclusive) → lista de "AAAA-MM-DDTHH:mm"
  diária: todo dia | semanal: dias da máscara | mensal: dia X ou o último dia do mês
  a cada N: anchor_date + k·N dias (k ≥ 1)
  corta pelo término: ends_on (inclusive) ou ends_after − due_count
proximas(regra, agora, n) → as n próximas depois de agora (prévia "Próximas:")
```

Rodada do agendador, executada ao abrir o app e a cada minuto (REP-11), para cada repetição ativa e não pausada:

```
vencidas = ocorrenciasEntre(regra, regra.last_processed, agora)
se vencidas está vazia → nada a fazer
anteriores = todas menos a última → registra cada uma como "missed" e a atividade (REP-10)
ultima = a última vencida
anterior = card mais recente da série, não arquivado (REP-07)
se anterior existe e não finalizado(anterior) e regra.if_previous_open = 'skip':
     registra "skipped" com notice_card_id = anterior              (REP-08)
senão:
     cria o card na lista de destino, no topo, copiando conforme REP-04,
     last_activity_at = agora, is_done = 0, atividade "Criado pela repetição"  (REP-12)
due_count += quantidade de vencidas; last_processed = ultima
tudo numa transação; ao final, emite "data:changed"
```

Casos de teste obrigatórios: cada frequência (inclusive mensal dia 31 em fevereiro e semanal com vários dias); os três tipos de término; pular e avisar; criar mesmo assim; "Criar agora mesmo assim" e "Dispensar"; app fechado por 10 dias numa repetição diária (cria 1 e registra 9 como "missed"); cópia de cada opção, com o checklist zerado; card novo com nível 0; rodar duas vezes no mesmo minuto não duplica nada (a restrição UNIQUE garante); quadro fechado pausa a repetição.

---

## 7. Etapas de implementação

São 12 etapas, em ordem. Cada uma termina com testes verdes, conferência visual, documentação atualizada e um aviso de "pronto" para você fazer o commit (seção 8). Os códigos de tela são os títulos do canvas: 1 Início, 2 Quadro, 3 Arrasto, 4 Modal, 5 Calendário, 6 Fundo, 6b Repetição, 7 Configurações, 8 Quadro claro e 9 Estados, mais as telas novas: 10 Início vazio, 11 Modelos de quadro, 12 Modelos de card, 13 Calendário de todos os quadros, 14 Modal com capa e anexos, 15 Configurações novas e 16 Estados e menus novos.

### Etapa 1 — Base do app e banco ✅ concluída em 21/10/2026

- **Resultado:** tudo da entrega abaixo foi feito; 46 testes, lint e tipos limpos; capturas das 5 rotas nos dois temas conferidas com o protótipo. Decisões da etapa: dados do dev em `%APPDATA%\Mello-dev`, barra de título nativa escura e instalação do Electron por script próprio (seção 1.1). O better-sqlite3 13 traz binário N-API, e o risco do módulo nativo (seção 9) deixou de existir. Detalhes no `Changelog.txt`.
- **Entrega:** projeto electron-vite (React + TS) com ESLint, Prettier e Vitest; estrutura de pastas; conexão SQLite com pragmas e a função `unaccent`; schema completo e migração inicial (0000); backup antes de migrar; utilitário de IPC (Zod + `Result`); protocolo `mello-arquivo://`; temas com as paletas literais e a fonte Inter local; casca do app (cabeçalho com o logo do protótipo, busca, "Criar" e engrenagem; barra flutuante de baixo; rotas vazias); `.gitignore`; `LICENSE` (MIT); `README.md` curto para a página do GitHub; `electron-builder.yml`; script de capturas.
- **Telas:** o cabeçalho e a barra flutuante comuns a 1, 2 e 5.
- **Aceite:** `npm run dev` abre a janela com o cabeçalho igual ao protótipo (56 px, cores, logo); o banco é criado em `%APPDATA%\Mello\mello.db` com todas as tabelas; reabrir não recria nada; `npm test`, `npm run lint` e `npm run typecheck` passam limpos; o better-sqlite3 abre dentro do Vitest.
- **Testes:** a migração roda do zero e é idempotente; chaves estrangeiras ligadas; `Result` de sucesso e de erro; Zod recusa entrada inválida; o protocolo recusa caminhos fora da pasta de arquivos (`..`, caminho absoluto, hash inválido).

### Etapa 2 — Quadros e listas ✅ concluída em 21/10/2026

- **Resultado:** tudo da entrega abaixo foi feito; 112 testes no total (66 novos), lint e tipos limpos; capturas conferidas com as telas 1, 2, 9, 10 e 16 nos dois temas; arrastar conferido no app real (mouse e teclado). "Criar quadro" ganhou um popover com o título (`QUA-10`, aprovado). Filtro, "Alterar fundo", "Adicionar cartão", "Ordenar" e modelos aparecem apagados até a etapa deles. Os testes da tela passaram a usar o main de verdade (rotas + SQLite em memória). Detalhes no `Changelog.txt`.
- **Entrega:** Início (área "Pessoal", grade de quadros com a miniatura do fundo, "Criar novo quadro", favoritos primeiro, "Ver todos os quadros fechados" e o convite "Criar seu primeiro quadro" quando não há nenhum, QUA-09); menu "Criar" → "Criar quadro"; popover "Mudar de quadros"; tela do quadro com a barra superior (título editável, filtro, favoritar, "Alterar fundo" e menu "…" com fechar quadro e itens arquivados); listas: criar, renomear, arrastar, contador e o menu "…" (copiar, mover para outro quadro, "Não envelhece", "Lista de conclusão", arquivar lista, arquivar todos os cards); quadro novo com 4 listas, 6 etiquetas e o fundo "Mello".
- **Telas:** 1, 2 (estrutura), 9 (nova lista, menu da lista, "Mudar de quadros", menu "Criar"); 10 (Início vazio); 16 (menu da lista atualizado, menu do quadro, itens arquivados, quadros fechados).
- **Aceite:** criar, renomear, favoritar, fechar e reabrir quadros; criar, renomear, arrastar, copiar, mover e arquivar listas; tudo persiste depois de reiniciar o app.
- **Testes:** QUA-01..07, LIS-01..07; a posição fracionária ao arrastar listas; etiquetas recriadas ao mover lista (LIS-05).

### Etapa 3 — Cards e arrastar ✅ concluída em 22/10/2026

- **Resultado:** tudo da entrega abaixo foi feito; 161 testes no total (49 novos), lint e tipos limpos; capturas conferidas com as telas 2, 3, 8, 9 e 16 nos dois temas; arrastar conferido no app real (mouse e teclado, inclusive o ✓ automático e o "mesmo lugar"). Entrou também o "Criar card" do menu "Criar". O modal do card abre pelo endereço (`?card=`), para o calendário reaproveitar na etapa 7. Decisão da etapa: card criado numa lista de conclusão nasce sem ✓ (seção 1.1). Detalhes no `Changelog.txt`.
- **Entrega:** criar card (formulário da tela 9); face do card com tudo o que já existe nessa etapa (etiquetas, título, ✓, data, contadores); arrastar cards dentro da lista e entre listas com o visual do protótipo (card inclinado e translúcido, lista de destino com borda azul, vaga reservada); arrastar listas e cards com teclado (dnd-kit); FIN-02 e FIN-03 automáticos; soltar no mesmo lugar não grava nada; clicar abre a casca do modal; tema claro do quadro.
- **Telas:** 2, 3, 8, 9 (novo card); 16 (card concluído, arrastar para a área de finalizado).
- **Aceite:** arrastar entre todas as listas, inclusive para a área de finalizado (o ✓ é marcado sozinho) e de volta (desmarcado); a ordem persiste.
- **Testes:** CAR-02, CAR-03, FIN-01..05; o movimento atualiza a lista, a posição e o `last_activity_at`; o mesmo lugar não muda nada.

### Etapa 4 — Modal do card: dados ✅ concluída em 23/10/2026

- **Resultado:** tudo da entrega abaixo foi feito; 280 testes no total (119 novos, inclusive a tabela de eventos de ENV-05 e ENV-06 com cobertura de todos os canais), lint e tipos limpos; capturas conferidas com as telas 4, 9, 14 e 16 nos dois temas; conferência no app real (descrição com link, Esc e clique fora no modal, reordenar item, rolagem automática). Decisões da etapa: campos só quando preenchidos (`CAR-09`) e arquivar com aviso no modal (`CAR-10`). O texto rico passou a ser escrito pelo main a partir do documento do editor (sem parser de HTML no main), e a rolagem automática do arraste passou a ser própria. Entrou o TipTap 3.31.4. Detalhes no `Changelog.txt`.
- **Entrega:** modal de 1160 × 804 px como no protótipo. Ele tem: seletor de lista (move o card); ✓ circular; título editável; botões Adicionar, Checklist, Anexo e Repetir; etiquetas (editor da tela 9); prioridade (seletor com "Sem prioridade") e o selo na face; data de entrega (seletor de data com hora e lembrete, que é salvo aqui e dispara na etapa 8; "Em atraso"); descrição (TipTap, "Editar"); checklists (vários, renomear, excluir, barra de progresso, "Ocultar itens marcados", itens com marcar, editar, data com "Mostrar no calendário", ações e "Adicionar um item"); "Última movimentação"; menu "…" (copiar, mover, arquivar, excluir). Também traz "Ordenar por prioridade" e "por data" na lista e o filtro do quadro (palavra-chave, prioridades, só recorrentes).
- **Telas:** 4 (coluna da esquerda), 9 (etiquetas, prioridade, seletor de data, data da tarefa, filtro, menu da lista); 14 (menu "…" do card); 16 (mover, copiar e excluir card).
- **Aceite:** cada campo do modal salva e reflete na face do card; ordenar e filtrar funcionam.
- **Testes:** PRI-01..05, DAT-01..04, CHK-01..06, FLT-01..05, ETQ-01..04, CAR-05..07; a tabela de eventos de ENV-05 e ENV-06 para tudo o que existe até aqui.

### Etapa 5 — Modal do card: nota, atividade, anexos e capa ✅ concluída em 24/10/2026

- **Resultado:** tudo da entrega abaixo foi feito; 336 testes no total (56 novos), lint e tipos limpos; capturas conferidas com as telas 4, 14 e 16 nos dois temas; conferência no app real (nota digitada, anexar pela janela do Windows e soltando arquivo, abrir a cópia, capa na face e no modal). Decisões da etapa: anexar também arrastando do Explorer (`ANX-01`); "Abrir" abre uma cópia temporária só leitura com o nome original, e programas são mostrados na pasta (`ANX-03`). A tela recebe uma ficha de cada arquivo, nunca o caminho. A limpeza dos arquivos sem uso fica para a etapa 10, com o espelho do backup. Entraram image-size 2.0.4 e @tiptap/extensions 3.31.4. Detalhes no `Changelog.txt`.
- **Entrega:** coluna da direita com a Nota (TipTap com Título, Negrito, Itálico, Lista, Caixa de marcar e Link; salvamento automático; "Salvo automaticamente") e a Atividade recolhida, com a contagem; seção de Anexos (escolher arquivo, copiar com hash, miniatura de imagem, abrir, remover); Capa (cor ou imagem); ícone de nota e de anexos na face.
- **Telas:** 4 (coluna da direita e barra do topo); 14 (capa e anexos); 16 (capa na face do card).
- **Aceite:** a nota sobrevive a reiniciar o app; anexar o mesmo arquivo duas vezes guarda uma cópia só; a capa aparece na face e no modal.
- **Testes:** NOT-01..07 (inclusive HTML proibido sendo descartado: `<script>`, `onerror`, `javascript:`), ATV-01..03, ANX-01..05, CAP-01..03; tabela de eventos ampliada.

### Etapa 6 — Envelhecimento ✅ concluída em 26/10/2026 (depois da etapa 7)

- **Resultado:** tudo da entrega abaixo foi feito; 423 testes no total (36 novos), lint e tipos limpos; capturas conferidas com as telas 2, 4 e 8 nos dois temas; no app real, 200 cards no nível 5 arrastam tão leve quanto 200 cards novos (17 ms por quadro no p95). O nível é calculado na tela, a cada minuto. O relógio do modo de desenvolvimento adianta por atalho (Ctrl+Alt+→), com um selo no canto, e serve também à etapa 8 (canais `dev:clock` e `dev:setClock`). Decisões da etapa: relógio de teste por atalho (24/10); versão 0.7.1 (25/10); manchas proporcionais nos cards com menos de 100 px de altura (26/10); textos do indicador e o card arrastado com o envelhecimento de antes de soltar. Detalhes no `Changelog.txt`.
- **Entrega:** cálculo do nível (seção 6.1); `fog()` do protótipo adaptado ao tamanho real do card, com o tom vindo do fundo (FUN-09; até a etapa 9 só existem cor e gradiente); congelamento por lista, por finalização, por modelo e pela configuração; indicador no modal ("Parado há X dias · nível N de 5", com as barrinhas); recálculo ao abrir o quadro e de hora em hora.
- **Telas:** 2 (os 5 níveis), 4 (indicador).
- **Aceite:** com o relógio adiantado no modo de desenvolvimento, os cards passam pelos 5 níveis e o visual bate com o protótipo; qualquer alteração volta o card ao nível 0.
- **Testes:** seção 6.1 completa; `fog()` determinístico (mesma semente, mesmo resultado); tom derivado de cor e de gradiente; desempenho (200 cards no quadro sem travar o arraste).

### Etapa 7 — Calendário ✅ concluída em 24/10/2026 (antes da etapa 6)

- **Resultado:** tudo da entrega abaixo foi feito; 387 testes no total (51 novos), lint e tipos limpos; capturas conferidas com as telas 5 e 13 nos dois temas. Canais novos `calendar:month`, `calendar:addCard` e `settings:get` (o calendário já lê as três configurações dele; gravar é da etapa 10). Decisões da etapa: a 7 antes da 6; mês de 4 semanas ganha a seguinte (`CAL-03`); quadros-modelo fora do calendário (`CAL-06`); a lista do "+N mais" é interativa (`CAL-11`); num dia cheio o "Adicionar" vira só o "+". Detalhes no `Changelog.txt`.
- **Entrega:** tela do calendário mensal com escopo de quadro ou de todos os quadros (P2); "‹ Hoje ›" e o seletor de mês; filtros Cards e Tarefas; "Riscado = finalizado"; células com cards (etiqueta, ✓, relógio de atraso, ↻, prioridade) e tarefas (caixa e card de origem); hoje destacado; início da semana configurável; "Adicionar" ao passar o mouse; "+N mais"; clicar no card abre o modal por cima; clicar na tarefa marca e desmarca.
- **Telas:** 5; 13 (todos os quadros).
- **Aceite:** um mês com cards finalizados, atrasados e tarefas marcadas aparece como no protótipo; trocar de mês e de escopo funciona.
- **Testes:** CAL-01..14; montagem da grade (meses de 5 e 6 semanas, início no domingo e na segunda, ano bissexto); riscado conforme FIN-01; itens arquivados, modelos e quadros fechados ficam de fora.

### Etapa 8 — Agendador: repetição e lembretes ✅ concluída em 28/10/2026

- **Resultado:** tudo da entrega abaixo foi feito; 504 testes no total (81 novos), lint e tipos limpos; capturas conferidas com as telas 6b, 9, 5 e 16 nos dois temas. O agendador fica em `src/main/scheduler.ts`, a bandeja e as notificações em `src/main/tray.ts` e os ícones (do logo do protótipo) em `resources/`. Canais novos `recurrence:save`, `remove`, `createAnyway` e `dismiss`, `reminders:missed` e `app:hideToTray`, e os eventos `data:changed`, `app:openCard` e `tray:notice`. O `recurrence:preview` não foi preciso: a prévia usa as mesmas contas do agendador, na tela. Decisões da etapa: salvar a regra vale a partir dali; só o aviso de pulada mais recente fica no card; série sem card sai; "Mudar nas Configurações" do aviso da bandeja fica apagado até a etapa 10. Pedido de 28/10/2026, feito na mesma etapa: a tarefa do checklist também tem hora, e o seletor de data (o do card e o da tarefa, tela 17A aprovada no canvas, sem atalhos de data) tem horários prontos e mostra se fica no prazo ou em atraso e quanto falta (DAT-05); a hora aparece na face e no calendário. Versão 0.8.0. Detalhes no `Changelog.txt`.
- **Entrega:** diálogo "Repetir card" completo (frequência, dias, horário, lista, o que copiar, se o anterior não estiver concluído, término, "Próximas:", Salvar e Remover); agendador no main (seção 6.4); aviso de repetição pulada dentro do card, com "Criar agora mesmo assim" e "Dispensar"; ↻ e próximo dia na face; repetições fantasma, puladas e perdidas no calendário; lembretes com notificação do Windows (o clique abre o card) e o aviso dos perdidos; bandeja do Windows (P4).
- **Telas:** 6b, 9 (aviso de repetição pulada), 4 (Repetir), 5 (fantasmas); 16 (aviso da bandeja, lembretes perdidos, notificação).
- **Aceite:** com o relógio adiantado, uma repetição semanal cria o card, pula quando o anterior está aberto e mostra tudo no calendário; um lembrete "No horário" aparece como notificação.
- **Testes:** seção 6.4 completa; REP-01..17; LEM-01..07 com relógio falso.

### Etapa 9 — Fundo do quadro ✅ concluída em 29/10/2026

- **Resultado:** tudo da entrega abaixo foi feito; 529 testes no total (25 novos), lint e tipos limpos; capturas conferidas com a tela 6 nos dois temas, com o quadro, o calendário e o Início usando uma foto em retrato gerada pelo script. O editor é uma rota própria (`#/boards/:boardId/background`); o fundo chega à tela em `BoardSummary.background` e é desenhado por `BoardBackdrop`. O ajuste automático é puro (`shared/rules/backgroundAuto.ts`), sobre a cópia de 64 × 40 que a tela tira com o Chromium; para isso, o protocolo `mello-arquivo://` passou a responder com CORS. Canais novos `boards:uploadBackground` e `boards:setBackground`. Decisões da etapa: os controles ficam sempre liberados (mexer desliga o automático, FUN-05); o contraste estimado é a média mais um desvio padrão, que o desfoque reduz; o limite de "imagem carregada" foi calibrado com os papéis de parede do Windows; o nome do arquivo não é guardado. Versão 0.9.0. Detalhes no `Changelog.txt`.
- **Entrega:** editor de fundo (prévia ao vivo com o quadro em miniatura; abas Imagem, Cor e Gradiente; envio por clique ou arrastando; ajuste automático com foco 3 × 3, zoom, escurecer e desfoque; indicador de legibilidade; "Restaurar automático"; Cancelar e "Aplicar ao quadro"); as 8 cores e os 6 gradientes do protótipo; o fundo no quadro, no calendário e na miniatura do Início; o tom do envelhecimento derivado da imagem.
- **Telas:** 6, 1 (miniatura).
- **Aceite:** uma foto clara recebe escurecimento automático e fica legível; mexer num controle desliga o "Auto"; restaurar volta aos valores automáticos.
- **Testes:** FUN-01..09; a análise automática sobre imagens sintéticas (clara, escura, com detalhe concentrado num canto); contraste WCAG; persistência dos ajustes.

### Etapa 10 — Configurações, tema, backup e dados ✅ concluída em 29/10/2026

- **Resultado:** tudo da entrega abaixo foi feito; 570 testes no total (41 novos), lint e tipos limpos; capturas conferidas com as telas 7, 8 e 15 nos dois temas, com o tema trocado pela configuração de verdade em todas as telas; no app real, "Igual ao sistema" seguiu o Windows, e exportar, trocar a pasta de backup, restaurar e apagar tudo foram feitos de verdade. Canais novos `settings:set` e `data:backups`, `backupNow`, `chooseBackupFolder`, `restore`, `export`, `openFolder`, `deleteAll` e `notices`, e o evento `backup:notice` (o `theme:changed` do plano não foi preciso). O serviço de dados fica em `src/main/modules/data.ts` e os arquivos de backup em `backup.ts`. Decisões da etapa: o tema é decidido só pelo main (`nativeTheme`) e a tela segue o `prefers-color-scheme`; o tipo de cada backup fica no cabeçalho do próprio arquivo; o backup de hora em hora sai quando passou 1 hora do último e o banco mudou; a pasta de dados do Mello não serve de pasta de backup; o aviso de "mesmo disco" não aparece em pastas do OneDrive, Google Drive ou Dropbox; restaurar confere o arquivo antes. Versão 0.10.0. Detalhes no `Changelog.txt`.

- **Entrega:** tela de Configurações com as seções do protótipo e duas novas no mesmo visual:
  - Aparência: Escuro, Claro ou Sistema, com prévias;
  - Envelhecimento: ligar e desligar, prévia dos 6 níveis com o `fog()`, o que zera, listas que não envelhecem agrupadas por quadro;
  - Calendário: mostrar tarefas, riscar finalizados, início da semana;
  - **Lembretes e bandeja** (nova);
  - **Dados e backup** (nova): pasta, backup agora, lista e restauração, exportar, abrir a pasta, apagar tudo.

  Também entram o backup automático e o tema claro conferido em todas as telas.
- **Telas:** 7, 8; 15 (Lembretes e bandeja, Dados e backup).
- **Aceite:** trocar o tema muda todas as telas na hora; "Sistema" acompanha o Windows; restaurar um backup devolve o estado anterior; a exportação abre num editor de texto.
- **Testes:** TEM-01..04; DAD-01..10 (backup consistente com o banco em uso, rotação de 10, restauração com backup prévio, exportação completa, limpeza de arquivos órfãos, apagar tudo).

### Etapa 11 — Busca e modelos

- **Entrega:** busca do topo (cards, tarefas e quadros, sem diferenciar acento e maiúscula, resultados agrupados, navegação por teclado); cards-modelo e quadros-modelo (P6), com "Criar a partir de modelo" na lista e no menu "Criar".
- **Telas:** 9 (busca e menu "Criar"); 11 (modelos de quadro); 12 (modelos de card).
- **Aceite:** buscar "acao" encontra "Ação"; criar um card e um quadro a partir de modelo copia o que a regra diz.
- **Testes:** BUS-01..05, MOD-01..05.

### Etapa 12 — Polimento, revisão geral e instalador

- **Entrega:** conferência de todas as telas contra o protótipo nos dois temas; estados vazios; foco visível e rótulos de acessibilidade; teste de desempenho com 500 cards; ícone do instalador (P14); `npm run build:win` gerando o instalador NSIS; instalação limpa e atualização por cima conferidas, com os dados preservados; revisão geral do código procurando erros; documentação final.
- **Aceite:** o instalador instala, o app abre, os dados sobrevivem à reinstalação e todos os testes passam.
- **Testes:** a suíte completa rodada de novo; roteiro manual do instalador registrado em `Testes.txt`.

---

## 8. Como cada etapa é conferida

Ao fim de cada etapa, nesta ordem:

1. `npm run lint`, `npm run typecheck` e `npm test`, todos limpos.
2. **Conferência visual:** `npm run capturas` abre o app com dados fictícios e salva uma captura de cada tela da etapa, nos dois temas. Comparo cada captura com o `.dc.html` correspondente (cores, medidas, textos, ícones e estados) e corrijo as diferenças antes de seguir.
3. Revisão do próprio diff, procurando erros, antes do commit.
4. Atualização dos documentos da etapa (seção 10), do `To-do-list.txt` e deste plano (etapa marcada como concluída).
5. Aviso "Etapa N pronta para commit", com os arquivos alterados, o resumo e uma sugestão de mensagem. Você faz commit e push e me libera para a próxima etapa. O fluxo completo está em `Pipeline.txt`.

Se uma funcionalidade não ficar boa, a etapa inteira é revertida (voltando ao commit anterior) e refeita, em vez de remendada.

---

## 9. Riscos

| Risco | Mitigação |
|---|---|
| ~~O better-sqlite3 é módulo nativo: o binário do Electron pode não abrir no Node dos testes, e vice-versa~~ | **Resolvido na etapa 1:** o better-sqlite3 13 traz binário N-API, o mesmo para o Electron e para o Vitest, sem compilar nada. O electron-builder usa `asarUnpack` para o `.node`. |
| O instalador oficial do Electron exige o Visual C++ Redistributable, que não está nesta máquina | Script próprio de instalação (`scripts/instalar-electron.mjs`), com o mesmo download e checksum oficiais. Se o Electron mudar a instalação, o script é ajustado (`Pipeline.txt`, seção 3). |
| O `fog()` gera dezenas de gradientes por card, e pode pesar com muitos cards | Memorizar o resultado por (nível, id, tema, tom, tamanho); recalcular só quando algum desses muda; teste de desempenho com 200 e 500 cards. Plano B: desenhar a máscara uma vez num canvas e reaproveitar como imagem. |
| O `fog()` do protótipo assume card de 252 × 100 px | Passar a largura e a altura reais (medidas com ResizeObserver), mantendo o algoritmo e as constantes. Conferir visualmente cards de 1, 3 e 8 linhas. |
| Arrastar com o visual exato do protótipo e a regra do "mesmo lugar" | dnd-kit com DragOverlay (card inclinado); a comparação de vizinhos antes e depois decide se grava. Teste de componente do arraste. |
| HTML da nota e da descrição (XSS dentro do app) | O TipTap só aceita o que está no schema; o main filtra de novo ao salvar (NOT-04); teste com `<script>`, `onerror` e `javascript:`. |
| Repetição e lembretes dependem do relógio, do app fechado e do horário de verão | Datas em horário local sem fuso; relógio injetável; testes de app fechado, de virada de mês e de ano bissexto. |
| Fechar a janela e o app continuar na bandeja pode confundir | Na primeira vez, um aviso explica e aponta a opção nas Configurações (P4). |
| O ajuste automático do fundo é subjetivo | Regras simples e testáveis (FUN-04), controles manuais sempre disponíveis e "Restaurar automático". |
| Escopo grande (12 etapas) feito de uma vez | Uma parada por etapa para o seu commit, testes por regra e conferência visual em cada etapa; parar só se surgir uma decisão sua. |
| Conferência visual sem conseguir abrir o protótipo como imagem | Capturas do app pelo Playwright comparadas com as especificações dos `.dc.html`; a conferência final é sua, na etapa 12. |
| A pasta de arquivos cresce com anexos | Deduplicação por hash, limpeza de órfãos e espelho incremental no backup. |
| Backup numa pasta da nuvem corromper o banco | O banco em uso nunca é sincronizado: o backup é um arquivo separado gerado pela API do SQLite. |
| O instalador sem assinatura dispara o SmartScreen | Documentado no `Pipeline.txt`: "Mais informações → Executar assim mesmo". |
| Dados pessoais no repositório público | `.gitignore` para bancos, arquivos e backups; dados de exemplo fictícios (P16); capturas geradas só com eles. |

---

## 10. Documentação por etapa

| Etapa | Documentos atualizados |
|---|---|
| Todas | `To-do-list.txt`, `Changelog.txt`, `Testes.txt`, este `PLANO.md` |
| 1 | `Pipeline.txt` (comandos reais), `Definicao-da-Stack.txt` (versões fixadas), `Arquitetura.txt` (convertido de `Docs/Arquitetura.md`), `Modelo-de-Dados.txt` |
| 2, 3 | `Regras.txt` (testes ligados às regras QUA, LIS, CAR e FIN) |
| 4, 5 | `Regras.txt`, `Definicao-da-Stack.txt` (TipTap), `LGPD.txt` (anexos) |
| 6 | `Regras.txt` (ENV), `Arquitetura.txt` (recálculo de hora em hora) |
| 7 | `Regras.txt` (CAL) |
| 8 | `Regras.txt` (REP, LEM), `Arquitetura.txt` (agendador e bandeja) |
| 9 | `Regras.txt` (FUN), `Arquitetura.txt` (protocolo de arquivos) |
| 10 | `Regras.txt` (TEM, DAD), `LGPD.txt` (backup, exportação e apagar tudo) |
| 11 | `Regras.txt` (BUS, MOD) |
| 12 | Todos: `Apresentacao.txt` final, `Pipeline.txt` (instalador), revisão de tudo |
| Qualquer migração nova | `Modelo-de-Dados.txt` |

**Documentos novos:** `Docs/Arquitetura.txt` (processos, IPC, pastas, segurança, agendador), `Modelo-de-Dados.txt` (tabelas, campos, índices e histórico de migrações), `Testes.txt` (o que é testado, como rodar e o roteiro manual), `Changelog.txt` (o que mudou em cada etapa).
