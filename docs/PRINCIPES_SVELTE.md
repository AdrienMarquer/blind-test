# Principes clés Svelte 5 - Guide pour développeurs Vue

> Ce guide compare les concepts de Svelte 5 (avec runes) et Vue 3 (Composition API) pour vous aider à comprendre les différences et similarités.

## 1. Architecture des composants

### Svelte 5
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>

<button onclick={() => count++}>
  {count} × 2 = {doubled}
</button>

<style>
  button { color: blue; }
</style>
```

### Vue 3 (équivalent)
```vue
<script setup>
import { ref, computed } from 'vue';

const count = ref(0);
const doubled = computed(() => count.value * 2);
</script>

<template>
  <button @click="count++">
    {{ count }} × 2 = {{ doubled }}
  </button>
</template>

<style scoped>
button { color: blue; }
</style>
```

### Différences clés
- **Svelte** : Logique, template et styles dans un seul fichier `.svelte`. La réactivité est **compilée** (pas de runtime virtuel DOM).
- **Vue** : Structure similaire avec `.vue`, mais utilise un **Virtual DOM** et la réactivité est basée sur des Proxies JavaScript.
- **Syntaxe** : Svelte utilise `{expression}` dans le HTML, Vue utilise `{{ expression }}` et directives `v-`.

## 2. Réactivité : Runes vs Composition API

### `$state` (Svelte) ≈ `ref` (Vue)

**Svelte 5**
```svelte
<script>
  let count = $state(0);
  let user = $state({ name: 'Alice', age: 25 });

  // Mutation directe - la réactivité est automatique
  count++;
  user.age = 26; // Fonctionne grâce au proxy profond
</script>
```

**Vue 3**
```vue
<script setup>
import { ref } from 'vue';

const count = ref(0);
const user = ref({ name: 'Alice', age: 25 });

// Utilise .value pour accéder/modifier
count.value++;
user.value.age = 26; // Ou reactive({ name: 'Alice', age: 25 })
</script>
```

**Différences**
- **Svelte** : Pas de `.value`, assignation directe. Le compilateur gère tout.
- **Vue** : Nécessite `.value` pour les `ref`, sauf dans le template.
- **Objets** : Les deux créent des proxies profonds par défaut.

---

### `$derived` (Svelte) ≈ `computed` (Vue)

**Svelte 5**
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);

  // Pour des calculs complexes
  let total = $derived.by(() => {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += i;
    return sum;
  });
</script>
```

**Vue 3**
```vue
<script setup>
import { ref, computed } from 'vue';

const count = ref(0);
const doubled = computed(() => count.value * 2);

const total = computed(() => {
  let sum = 0;
  for (let i = 0; i < count.value; i++) sum += i;
  return sum;
});
</script>
```

**Similitudes**
- Mémoisation automatique
- Recalcul uniquement quand les dépendances changent
- Tracking automatique des dépendances

**Différences**
- **Svelte** : `$derived.by()` pour logique complexe, sinon `$derived()`
- **Vue** : Toujours une fonction dans `computed()`

---

### `$effect` (Svelte) ≈ `watchEffect` / `watch` (Vue)

**Svelte 5**
```svelte
<script>
  let count = $state(0);

  $effect(() => {
    console.log(`Count is now ${count}`);

    // Cleanup automatique
    return () => {
      console.log('Effect cleanup');
    };
  });

  // Effet qui s'exécute avant la mise à jour du DOM
  $effect.pre(() => {
    // Similaire à Vue's flush: 'pre'
  });
</script>
```

**Vue 3**
```vue
<script setup>
import { ref, watchEffect, watch, onUnmounted } from 'vue';

const count = ref(0);

// watchEffect - tracking automatique
watchEffect((onCleanup) => {
  console.log(`Count is now ${count.value}`);

  onCleanup(() => {
    console.log('Effect cleanup');
  });
});

// watch - dépendances explicites
watch(count, (newVal, oldVal) => {
  console.log(`Count changed from ${oldVal} to ${newVal}`);
});
</script>
```

**Différences clés**
- **Svelte** : `$effect` tracking automatique, cleanup via `return`
- **Vue** : `watchEffect` (auto) ou `watch` (explicite), cleanup via callback
- **Timing** : Svelte a `$effect.pre`, Vue a `flush: 'pre' | 'post' | 'sync'`

---

### Stores (Svelte) vs Composables (Vue)

**Svelte 5** - État partagé moderne
```js
// stores/counter.svelte.js
export const counterState = $state({
  count: 0,
  increment() {
    this.count++;
  }
});
```

**Vue 3** - Composable
```js
// composables/useCounter.js
import { ref } from 'vue';

export function useCounter() {
  const count = ref(0);
  const increment = () => count.value++;

  return { count, increment };
}
```

**Ancienne méthode Svelte (toujours valide)**
```js
// stores/counter.js
import { writable } from 'svelte/store';

export const count = writable(0);
export function increment() {
  count.update(n => n + 1);
}
```

**Quand utiliser les stores Svelte ?**
- Flux de données asynchrones complexes (RxJS-like)
- Besoin de contrôle manuel sur les mises à jour
- Compatibilité avec du code existant Svelte 4

## 3. Props et communication parent-enfant

### `$props` (Svelte) vs `defineProps` (Vue)

**Svelte 5**
```svelte
<!-- Child.svelte -->
<script>
  let { title, count = 0 } = $props(); // Destructuration avec défaut
</script>

<h1>{title}: {count}</h1>
```

**Vue 3**
```vue
<!-- Child.vue -->
<script setup>
const props = defineProps({
  title: String,
  count: { type: Number, default: 0 }
});
</script>

<template>
  <h1>{{ title }}: {{ count }}</h1>
</template>
```

**Utilisation**
```svelte
<!-- Svelte -->
<Child title="Counter" count={5} />
```

```vue
<!-- Vue -->
<Child title="Counter" :count="5" />
```

---

### `$bindable` (Svelte) vs `v-model` (Vue)

**Svelte 5** - Two-way binding
```svelte
<!-- FancyInput.svelte -->
<script>
  let { value = $bindable() } = $props();
</script>

<input bind:value />

<!-- App.svelte -->
<script>
  let message = $state('hello');
</script>

<FancyInput bind:value={message} />
<p>{message}</p>
```

**Vue 3** - v-model
```vue
<!-- FancyInput.vue -->
<script setup>
const model = defineModel(); // Svelte 5.25+
</script>

<template>
  <input v-model="model" />
</template>

<!-- App.vue -->
<script setup>
import { ref } from 'vue';
const message = ref('hello');
</script>

<template>
  <FancyInput v-model="message" />
  <p>{{ message }}</p>
</template>
```

**Différences**
- **Svelte** : `bind:` directive + `$bindable()` rune
- **Vue** : `v-model` + `defineModel()` (ou `emit('update:modelValue')`)

---

### Context (Svelte) vs Provide/Inject (Vue)

**Svelte 5**
```svelte
<!-- Parent.svelte -->
<script>
  import { setContext } from 'svelte';

  let theme = $state({ mode: 'dark' });
  setContext('theme', theme);
</script>

<!-- Child.svelte -->
<script>
  import { getContext } from 'svelte';

  const theme = getContext('theme');
</script>

<div class={theme.mode}>Content</div>
```

**Vue 3**
```vue
<!-- Parent.vue -->
<script setup>
import { provide, reactive } from 'vue';

const theme = reactive({ mode: 'dark' });
provide('theme', theme);
</script>

<!-- Child.vue -->
<script setup>
import { inject } from 'vue';

const theme = inject('theme');
</script>

<template>
  <div :class="theme.mode">Content</div>
</template>
```

**Similitudes parfaites** : Les deux systèmes fonctionnent de manière quasi-identique !

---

## 4. Directives et rendu conditionnel

### Conditions

**Svelte**
```svelte
{#if condition}
  <p>Vrai</p>
{:else if otherCondition}
  <p>Autre</p>
{:else}
  <p>Faux</p>
{/if}
```

**Vue**
```vue
<p v-if="condition">Vrai</p>
<p v-else-if="otherCondition">Autre</p>
<p v-else>Faux</p>
```

---

### Boucles

**Svelte**
```svelte
{#each items as item, index (item.id)}
  <div>{index}: {item.name}</div>
{/each}
```

**Vue**
```vue
<div v-for="(item, index) in items" :key="item.id">
  {{ index }}: {{ item.name }}
</div>
```

**Différence** : Svelte utilise des blocs `{#each}...{/each}`, Vue utilise `v-for`

---

### Bindings

**Svelte**
```svelte
<input bind:value={text} />
<input type="checkbox" bind:checked={agreed} />
<select bind:value={selected}>
  <option value="a">A</option>
</select>
```

**Vue**
```vue
<input v-model="text" />
<input type="checkbox" v-model="agreed" />
<select v-model="selected">
  <option value="a">A</option>
</select>
```

---

### Classes et styles dynamiques

**Svelte**
```svelte
<div class:active={isActive} class:disabled>
  Content
</div>

<div style:color={userColor} style:font-size="16px">
  Styled
</div>
```

**Vue**
```vue
<div :class="{ active: isActive, disabled: true }">
  Content
</div>

<div :style="{ color: userColor, fontSize: '16px' }">
  Styled
</div>
```

---

## 5. Bonnes pratiques communes

### Gestion des effets de bord
- ✅ **Toujours nettoyer** les effets (timers, WebSockets, listeners)
- ✅ **Éviter les mutations** dans les effects si un computed/derived suffit
- ✅ **Conditional effects** : tester les conditions en début d'effet

### Performance
- ✅ **Keys stables** dans les boucles (`item.id` plutôt que `index`)
- ✅ **Computed/Derived** pour éviter recalculs inutiles
- ✅ **Mémoisation** : Les deux frameworks le font automatiquement

### Accessibilité
- ✅ Labels associés aux inputs (`<label for="id">`)
- ✅ ARIA attributes (`aria-live`, `aria-busy`, etc.)
- ✅ Éléments sémantiques (`<button>` pas `<div onclick>`)

---

## 6. Lifecycle et timing

**Svelte 5** (dans les composants)
```svelte
<script>
  import { onMount, onDestroy } from 'svelte';

  onMount(() => {
    console.log('Monté');
    return () => console.log('Cleanup');
  });

  // Ou avec $effect
  $effect(() => {
    console.log('Effect run');
    return () => console.log('Effect cleanup');
  });
</script>
```

**Vue 3**
```vue
<script setup>
import { onMounted, onUnmounted, watchEffect } from 'vue';

onMounted(() => {
  console.log('Monté');
});

onUnmounted(() => {
  console.log('Cleanup');
});

// Ou avec watchEffect
watchEffect((onCleanup) => {
  console.log('Effect run');
  onCleanup(() => console.log('Effect cleanup'));
});
</script>
```

---

## 7. Différences architecturales clés

### Compilation vs Runtime

**Svelte**
```
.svelte → Compilateur → JavaScript optimisé
✅ Pas de Virtual DOM
✅ Code généré ultra-optimisé
✅ Bundle size très petit
✅ Performance native
```

**Vue**
```
.vue → Runtime Vue → Virtual DOM → DOM réel
✅ Virtual DOM efficace
✅ HMR rapide en dev
✅ Ecosystem mature
✅ DevTools puissants
```

### Réactivité : Comment ça marche vraiment ?

**Svelte** - Réactivité compilée
```svelte
<script>
  let count = $state(0);
  // Le compilateur transforme ça en appels système
  // Pas de proxy runtime, tout est géré à la compilation
</script>
```

**Vue** - Réactivité via Proxy
```vue
<script setup>
import { ref } from 'vue';

const count = ref(0);
// Runtime : Proxy qui intercepte les get/set
// Tracking des dépendances à l'exécution
</script>
```

**Conséquence pratique** :
- Svelte : Code plus petit, moins de runtime, mais nécessite recompilation
- Vue : Plus flexible à runtime, meilleur debugging, ecosystem plus riche

---

## 8. Pièges courants pour les développeurs Vue

### ❌ Oublier que `$state` n'est pas `ref`
```svelte
<!-- ❌ FAUX -->
<script>
  let count = $state(0);
  console.log(count.value); // undefined! Pas de .value
</script>

<!-- ✅ CORRECT -->
<script>
  let count = $state(0);
  console.log(count); // 0
</script>
```

### ❌ Essayer d'exporter du state directement
```js
// ❌ FAUX - state.svelte.js
export let count = $state(0); // Erreur!

// ✅ CORRECT
export const counter = $state({ count: 0 });
// ou
let count = $state(0);
export function getCount() { return count; }
```

### ❌ Mutation de props sans $bindable
```svelte
<!-- ❌ FAUX -->
<script>
  let { user } = $props();
  user.name = 'Bob'; // Warning! Mutation non autorisée
</script>

<!-- ✅ CORRECT -->
<script>
  let { user = $bindable() } = $props();
  user.name = 'Bob'; // OK avec $bindable
</script>
```

### ❌ Confondre les événements
```svelte
<!-- ❌ FAUX (syntaxe Vue) -->
<button @click="handleClick">Click</button>

<!-- ✅ CORRECT (Svelte) -->
<button onclick={handleClick}>Click</button>
```

---

## 9. Outils et workflow

### TypeScript

**Svelte**
```svelte
<script lang="ts">
  interface Props {
    title: string;
    count?: number;
  }

  let { title, count = 0 }: Props = $props();
</script>
```

**Vue**
```vue
<script setup lang="ts">
interface Props {
  title: string;
  count?: number;
}

const props = withDefaults(defineProps<Props>(), {
  count: 0
});
</script>
```

### Commandes CLI

**Svelte / SvelteKit**
```bash
# Vérification des types et erreurs
bunx svelte-kit sync  # Génère les types
bunx svelte-check     # Vérifie le code

# Dev
bun run dev

# Build
bun run build
```

**Vue / Nuxt**
```bash
# Vérification
vue-tsc --noEmit

# Dev
npm run dev

# Build
npm run build
```

---

## 10. Tableau récapitulatif

| Concept | Svelte 5 | Vue 3 |
|---------|----------|-------|
| **État local** | `$state(0)` | `ref(0)` |
| **Valeur dérivée** | `$derived(...)` | `computed(...)` |
| **Effet de bord** | `$effect(...)` | `watchEffect(...)` |
| **Props** | `$props()` | `defineProps()` |
| **Two-way binding** | `$bindable()` | `defineModel()` |
| **Contexte** | `setContext/getContext` | `provide/inject` |
| **Événements** | `onclick={fn}` | `@click="fn"` |
| **Condition** | `{#if}...{/if}` | `v-if` |
| **Boucle** | `{#each}...{/each}` | `v-for` |
| **Binding** | `bind:value` | `v-model` |
| **Classes dyn.** | `class:active` | `:class="{active}"` |
| **Lifecycle** | `onMount/onDestroy` | `onMounted/onUnmounted` |
| **Accès .value** | ❌ Non | ✅ Oui (sauf template) |
| **Virtual DOM** | ❌ Non | ✅ Oui |

---

## 11. Quand utiliser quoi ?

### Choisir Svelte si :
- ✅ Performance maximale requise (petits bundles)
- ✅ Projet avec contraintes de taille
- ✅ Vous aimez la simplicité syntaxique
- ✅ Moins de dépendances runtime
- ✅ Applications embarquées / widgets

### Choisir Vue si :
- ✅ Écosystem mature requis (Nuxt, Pinia, etc.)
- ✅ Équipe déjà formée Vue
- ✅ DevTools essentiels pour debugging
- ✅ Migration progressive d'apps existantes
- ✅ Support entreprise long-terme

---

## 12. Ressources pour aller plus loin

### Documentation officielle
- [Svelte Tutorial](https://learn.svelte.dev/) - Tutoriel interactif
- [Svelte Docs](https://svelte.dev/docs) - Documentation complète
- [SvelteKit Docs](https://kit.svelte.dev/docs) - Framework full-stack

### Comparaisons
- [Svelte vs Vue](https://svelte.dev/blog/virtual-dom-is-pure-overhead) - Article officiel
- [Svelte Playground](https://svelte.dev/playground) - Tester en ligne

### Pour développeurs Vue
- Focus sur les **runes** (`$state`, `$derived`, `$effect`)
- Oubliez `.value` - assignation directe
- Utilisez `{#if}` et `{#each}` au lieu de `v-if` et `v-for`
- Les événements sont `onclick` pas `@click`
- Context API ≈ provide/inject (presque identique!)

---

## Conclusion

Svelte 5 avec les runes apporte une approche **similaire mais simplifiée** par rapport à Vue 3. Les concepts sont presque les mêmes, mais la syntaxe est plus concise grâce à la compilation. Si vous connaissez Vue, vous serez à l'aise avec Svelte en quelques heures ! 🚀 EOF
