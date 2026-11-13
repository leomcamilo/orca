import { defineFixture } from '../../../../component-fixtures/component-fixture'
import { NativeChatSpokenReplyControls } from './NativeChatSpokenReplyControls'
import { NativeChatSpokenReplyStrip } from './NativeChatSpokenReplyStrip'
import type { NativeChatSpokenReplies } from './use-native-chat-spoken-replies'

// Synthetic reply only; no recorded or real conversation.
const LINE = 'The login fix is in and the tests pass, but the migration still needs your approval.'

function control(on: boolean, handsFree: boolean): NativeChatSpokenReplies {
  return {
    on,
    sessionId: 'fixture',
    visible: true,
    line: on ? LINE : null,
    agentLabel: 'Claude',
    handsFree,
    toggle: () => {},
    setHandsFree: () => {},
    silence: () => {}
  }
}

// The composer never takes a send here, so hands-free turns stay at rest.
const RESTING = {
  dictationUnavailable: false,
  agentWorking: false,
  canSend: false,
  onOpenMicrophone: () => {},
  onSend: () => {}
}

function composer(on: boolean, handsFree = false): () => React.JSX.Element {
  return () => (
    <div className="native-chat-appearance p-4 pt-6">
      {on ? (
        <NativeChatSpokenReplyStrip line={LINE} agentLabel="Claude" onSilence={() => {}} />
      ) : null}
      <div className="mx-3 flex items-center justify-between rounded-md border border-border p-3 text-sm text-muted-foreground sm:mx-4">
        Composer
        <span className="flex items-center gap-1">
          <NativeChatSpokenReplyControls spoken={control(on, handsFree)} composer={RESTING} />
        </span>
      </div>
    </div>
  )
}

export const speaking = defineFixture({ width: 720, render: composer(true) })

export const off = defineFixture({ width: 720, render: composer(false) })

export const handsFree = defineFixture({ width: 720, render: composer(true, true) })

export const narrow = defineFixture({ width: 360, render: composer(true) })
