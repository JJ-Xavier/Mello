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
  sortListInput,
  updateBoardInput,
  updateListInput
} from '../../shared/ipc/boards'
import { calendarAddCardInput, calendarMonthInput } from '../../shared/ipc/calendar'
import {
  cardIdInput,
  copyCardInput,
  createCardInput,
  matchingInput,
  moveCardInput,
  setCoverInput,
  setLabelsInput,
  updateCardInput
} from '../../shared/ipc/cards'
import {
  checklistIdInput,
  createChecklistInput,
  createItemInput,
  itemIdInput,
  moveChecklistInput,
  moveItemInput,
  toggleItemInput,
  updateChecklistInput,
  updateItemInput
} from '../../shared/ipc/checklists'
import {
  addAttachmentsInput,
  attachmentIdInput,
  droppedFilesInput,
  pickFilesInput,
  uploadCoverInput
} from '../../shared/ipc/files'
import { setClockInput } from '../../shared/ipc/dev'
import { createLabelInput, labelIdInput, updateLabelInput } from '../../shared/ipc/labels'
import { AppError } from '../../shared/result'
import type { Clock } from '../clock'
import type { Db } from '../db/client'
import * as attachments from '../modules/attachments'
import * as boards from '../modules/boards'
import * as calendar from '../modules/calendar'
import * as cards from '../modules/cards'
import * as checklists from '../modules/checklists'
import { createPicks, type FileStore } from '../modules/files'
import * as labels from '../modules/labels'
import * as lists from '../modules/lists'
import * as settings from '../modules/settings'
import { createHandler, type Handler } from './handler'

export interface RouteContext {
  db: Db
  app: AppInfo
  // O "agora" de tudo o que o main grava; no modo de desenvolvimento, pode estar adiantado.
  clock: Clock
  // Pasta dos arquivos guardados e o que o main usa do Windows (janela de abrir, programa padrão).
  files: FileStore
  onUnexpectedError?: (channel: string, error: unknown) => void
}

export type Routes = Map<string, Handler<unknown>>

export function createRoutes({ db, app, clock, files, onUnexpectedError }: RouteContext): Routes {
  const routes: Routes = new Map()
  const now = () => clock.now()
  const none = z.undefined()
  // Arquivos escolhidos ou soltos, à espera da confirmação da tela (modules/files.ts).
  const picks = createPicks()

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
  route(CHANNELS.listsSort, sortListInput, ({ listId, by }) =>
    done(() => lists.sort(db, listId, by))
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
  route(CHANNELS.cardsUpdate, updateCardInput, (input) =>
    done(() => cards.update(db, input, now()))
  )
  route(CHANNELS.cardsCopy, copyCardInput, (input) => cards.copy(db, input, now()))
  route(CHANNELS.cardsSetLabels, setLabelsInput, ({ cardId, labelIds }) =>
    done(() => cards.setLabels(db, cardId, labelIds, now()))
  )
  route(CHANNELS.cardsArchive, cardIdInput, ({ cardId }) =>
    done(() => cards.archive(db, cardId, now()))
  )
  route(CHANNELS.cardsMatching, matchingInput, ({ boardId, keyword }) =>
    cards.matching(db, boardId, keyword)
  )
  route(CHANNELS.cardsMove, moveCardInput, ({ cardId, listId, index }) =>
    done(() => cards.move(db, cardId, listId, index, now()))
  )
  route(CHANNELS.cardsRestore, cardIdInput, ({ cardId }) =>
    done(() => cards.restore(db, cardId, now()))
  )
  route(CHANNELS.cardsDelete, cardIdInput, ({ cardId }) => done(() => cards.remove(db, cardId)))
  route(CHANNELS.cardsSetCover, setCoverInput, ({ cardId, cover }) =>
    done(() => attachments.setCover(db, cardId, cover, now()))
  )
  route(CHANNELS.cardsUploadCover, uploadCoverInput, async ({ cardId, token }) => {
    const [pick] = picks.take([token])
    await attachments.uploadCover(db, files, cardId, pick!.path, now())
    return null
  })

  route(CHANNELS.filesPick, pickFilesInput, async ({ imagesOnly }) =>
    picks.register(await files.system.chooseFiles({ imagesOnly }))
  )
  route(CHANNELS.filesDropped, droppedFilesInput, ({ paths }) => picks.register(paths))
  route(CHANNELS.attachmentsAdd, addAttachmentsInput, async ({ cardId, tokens }) => {
    await attachments.add(db, files, cardId, picks.take(tokens), now())
    return null
  })
  route(CHANNELS.attachmentsOpen, attachmentIdInput, ({ attachmentId }) =>
    attachments.open(db, files, attachmentId)
  )
  route(CHANNELS.attachmentsDelete, attachmentIdInput, ({ attachmentId }) =>
    done(() => attachments.remove(db, attachmentId, now()))
  )

  route(CHANNELS.labelsList, boardIdInput, ({ boardId }) => labels.list(db, boardId))
  route(CHANNELS.labelsCreate, createLabelInput, (input) => labels.create(db, input))
  route(CHANNELS.labelsUpdate, updateLabelInput, (input) => labels.update(db, input))
  route(CHANNELS.labelsDelete, labelIdInput, ({ labelId }) =>
    done(() => labels.remove(db, labelId))
  )

  route(CHANNELS.checklistsCreate, createChecklistInput, ({ cardId, title }) =>
    checklists.create(db, cardId, title, now())
  )
  route(CHANNELS.checklistsUpdate, updateChecklistInput, (input) =>
    done(() => checklists.update(db, input, now()))
  )
  route(CHANNELS.checklistsMove, moveChecklistInput, ({ checklistId, index }) =>
    done(() => checklists.move(db, checklistId, index, now()))
  )
  route(CHANNELS.checklistsDelete, checklistIdInput, ({ checklistId }) =>
    done(() => checklists.remove(db, checklistId, now()))
  )
  route(CHANNELS.itemsCreate, createItemInput, ({ checklistId, text }) =>
    checklists.createItem(db, checklistId, text, now())
  )
  route(CHANNELS.itemsUpdate, updateItemInput, (input) =>
    done(() => checklists.updateItem(db, input, now()))
  )
  route(CHANNELS.itemsToggle, toggleItemInput, ({ itemId, isDone }) =>
    done(() => checklists.toggleItem(db, itemId, isDone, now()))
  )
  route(CHANNELS.itemsMove, moveItemInput, ({ itemId, index }) =>
    done(() => checklists.moveItem(db, itemId, index, now()))
  )
  route(CHANNELS.itemsDelete, itemIdInput, ({ itemId }) =>
    done(() => checklists.removeItem(db, itemId, now()))
  )

  route(CHANNELS.calendarMonth, calendarMonthInput, (input) => calendar.month(db, input))
  route(CHANNELS.calendarAddCard, calendarAddCardInput, (input) =>
    calendar.addCard(db, input, now())
  )

  route(CHANNELS.settingsGet, none, () => settings.get(db))

  // Relógio de teste (decidido em 24/10/2026). O app instalado só informa que não está adiantado.
  route(CHANNELS.devClock, none, () => ({ offset: clock.offset() }))
  route(CHANNELS.devSetClock, setClockInput, ({ offset }) => {
    if (!app.dev) {
      throw new AppError('CONFLICT', 'O relógio de teste só existe no modo de desenvolvimento.')
    }
    clock.setOffset(offset)
    return { offset }
  })

  return routes
}
