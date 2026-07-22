# TerraQuest

TerraQuest is an Expo/React Native exploration RPG. Walking reveals a persistent fog-of-war map, completes quests, and earns server-validated XP.

## Current checkpoint

- Expo SDK 57 with Expo Router
- Android-first dark UI and four core tabs
- Native location permission and foreground tracking prototype
- Native map fog-mask proof of concept plus web fallback
- Local-first session recovery with AsyncStorage
- Pure progression rules with automated tests
- Convex schema for users, stats, sessions, cells, XP ledger, and quests

## Run locally

```bash
npm install
npm run start
```

Use Expo Go for the initial UI and foreground tracking. Background tracking will require an Expo development build.

## Connect Convex

```bash
npx convex dev
```

Then copy the generated deployment URL to `.env.local`:

```bash
EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

The app intentionally works with local demo state before Convex is connected.

## Validation

```bash
npm run typecheck
npm run lint
npm test
```

## Architecture

- `src/app`: Expo Router screens
- `src/components`: reusable UI and map rendering
- `src/domain`: deterministic XP and exploration rules
- `src/state`: local-first session state
- `convex`: server schema and, after deployment setup, server functions
- `tests`: domain tests
