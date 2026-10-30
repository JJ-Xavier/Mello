// Schema completo do banco (Docs/PLANO.md, seção 5, e Docs/Modelo-de-Dados.txt).
//
// Convenções: IDs são UUID em texto; created_at, updated_at e os demais *_at numéricos são epoch em
// milissegundos (UTC); datas de entrega são texto local sem fuso ("2026-10-20" ou
// "2026-10-20T14:30"); booleanos são INTEGER 0/1; position é uma chave de fractional indexing.
//
// Mudou alguma coisa aqui? Rode "npm run db:generate" para gerar uma migração nova. Uma migração
// já aplicada nunca é editada.
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core'

const timestamps = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
}

export const board = sqliteTable('board', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  position: text('position').notNull(),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  isTemplate: integer('is_template', { mode: 'boolean' }).notNull().default(false),
  closedAt: integer('closed_at'),
  bgKind: text('bg_kind', { enum: ['image', 'color', 'gradient'] })
    .notNull()
    .default('gradient'),
  bgValue: text('bg_value').notNull().default('mello'),
  bgAuto: integer('bg_auto', { mode: 'boolean' }).notNull().default(true),
  bgFocus: integer('bg_focus').notNull().default(4),
  bgZoom: integer('bg_zoom').notNull().default(100),
  bgDim: integer('bg_dim').notNull().default(0),
  bgBlur: integer('bg_blur').notNull().default(0),
  bgTone: text('bg_tone').notNull(),
  ...timestamps
})

export const list = sqliteTable(
  'list',
  {
    id: text('id').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => board.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    position: text('position').notNull(),
    freezesAging: integer('freezes_aging', { mode: 'boolean' }).notNull().default(false),
    isDoneList: integer('is_done_list', { mode: 'boolean' }).notNull().default(false),
    archivedAt: integer('archived_at'),
    ...timestamps
  },
  (t) => [index('list_board_position_idx').on(t.boardId, t.position)]
)

export const card = sqliteTable(
  'card',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => list.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    position: text('position').notNull(),
    descriptionHtml: text('description_html').notNull().default(''),
    descriptionText: text('description_text').notNull().default(''),
    noteHtml: text('note_html').notNull().default(''),
    noteText: text('note_text').notNull().default(''),
    isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
    doneAt: integer('done_at'),
    priority: integer('priority'),
    dueAt: text('due_at'),
    reminder: text('reminder', { enum: ['none', 'at_time', 'day_before'] })
      .notNull()
      .default('none'),
    reminderFiredAt: integer('reminder_fired_at'),
    coverKind: text('cover_kind', { enum: ['color', 'image'] }),
    coverValue: text('cover_value'),
    isTemplate: integer('is_template', { mode: 'boolean' }).notNull().default(false),
    recurrenceId: text('recurrence_id').references((): AnySQLiteColumn => recurrence.id, {
      onDelete: 'set null'
    }),
    occurrenceDate: text('occurrence_date'),
    lastActivityAt: integer('last_activity_at').notNull(),
    archivedAt: integer('archived_at'),
    ...timestamps
  },
  (t) => [
    check('card_priority_check', sql`${t.priority} BETWEEN 1 AND 5`),
    index('card_list_position_idx').on(t.listId, t.position),
    index('card_due_at_idx').on(t.dueAt),
    index('card_recurrence_idx').on(t.recurrenceId),
    index('card_is_template_idx').on(t.isTemplate)
  ]
)

export const label = sqliteTable(
  'label',
  {
    id: text('id').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => board.id, { onDelete: 'cascade' }),
    name: text('name'),
    color: text('color').notNull(),
    position: text('position').notNull()
  },
  (t) => [index('label_board_idx').on(t.boardId)]
)

export const cardLabel = sqliteTable(
  'card_label',
  {
    cardId: text('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => label.id, { onDelete: 'cascade' })
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.labelId] }),
    index('card_label_label_idx').on(t.labelId)
  ]
)

export const checklist = sqliteTable(
  'checklist',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    position: text('position').notNull(),
    hideChecked: integer('hide_checked', { mode: 'boolean' }).notNull().default(false)
  },
  (t) => [index('checklist_card_position_idx').on(t.cardId, t.position)]
)

export const checklistItem = sqliteTable(
  'checklist_item',
  {
    id: text('id').primaryKey(),
    checklistId: text('checklist_id')
      .notNull()
      .references(() => checklist.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
    dueDate: text('due_date'),
    showInCalendar: integer('show_in_calendar', { mode: 'boolean' }).notNull().default(true),
    position: text('position').notNull(),
    ...timestamps
  },
  (t) => [
    index('checklist_item_checklist_position_idx').on(t.checklistId, t.position),
    index('checklist_item_due_date_idx').on(t.dueDate)
  ]
)

export const activity = sqliteTable(
  'activity',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: [
        'created',
        'moved',
        'done',
        'undone',
        'archived',
        'restored',
        'copied',
        'from_template',
        'from_recurrence',
        'recurrence_skipped',
        'recurrence_missed'
      ]
    }).notNull(),
    data: text('data').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('activity_card_created_idx').on(t.cardId, t.createdAt)]
)

// O id é o SHA-256 do conteúdo. O arquivo fica em %APPDATA%\Mello\arquivos\<id>.<ext>.
export const file = sqliteTable('file', {
  id: text('id').primaryKey(),
  ext: text('ext').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  width: integer('width'),
  height: integer('height'),
  avgColor: text('avg_color'),
  createdAt: integer('created_at').notNull()
})

export const attachment = sqliteTable(
  'attachment',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    fileId: text('file_id')
      .notNull()
      .references(() => file.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('attachment_card_idx').on(t.cardId), index('attachment_file_idx').on(t.fileId)]
)

export const recurrence = sqliteTable(
  'recurrence',
  {
    id: text('id').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => board.id, { onDelete: 'cascade' }),
    freq: text('freq', { enum: ['daily', 'weekly', 'monthly', 'every_n'] }).notNull(),
    // Máscara de bits: dom = 1, seg = 2, ter = 4, … sáb = 64.
    weekdays: integer('weekdays').notNull().default(0),
    monthDay: integer('month_day'),
    intervalDays: integer('interval_days'),
    anchorDate: text('anchor_date').notNull(),
    time: text('time').notNull(),
    // NULL = repetição pausada (REP-16).
    targetListId: text('target_list_id').references(() => list.id, { onDelete: 'set null' }),
    copyLabelsPriority: integer('copy_labels_priority', { mode: 'boolean' }).notNull(),
    copyDescription: integer('copy_description', { mode: 'boolean' }).notNull(),
    copyChecklist: integer('copy_checklist', { mode: 'boolean' }).notNull(),
    copyDueDate: integer('copy_due_date', { mode: 'boolean' }).notNull(),
    ifPreviousOpen: text('if_previous_open', { enum: ['skip', 'create'] })
      .notNull()
      .default('skip'),
    endsKind: text('ends_kind', { enum: ['never', 'on_date', 'after_count'] })
      .notNull()
      .default('never'),
    endsOn: text('ends_on'),
    endsAfter: integer('ends_after'),
    dueCount: integer('due_count').notNull().default(0),
    lastProcessed: text('last_processed'),
    ...timestamps
  },
  (t) => [
    index('recurrence_board_idx').on(t.boardId),
    index('recurrence_target_list_idx').on(t.targetListId)
  ]
)

export const recurrenceOccurrence = sqliteTable(
  'recurrence_occurrence',
  {
    id: text('id').primaryKey(),
    recurrenceId: text('recurrence_id')
      .notNull()
      .references(() => recurrence.id, { onDelete: 'cascade' }),
    occurrenceDate: text('occurrence_date').notNull(),
    status: text('status', {
      enum: ['created', 'skipped', 'missed', 'created_anyway']
    }).notNull(),
    cardId: text('card_id').references(() => card.id, { onDelete: 'set null' }),
    noticeCardId: text('notice_card_id').references(() => card.id, { onDelete: 'set null' }),
    dismissedAt: integer('dismissed_at'),
    createdAt: integer('created_at').notNull()
  },
  (t) => [
    uniqueIndex('recurrence_occurrence_unique_idx').on(t.recurrenceId, t.occurrenceDate),
    index('recurrence_occurrence_card_idx').on(t.cardId),
    index('recurrence_occurrence_notice_card_idx').on(t.noticeCardId)
  ]
)

// Chaves: theme, aging.enabled, calendar.showTasks, calendar.strikeDone, calendar.weekStart,
// tray.keep, app.autoStart, backup.folder, backup.lastAt. O valor é JSON.
export const setting = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})
