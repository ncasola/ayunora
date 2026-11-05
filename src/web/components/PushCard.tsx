import { useEffect, useState } from 'react'
import { api, errorMessage } from '../lib/api'
import { enablePush, getPushStatus, sendTestPush, type PushStatus } from '../lib/push'
import { Button, Card, ErrorText } from './ui'

const statusText: Record<PushStatus, string> = {
  unsupported:
    'Este navegador no admite notificaciones. En iPhone, instala la app en la pantalla de inicio.',
  denied: 'Las notificaciones están bloqueadas. Actívalas en Ajustes › Notificaciones › Ayunora.',
  default: 'Activa las notificaciones para saber cuándo termina tu ayuno.',
  'granted-unsubscribed': 'Falta registrar este dispositivo para recibir avisos.',
  subscribed: 'Activadas en este dispositivo ✓',
}

export function PushCard() {
  const [status, setStatus] = useState<PushStatus>()
  const [publicKey, setPublicKey] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    void getPushStatus().then(setStatus)
    // La clave se pide antes: en iOS, el permiso tiene que pedirse dentro del propio toque.
    api<{ publicKey: string }>('/push/public-key')
      .then((r) => setPublicKey(r.publicKey))
      .catch(() => undefined)
  }, [])

  async function activate() {
    if (!publicKey) return
    setBusy(true)
    setError(undefined)
    setMessage(undefined)
    try {
      await enablePush(publicKey)
      setMessage('¡Listo! Te avisaremos aquí.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setStatus(await getPushStatus())
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const r = await sendTestPush()
      setMessage(
        r.sent > 0
          ? 'Enviada. Si tienes la app abierta, puede que no la veas: prueba a cerrarla.'
          : 'No hay ningún dispositivo registrado. Activa las notificaciones primero.',
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const canActivate = status === 'default' || status === 'granted-unsubscribed'

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-bold">Notificaciones</h2>
      <p className="text-sm text-ink/70 dark:text-brand-50/70">
        {status ? statusText[status] : 'Comprobando…'}
      </p>
      {canActivate && (
        <Button onClick={activate} busy={busy} disabled={!publicKey}>
          Activar notificaciones
        </Button>
      )}
      {status === 'subscribed' && (
        <Button variant="secondary" onClick={test} busy={busy}>
          Enviar notificación de prueba
        </Button>
      )}
      {message && <p className="text-sm">{message}</p>}
      <ErrorText>{error}</ErrorText>
    </Card>
  )
}
