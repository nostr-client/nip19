/**
 * nip19.js — bech32 display encoding for nostr (NIP-19). No build, no deps.
 *
 * Part of https://github.com/nostr-client — one repo, one thing.
 * License: AGPL-3.0-or-later
 *
 * THE RULE: hex pubkeys/ids are the primitives everywhere in nostr-client —
 * in APIs, attributes, events, and storage. NIP-19 strings (npub…, nsec…,
 * note…) are PRESENTATION ONLY: encode at the last moment before display,
 * decode at the first moment after user input.
 *
 *   import { npubEncode, decode, shorten } from 'https://nostr-client.github.io/nip19/nip19.js'
 */

const CHARS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

function polymod(values) {
  let chk = 1
  for (const v of values) {
    const b = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i]
  }
  return chk
}

function hrpExpand(hrp) {
  const out = []
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5)
  out.push(0)
  for (const c of hrp) out.push(c.charCodeAt(0) & 31)
  return out
}

function convertBits(data, from, to, pad) {
  let acc = 0, bits = 0
  const out = []
  const maxv = (1 << to) - 1
  for (const value of data) {
    acc = (acc << from) | value
    bits += from
    while (bits >= to) {
      bits -= to
      out.push((acc >> bits) & maxv)
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv)
  } else if (bits >= from || ((acc << (to - bits)) & maxv)) {
    throw new Error('bech32: invalid padding')
  }
  return out
}

export const bytesToHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
export const hexToBytes = (hex) => {
  if (!/^([0-9a-fA-F]{2})+$/.test(hex)) throw new Error('invalid hex')
  return new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)))
}

export function bech32Encode(hrp, bytes) {
  const data = convertBits(bytes, 8, 5, true)
  const pm = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1
  const checksum = []
  for (let i = 0; i < 6; i++) checksum.push((pm >> (5 * (5 - i))) & 31)
  return hrp + '1' + [...data, ...checksum].map((v) => CHARS[v]).join('')
}

export function bech32Decode(str) {
  str = str.toLowerCase().trim()
  const pos = str.lastIndexOf('1')
  if (pos < 1 || pos + 7 > str.length) throw new Error('bech32: malformed')
  const hrp = str.slice(0, pos)
  const values = [...str.slice(pos + 1)].map((c) => {
    const v = CHARS.indexOf(c)
    if (v === -1) throw new Error('bech32: invalid character')
    return v
  })
  if (polymod([...hrpExpand(hrp), ...values]) !== 1) throw new Error('bech32: bad checksum')
  return { hrp, bytes: new Uint8Array(convertBits(values.slice(0, -6), 5, 8, false)) }
}

// ------------------------------------------------- nostr entities (32-byte)

const encode32 = (hrp) => (hex) => {
  const bytes = hexToBytes(hex)
  if (bytes.length !== 32) throw new Error(hrp + ': expected 32 bytes')
  return bech32Encode(hrp, bytes)
}

export const npubEncode = encode32('npub') // display a pubkey
export const nsecEncode = encode32('nsec') // display a secret key
export const noteEncode = encode32('note') // display an event id

/**
 * Decode any NIP-19 bare string (or 64-char hex passthrough) back to the
 * hex primitive. Returns { type: 'npub'|'nsec'|'note'|'hex', hex }.
 */
export function decode(str) {
  str = str.trim()
  if (/^[0-9a-fA-F]{64}$/.test(str)) return { type: 'hex', hex: str.toLowerCase() }
  const { hrp, bytes } = bech32Decode(str)
  if (bytes.length !== 32) throw new Error('expected 32 bytes of data')
  if (!['npub', 'nsec', 'note'].includes(hrp)) throw new Error('unsupported prefix: ' + hrp)
  return { type: hrp, hex: bytesToHex(bytes) }
}

/**
 * Decode TLV entities (nprofile / nevent / naddr) — accepted at the UI edge
 * (pasted strings, nostr: links in note content) and immediately reduced to
 * hex primitives + hints.
 *
 * Returns, by type:
 *   nprofile → { type, hex: <pubkey>, relays }
 *   nevent   → { type, hex: <event id>, relays, author?, kind? }
 *   naddr    → { type, identifier, author, kind, relays }
 * Bare npub/nsec/note/hex fall through to decode()'s shape.
 */
export function decodeAny(str) {
  str = String(str).trim().replace(/^nostr:/, '')
  if (/^(npub|nsec|note)1|^[0-9a-fA-F]{64}$/.test(str)) return decode(str)
  const { hrp, bytes } = bech32Decode(str)
  if (!['nprofile', 'nevent', 'naddr'].includes(hrp)) throw new Error('unsupported prefix: ' + hrp)
  const tlv = {}
  for (let i = 0; i + 1 < bytes.length;) {
    const type = bytes[i]
    const len = bytes[i + 1]
    const value = bytes.slice(i + 2, i + 2 + len)
    if (value.length !== len) throw new Error('tlv: truncated')
    ;(tlv[type] ??= []).push(value)
    i += 2 + len
  }
  const relays = (tlv[1] ?? []).map((v) => new TextDecoder().decode(v))
  const author = tlv[2]?.[0] ? bytesToHex(tlv[2][0]) : undefined
  const kind = tlv[3]?.[0] ? new DataView(tlv[3][0].buffer, tlv[3][0].byteOffset).getUint32(0) : undefined
  if (!tlv[0]?.[0]) throw new Error(hrp + ': missing special field')
  if (hrp === 'nprofile') {
    if (tlv[0][0].length !== 32) throw new Error('nprofile: bad pubkey length')
    return { type: hrp, hex: bytesToHex(tlv[0][0]), relays }
  }
  if (hrp === 'nevent') {
    if (tlv[0][0].length !== 32) throw new Error('nevent: bad id length')
    return { type: hrp, hex: bytesToHex(tlv[0][0]), relays, author, kind }
  }
  return { type: hrp, identifier: new TextDecoder().decode(tlv[0][0]), relays, author, kind }
}

/** "npub1sg6plz…f63m" — the standard short display form. */
export function shorten(nip19str, head = 10, tail = 4) {
  return nip19str.length <= head + tail + 1 ? nip19str : nip19str.slice(0, head) + '…' + nip19str.slice(-tail)
}

/** Convenience: hex pubkey → short display string. */
export const npubShort = (hex) => shorten(npubEncode(hex))
