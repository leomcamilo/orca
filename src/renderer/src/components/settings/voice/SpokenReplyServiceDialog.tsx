import { useState } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { Button } from '../../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../ui/dialog'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { useTranslate } from '@/i18n/use-translate'

export type SpokenReplyServiceField = {
  id: string
  label: string
  placeholder?: string
  secret?: boolean
  /** Starts filled; secrets always start empty. */
  initial?: string
  optional?: boolean
}

/** What went wrong saving or removing, in the main process's own words; null when it worked. */
async function failureOf(action: () => Promise<void>): Promise<string | null> {
  try {
    await action()
    return null
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : String(failure)
    // IPC wraps the main process's own words in its channel name.
    return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
  }
}

/** Saves what reaching a speech service takes: a key, or a server's address and names. What it
 *  saves is sealed in the main process; the dialog never reads a saved secret back. */
export function SpokenReplyServiceDialog({
  open,
  title,
  description,
  fields,
  configured,
  onOpenChange,
  onSave,
  onClear
}: {
  open: boolean
  title: string
  description: string
  fields: readonly SpokenReplyServiceField[]
  configured: boolean
  onOpenChange: (open: boolean) => void
  onSave: (values: Record<string, string>) => Promise<void>
  onClear: () => Promise<void>
}): React.JSX.Element {
  const t = useTranslate()
  const [values, setValues] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valueOf = (field: SpokenReplyServiceField): string =>
    values[field.id] ?? (field.secret ? '' : (field.initial ?? ''))
  const complete = fields.every((field) => field.optional || valueOf(field).trim() !== '')
  const run = async (action: () => Promise<void>): Promise<void> => {
    setPending(true)
    setError(null)
    const failure = await failureOf(action)
    setPending(false)
    if (failure === null) {
      setValues({})
      onOpenChange(false)
    } else {
      setError(failure)
    }
  }
  const save = (): Promise<void> =>
    run(() => onSave(Object.fromEntries(fields.map((field) => [field.id, valueOf(field)]))))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {fields.map((field) => (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={`spoken-reply-service-${field.id}`}>{field.label}</Label>
            <Input
              id={`spoken-reply-service-${field.id}`}
              type={field.secret ? 'password' : 'text'}
              value={valueOf(field)}
              placeholder={field.placeholder}
              disabled={pending}
              onChange={(event) => setValues({ ...values, [field.id]: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && complete) {
                  void save()
                }
              }}
            />
          </div>
        ))}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <Lock className="size-3 shrink-0" />
          {t(
            'components.settings.voice.spokenReplies.serviceDialog.storage',
            'Saved in ~/.orca with Electron encrypted storage when available.'
          )}
        </p>
        <DialogFooter>
          {configured ? (
            <Button variant="outline" disabled={pending} onClick={() => void run(onClear)}>
              {t('components.settings.voice.spokenReplies.serviceDialog.clear', 'Remove')}
            </Button>
          ) : null}
          <Button disabled={pending || !complete} onClick={() => void save()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('components.settings.voice.spokenReplies.serviceDialog.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
