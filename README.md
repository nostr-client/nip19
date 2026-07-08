# nip19

Bech32 display encoding for nostr ([NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md)).
**Zero dependencies. No build step.** One file: [`nip19.js`](nip19.js). Works in
browsers, node, and workers.

Part of [nostr-client](https://github.com/nostr-client) — a modular, composable
nostr client where each repo does one thing.

**Live demo:** https://nostr-client.github.io/nip19/

## The rule this repo exists to enforce

> **Hex is the primitive. NIP-19 is presentation.**

Every nostr-client API, attribute, event and storage key speaks 64-char hex
pubkeys and event ids. `npub…` / `nsec…` / `note…` strings exist only at the
edges of the UI: encode at the last moment before display, decode at the first
moment after user input.

## Use

```js
import { npubEncode, npubShort, noteEncode, decode, shorten }
  from 'https://nostr-client.github.io/nip19/nip19.js'

npubEncode('82341f88…')   // 'npub1sg6plz…' — display only
npubShort('82341f88…')    // 'npub1sg6plz…f63m'
decode('npub1sg6plz…')    // { type: 'npub', hex: '82341f88…' } — back to the primitive
decode('82341f88…')       // hex passes through: { type: 'hex', hex: … }
```

Also exported: `nsecEncode`, `bech32Encode`, `bech32Decode`, `bytesToHex`,
`hexToBytes`.

Deliberately not included: TLV entities (`nevent`, `nprofile`, `naddr`) — if
you find yourself wanting to *pass around* relay hints inside identifiers,
prefer passing explicit `{ id/pubkey (hex), relays }` data. This may grow TLV
*decoding* later so pasted `nevent…` strings can be accepted at the UI edge.

## License

AGPL-3.0-or-later
