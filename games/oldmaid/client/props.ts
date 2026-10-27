import type { PlayViewProps } from '@wsfg/core/client'
import type { ClientAction, OldMaidSettings, OldMaidView } from '../shared/index.ts'

/** Props every phase component gets from PlayView. */
export type PhaseProps = PlayViewProps<OldMaidView, ClientAction, OldMaidSettings>
