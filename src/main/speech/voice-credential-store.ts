import { homedir } from 'node:os'
import { join } from 'node:path'
import { getSecretStore } from '../../shared/secure-storage/secret-store'
import { voiceCredentialFile } from './voice-credential-file'

export function createVoiceCredentialStore(
  options: { fileName: string; envelopePrefix: string; providerLabel: string },
  file = voiceCredentialFile
) {
  const path = () => join(homedir(), '.orca', options.fileName)
  let cached: string | null = null
  let pending: Promise<unknown> = Promise.resolve()
  const ordered = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = pending.then(operation, operation)
    pending = next.catch(() => undefined)
    return next
  }
  return {
    has: () => ordered(async () => (await file({ kind: 'has', path: path() })).exists),
    read: () =>
      ordered(async (): Promise<string | null> => {
        if (cached !== null) {
          return cached
        }
        const { contents } = await file({ kind: 'read', path: path() })
        if (contents === null) {
          return null
        }
        const text = Buffer.from(contents).toString('utf8')
        const rest = text.startsWith(options.envelopePrefix)
          ? text.slice(options.envelopePrefix.length)
          : ''
        const separator = rest.indexOf(':')
        const kind = rest.slice(0, separator)
        if (separator === -1 || (kind !== 'encrypted' && kind !== 'plaintext')) {
          throw new Error(`${options.providerLabel} API key could not be decrypted`)
        }
        const payload = Buffer.from(rest.slice(separator + 1), 'base64')
        cached =
          kind === 'plaintext' ? payload.toString('utf8') : getSecretStore().decryptString(payload)
        return cached
      }),
    save: (key: string) =>
      ordered(async () => {
        const trimmed = key.trim()
        if (!trimmed) {
          throw new Error(`${options.providerLabel} API key is required`)
        }
        const secrets = getSecretStore()
        const encrypted = secrets.isEncryptionAvailable()
        if (!encrypted) {
          console.warn(
            '[speech] Secret encryption unavailable; storing voice credential in plaintext'
          )
        }
        const payload = encrypted ? secrets.encryptString(trimmed) : Buffer.from(trimmed, 'utf8')
        await file({
          kind: 'write',
          path: path(),
          contents: `${options.envelopePrefix}${encrypted ? 'encrypted' : 'plaintext'}:${payload.toString('base64')}`
        })
        cached = trimmed
      }),
    clear: () =>
      ordered(async () => {
        cached = null
        await file({ kind: 'clear', path: path() })
      })
  }
}
