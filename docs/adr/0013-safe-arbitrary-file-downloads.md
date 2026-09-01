# ADR 0013 — Safe arbitrary-file downloads

Status: accepted

## Decision

An ordinary file attachment is stored as opaque bytes under a server-generated `.bin` key. The
server derives its media type from the bytes, not from the upload header, and demotes formats a
browser can interpret as active content to `application/octet-stream`. Every file response carries
`Content-Disposition: attachment` with an ASCII fallback and an RFC 5987 UTF-8 filename,
`X-Content-Type-Options: nosniff`, and a sandboxed Content-Security-Policy. Known executable
extensions are refused before storage. Images keep the existing decode-and-WebP re-encode; audio is
handled by ADR 0014.

This is a browser-origin safety boundary, not malware scanning. A PDF, office document, or archive
may still be hostile when opened by another application. The UI therefore describes the operation
as a download and never embeds an arbitrary file inline.

## Consequences

- One non-image file up to 25 MB may be sent per message; images retain their ten-file limit.
- The original display filename is data, never a filesystem path, and is normalized before storage.
- The signed attachment URL remains bearer proof until it expires, as documented by ADR 0007.
- There is no antivirus guarantee. Adding one later belongs before the database write and needs an
  explicit quarantine/failure state rather than silently changing this contract.
- Range requests and private caching continue to be handled by the attachment endpoint.
