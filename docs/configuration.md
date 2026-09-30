# Configuration

Two kinds of settings: a few **environment variables** read when the containers
start, and everything else, set from the **Admin page** and stored in the
database.

## Environment variables

### `.env` (next to `docker-compose.yml`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DB_PASSWORD` | `change-me` | PostgreSQL password, shared by the database and the backend. **Change it.** |
| `ALLOWED_HOSTS` | *(empty)* | Extra host names the frontend dev server answers to, comma-separated. `.example.com` allows every subdomain. `localhost`, `127.0.0.1` and `nexus-portal` are always allowed. |
| `CORS_ORIGINS` | *(empty)* | Extra origins allowed to call the API, comma-separated, with their scheme: `https://portal.example.com`. |
| `SEARXNG_URL` | `http://searxng:8080` | SearXNG instance for web results in Ctrl K. Optional: without it the *Web* group simply doesn't appear. |
| `JELLYFIN_URL` | *(empty)* | Only for the legacy `/api/jellyfin/*` statistics routes. The Jellyfin **tile** is configured in *Intégrations*. |
| `JELLYFIN_API_KEY` | *(empty)* | Same. |

### `backend/.env`

| Variable | Purpose |
| --- | --- |
| `OPENWEATHER_API_KEY` | Weather in the status bar ([OpenWeather](https://openweathermap.org/api), free plan). Without it the weather is hidden, or replaced by your Home Assistant sensors (see [Home Assistant](home-assistant.md#status-bar)). |

Set in `docker-compose.yml` (normally left as is): `DB_HOST`, `DB_PORT`,
`DB_USER`, `DB_NAME`, `PORT`, `NODE_ENV`, `VITE_API_URL`.

After changing a variable: `docker compose up -d` (recreates the containers
whose configuration changed).

## Ports

| Port | Service | Needed? |
| --- | --- | --- |
| 80 | nginx (the portal) | Yes |
| 443 | nginx, if you add TLS to `nginx.conf` | Optional |
| 2443 | frontend dev server, directly | Debugging only |
| 5010 | backend API, directly | Debugging only |
| 5011 | PostgreSQL | Debugging / backups from the host |

## The Admin page

Open it from the sidebar (*Administration*), with <kbd>G</kbd> <kbd>A</kbd>, or
<kbd>Ctrl</kbd>+<kbd>,</kbd>.

### *Services* and *Catégories*

Every link (a "service") and folder (a "category"), in tables. Most of this
is quicker from the home page itself (see the [user guide](user-guide.md)),
but these tabs show every field:

- **Service**: name, address, description, folder, icon (an
  [Iconify](https://icon-sets.iconify.design/) name like `mdi:router`, a
  [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) slug with
  `di:`, or your own image), tags, *Ouvrir dans un nouvel onglet*,
  *Visible sur l'accueil*, and the Docker container it runs in (for its CPU /
  RAM, logs and restart button).
- **Category**: name, icon, colour.

### *Intégrations*

One card per service; see [Integrations](integrations.md). Secrets are
write-only: the page shows whether one is stored, never the value, and an empty
field keeps the stored one. *Enregistrer et tester* saves and runs one check
right away, so you see at once whether it works.

### *Thème*

| Section | Settings |
| --- | --- |
| *Apparence* | **Style** (theme, see [user guide → themes](user-guide.md#themes)), **mode** (light, dark, system), **accent colour** |
| *Fond de l'accueil* | Plain, gradient or your own image behind the home page (themes with their own background ignore it) |
| *Mise en page* | **Density** (compact / normal), and which home widgets show: clock, server statistics, weather, service descriptions. Per device: *Mode nuit* (favourites only from 11 pm to 6 am), *Curseur animé*, *Mode léger* |
| *Accueil* | **Prénom** for the greeting; **SSH target** (`root@192.168.1.10`) used by the SSH actions |
| *Météo* | City and unit of the weather |

Settings marked *per device* are kept in the browser (localStorage), so your
phone and your computer can differ.
