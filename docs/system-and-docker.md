# System and Docker

The backend talks to Docker through its socket (`/var/run/docker.sock`,
mounted in `docker-compose.yml`). That's what the *Système* page, the tiles'
container figures, auto-discovery and updates rely on.

## The *Système* page

- **Processeur / Mémoire / Disque**: current use and the last hour (sampled
  every 15 s), colour-coded above 70 % and 85 %.
- **Maintenance**: image updates and cleanup (below).
- **Conteneurs**: every container with its CPU and RAM trend, sortable, with
  start / stop / restart (stop and restart ask for a second click).
- **Home Assistant**: the button at the top opens the
  [sensors page](home-assistant.md#sensors-page).

Link a tile to its container (*Administration → Services*, or found
automatically) and the tile shows its CPU / RAM, logs (*Détails et
journaux*) and a restart action.

## Health checks

Every 30 s the backend checks each link: an HTTP request with a 4 s timeout
(any 2xx / 3xx answer counts as up, and so do 401 / 403 — the service answers,
it just wants a login), plus the container's state when the tile has one. A service is announced down after two
failed checks in a row, and announced again when it recovers. History: the
last 30 minutes in detail, 7 days of samples, and a daily summary kept for
*Wrapped*.

## Image updates

*Système → Maintenance → Mises à jour*, or the « MAJ » pill on a tile.

- **Check**: every 12 hours (or *Vérifier*), the backend asks the registry for
  the current digest of every image in use and compares it with the local one
  — the way Watchtower does, but only when you ask it to act. Containers that
  already have a newer image pulled but still run the old one are flagged too
  (*À redémarrer sur la nouvelle image*).
- **Update** one container, or *Tout mettre à jour*:
  1. pull the image;
  2. stop the container, rename it aside, create and start the new one with the
     same settings (anonymous volumes carried over);
  3. remove the old one — or **roll back** to it if the new one doesn't start.
- **Order**: updates run **one at a time**, and a container's Compose
  dependencies (`depends_on`) go first: the database before the app. After a
  dependency comes back, the queue waits for it to be ready (healthy, or 15 s
  without a healthcheck), so an app never runs its migrations against a
  database that's about to be stopped.
- **Shared networks**: containers living in another one's network
  (`network_mode: container:…`, e.g. a torrent client behind a VPN container)
  are recreated right after it.
- **Not updated from here**: images built locally (no registry digest) and the
  portal's own containers (Compose project `portail`: it would stop itself
  mid-update). Update the portal with `git pull && docker compose up -d --build`.

## Cleanup

*Système → Maintenance → Nettoyage* shows what `docker … prune` would free, per
kind, and does it: stopped containers, dangling or all unused images, unused
networks, build cache, and — only if you tick it — unused **anonymous**
volumes. **Named volumes are never removed**, and neither are the portal's own
stopped containers.

## Auto-discovery with Docker labels

Every minute the backend looks for containers carrying `nexus.*` labels and
creates their tiles (Homepage-style):

```yaml
services:
  n8n:
    image: n8nio/n8n
    labels:
      nexus.name: N8N                        # required
      nexus.url: https://n8n.example.com     # required
      nexus.group: Infrastructure            # folder, created if missing
      nexus.icon: di:n8n                     # optional: dashboard-icons slug or Iconify name
      nexus.description: Automatisations     # optional
```

The tile is bound to the container (CPU / RAM, logs, restart). A tile you
created by hand for the same container is never overwritten. Run it now with
« Détecter les conteneurs Docker » in Ctrl K.
