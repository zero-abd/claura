# Hosting on Cloudflare Workers (static assets)

| What | Worker | Live URL | Custom domain (after the zone is on Cloudflare) |
|---|---|---|---|
| Landing page (`apps/site`) | `claura-site` | https://claura-site.almahmud-zero.workers.dev | `claura.us`, `www.claura.us` |
| Console demo (`apps/dashboard`, replay mode) | `claura-app` | https://claura-app.almahmud-zero.workers.dev/?demo=1&play=1 | `app.claura.us` |

## Deploy
Build each app, copy its `dist/` next to its `wrangler.jsonc`, then run `npx wrangler deploy` in that folder.

## Custom domains
1. Add `claura.us` to Cloudflare (Free plan).
2. At the registrar, set the domain's nameservers to the two Cloudflare nameservers shown.
3. Once the zone is active, add these routes to the configs and redeploy. Cloudflare then creates the DNS records and certificates itself.
   - `claura-site`: `"routes": [{ "pattern": "claura.us", "custom_domain": true }, { "pattern": "www.claura.us", "custom_domain": true }]`
   - `claura-app`: `"routes": [{ "pattern": "app.claura.us", "custom_domain": true }]`

## Limits of the hosted console
Replay mode runs entirely in the browser. Live mode (`?live=1`) connects to SpacetimeDB Maincloud and needs a break-glass enrollment code. Secure Shell and voice need the local gateway (`demo/start.sh`), so the hosted demo shows them as unavailable.
