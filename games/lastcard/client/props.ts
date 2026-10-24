import type { PlayViewProps } from '@wsfg/core/client'
import type { ClientAction, LastCardSettings, LastCardView } from '../shared/index.ts'

/** Props every phase component gets from PlayView. */
export type PhaseProps = PlayViewProps<LastCardView, ClientAction, LastCardSettings>
