import { spawnWorkerThread } from '../worker-threads/worker-thread-spawn'
import {
  currentWorkerEntryLayout,
  resolveWorkerThreadEntryPath
} from '../worker-threads/worker-thread-entry-path'
import type {
  VoiceCredentialFileJob,
  VoiceCredentialFileResult
} from './voice-credential-file-contract'

export function voiceCredentialFile(
  job: VoiceCredentialFileJob,
  workerPath = resolveWorkerThreadEntryPath(
    currentWorkerEntryLayout(__dirname),
    'voice-credential-file-worker-entry.js'
  )
): Promise<Extract<VoiceCredentialFileResult, { ok: true }>> {
  return new Promise((resolve, reject) => {
    const worker = spawnWorkerThread(workerPath, {
      name: 'orca-voice-credential-file',
      workerData: job,
      execArgv: []
    })
    let result: VoiceCredentialFileResult | undefined
    let failure: Error | undefined
    const timer = setTimeout(() => {
      failure = new Error('Voice credential file worker timed out')
      void worker.terminate().catch(reject)
    }, 30_000)
    worker.on('message', (message: VoiceCredentialFileResult) => {
      result = message
    })
    worker.on('error', (error) => {
      failure = error
    })
    worker.once('exit', (code) => {
      clearTimeout(timer)
      if (failure || code !== 0 || !result?.ok) {
        reject(
          failure ??
            new Error(
              result?.ok === false
                ? result.message
                : 'Voice credential file worker exited without completion'
            )
        )
      } else {
        resolve(result)
      }
    })
  })
}
