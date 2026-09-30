# Nexus Portal Backend

Backend API pour Nexus Portal avec persistance Postgres et audit logging complet.

## Fonctionnalités

- **Gestion des Services**: CRUD complet avec historique des changements
- **Gestion des Catégories**: Organisation des services
- **Configuration du Thème**: Stockage des préférences d'interface
- **Audit Logs**: Historique complet de chaque modification (CREATE, UPDATE, DELETE)
- **Access Logs**: Suivi de chaque accès aux services
- **API REST**: Endpoints standards pour tous les CRUD

## Structure de la Base de Données

### Tables

1. **categories** - Catégories de services
   - id (UUID)
   - name, color, icon
   - order, created_at, updated_at

2. **services** - Définition des services
   - id (UUID)
   - name, description, url, icon
   - category_id (FK → categories)
   - tags, stats
   - is_favorite, is_visible, open_in_new_tab
   - status (online/offline/maintenance/unknown)
   - order, created_at, updated_at

3. **theme_config** - Configuration du thème
   - id (UUID)
   - mode, primary_color, background_type, background_value
   - density, show_clock, show_weather, show_descriptions
   - created_at, updated_at

4. **audit_logs** - Historique complet des changements
   - id (UUID)
   - action (CREATE, UPDATE, DELETE)
   - entity_type (SERVICE, CATEGORY, THEME_CONFIG)
   - entity_id (UUID)
   - old_values (JSONB)
   - new_values (JSONB)
   - ip_address, user_agent
   - created_at

5. **access_logs** - Logs d'accès aux services
   - id (UUID)
   - service_id (FK → services)
   - ip_address, user_agent
   - accessed_at

## Installation

```bash
npm install
```

## Configuration

Créer un fichier `.env`:

```env
NODE_ENV=development
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_USER=portail
DB_PASSWORD=change-me
DB_NAME=portail_db
```

## Migration de la Base de Données

```bash
npm run migrate        # Appliquer les migrations
npm run migrate:rollback  # Annuler la dernière migration
```

## Déploiement avec Docker

Le backend est incluent dans `docker-compose.yml` avec PostgreSQL:

```bash
docker-compose up
```

Services:
- Backend: http://localhost:5000
- PostgreSQL: localhost:5432
- Frontend: http://localhost:2443

## Endpoints API

### Services

- `GET /api/services` - Lister tous les services
- `GET /api/services/:id` - Obtenir un service
- `POST /api/services` - Créer un service
- `PUT /api/services/:id` - Modifier un service
- `DELETE /api/services/:id` - Supprimer un service
- `POST /api/services/:id/access` - Logger un accès

### Catégories

- `GET /api/categories` - Lister toutes les catégories
- `GET /api/categories/:id` - Obtenir une catégorie
- `POST /api/categories` - Créer une catégorie
- `PUT /api/categories/:id` - Modifier une catégorie
- `DELETE /api/categories/:id` - Supprimer une catégorie

### Thème

- `GET /api/theme` - Obtenir la configuration du thème
- `PUT /api/theme` - Modifier le thème

### Audit

- `GET /api/audit/logs` - Lister l'historique des changements
- `GET /api/audit/logs?entity_type=SERVICE` - Filtrer par type
- `GET /api/audit/access/:service_id` - Logs d'accès d'un service
- `GET /api/audit/stats` - Statistiques des changements

## Intégration avec le Frontend

Le frontend React doit utiliser l'API backend. Ajouter la variable d'environnement:

```env
VITE_API_URL=http://localhost:5000
```

Puis utiliser dans les appels API:

```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Exemple
fetch(`${API_URL}/api/services`)
  .then(r => r.json())
```

## Développement

```bash
npm run dev   # Démarrer en mode développement avec hot reload
```

Le serveur se lance sur `http://0.0.0.0:5000`
