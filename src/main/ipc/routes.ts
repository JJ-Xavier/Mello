// Tabela de canais: cada canal liga um schema Zod a uma função de módulo (valida → chama →
// Result). Não importa o Electron: o index.ts registra as rotas no ipcMain e os testes da tela as
// usam direto, com um banco em memória.
import { z } from 'zod'
import { CHANNELS, type AppInfo } from '../../shared/ipc/api'
import {
  boardIdInput,
  createBoardInput,
  createListInput,
  listIdInput,
  moveBoardInput,
  moveListInput,
  moveListToBoardInput,
  updateBoardInput,
  updateListInput
} from '../../shared/ipc/boards'
import { cardIdInput, createCardInput, moveCardInput } from '../../shared/ipc/cards'
import type { Db } from '../db/client'
import * as boards from '../modules/boards'
import * as cards from '../modules/cards'
import * as lists from '../modules/lists'
import { createHandler, type Handler } from './handler'

export interface RouteContext {
  db: Db
  app: AppInfo
  now: () => number
  onUnexpectedError?: (channel: string, error: unknown) => void
}

export type Routes = Map<string, Handler<unknown>>

export function createRoutes({ db, app, now, onUnexpectedError }: RouteContext): Routes {
  const routes: Routes = new Map()
  const none = z.undefined()

  function route<S extends z.ZodType, T>(
    channel: string,
    schema: S,
    fn: (input: z.output<S>) => T | Promise<T>
  ): void {
    routes.set(
      channel,
      createHandler(schema, fn, (error) => onUnexpectedError?.(channel, error))
    )
  }

  // Para os canais que não devolvem nada: o Result leva null.
  function done(fn: () => unknown): null {
    fn()
    return null
  }

  route(CHANNELS.appInfo, none, () => app)

  route(CHANNELS.boardsList, none, () => boards.listOpen(db))
  route(CHANNELS.boardsListClosed, none, () => boards.listClosed(db))
  route(CHANNELS.boardsGet, boardIdInput, ({ boardId }) => boards.get(db, boardId))
  route(CHANNELS.boardsCreate, createBoardInput, ({ title }) => boards.create(db, title, now()))
  route(CHANNELS.boardsUpdate, updateBoardInput, (input) => boards.update(db, input, now()))
  route(CHANNELS.boardsMove, moveBoardInput, ({ boardId, index }) =>
    done(() => boards.move(db, boardId, index, now()))
  )
  route(CHANNELS.boardsClose, boardIdInput, ({ boardId }) =>
    done(() => boards.close(db, boardId, now()))
  )
  route(CHANNELS.boardsReopen, boardIdInput, ({ boardId }) =>
    done(() => boards.reopen(db, boardId, now()))
  )
  route(CHANNELS.boardsDelete, boardIdInput, ({ boardId }) =>
    done(() => boards.remove(db, boardId))
  )
  route(CHANNELS.boardsArchived, boardIdInput, ({ boardId }) => boards.archived(db, boardId))

  route(CHANNELS.listsCreate, createListInput, ({ boardId, title }) =>
    lists.create(db, boardId, title, now())
  )
  route(CHANNELS.listsUpdate, updateListInput, (input) => lists.update(db, input, now()))
  route(CHANNELS.listsMove, moveListInput, ({ listId, index }) =>
    done(() => lists.move(db, listId, index, now()))
  )
  route(CHANNELS.listsCopy, listIdInput, ({ listId }) => lists.copy(db, listId, now()))
  route(CHANNELS.listsMoveToBoard, moveListToBoardInput, ({ listId, boardId, index }) =>
    done(() => lists.moveToBoard(db, listId, boardId, index, now()))
  )
  route(CHANNELS.listsArchive, listIdInput, ({ listId }) =>
    done(() => lists.archive(db, listId, now()))
  )
  route(CHANNELS.listsArchiveCards, listIdInput, ({ listId }) =>
    lists.archiveCards(db, listId, now())
  )
  route(CHANNELS.listsRestore, listIdInput, ({ listId }) =>
    done(() => lists.restore(db, listId, now()))
  )

  route(CHANNELS.cardsGet, cardIdInput, ({ cardId }) => cards.get(db, cardId))
  route(CHANNELS.cardsCreate, createCardInput, ({ listId, title }) =>
    cards.create(db, listId, title, now())
  )
  route(CHANNELS.cardsMove, moveCardInput, ({ cardId, listId, index }) =>
    done(() => cards.move(db, cardId, listId, index, now()))
  )
  route(CHANNELS.cardsRestore, cardIdInput, ({ cardId }) =>
    done(() => cards.restore(db, cardId, now()))
  )
  route(CHANNELS.cardsDelete, cardIdInput, ({ cardId }) => done(() => cards.remove(db, cardId)))

  return routes
}
