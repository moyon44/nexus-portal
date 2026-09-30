# Getting started

## Requirements

- A Linux host with **Docker** and **Docker Compose** (v2).
- About 1 GB of RAM for the four containers.
- Optional: a reverse proxy with authentication if you want to reach the portal
  from outside your network (see [Security](security.md)).

## Install

```bash
git clone <this repository> nexus-portal
cd nexus-portal

cp .env.example .env                  # set DB_PASSWORD at least
cp backend/.env.example backend/.env  # optional: OpenWeather key for the weather
docker compose up -d --build
```

Compose starts four containers:

| Container | Role | Port on the host |
| --- | --- | --- |
| `nexus-portal-nginx` | Entry point: serves the app and forwards `/api/` to the backend | 80 (and 443 if you add TLS) |
| `nexus-portal` | Frontend (Vite dev server, sources mounted: edits apply live) | 2443 |
| `nexus-portal-backend` | API (Express), background jobs, Docker access | 5010 |
| `nexus-portal-db` | PostgreSQL 16 | 5011 |

Open `http://<your-server>/`. On its first start the backend creates the
database schema (migrations) and a few example folders and links (*Router*,
*Proxmox*, *Plex*, *GitLab*): edit or delete them from the home page or from
*Administration*.

> Ports 5010, 5011 and 2443 are only needed for debugging. If nothing else uses
> them, you can remove their `ports:` entries so that only nginx is exposed.

## First steps

1. **Your name** — *Administration → Thème → Accueil → Prénom*: the greeting says
   « Bonjour Alex ».
2. **Your links** — press <kbd>N</kbd> (or paste an address anywhere on the home
   page) to add a link; create folders at the bottom of the sidebar. Or let the
   portal find your containers: see [auto-discovery](system-and-docker.md#auto-discovery-with-docker-labels).
3. **Integrations** — *Administration → Intégrations*: see [Integrations](integrations.md).
4. **A theme** — *Administration → Thème → Apparence → Style*, or <kbd>Ctrl</kbd>+<kbd>K</kbd> → « Style ».

## Reaching it from outside

The portal has **no login of its own**. Put it behind a proxy that
authenticates, for example:

- **Cloudflare Tunnel + Cloudflare Access** — no port to open; Access asks for
  your identity before anything reaches the portal.
- **Authelia / Authentik** in front of Traefik, Caddy or nginx.

Then tell the portal its public address in `.env`:

```dotenv
ALLOWED_HOSTS=.example.com                 # host names the frontend answers to
CORS_ORIGINS=https://portal.example.com    # pages allowed to call the API
```

and recreate the containers: `docker compose up -d`.

Integrations must still use **LAN addresses** (`http://192.168.1.10:8096`): the
backend calls them directly, and a public subdomain behind an access proxy
answers with its login page instead of the API.

### Uploads through a proxy

Uploads to Nextcloud / kDrive are capped at **100 MB per file**, the limit of
Cloudflare's free plan per request. The portal's nginx accepts that much on the
upload route only. See [Files → limits](files.md#limits) to raise it.

## Updating

```bash
git pull
docker compose up -d --build
```

The backend applies new database migrations when it starts. The frontend picks
up source changes immediately; the backend is compiled at start, so it needs
the rebuild above after its code changes.

> The portal refuses to update its own containers from its *Système* page (it
> would stop itself mid-update): update it with the commands above.

## Backups

The portal's own data (links, folders, theme, integrations and their
credentials, widgets, uptime history) lives in PostgreSQL.

```bash
./backup-portail.sh                                   # → backups/portail_backup_<date>.sql.gz
./restore-portail.sh backups/portail_backup_<date>.sql.gz
```

The backup script keeps 30 days of dumps. To run it every night at 2 am:

```cron
0 2 * * * /path/to/nexus-portal/backup-portail.sh >> /path/to/nexus-portal/backups/backup.log 2>&1
```

`backups/` is in `.gitignore`: the dumps contain your credentials, keep them
private.

## Uninstall

```bash
docker compose down -v   # -v also deletes the database volume
```
