import { Navigate, Route, Routes } from 'react-router'
import { InstallBanner } from './components/InstallBanner'
import { OfflineBanner } from './components/OfflineBanner'
import { TabBar } from './components/TabBar'
import { Button } from './components/ui'
import { errorMessage } from './lib/api'
import { useMe } from './lib/queries'
import { LoginScreen, RegisterScreen } from './screens/Auth'
import { HistoryScreen } from './screens/History'
import { SettingsScreen } from './screens/Settings'
import { TimerScreen } from './screens/Timer'
import { WeightScreen } from './screens/Weight'
import { WelcomeScreen } from './screens/Welcome'

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
        <OfflineBanner />
        <InstallBanner />
        <Routes>
          <Route index element={<TimerScreen />} />
          <Route path="historial" element={<HistoryScreen />} />
          <Route path="peso" element={<WeightScreen />} />
          <Route path="ajustes" element={<SettingsScreen />} />
          <Route path="bienvenida" element={<WelcomeScreen />} />
          {/* Recién registrada, la URL sigue en /registro: de ahí pasa a la bienvenida.
              No se hace desde el onSuccess del formulario porque al iniciarse la sesión el
              formulario se desmonta y ese callback ya no se llama. */}
          <Route path="registro" element={<Navigate to="/bienvenida" replace />} />
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
