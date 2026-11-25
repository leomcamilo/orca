export type VoiceCredentialFileJob =
  | { kind: 'read' | 'has' | 'clear'; path: string }
  | { kind: 'write'; path: string; contents: string }

export type VoiceCredentialFileResult =
  | { ok: true; contents: Uint8Array | null; exists: boolean }
  | { ok: false; message: string }
