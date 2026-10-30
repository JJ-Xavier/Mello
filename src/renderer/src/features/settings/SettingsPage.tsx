// Configurações (Config.dc.html e NovoConfig.dc.html, etapa 10): Aparência, Envelhecimento dos
// cards, Calendário, Lembretes e bandeja e Dados e backup, numa coluna que rola. O menu da esquerda
// leva à seção e marca a que está à vista. Cada opção vale na hora (settings:set).
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import type { SetSettingInput, Settings, Theme } from '../../../../shared/ipc/settings'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useAction, useAppInfo, useSettings } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import type { SettingsLocationState } from '../../app/AppHeader'
import { AgingSection } from './AgingSection'
import { DataSection } from './DataSection'
import { Section, Toggle } from './SettingsParts'
import styles from './SettingsPage.module.css'

const SECTIONS = [
  { id: 'aparencia', label: 'Aparência' },
  { id: 'envelhecimento', label: 'Envelhecimento dos cards' },
  { id: 'calendario', label: 'Calendário' },
  { id: 'lembretes', label: 'Lembretes e bandeja' },
  { id: 'dados', label: 'Dados e backup' }
] as const

type SectionId = (typeof SECTIONS)[number]['id']

const isSection = (id: string | undefined): id is SectionId =>
  SECTIONS.some((section) => section.id === id)

// TEM-01: as prévias do protótipo (o fundo e as duas listas de cada tema).
const THEMES: { id: Theme; label: string; preview: string; list: string }[] = [
  { id: 'dark', label: 'Escuro', preview: '#1d2125', list: '#101204' },
  { id: 'light', label: 'Claro', preview: '#f7f8f9', list: '#dcdfe4' },
  {
    id: 'system',
    label: 'Igual ao sistema',
    preview: 'linear-gradient(90deg, #1d2125 50%, #f7f8f9 50%)',
    list: '#738496'
  }
]

// Grava uma opção. A tela já mostra o valor novo enquanto o main grava.
function useSaveSetting(): (input: SetSettingInput) => void {
  const queryClient = useQueryClient()
  const action = useAction()
  return (input) => {
    queryClient.setQueryData<Settings>(queryKeys.settings, (current) =>
      current ? { ...current, [input.key]: input.value } : current
    )
    void action(() => unwrap(api().settings.set(input)), [queryKeys.settings])
  }
}

function Appearance({
  settings,
  save
}: {
  settings: Settings
  save: (input: SetSettingInput) => void
}) {
  return (
    <Section
      id="aparencia"
      title="Aparência"
      lead="Escolha o tema do Mello. O fundo de cada quadro continua o mesmo."
    >
      <div role="radiogroup" aria-label="Tema" className={styles.themes}>
        {THEMES.map((theme) => (
          <label key={theme.id} className={styles.theme}>
            <input
              type="radio"
              name="tema"
              value={theme.id}
              checked={settings.theme === theme.id}
              onChange={() => save({ key: 'theme', value: theme.id })}
            />
            <span
              className={styles.preview}
              style={{ background: theme.preview }}
              aria-hidden="true"
            >
              <span className={styles.previewList} style={{ background: theme.list }} />
              <span className={styles.previewList} style={{ background: theme.list }} />
            </span>
            {theme.label}
          </label>
        ))}
      </div>
    </Section>
  )
}

function CalendarOptions({
  settings,
  save
}: {
  settings: Settings
  save: (input: SetSettingInput) => void
}) {
  return (
    <Section
      id="calendario"
      title="Calendário"
      lead="Visualização mensal com cards e tarefas do checklist."
    >
      <Toggle
        checked={settings['calendar.showTasks']}
        onChange={(value) => save({ key: 'calendar.showTasks', value })}
      >
        Mostrar tarefas do checklist que têm data
      </Toggle>
      <Toggle
        checked={settings['calendar.strikeDone']}
        onChange={(value) => save({ key: 'calendar.strikeDone', value })}
      >
        Riscar itens finalizados
      </Toggle>
      <label className={styles.sw}>
        Semana começa em
        <select
          aria-label="Primeiro dia da semana"
          className={styles.select}
          value={settings['calendar.weekStart']}
          onChange={(event) =>
            save({ key: 'calendar.weekStart', value: event.target.value as 'sunday' | 'monday' })
          }
        >
          <option value="sunday">Domingo</option>
          <option value="monday">Segunda-feira</option>
        </select>
      </label>
    </Section>
  )
}

function TrayOptions({
  settings,
  save
}: {
  settings: Settings
  save: (input: SetSettingInput) => void
}) {
  return (
    <Section
      id="lembretes"
      title="Lembretes e bandeja"
      lead="Para lembretes e repetições funcionarem, o Mello precisa estar aberto ou na bandeja do Windows."
    >
      <Toggle
        checked={settings['tray.keep']}
        onChange={(value) => save({ key: 'tray.keep', value })}
        sub='Fechar a janela só esconde o app. Para sair de vez, use "Sair" no ícone da bandeja.'
      >
        Manter o Mello na bandeja ao fechar a janela
      </Toggle>
      <Toggle
        checked={settings['app.autoStart']}
        onChange={(value) => save({ key: 'app.autoStart', value })}
        sub="O Mello abre direto na bandeja quando você liga o computador."
      >
        Iniciar com o Windows
      </Toggle>
      <p className={styles.note}>
        Lembretes que venceram com o app fechado aparecem num aviso ao abrir (até 7 dias).
      </p>
    </Section>
  )
}

export function SettingsPage() {
  const info = useAppInfo().data
  const settings = useSettings().data
  const save = useSaveSetting()
  const location = useLocation()
  const asked = (location.state as SettingsLocationState | null)?.section
  const initial = isSection(asked) ? asked : 'aparencia'
  const [active, setActive] = useState<SectionId>(initial)
  const content = useRef<HTMLDivElement>(null)
  // A rolagem causada pelo clique no menu não muda a seção marcada: a última seção pode não
  // chegar ao topo.
  const jumping = useRef(false)

  const go = (id: SectionId) => {
    setActive(id)
    jumping.current = true
    document.getElementById(id)?.scrollIntoView?.({ block: 'start' })
  }

  // Aberto numa seção (o aviso da bandeja abre "Lembretes e bandeja"): rola até ela quando as
  // seções aparecem.
  const ready = settings !== undefined
  useEffect(() => {
    if (!ready || initial === 'aparencia') return
    jumping.current = true
    document.getElementById(initial)?.scrollIntoView?.({ block: 'start' })
  }, [ready, initial])

  const onScroll = () => {
    const box = content.current
    if (!box) return
    if (jumping.current) {
      jumping.current = false
      return
    }
    const top = box.getBoundingClientRect().top
    let current: SectionId = SECTIONS[0].id
    for (const { id } of SECTIONS) {
      const section = document.getElementById(id)
      if (section && section.getBoundingClientRect().top - top <= 48) current = id
    }
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) current = 'dados'
    setActive(current)
  }

  return (
    <div className={styles.page}>
      <nav aria-label="Seções de configurações" className={styles.nav}>
        <h1 className={styles.title}>Configurações</h1>
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={cx(styles.navItem, active === section.id && styles.navActive)}
            aria-current={active === section.id ? 'true' : undefined}
            onClick={() => go(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>
      <div ref={content} className={styles.content} onScroll={onScroll}>
        {settings && (
          <>
            <Appearance settings={settings} save={save} />
            <AgingSection settings={settings} save={save} />
            <CalendarOptions settings={settings} save={save} />
            <TrayOptions settings={settings} save={save} />
            <DataSection />
          </>
        )}
        {info && (
          <p className={styles.version}>
            Mello {info.version}
            {info.dev ? ' (desenvolvimento)' : ''}
          </p>
        )}
      </div>
    </div>
  )
}
