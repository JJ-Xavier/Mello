import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { BoardPage } from '../features/board/BoardPage'
import { CalendarPage } from '../features/calendar/CalendarPage'
import { HomePage } from '../features/home/HomePage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { BoardLayout, HomeLayout, SettingsLayout } from './Layouts'

// Os dados vêm do banco local, então não "envelhecem" sozinhos: o cache só é recarregado quando
// uma alteração o invalida (staleTime infinito, sem recarregar ao focar a janela).
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false }
    }
  })
}

// HashRouter porque o app instalado carrega a tela por file://.
export function App() {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<HomeLayout />}>
            <Route index element={<HomePage />} />
            <Route path="calendar" element={<CalendarPage scope="all" />} />
          </Route>
          <Route path="boards/:boardId" element={<BoardLayout />}>
            <Route index element={<BoardPage />} />
            <Route path="calendar" element={<CalendarPage scope="board" />} />
          </Route>
          <Route element={<SettingsLayout />}>
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
