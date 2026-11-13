import {
  NativeChatHandsFreeButton,
  type NativeChatHandsFreeComposer
} from './NativeChatHandsFreeButton'
import { NativeChatSpokenReplyButton } from './NativeChatSpokenReplyButton'
import type { NativeChatSpokenReplies } from './use-native-chat-spoken-replies'

/** The composer's spoken-reply controls: the speaker, and the ear once replies are read aloud. */
export function NativeChatSpokenReplyControls(props: {
  spoken: NativeChatSpokenReplies
  composer: NativeChatHandsFreeComposer
}): React.JSX.Element {
  return (
    <>
      <NativeChatSpokenReplyButton spoken={props.spoken} />
      {props.spoken.on ? (
        <NativeChatHandsFreeButton spoken={props.spoken} composer={props.composer} />
      ) : null}
    </>
  )
}
