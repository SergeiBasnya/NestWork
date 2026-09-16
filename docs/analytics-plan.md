# Plan d'instrumentation analytics — NestWork

> **Statut : à implémenter le jour de l'ouverture, pas avant.**
> En phase crash-test à 2 users, l'analytics quantitatif n'apporte rien que le retour
> direct ne donne déjà. Ce doc est le plan à dégainer au moment où on ouvre à plus de monde.
> Aligné avec la trajectoire produit (Sentry + scale reportés jusqu'à l'ouverture).

---

## 1. Principe directeur

On part de **questions de décision**, pas d'events « au cas où ».
Règle : si la liste dépasse ~6 events, c'est qu'on tracke pour se rassurer, pas pour décider.

| # | Question | Ce qu'on en fait |
|---|----------|------------------|
| Q1 | Est-ce que les gens **reviennent** ? | Rétention J1/J7/J30 — le seul vrai signal de PMF |
| Q2 | La feature centrale (**audio de proximité**) aboutit-elle techniquement et est-elle *utilisée* ? | Taux de connexion peer réussie + durée des sessions |
| Q3 | Les gens font-ils les **actions de valeur** (parler, écrire, aménager) ? | Activation / engagement |
| Q4 | Qu'est-ce qui **casse** en prod chez de vrais users ? | **Sentry** (error tracking, traité à part — voir §6) |

---

## 2. Stack recommandée

- **PostHog Cloud EU**, en **mode sans cookie** (`persistence: 'memory'` ou `localStorage` selon besoin, identification par `userId` interne — pas de cookie de tracking tiers).
  - Couvre product analytics + funnels + rétention.
  - Hébergé en EU → surface RGPD réduite.
  - Mode sans cookie → **pas de bandeau de consentement** nécessaire.
- Identification : on `identify()` avec l'`userId` interne (déjà connu après login). Pas d'email, pas de PII dans les events.
- **~5 events** au total. C'est tout.

> Alternative plus légère si on ne veut QUE de la web-analytics (pas de funnels) :
> **Plausible** ou **Umami** auto-hébergé. Mais pour répondre à Q1–Q3, PostHog est mieux adapté.

---

## 3. Les events (la liste courte)

Légende : **[C]** = émis côté client web · **[S]** = émis côté serveur (plus fiable pour le réseau/socket).

| Event | Q | Côté | Props | Où l'émettre (fichier:ligne approx.) |
|-------|---|------|-------|--------------------------------------|
| `session_start` | Q1 | C | `{ userId }` | `apps/web/stores/auth.ts:33` — dans `setAuth()`. Couvre login + reprise de session via refresh token. |
| `peer_connected` | Q2 | C | `{ workspaceSlug, peerId }` | `apps/web/contexts/MediaContext.tsx` — sur `RTCPeerConnection` `onconnectionstatechange` quand state passe à `'connected'`. À ajouter près du setup PC (≈ l.267–311). |
| `peer_session_ended` | Q2 | C | `{ workspaceSlug, peerId, durationSec }` | `MediaContext.tsx` — quand la PC passe à `'disconnected'`/`'failed'`/`'closed'` ou au cleanup. Calculer `durationSec` depuis le timestamp de `peer_connected`. |
| `message_sent` | Q3 | S | `{ userId, channelType }` (`dm` \| `channel`) — **jamais le contenu** | `apps/server/src/socket/spaceHandler.ts:422` — handler `message:send`, après `prisma.message.create()`. |
| `map_applied` | Q3 | S | `{ userId, workspaceSlug, templateId }` | `apps/server/src/socket/spaceHandler.ts:720` — handler `map:apply`. (Le « aha » d'aménagement de l'espace.) |

### Pourquoi ce découpage
- **Q2 en 2 events (`peer_connected` + `peer_session_ended`)** : le ratio `connected / tentatives` révèle les échecs WebRTC (la partie la plus fragile), et `durationSec` dit si l'audio de proximité *sert vraiment* ou si les gens se croisent sans se parler.
- **`message_sent` et `map_applied` côté serveur** : émis depuis le socket handler, donc fiables même si le client se déconnecte ; et on a déjà l'`userId` authentifié sous la main.
- **Pas de `workspace_created`** : les workspaces sont pré-seedés (`apps/server/prisma/seed.ts:56`), ce n'est pas une action user. À rajouter *seulement si* on ouvre la création de workspace plus tard.

### Events « plus tard, si une question précise se pose »
`card_created` (`apps/server/src/routes/maps.ts:187`), `dm_opened` (`apps/server/src/routes/channels.ts:167`), `screen_share_started`. À ne PAS ajouter d'emblée.

---

## 4. Setup technique (le jour J)

### Côté web (`apps/web`)
1. `pnpm add posthog-js` (dans `apps/web`).
2. Var d'env : `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`.
   - Ajouter à `.env.local` (web) et à `.env.example` si on en crée un.
3. Provider racine dans `apps/web/app/layout.tsx` (≈ l.14, à côté de `<ThemeProvider>`) :
   un `<AnalyticsProvider>` qui init PostHog côté client (init no-op si la clé est absente → safe en dev/local).
4. Un wrapper minimal pour ne pas disperser des appels PostHog partout :
   ```ts
   // apps/web/lib/analytics.ts
   export function track(event: string, props?: Record<string, unknown>) {
     if (typeof window === 'undefined') return;
     posthog?.capture(event, props);
   }
   export function identify(userId: string) { posthog?.identify(userId); }
   export function resetAnalytics() { posthog?.reset(); } // sur logout
   ```
5. Brancher : `identify()` + `track('session_start')` dans `stores/auth.ts:33` (`setAuth`),
   `resetAnalytics()` dans `logout` (`stores/auth.ts` ≈ l.37).
   Events peer dans `contexts/MediaContext.tsx`.

### Côté serveur (`apps/server`)
1. `pnpm add posthog-node` (dans `apps/server`).
2. Var d'env : `POSTHOG_KEY` (+ host EU). Chargée via le `dotenv.config()` existant (`src/index.ts:1`).
3. Un petit module `apps/server/src/lib/analytics.ts` exposant `capture(userId, event, props)` —
   no-op si `POSTHOG_KEY` absent (donc inactif en local/dev par défaut).
4. Brancher dans les 2 socket handlers : `message:send` (`spaceHandler.ts:422`) et `map:apply` (`spaceHandler.ts:720`).
5. `posthog.shutdown()` dans le hook d'arrêt propre du serveur.

### Garde-fous
- **Tout est no-op sans clé d'env** → aucune télémétrie en dev/local, zéro fuite involontaire. Cohérent avec « toujours tester en local ».
- Activer **uniquement en prod** (clé présente seulement dans l'env Vercel/serveur prod).

---

## 5. RGPD — points de vigilance

NestWork traite déjà des données perso (visio, MP, comptes). Ajouter de la télémétrie demande de rester propre :
- **Mode sans cookie + host EU** → pas de bandeau de consentement requis pour de l'analytics anonyme/first-party.
- **Aucune PII dans les events** : jamais d'email, jamais de contenu de message. Seulement l'`userId` interne (pseudonyme).
- Prévoir, au moment de l'ouverture publique, une **page Confidentialité** mentionnant l'usage d'analytics (PostHog EU) — un paragraphe suffit. (Aucune page privacy n'existe encore dans le repo.)
- Ne jamais logguer le contenu des messages/visio dans les events ni dans Sentry.

---

## 6. Error tracking (Sentry) — à faire AVANT l'analytics produit

C'est un sujet distinct et **prioritaire** : Sentry est le seul « tracker » utile même avec peu d'users.
Déjà prévu dans la trajectoire produit. Ordre conseillé le jour de l'ouverture :
1. **Sentry** (web + serveur) — savoir ce qui casse.
2. **PostHog** (les 5 events ci-dessus) — savoir si ça sert et si les gens reviennent.

---

## 7. Checklist jour J

- [ ] Sentry web + serveur (prio 1)
- [ ] Compte PostHog Cloud **EU**, projet NestWork, mode sans cookie
- [ ] `posthog-js` (web) + `posthog-node` (server), clés en env **prod uniquement**
- [ ] Wrapper `track/identify/reset` (web) + `capture` (server), **no-op sans clé**
- [ ] `session_start` + `identify` sur login/reprise de session
- [ ] `peer_connected` / `peer_session_ended` (+ `durationSec`) dans MediaContext
- [ ] `message_sent` (server) + `map_applied` (server)
- [ ] Vérifier en local que **rien n'est émis sans clé**
- [ ] Paragraphe analytics dans une page Confidentialité
- [ ] Construire dans PostHog : 1 funnel rétention (Q1), 1 ratio connexion peer + histogramme durée (Q2), courbes d'engagement (Q3)

---

## 8. Ce qu'on ne tracke PAS (volontairement)

Pageviews détaillées · clics par bouton · scroll · temps par écran · mouvements dans l'espace ·
heatmaps · session replay. À l'échelle d'ouverture, c'est du bruit ininterprétable.
On ajoutera du grain **seulement si** une question de décision précise l'exige.
