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

### 🎵 Import en masse de chansons

Pour importer rapidement toute votre bibliothèque musicale :

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

## 💾 Base de données et migrations

Le projet utilise **Drizzle ORM** avec SQLite pour la persistance des données.

### Modifications du schéma

Si vous modifiez le schéma de la base de données dans `apps/server/src/db/schema.ts` :

```bash
# Générer automatiquement une migration SQL
cd apps/server
bunx drizzle-kit generate
```

Cela créera un nouveau fichier de migration dans `apps/server/drizzle/`.

Les migrations s'exécutent **automatiquement au démarrage du serveur**.

### Fichiers importants

- `apps/server/src/db/schema.ts` - Définition du schéma TypeScript
- `apps/server/drizzle/*.sql` - Migrations SQL générées
- `apps/server/db/sqlite.db` - Base de données SQLite (gitignorée)

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
