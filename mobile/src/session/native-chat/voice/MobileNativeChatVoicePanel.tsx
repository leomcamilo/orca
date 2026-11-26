import { Pressable, StyleSheet, Text, View } from 'react-native'
import { themedStyleSheet } from '../../../theme/themed-styles'
import {
  AudioLines,
  Ear,
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  Volume2,
  X,
  type LucideIcon
} from 'lucide-react-native'
import { colors, radii, spacing, typography, pressedStyle } from '../../../theme/mobile-theme'
import { useMobileColorScheme } from '../../../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../../../i18n/use-mobile-translation'
import type { MobileCodexVoice } from './mobile-codex-voice-view'
import { mobileCodexVoiceOutputLabel, mobileCodexVoiceStatusLabel } from './mobile-codex-voice-copy'

/** Voice mode above a Codex chat's composer: a start button at rest, else the call's state and controls. */
export function MobileNativeChatVoiceControls({
  voice,
  disabled
}: {
  voice: MobileCodexVoice
  disabled: boolean
}): React.JSX.Element {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { view } = voice
  // At rest, one pill starts it; typing and dictation stay available below.
  if (view.status === 'idle') {
    return (
      <PanelButton
        label={t('chat.voice.action.start', 'Talk with Codex')}
        onPress={voice.start}
        icon={AudioLines}
        start
        disabled={disabled}
      />
    )
  }
  const ended = view.status === 'ended'
  const live = view.status === 'live'
  const output = live ? mobileCodexVoiceOutputLabel(t, view.outputPort) : ''
  const dot = ended ? colors.statusRed : live ? colors.statusGreen : colors.statusAmber
  return (
    <View style={styles.panel} testID="native-chat-voice-panel">
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={styles.status} accessibilityLiveRegion="polite" numberOfLines={3}>
          {mobileCodexVoiceStatusLabel(t, view)}
        </Text>
        {output ? <Text style={styles.output}>{output}</Text> : null}
      </View>
      {view.captions.slice(-2).map((caption) => (
        <Text key={caption.id} style={styles.caption} numberOfLines={3}>
          <Text style={styles.speaker}>
            {caption.role === 'user'
              ? t('chat.voice.caption.you', 'You')
              : t('chat.voice.caption.codex', 'Codex')}
            {': '}
          </Text>
          {caption.text.trim()}
        </Text>
      ))}
      <View style={styles.actions}>
        {ended ? (
          <>
            <PanelButton
              label={t('chat.voice.action.retry', 'Try again')}
              onPress={voice.start}
              icon={RotateCcw}
            />
            <PanelButton
              label={t('chat.voice.action.close', 'Close')}
              onPress={voice.dismiss}
              icon={X}
            />
          </>
        ) : (
          <>
            <PanelButton
              label={
                view.muted
                  ? t('chat.voice.action.unmute', 'Unmute')
                  : t('chat.voice.action.mute', 'Mute')
              }
              onPress={() => voice.setMuted(!view.muted)}
              icon={view.muted ? MicOff : Mic}
              selected={view.muted}
            />
            <PanelButton
              label={
                view.speaker
                  ? t('chat.voice.action.speaker', 'Speaker')
                  : t('chat.voice.action.earpiece', 'Earpiece')
              }
              onPress={() => voice.setSpeaker(!view.speaker)}
              icon={view.speaker ? Volume2 : Ear}
            />
            <PanelButton
              label={t('chat.voice.action.end', 'End')}
              onPress={voice.stop}
              icon={PhoneOff}
              danger
            />
          </>
        )}
      </View>
    </View>
  )
}

function PanelButton(props: {
  label: string
  onPress: () => void
  icon: LucideIcon
  selected?: boolean
  danger?: boolean
  start?: boolean
  disabled?: boolean
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={props.selected === undefined ? undefined : { selected: props.selected }}
      onPress={props.onPress}
      disabled={props.disabled}
      testID={props.start ? 'native-chat-voice-button' : undefined}
      style={({ pressed }) => [
        styles.button,
        props.start && styles.buttonStart,
        props.disabled && styles.buttonDisabled,
        props.selected && styles.buttonSelected,
        props.danger && styles.buttonDanger,
        pressed && pressedStyle
      ]}
    >
      <props.icon size={16} color={props.danger ? colors.onStatusRed : colors.textPrimary} />
      <Text style={[styles.buttonLabel, props.danger && styles.buttonLabelDanger]}>
        {props.label}
      </Text>
    </Pressable>
  )
}

const styles = themedStyleSheet(() => ({
  panel: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.composerBorder,
    backgroundColor: colors.composerSurface
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: radii.pill },
  status: { flex: 1, color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  output: { color: colors.textMuted, fontSize: typography.metaSize },
  caption: { color: colors.textSecondary, fontSize: typography.bodySize },
  speaker: { color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.composerControl
  },
  buttonStart: {
    alignSelf: 'flex-end',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.composerBorder,
    backgroundColor: colors.composerSurface
  },
  buttonDisabled: { opacity: 0.4 },
  buttonSelected: { backgroundColor: colors.translucentFill },
  buttonDanger: { backgroundColor: colors.statusRed },
  buttonLabel: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '600' },
  buttonLabelDanger: { color: colors.onStatusRed }
}))
