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

Two manually triggered workflows keep the hosted backends and EAS environments aligned:

- `Deploy Convex Staging` deploys to a separate non-expiring Convex production-type deployment referenced as `staging`, then writes its URL to the EAS `preview` environment.
- `Deploy Convex Production` deploys with the production key, then writes its URL to the EAS `production` environment. The workflow requires an explicit production confirmation and uses the GitHub `production` environment.

Configure these repository secrets before the first run:

- `CONVEX_STAGING_DEPLOY_KEY`: a deploy key scoped only to the `staging` deployment
- `CONVEX_PROD_DEPLOY_KEY`: a Convex Production deploy key
- `EXPO_TOKEN`: the Expo access token already used by the development build workflow

Never commit deploy keys or Expo tokens. The generated Convex deployment URLs are public client configuration and can be shown in workflow output.

Create the stable staging deployment once with Convex CLI 1.34 or newer, then generate its scoped CI key:

```bash
npx convex deployment create staging --type prod --expiration none
npx convex deployment token create github-staging --deployment staging
```

Store the printed token directly as `CONVEX_STAGING_DEPLOY_KEY`; do not paste it into chat or a tracked file. A temporary Convex preview deployment is intentionally not used for staging because preview deployments expire automatically.

The manually triggered `EAS Development Build` workflow verifies `EXPO_TOKEN` and the Expo project link, configures the development Convex URL, and queues an internally distributed Android development build. The workflow has read-only repository permissions.

Expo project: [`@peegee85/terraquest`](https://expo.dev/accounts/peegee85/projects/terraquest), project ID `cbb276cd-c61e-4ab2-b19f-1198d03987da`.

Latest installable Android development build: [EAS build `c62b1e95`](https://expo.dev/accounts/peegee85/projects/terraquest/builds/c62b1e95-9856-4b72-97b8-394f28c92859).

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
