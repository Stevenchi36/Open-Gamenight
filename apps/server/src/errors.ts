import type { ErrorCode } from '@wsfg/core/protocol'

/** An error sent back to the client as `error { code, message }`. */
export class RoomError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
}
