# Security

Nexus Portal is built for **one household on a trusted network**. Read this
before exposing it.

## What it can do on your server

| Access | Why | What someone using the portal could do |
| --- | --- | --- |
| **Docker socket** (`/var/run/docker.sock`, mounted in the backend) | Container stats, logs, restart, updates, cleanup, auto-discovery, Nextcloud `occ` actions | Start, stop, restart, recreate and update your containers; prune unused images, networks, build cache and anonymous volumes |
| **Integration credentials** (in PostgreSQL) | Live tiles, files, requests, controls | Read and upload files with the Nextcloud / kDrive account you gave; request films as the Jellyseerr admin; drive the Home Assistant entities you put in a *Contrôles* widget |

The Docker socket gives control of the host's containers — treat access to the
portal like root access to Docker.

## There is no login

The portal has no accounts and no password. Keep it:

- on your LAN only, **or**
- behind a proxy that **authenticates** every request: Cloudflare Access
  (with a Cloudflare Tunnel, nothing to open on your router), Authelia or
  Authentik with Traefik / Caddy / nginx, Tailscale / WireGuard…

Do **not** forward port 80 to it on your router as is.

## Built-in safeguards

- **Secrets stay on the server.** The Admin page never receives a stored key or
  password, only whether one exists; an empty field keeps the stored value.
- **Allow-lists, not free commands.** Only a fixed set of `occ` commands can be
  run in Nextcloud; Home Assistant commands are refused unless the entity is in
  a *Contrôles* widget, and only the service matching its type
  (`light.turn_on`, `cover.open_cover`…) is called.
- **Second confirmation** for anything disruptive: restarting or stopping a
  container, updates from the palette, deleting links, Jellyseerr requests,
  Nextcloud actions, locks, gates and other sensitive Home Assistant entities.
- **No overwrite, no delete** in [Files](files.md): uploads get a new name when
  one is taken, and the portal cannot delete files.
- **Uploads are streamed**, size-checked (100 MB) and never kept on disk;
  names are sanitised (no `/`, `..` or control characters).
- **The portal never updates or prunes itself** (its Compose project,
  `portail`, is excluded), and named Docker volumes are never pruned.
- **CORS** only lets `localhost` and the origins in `CORS_ORIGINS` call the API
  from a browser.

## Recommendations

- Set a strong `DB_PASSWORD`, and remove the published ports you don't need
  (`5010`, `5011`, `2443`) so only nginx is reachable.
- Give integrations the **least rights** that work: a dedicated Nextcloud app
  password you can revoke, a kDrive token with only the `drive` scope, a Home
  Assistant token you can revoke.
- **Back up** the database (`./backup-portail.sh`) and keep `backups/` private:
  the dumps contain your credentials.
- Before sharing your copy of the project, check that no `.env`, backup or key
  is committed (`.gitignore` covers the usual ones).
