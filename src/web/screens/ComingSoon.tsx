import { Card } from '../components/ui'

export function ComingSoon({ title, emoji, text }: { title: string; emoji: string; text: string }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <Card className="flex flex-col items-center gap-2 py-10 text-center">
        <span className="text-5xl" aria-hidden>
          {emoji}
        </span>
        <p className="font-semibold">Muy pronto</p>
        <p className="text-sm text-ink/60 dark:text-brand-50/60">{text}</p>
      </Card>
    </div>
  )
}
