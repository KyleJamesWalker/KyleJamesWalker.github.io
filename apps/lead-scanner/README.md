# Lead Scanner

A mobile web app for collecting conference leads. Point the phone camera at an
attendee badge, and the QR code is decoded, parsed into contact fields, and
stored locally. Export the collected leads as CSV when the booth closes.

Installable as a PWA, so it runs full screen and survives a lost signal on the
show floor.

## Badge format

Badge QR codes carry a single tilde-delimited string. The fields, in order:

```
conference_id ~ first_name ~ last_name ~ email ~ job_title ~ company ~ phone_number ~ zip_code ~ unknown_id
```

Missing trailing fields decode as empty strings. Exported CSV rows prepend an
ISO 8601 scan timestamp to these nine fields.

## Zoom

While the camera is live, a `1x / 2x / 3x / 5x` control sits under the
viewfinder. Badge QR codes are printed small, and a wide frame often will not
decode them.

The zoom is applied to the `MediaStreamTrack`, not to the preview. A CSS
transform would enlarge what you see while the decoder kept reading the same
wide frame, which looks like it works and does not.

This depends on the browser exposing `MediaStreamTrack.getCapabilities().zoom`.
Where it is missing — older iOS Safari, most desktop webcams — the control is
hidden rather than shown as dead buttons. Requested levels are clamped to the
range the device reports, so `5x` on a camera that stops at `4x` gives `4x`.

The level is a sticky preference, not a per-session setting. It is stored in
`localStorage` under `lead-scanner-zoom` and re-applied every time the camera
starts, so it survives a scan, a stop and restart, and a page reload. Nothing
resets it; tapping `1x` is how you zoom back out.

## Storage

Scans live in `localStorage` under the key `lead-scans`, the zoom level under
`lead-scanner-zoom`. Nothing leaves the device — there is no server and no
network call after the page loads. Clearing site data discards the leads, so
export before the browser does it for you.

## Running it

```bash
npm install
npm run dev
```

Then `npm run build` for a production bundle and `npm run preview` to serve it.

**The camera needs a secure context.** Browsers only grant `getUserMedia` over
HTTPS or on `localhost`. `npm run dev` on the machine itself is fine; reaching
the dev server from a phone over the LAN (`http://192.168.x.x:5173`) is not —
the camera silently fails to start. Use a tunnel that terminates TLS, or serve
the built output over HTTPS, when testing on a real device.

## PWA

`vite-plugin-pwa` generates the service worker and manifest at build time, with
`registerType: 'autoUpdate'`. The service worker is a production-build artifact,
so installability is only testable against `npm run build && npm run preview`,
not the dev server.

The manifest icons in `public/` are generated placeholders, not final artwork.
