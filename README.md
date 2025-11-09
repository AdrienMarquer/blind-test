# 🎵 Blind Test

Un système de blind test local en temps réel où les joueurs s'affrontent pour deviner des chansons. Le serveur maître contrôle la musique via une enceinte Bluetooth, tandis que les joueurs rejoignent depuis leurs téléphones ou tablettes.

## 🚀 Démarrage rapide

### Installation

```bash
# Installer les dépendances
bun install
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

## 🛠 Stack technique

- **Runtime** : Bun
- **Backend** : Elysia + WebSockets natifs
- **Frontend** : SvelteKit + Svelte 5
- **Base de données** : SQLite + Drizzle ORM
- **Type safety** : Eden Treaty (end-to-end)

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

# Réinstaller les dépendances
rm -rf node_modules apps/*/node_modules
bun install
```

---

**Fait avec ❤️ avec Bun, Elysia et SvelteKit**
