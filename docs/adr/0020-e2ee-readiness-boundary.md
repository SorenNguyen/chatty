# ADR 0020: No E2EE claim before a browser-grade protocol implementation

## Status

Accepted. This completes the protocol and recovery decision in roadmap item 129; it does not claim
that Chatty messages are end-to-end encrypted today.

## Context

Chatty is currently a browser-first application. The server authorizes and stores plaintext so it
can search, normalize images, build previews and synchronize history. Adding a cipher around
`Message.content` would not produce an honest E2EE system: device enrollment, group membership,
attachments, recovery, key changes and compromised-device removal are the hard protocol.

The maintained TypeScript bridge in Signal's `libsignal` targets Node native libraries, while its
old browser JavaScript implementation is archived. OpenMLS implements the IETF MLS standard and can
compile to WebAssembly, but its own supported-platform table currently lists WASM as built but not
tested. Matrix's Rust crypto WASM is browser-capable and its underlying vodozemac implementation has
received an external audit, but its state machine implements Matrix client/server semantics rather
than acting as a drop-in cipher for Chatty.

Forking one of these libraries, reviving archived browser crypto, or implementing the RFC directly
would make Chatty the maintainer of security-critical protocol code. That is outside the free-first
product's safe operating boundary.

## Decision

### Protocol target

Messaging Layer Security (MLS, RFC 9420) is the target for both two-person and group conversations.
It provides one asynchronous group state with forward secrecy and post-compromise security instead
of layering a custom group sender-key scheme over pairwise sessions.

Implementation remains gated until a maintained browser/WASM MLS package:

1. supports the required RFC 9420 ciphersuite and persistent state in IndexedDB;
2. publishes interoperability tests and passes them in the browsers Chatty supports;
3. has a current independent security review covering the distributed package, not only the RFC;
4. has a compatible license and a documented security-update channel; and
5. survives a Chatty prototype covering add/remove races, offline epochs and state recovery.

OpenMLS is the leading candidate, not a dependency selected in advance of those facts. Matrix crypto
is reconsidered only if Chatty deliberately adopts Matrix transport semantics rather than wrapping
its state machine behind an imitation Matrix server.

### Device identity and verification

- Every browser installation is a device with its own MLS credential and operational keys. Persisted
  secrets are additionally sealed by a non-extractable WebCrypto wrapping key where supported; this
  limits at-rest extraction but does not pretend to defeat JavaScript executing through an active XSS.
- An account recovery identity signs device credentials; the server may distribute public
  credentials but cannot silently make an unverified device trusted.
- A new device becomes trusted through QR/SAS confirmation by an existing trusted device or through
  an offline recovery key. A password or password-reset email alone never grants message keys.
- Contacts verify the account recovery identity. A changed identity is a blocking warning, not a
  passive notification. The UI shows per-device trust and last activity rather than one misleading
  account-level lock.

This design still needs a key-transparency decision before large public deployment. Without one, a
malicious server can present different device sets to different people until they compare keys.

### History, attachments and recovery

- A newly signed-in but unverified device receives no old plaintext history.
- A verified existing device may transfer current MLS state and an explicitly bounded history over
  an encrypted device-to-device channel. Membership alone does not reveal messages from before join.
- The client creates the display image and thumbnail, encrypts both with a fresh attachment key, and
  uploads opaque bytes. That key and hashes travel inside the MLS application message. The server
  cannot normalize or thumbnail encrypted media.
- Optional backup is an AEAD-encrypted client archive protected by a separate high-entropy recovery
  key. The server or object store sees ciphertext only. Losing every trusted device and that recovery
  key means history is unrecoverable; support staff cannot reset encryption with email.
- PostgreSQL backup encryption protects disks and operators handling backup files, but it is not the
  same guarantee as client-side E2EE backup.

### Review and rollout

Before any E2EE badge or default migration, Chatty needs a written threat model, protocol test
vectors, cross-browser and multi-device failure tests, metadata disclosure documentation, and an
independent review of the integration. Findings rated high or critical block release. A major crypto
library/protocol upgrade repeats the review. A community audit or grant-funded review may keep the
vendor bill at zero; absence of a reviewer does not lower the gate.

## Consequences

- Chatty remains honest: current transport TLS, signed media and encrypted operator backups are not
  presented as end-to-end encryption.
- Search, server thumbnails and account recovery keep working in the current product until an E2EE
  mode replaces them with client-side equivalents.
- The roadmap item is resolved as a decision, while E2EE implementation remains intentionally
  unavailable until the browser-library and independent-review gates are real.
- No cryptographic dependency, schema or UI badge is added prematurely.

## Sources

- [RFC 9420: Messaging Layer Security](https://www.rfc-editor.org/info/rfc9420/)
- [Signal libsignal](https://github.com/signalapp/libsignal)
- [Archived Signal browser JavaScript implementation](https://github.com/signalapp/libsignal-protocol-javascript)
- [OpenMLS supported platforms](https://github.com/openmls/openmls)
- [Matrix Rust crypto WebAssembly bindings](https://github.com/matrix-org/matrix-sdk-crypto-wasm)
- [Independent vodozemac audit](https://matrix.org/media/Least%20Authority%20-%20Matrix%20vodozemac%20Final%20Audit%20Report.pdf)
