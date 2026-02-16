# Luxury Landing Variant F (Prototype)

Standalone static marketing landing prototype for Verity's premium "private-club" direction.

## What's included

- Dark-first luxury theme with light toggle fallback
- Gold accent token system
- Ambient media layers + cinematic loop support
- Variant F intensity controls (`subtle`, `medium`, `bold`)
- Waitlist form metadata capture
- Instrumentation docs + A/B rollout runbook

## Quick preview

From `verity-web/marketing/luxury-landing-f`:

```bash
python3 -m http.server 8123
```

Open:

- `http://127.0.0.1:8123/index.html?variant=F&theme=luxury-dark&intensity=medium`

## Intensity presets

- `subtle`
- `medium` (default)
- `bold`

Example:

`?variant=F&theme=luxury-dark&intensity=bold`

## Risk notes

- Includes media assets (~3 MB+) which can impact first load on low-bandwidth links.
- Telemetry emits to `dataLayer`/custom events by default; configure an endpoint before production decisions.
- Keep this prototype isolated from auth app routes until rollout decision is finalized.
