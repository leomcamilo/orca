import { parentPort, workerData } from 'node:worker_threads'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { hardenExistingSecureFile, writeSecureFile } from '../../shared/secure-storage/secure-file'
import type {
  VoiceCredentialFileJob,
  VoiceCredentialFileResult
} from './voice-credential-file-contract'

const port = parentPort
if (!port) {
  throw new Error('Voice credential file worker needs a parent port')
}
const job: VoiceCredentialFileJob = workerData
try {
  let contents: Buffer | null = null
  if (job.kind === 'write') {
    writeSecureFile(job.path, job.contents, { durable: true })
  } else if (job.kind === 'clear') {
    rmSync(job.path, { force: true })
  } else if (existsSync(job.path)) {
    try {
      hardenExistingSecureFile(job.path)
    } catch {
      // Permission hardening is best-effort, as in the existing credential store.
    }
    if (job.kind === 'read') {
      contents = readFileSync(job.path)
    }
  }
  port.postMessage({
    ok: true,
    contents,
    exists: existsSync(job.path)
  } satisfies VoiceCredentialFileResult)
} catch {
  port.postMessage({
    ok: false,
    message: 'Voice credential file operation failed'
  } satisfies VoiceCredentialFileResult)
}
port.close()
