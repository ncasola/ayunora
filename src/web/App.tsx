import { Navigate, Route, Routes } from 'react-router'
import { InstallBanner } from './components/InstallBanner'
import { TabBar } from './components/TabBar'
import { Button } from './components/ui'
import { errorMessage } from './lib/api'
import { useMe } from './lib/queries'
import { LoginScreen, RegisterScreen } from './screens/Auth'
import { ComingSoon } from './screens/ComingSoon'
import { HistoryScreen } from './screens/History'
import { SettingsScreen } from './screens/Settings'
import { TimerScreen } from './screens/Timer'

export function App() {
  const me = useMe()

  if (me.isPending) return <Splash />
  if (me.isError) {
    return (
      <main className="safe-area mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 text-center">
        <p>{errorMessage(me.error)}</p>
        <Button onClick={() => me.refetch()}>Reintentar</Button>
      </main>
    )
  }

  if (!me.data) {
    return (
      <Routes>
        <Route path="/registro" element={<RegisterScreen />} />
        <Route path="*" element={<LoginScreen />} />
      </Routes>
    )
  }

  return (
    <>
      <main className="safe-area mx-auto flex max-w-md flex-col gap-5 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]!">
        <InstallBanner />
        <Routes>
          <Route index element={<TimerScreen />} />
          <Route path="historial" element={<HistoryScreen />} />
          <Route
            path="peso"
            element={
              <ComingSoon
                title="Peso"
                emoji="⚖️"
                text="Aquí podrás registrar tu peso y ver cómo evoluciona."
              />
            }
          />
          <Route path="ajustes" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <TabBar />
    </>
  )
}

function Splash() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <img src="/icon.svg" alt="Ayunora" className="size-20 animate-pulse rounded-3xl" />
    </main>
  )
}
