import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { InstallBanner } from '../components/InstallBanner'
import { Button, ErrorText, Field } from '../components/ui'
import { errorMessage } from '../lib/api'
import { deviceTimeZone } from '../lib/format'
import { useLogin, useRegister } from '../lib/queries'

function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="safe-area mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6">
      <header className="flex flex-col items-center gap-3 pt-6 text-center">
        <img src="/icon.svg" alt="" className="size-20 rounded-3xl shadow-lg shadow-brand-500/30" />
        <h1 className="text-3xl font-extrabold">Ayunora</h1>
        <p className="text-ink/60 dark:text-brand-50/60">{title}</p>
      </header>
      <InstallBanner />
      {children}
    </main>
  )
}

export function LoginScreen() {
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate({ email, password })
  }

  return (
    <AuthLayout title="Tu reloj de ayuno intermitente">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorText>{login.error ? errorMessage(login.error) : undefined}</ErrorText>
        <Button type="submit" busy={login.isPending}>
          Entrar
        </Button>
      </form>
      <p className="text-center text-sm">
        ¿Primera vez?{' '}
        <Link to="/registro" className="font-semibold text-brand-600 dark:text-brand-300">
          Crea tu cuenta
        </Link>
      </p>
    </AuthLayout>
  )
}

export function RegisterScreen() {
  const register = useRegister()
  const [form, setForm] = useState({ name: '', email: '', password: '', inviteCode: '' })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    register.mutate({ ...form, timezone: deviceTimeZone() })
  }

  return (
    <AuthLayout title="Crea tu cuenta">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Nombre"
          autoComplete="given-name"
          required
          value={form.name}
          onChange={set('name')}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          required
          value={form.email}
          onChange={set('email')}
        />
        <Field
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          hint="Mínimo 8 caracteres."
          value={form.password}
          onChange={set('password')}
        />
        <Field
          label="Código de invitación"
          autoComplete="off"
          autoCapitalize="none"
          required
          hint="Te lo da quien gestiona la app."
          value={form.inviteCode}
          onChange={set('inviteCode')}
        />
        <ErrorText>{register.error ? errorMessage(register.error) : undefined}</ErrorText>
        <Button type="submit" busy={register.isPending}>
          Crear cuenta
        </Button>
      </form>
      <p className="text-center text-sm">
        ¿Ya tienes cuenta?{' '}
        <Link to="/" className="font-semibold text-brand-600 dark:text-brand-300">
          Entra
        </Link>
      </p>
    </AuthLayout>
  )
}
