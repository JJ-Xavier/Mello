# Mello

Planejador pessoal para Windows, inspirado no Trello: quadros Kanban e um calendário mensal com os
mesmos cards. Roda 100% no computador, sem conta, sem nuvem e sem internet.

> **Status:** em desenvolvimento. As etapas 1 a 10 de 12 estão prontas: a base do app, o banco
> de dados, os quadros, as listas, os cards com arrastar e soltar, o modal do card com etiquetas,
> prioridade, datas, descrição, checklists, nota, atividade, anexos e capa, o envelhecimento dos
> cards parados, o calendário mensal (de um quadro ou de todos), os cards que se repetem, os
> lembretes do Windows, a bandeja, o fundo de cada quadro (cor, gradiente ou foto, com ajuste
> automático) e as Configurações (tema escuro, claro ou do sistema, backups automáticos,
> restaurar, exportar e apagar tudo).
> O andamento está em [Docs/PLANO.md](Docs/PLANO.md) e [Docs/To-do-list.txt](Docs/To-do-list.txt).

## O que o Mello faz (versão 1.0)

- Quadros com listas e cards, arrastar e soltar, etiquetas, prioridade, checklist e nota em cada card.
- Calendário mensal com os cards e as tarefas que têm data.
- Cards que envelhecem visualmente quando ficam parados.
- Cards que se repetem, lembretes do Windows, fundo de quadro, busca e modelos.
- Backup automático e exportação dos dados em JSON.

## Como rodar

Requisitos: Windows 10 ou 11 (64 bits), [Node.js](https://nodejs.org) 24 e Git.

```bash
npm install      # instala as dependências (uma vez)
npm run dev      # abre o app em modo de desenvolvimento
npm test         # roda os testes
```

Os outros comandos estão em [Docs/Pipeline.txt](Docs/Pipeline.txt).

## Onde ficam os dados

Num banco SQLite em `%APPDATA%\Mello` (no modo de desenvolvimento, em `%APPDATA%\Mello-dev`).
Nada é enviado para fora do computador. Detalhes em [Docs/LGPD.txt](Docs/LGPD.txt).

## Documentação

| Documento                                             | Conteúdo                                          |
| ----------------------------------------------------- | ------------------------------------------------- |
| [Apresentacao.txt](Docs/Apresentacao.txt)             | O que é o Mello e para quem                       |
| [PLANO.md](Docs/PLANO.md)                             | Decisões, modelo de dados e as 12 etapas          |
| [Regras.txt](Docs/Regras.txt)                         | Regras de negócio, com códigos citados nos testes |
| [Arquitetura.txt](Docs/Arquitetura.txt)               | Processos, IPC, pastas e segurança                |
| [Modelo-de-Dados.txt](Docs/Modelo-de-Dados.txt)       | Tabelas, campos, índices e migrações              |
| [Definicao-da-Stack.txt](Docs/Definicao-da-Stack.txt) | Tecnologias, versões e por quê                    |
| [Testes.txt](Docs/Testes.txt)                         | O que é testado e como rodar                      |
| [Pipeline.txt](Docs/Pipeline.txt)                     | Fluxo de trabalho e comandos                      |
| [Changelog.txt](Docs/Changelog.txt)                   | O que mudou em cada etapa                         |

## Licença

[MIT](LICENSE).
