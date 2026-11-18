import type * as NodeOs from 'node:os'
import type * as VoiceCredentialFile from './voice-credential-file'
import { build } from 'esbuild'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { setSecretStore, _resetSecretStoreForTests } from '../../shared/secure-storage/secret-store'
import { createEncryptedApiKeyFileStore } from '../credentials/encrypted-api-key-file-store'
import { voiceCredentialFile } from './voice-credential-file'
import { createVoiceCredentialStore } from './voice-credential-store'
import {
  saveOpenAiCompatibleSpeechVoice,
  readOpenAiCompatibleSpeechVoice,
  clearOpenAiCompatibleSpeechVoice
} from './openai-compatible-speech-voice-store'
import {
  clearOpenAiSpeechApiKey,
  getOpenAiKeyPath,
  readOpenAiSpeechApiKeyAsync,
  saveOpenAiSpeechApiKey
} from './openai-api-key-store'

const home = vi.hoisted(() => ({ path: '', workerPath: '' }))
vi.mock('node:os', async (original) => ({
  ...(await original<typeof NodeOs>()),
  homedir: () => home.path
}))
vi.mock('./voice-credential-file', async (original) => {
  const { voiceCredentialFile: run } = await original<typeof VoiceCredentialFile>()
  return { voiceCredentialFile: (job: Parameters<typeof run>[0]) => run(job, home.workerPath) }
})
let workerDirectory: string
let workerPath: string
const options = {
  fileName: 'voice-test.enc',
  envelopePrefix: 'orca-voice-test:v1:',
  providerLabel: 'Voice test',
  logScope: 'voice-test'
}
const cipherKey = Buffer.alloc(32, 7)
function encrypt(plaintext: string): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', cipherKey, iv)
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([Buffer.from('v10'), iv, cipher.getAuthTag(), body])
}
function decrypt(raw: Buffer): string {
  const cipher = createDecipheriv('aes-256-gcm', cipherKey, raw.subarray(3, 15))
  cipher.setAuthTag(raw.subarray(15, 31))
  return Buffer.concat([cipher.update(raw.subarray(31)), cipher.final()]).toString('utf8')
}
const secrets = {
  isEncryptionAvailable: () => true,
  encryptString: encrypt,
  decryptString: decrypt,
  describeProtectionGap: () => null
}
function store() {
  return createVoiceCredentialStore(options, (job) => voiceCredentialFile(job, workerPath))
}
function path() {
  return join(home.path, '.orca', options.fileName)
}

beforeAll(async () => {
  workerDirectory = mkdtempSync(join(tmpdir(), 'orca-voice-credential-worker-'))
  workerPath = join(workerDirectory, 'voice-credential-file-worker-entry.js')
  home.workerPath = workerPath
  await build({
    entryPoints: [resolve('src/main/speech/voice-credential-file-worker-entry.ts')],
    outfile: workerPath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent'
  })
})
beforeEach(() => {
  home.path = mkdtempSync(join(tmpdir(), 'orca-voice-credentials-'))
  mkdirSync(join(home.path, '.orca'))
  setSecretStore(secrets)
  clearOpenAiSpeechApiKey()
})
afterEach(() => {
  clearOpenAiSpeechApiKey()
  _resetSecretStoreForTests()
  rmSync(home.path, { recursive: true, force: true })
})
afterAll(() => rmSync(workerDirectory, { recursive: true, force: true }))

it('reads existing encrypted envelopes and writes files the existing store can decrypt', async () => {
  createEncryptedApiKeyFileStore(options).save('old-value')
  const current = store()
  expect(await current.read()).toBe('old-value')
  await current.save('new-value')
  expect(createEncryptedApiKeyFileStore(options).read()).toBe('new-value')
  expect(readFileSync(path(), 'utf8')).not.toContain('new-value')
  if (process.platform !== 'win32') {
    expect(statSync(path()).mode & 0o777).toBe(0o600)
  }
})

it('keeps a decrypted key cached and orders clear after in-flight reads and saves', async () => {
  const current = store()
  await current.save('cached-value')
  writeFileSync(path(), 'not a credential')
  expect(await current.read()).toBe('cached-value')
  const saving = current.save('next-value')
  const clearing = current.clear()
  await Promise.all([saving, clearing])
  expect(await current.has()).toBe(false)
  expect(await current.read()).toBe(null)
})

it('retains plaintext compatibility and rejects corrupt envelopes without replacing them', async () => {
  setSecretStore({ ...secrets, isEncryptionAvailable: () => false })
  const current = store()
  await current.save('plaintext-value')
  expect(createEncryptedApiKeyFileStore(options).read()).toBe('plaintext-value')
  expect(await store().read()).toBe('plaintext-value')
  writeFileSync(path(), 'corrupt-value')
  await expect(store().read()).rejects.toThrow('could not be decrypted')
  expect(readFileSync(path(), 'utf8')).toBe('corrupt-value')
})

it('rejects a failed durable save and leaves the previously cached credential usable', async () => {
  const current = store()
  await current.save('retained-value')
  rmSync(path())
  mkdirSync(path())
  await expect(current.save('unpublished-value')).rejects.toThrow('operation failed')
  expect(await current.read()).toBe('retained-value')
})

it('reads OpenAI ciphertext, legacy JSON and plaintext and shares save/clear invalidation', async () => {
  expect(await readOpenAiSpeechApiKeyAsync()).toBe(null)
  writeFileSync(getOpenAiKeyPath(), encrypt('raw-value'))
  expect(await readOpenAiSpeechApiKeyAsync()).toBe('raw-value')
  saveOpenAiSpeechApiKey('saved-value')
  expect(await readOpenAiSpeechApiKeyAsync()).toBe('saved-value')
  clearOpenAiSpeechApiKey()
  expect(await readOpenAiSpeechApiKeyAsync()).toBe(null)
  writeFileSync(
    getOpenAiKeyPath(),
    JSON.stringify({ encryptedKeyBase64: encrypt('legacy-value').toString('base64') })
  )
  expect(await readOpenAiSpeechApiKeyAsync()).toBe('legacy-value')
  clearOpenAiSpeechApiKey()
  setSecretStore({ ...secrets, isEncryptionAvailable: () => false })
  writeFileSync(getOpenAiKeyPath(), 'plaintext-key')
  expect(await readOpenAiSpeechApiKeyAsync()).toBe('plaintext-key')
})

it('keeps a newly saved server key when concurrent edits omit it, and clears after saves', async () => {
  const provider = { baseUrl: 'https://voice.example.com/v1', model: 'speech', voice: 'voice' }
  const first = saveOpenAiCompatibleSpeechVoice({ ...provider, apiKey: 'first-key' })
  const second = saveOpenAiCompatibleSpeechVoice({ ...provider, apiKey: 'new-key' })
  const third = saveOpenAiCompatibleSpeechVoice({ ...provider, apiKey: '' })
  await Promise.all([first, second, third])
  expect((await readOpenAiCompatibleSpeechVoice())?.apiKey).toBe('new-key')
  await saveOpenAiCompatibleSpeechVoice({
    ...provider,
    baseUrl: 'https://different.example.com/v1',
    apiKey: ''
  })
  expect((await readOpenAiCompatibleSpeechVoice())?.apiKey).toBe('')
  const saving = saveOpenAiCompatibleSpeechVoice({ ...provider, apiKey: 'discarded-key' })
  const clearing = clearOpenAiCompatibleSpeechVoice()
  await Promise.all([saving, clearing])
  expect(await readOpenAiCompatibleSpeechVoice()).toBe(null)
})

it('refuses sealed credentials when the host cannot decrypt without rewriting the file', async () => {
  createEncryptedApiKeyFileStore(options).save('sealed-value')
  const sealed = readFileSync(path())
  setSecretStore({ ...secrets, isEncryptionAvailable: () => false })
  await expect(store().read()).rejects.toThrow('could not be decrypted')
  expect(readFileSync(path())).toEqual(sealed)
})
