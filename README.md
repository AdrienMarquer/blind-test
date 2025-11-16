# 🎵 Adriquiz

Un système de blind test local en temps réel où les joueurs s'affrontent pour deviner des chansons. Le serveur maître contrôle la musique via une enceinte Bluetooth, tandis que les joueurs rejoignent depuis leurs téléphones ou tablettes.

## 🚀 Démarrage rapide

### Prérequis

- **Bun** : Runtime JavaScript/TypeScript ([installer](https://bun.sh))
- **Docker** : Pour la base de données PostgreSQL ([installer](https://www.docker.com/get-started))

### Installation

```bash
# Installer les dépendances
bun install

# Démarrer PostgreSQL et appliquer les migrations
bun run db:start
bun run db:migrate
```

### Développement

```bash
# Lancer serveur + client en même temps
bun run dev

# Serveur seul (http://localhost:3007)
bun run dev:server

# Client seul (http://localhost:5173)
bun run dev:client
```

### Gestion de la base de données

```bash
# Démarrer PostgreSQL
bun run db:start

# Arrêter PostgreSQL
bun run db:stop

# Appliquer les migrations
bun run db:migrate

# Ouvrir Drizzle Studio (interface web)
bun run db:studio
```

### Production

```bash
# Compiler tout
bun run build
```

## 📱 Utilisation

1. **Créer une salle** sur http://localhost:5173
2. **Scanner le QR code** avec votre téléphone pour rejoindre
3. **Uploader des chansons** dans la bibliothèque musicale
4. **Démarrer la partie** (minimum 2 joueurs)
5. **Buzzer** et deviner le titre/artiste !

### 🎵 Import de chansons

Le système supporte plusieurs méthodes d'import :

#### 1. Import en masse depuis fichiers locaux

```bash
# Importer toutes les chansons d'un dossier (récursif)
bun scripts/bulk-upload-songs.ts ~/Musique

# Ou depuis un chemin relatif
bun scripts/bulk-upload-songs.ts ./mes-chansons

# Serveur distant (si pas localhost:3007)
SERVER_URL=http://192.168.1.100:3007 bun scripts/bulk-upload-songs.ts ~/Musique
```

**Formats supportés** : `.mp3`, `.m4a`, `.wav`, `.flac`

Le script :
- ✅ Scanne récursivement tous les sous-dossiers
- ✅ Détecte et ignore automatiquement les doublons
- ✅ Extrait les métadonnées (titre, artiste, genre, année)
- ✅ Affiche une progression en temps réel avec un résumé

#### 2. Import depuis YouTube

Le système peut télécharger des chansons depuis YouTube et **enrichir automatiquement les métadonnées** :

- **Interface web** : Importer une vidéo ou une playlist YouTube directement depuis l'UI
- **Enrichissement automatique** : Les métadonnées (titre, artiste, année, genre) sont enrichies via :
  - **Spotify** (gratuit, recommandé pour musique populaire)
  - **OpenAI** (excellente précision, ~$0.001/chanson)
  - **Anthropic Claude** (meilleur raisonnement, ~$0.003/chanson)
  - **Google Gemini** (niveau gratuit généreux)

**Configuration** : Voir `apps/server/METADATA_PROVIDER_SETUP.md` pour configurer votre provider préféré

#### 3. Import depuis Spotify (à venir)

Import de playlists Spotify avec métadonnées complètes

## 💾 Base de données et migrations

Le serveur tourne sur **PostgreSQL 18** via Drizzle ORM. Configure la connexion avec `DATABASE_URL` dans `apps/server/.env` (voir `.env.example`).

### Workflow schéma → migration

1. Modifie le schéma dans `apps/server/src/db/schema.ts`.
2. Génère une migration :
   ```bash
   cd apps/server
   bunx drizzle-kit generate --name <changement>
   ```
3. Applique toutes les migrations locales :
   ```bash
   bun run db:migrate   # alias pour bunx drizzle-kit migrate
   ```
4. Commit les fichiers créés dans `apps/server/drizzle/` **et** `apps/server/drizzle/meta/`.

Les migrations sont aussi lancées automatiquement au démarrage du serveur (voir `runMigrations()` dans `apps/server/src/db/index.ts`).

### Fichiers importants

- `apps/server/src/db/schema.ts` – source de vérité du schéma
- `apps/server/drizzle/*.sql` – migrations SQL
- `apps/server/drizzle/meta/*` – snapshots / journal Drizzle

## 🛠 Stack technique

- **Runtime** : Bun
- **Backend** : Elysia + WebSockets natifs
- **Frontend** : SvelteKit + Svelte 5
- **Base de données** : PostgreSQL 18 + Drizzle ORM
- **Type safety** : Eden Treaty (end-to-end)
- **Containerisation** : Docker (dev + production)

## 📂 Structure

```
blind-test/
├── apps/
│   ├── server/         # API backend (Elysia)
│   └── client/         # Interface web (SvelteKit)
└── packages/
    └── shared/         # Types partagés
```

## 🎮 Fonctionnalités

✅ Gestion des salles et joueurs
✅ WebSocket temps réel
✅ Bibliothèque musicale (upload/gestion)
✅ QR code pour rejoindre facilement
✅ Interface maître + interface joueur
✅ Mode buzz + choix multiples
✅ Score en temps réel

## 🐛 Dépannage

```bash
# Port 3007 déjà utilisé ?
lsof -i :3007
kill -9 <PID>

# Port 5173 déjà utilisé ?
lsof -i :5173
kill -9 <PID>

# Base de données ne démarre pas ?
docker ps -a  # Vérifier le statut du container

# Réinitialiser complètement (⚠️ supprime toutes les données)
bun run db:stop
docker volume rm blind-test_postgres_dev_data
bun run db:start
bun run db:migrate

# Réinstaller les dépendances
rm -rf node_modules apps/*/node_modules
bun install
```

## 📚 Documentation

- [Architecture](docs/00_ARCHITECTURE.md)
- [API REST](docs/API.md)
- [WebSockets](docs/WEBSOCKETS.md)
- [Base de données](docs/DATABASE.md)
- [Déploiement Docker](docs/DOCKER_DEPLOYMENT.md)

---

**Fait avec ❤️ avec Bun, Elysia et SvelteKit**
