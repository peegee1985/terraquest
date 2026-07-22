# TerraQuest

TerraQuest is an Expo/React Native exploration RPG. Walking reveals a persistent fog-of-war map, completes quests, and earns server-validated XP.

## Current checkpoint

- Expo SDK 57 with Expo Router
- Android-first dark UI and four core tabs
- Native location permission and foreground tracking prototype
- Native map fog-mask proof of concept plus web fallback
- Local-first session recovery with AsyncStorage
- Pure progression rules with automated tests
- Deployed Convex schema for users, stats, sessions, cells, XP ledger, and quests

## Run locally

```bash
npm install
npm run start
```

Use Expo Go for the initial UI and foreground tracking. Background tracking will require an Expo development build.

## Connect Convex

The development deployment is connected through the public URL committed in `.env`:

```bash
EXPO_PUBLIC_CONVEX_URL=https://tough-shepherd-707.convex.cloud
```

Backend changes under `convex/**` are deployed by the read-only GitHub Actions workflow using the `CONVEX_DEPLOY_KEY` repository secret. The app intentionally retains local demo state when Convex is unavailable.

## EAS environments

`eas.json` defines three isolated build profiles:

- `development`: internal Expo development client
- `preview`: internally distributed Android APK using the EAS `preview` environment
- `production`: store build using the EAS `production` environment

Set `EXPO_PUBLIC_CONVEX_URL` separately in each matching EAS environment. The value is public client configuration; Convex deployment keys remain only in protected CI secrets.

The manually triggered `EAS Development Build` workflow verifies `EXPO_TOKEN` and the Expo project link, configures the development Convex URL, and queues an internally distributed Android development build. The workflow has read-only repository permissions.

Expo project: [`@peegee85/terraquest`](https://expo.dev/accounts/peegee85/projects/terraquest), project ID `cbb276cd-c61e-4ab2-b19f-1198d03987da`.

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
