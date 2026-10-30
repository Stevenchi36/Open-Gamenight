/**
 * A software passkey for tests: what a phone or password manager does during WebAuthn, minus
 * the prompt. P-256 key, "none" attestation, so the server's real verification runs unchanged.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest()

/** Just enough CBOR for an attestation object and a COSE key. */
function cbor(value: number | string | Uint8Array | Map<number | string, unknown>): Buffer {
  const head = (major: number, n: number) => {
    if (n < 24) return Buffer.from([(major << 5) | n])
    if (n < 0x100) return Buffer.from([(major << 5) | 24, n])
    if (n < 0x10000) return Buffer.from([(major << 5) | 25, n >> 8, n & 0xff])
    const b = Buffer.alloc(5)
    b[0] = (major << 5) | 26
    b.writeUInt32BE(n, 1)
    return b
  }
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value)
  if (typeof value === 'string') {
    const text = Buffer.from(value, 'utf8')
    return Buffer.concat([head(3, text.length), text])
  }
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), value])
  const parts: Buffer[] = [head(5, value.size)]
  for (const [k, v] of value) parts.push(cbor(k), cbor(v as Parameters<typeof cbor>[0]))
  return Buffer.concat(parts)
}

export interface SoftPasskey {
  credentialId: string
  /** The browser's response to the server's registration options. */
  register(options: { challenge: string; rp: { id: string } }, origin: string): unknown
  /** The browser's response to the server's sign-in options. */
  authenticate(options: { challenge: string; rpId: string }, origin: string): unknown
}

/** 'User present' and 'user verified', plus 'attested credential data' when registering. */
const UP_UV = 0x05
const AT = 0x40

/** Bitwarden's authenticator model id. The default, all zeros, is what privacy-preserving ones send. */
export const BITWARDEN_AAGUID = 'd548826e-79b4-db40-a3d8-11116f7e8349'

export function softPasskey({ aaguid = '00000000-0000-0000-0000-000000000000' } = {}): SoftPasskey {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const credential = randomBytes(16)
  const credentialId = b64url(credential)
  let counter = 0

  const authData = (rpId: string, flags: number, attested?: Buffer) => {
    const count = Buffer.alloc(4)
    count.writeUInt32BE(++counter)
    return Buffer.concat([sha256(rpId), Buffer.from([flags]), count, ...(attested ? [attested] : [])])
  }
  const clientData = (type: string, challenge: string, origin: string) =>
    Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }))

  return {
    credentialId,
    register(options, origin) {
      const jwk = (publicKey as KeyObject).export({ format: 'jwk' })
      const coseKey = new Map<number, unknown>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, Buffer.from(jwk.x!, 'base64url')],
        [-3, Buffer.from(jwk.y!, 'base64url')],
      ])
      const length = Buffer.from([credential.length >> 8, credential.length & 0xff])
      const attested = Buffer.concat([Buffer.from(aaguid.replace(/-/g, ''), 'hex'), length, credential, cbor(coseKey)])
      const attestationObject = cbor(new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData(options.rp.id, UP_UV | AT, attested)],
      ]))
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: {
          clientDataJSON: b64url(clientData('webauthn.create', options.challenge, origin)),
          attestationObject: b64url(attestationObject),
          transports: ['internal'],
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      }
    },
    authenticate(options, origin) {
      const data = authData(options.rpId, UP_UV)
      const client = clientData('webauthn.get', options.challenge, origin)
      const signature = sign('sha256', Buffer.concat([data, sha256(client)]), privateKey)
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: { clientDataJSON: b64url(client), authenticatorData: b64url(data), signature: b64url(signature) },
        clientExtensionResults: {},
      }
    },
  }
}
