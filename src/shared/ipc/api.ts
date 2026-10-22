// Contrato entre a tela e o main: os nomes dos canais e a forma de window.mello.
// O preload implementa MelloApi; a tela só enxerga este tipo.
import type { Result } from '../result'
import type {
  ArchivedItems,
  BoardDetail,
  BoardIdInput,
  BoardSummary,
  CardIdInput,
  CreateBoardInput,
  CreateListInput,
  ListIdInput,
  ListSummary,
  MoveBoardInput,
  MoveListInput,
  MoveListToBoardInput,
  UpdateBoardInput,
  UpdateListInput
} from './boards'

export const CHANNELS = {
  appInfo: 'app:info',
  boardsList: 'boards:list',
  boardsListClosed: 'boards:listClosed',
  boardsGet: 'boards:get',
  boardsCreate: 'boards:create',
  boardsUpdate: 'boards:update',
  boardsMove: 'boards:move',
  boardsClose: 'boards:close',
  boardsReopen: 'boards:reopen',
  boardsDelete: 'boards:delete',
  boardsArchived: 'boards:archived',
  listsCreate: 'lists:create',
  listsUpdate: 'lists:update',
  listsMove: 'lists:move',
  listsCopy: 'lists:copy',
  listsMoveToBoard: 'lists:moveToBoard',
  listsArchive: 'lists:archive',
  listsArchiveCards: 'lists:archiveCards',
  listsRestore: 'lists:restore',
  cardsRestore: 'cards:restore',
  cardsDelete: 'cards:delete'
} as const

export interface AppInfo {
  version: string
  dataDir: string
  dev: boolean
}

export interface MelloApi {
  app: {
    info(): Promise<Result<AppInfo>>
  }
  boards: {
    list(): Promise<Result<BoardSummary[]>>
    listClosed(): Promise<Result<BoardSummary[]>>
    get(input: BoardIdInput): Promise<Result<BoardDetail>>
    create(input: CreateBoardInput): Promise<Result<BoardSummary>>
    update(input: UpdateBoardInput): Promise<Result<BoardSummary>>
    move(input: MoveBoardInput): Promise<Result<null>>
    close(input: BoardIdInput): Promise<Result<null>>
    reopen(input: BoardIdInput): Promise<Result<null>>
    delete(input: BoardIdInput): Promise<Result<null>>
    archived(input: BoardIdInput): Promise<Result<ArchivedItems>>
  }
  lists: {
    create(input: CreateListInput): Promise<Result<ListSummary>>
    update(input: UpdateListInput): Promise<Result<ListSummary>>
    move(input: MoveListInput): Promise<Result<null>>
    copy(input: ListIdInput): Promise<Result<ListSummary>>
    moveToBoard(input: MoveListToBoardInput): Promise<Result<null>>
    archive(input: ListIdInput): Promise<Result<null>>
    archiveCards(input: ListIdInput): Promise<Result<number>>
    restore(input: ListIdInput): Promise<Result<null>>
  }
  cards: {
    restore(input: CardIdInput): Promise<Result<null>>
    delete(input: CardIdInput): Promise<Result<null>>
  }
}

// Monta window.mello a partir de uma função que entrega (canal, entrada) ao main. O preload passa
// o ipcRenderer.invoke; os testes da tela passam as rotas do main direto.
export function createApi(
  invoke: (channel: string, input?: unknown) => Promise<unknown>
): MelloApi {
  const call =
    <T>(channel: string) =>
    (input?: unknown) =>
      invoke(channel, input) as Promise<Result<T>>
  return {
    app: {
      info: call(CHANNELS.appInfo)
    },
    boards: {
      list: call(CHANNELS.boardsList),
      listClosed: call(CHANNELS.boardsListClosed),
      get: call(CHANNELS.boardsGet),
      create: call(CHANNELS.boardsCreate),
      update: call(CHANNELS.boardsUpdate),
      move: call(CHANNELS.boardsMove),
      close: call(CHANNELS.boardsClose),
      reopen: call(CHANNELS.boardsReopen),
      delete: call(CHANNELS.boardsDelete),
      archived: call(CHANNELS.boardsArchived)
    },
    lists: {
      create: call(CHANNELS.listsCreate),
      update: call(CHANNELS.listsUpdate),
      move: call(CHANNELS.listsMove),
      copy: call(CHANNELS.listsCopy),
      moveToBoard: call(CHANNELS.listsMoveToBoard),
      archive: call(CHANNELS.listsArchive),
      archiveCards: call(CHANNELS.listsArchiveCards),
      restore: call(CHANNELS.listsRestore)
    },
    cards: {
      restore: call(CHANNELS.cardsRestore),
      delete: call(CHANNELS.cardsDelete)
    }
  }
}
