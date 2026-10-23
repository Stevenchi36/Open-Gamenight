import type { PlayViewProps } from '@wsfg/core/client'
import type { ClientAction, HerdSettings, HerdView } from '../shared/index.ts'

/** Props every phase component gets from PlayView. */
export type PhaseProps = PlayViewProps<HerdView, ClientAction, HerdSettings>
