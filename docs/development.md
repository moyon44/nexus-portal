# Development

## Running it

The simplest is the Docker setup from [Getting started](getting-started.md):
the frontend's sources are mounted into its container, so edits reload in the
browser at once; the backend needs `docker compose up -d --build backend` after
a change.

Without Docker (Node 20, and a PostgreSQL you can reach):

```bash
npm install && npm run dev                  # frontend on http://localhost:3000
cd backend && npm install
cp .env.example .env                        # then add DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
npm run init && npm run dev                 # migrations, then the API on :5000
```

From `localhost` the frontend calls the API on `http://localhost:5000`.

Type checks: `npx tsc --noEmit -p .` (frontend) and
`cd backend && npx tsc --noEmit -p .`. Production build of the frontend:
`npx vite build`.

## Project layout

```
.
├── App.tsx                 app shell: sidebar, routes, keyboard shortcuts, notifications
├── index.tsx, index.html   entry point (theme applied before the first paint)
├── store.tsx               data shared by every page, polling
├── api.ts                  every call to the backend
├── types.ts                shared types
├── pages/                  Dashboard (home), Admin, System, HomeAssistant, Maison, Fichiers
├── components/             tiles, palette, sidebar tree, status bar, ha/ (widgets), ui/ (buttons, panels, charts)
├── lib/                    helpers: actions, motion, Home Assistant formatting, storage, lite mode…
├── theme/                  themes (skins.ts), studio styles, colours
├── styles/                 theme.css (design tokens), skins.css (themes), wrapped.css
├── hooks/                  polling hooks
├── public/                 PWA manifest, service worker, icons
├── nginx.conf              the entry point
└── backend/src/
    ├── index.ts            Express app, routes, background jobs
    ├── routes/             one file per API area
    ├── services/           monitor, containers, discovery, updates, Nextcloud occ, pet…
    └── migrations/         database schema, numbered
```

`pages/Map.tsx` (an infrastructure map drawn with d3-force) is in the code but
not wired to a route: add one in `App.tsx` to try it.

## Conventions

- The **interface is in French**; code, comments and commit messages in
  English.
- Each file starts with a comment saying what it does and where its
  counterpart lives (e.g. the route a component calls).
- Components use the design tokens of `styles/theme.css` through Tailwind
  classes (`text-text-primary`, `bg-background-secondary-default`…), never raw
  colours, so every theme and dark mode keep working.
- Anything with an effect on the server (restart, update, request, command)
  asks for a second confirmation.

## Adding an integration

1. **Backend**, `backend/src/routes/integrations.ts`:
   - add its key to `TYPES`;
   - write a fetcher `async function myservice(cfg: IntegrationRow)` that
     returns `{ ok, summary, items, active? }` — `summary` is the tile's line,
     `items` its details, `active` makes the tile glow;
   - register it in `FETCHERS`.

   The poller, the tile matching, the error messages and the Admin API come for
   free. Extra routes (search, actions) go in the same file.
2. **Frontend**:
   - add the key to the `type` union of `IntegrationConfig` in `types.ts`;
   - add its card to `META` in `components/admin/IntegrationsEditor.tsx`:
     name, one-line description, example address, the label of its key
     (`key`), `login: true` for a user / password, `option` for one more
     setting stored in `options`.
3. Palette entries, if any: `components/CommandPalette.tsx` (see the
   *Demandes* and *Fichiers* groups for asynchronous results).

## Adding a theme

1. `theme/skins.ts`: add `{ key, label, hint, swatch }` to `SKINS` (`mode` to
   force light or dark, `ownAccent` if it brings its own colours).
2. `styles/skins.css`: style it under `html[data-skin="<key>"]`, overriding
   the design tokens first, then specific parts (`.tile`, `.section-title`,
   `.fx-cursor`…).
3. Allow it in the backend whitelist (`backend/src/routes/theme.ts`) and in
   the pre-paint map of `index.html`.
4. Optional decor (overlays, a boot screen…): `components/SkinDecor.tsx`.

## Adding a database change

Create `backend/src/migrations/0NN_what_it_does.ts` with `up` / `down`, using
`knex.schema.hasTable` / `hasColumn` so it can run twice. It runs on the
backend's next start.

## Adding a page

1. `pages/MyPage.tsx`, built from `PageHeader` and `Panel`
   (`components/ui/panel.tsx`).
2. A route in the router at the bottom of `App.tsx`.
3. A link in `components/layout/Sidebar.tsx` and an entry in the *Pages* group
   of `components/CommandPalette.tsx`.
