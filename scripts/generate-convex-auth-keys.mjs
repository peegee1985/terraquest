// One-time setup for TQ-18 (Convex Auth): generates an RS256 keypair the
// same way @convex-dev/auth's own `npx @convex-dev/auth` CLI wizard does
// (see node_modules/@convex-dev/auth/src/cli/generateKeys.ts) and sets
// JWT_PRIVATE_KEY / JWKS directly on the target Convex deployment via the
// `convex env set` CLI, using CONVEX_DEPLOY_KEY from the environment.
//
// The private key is piped to the CLI's stdin and never printed or passed
// as a CLI argument, so it never appears in shell history or CI logs.
//
// Usage: node scripts/generate-convex-auth-keys.mjs <dev|staging|production> [--force]

import { spawnSync } from 'node:child_process';

import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';

const target = process.argv[2];
const force = process.argv.includes('--force');

if (!['dev', 'staging', 'production'].includes(target ?? '')) {
  console.error('Usage: node scripts/generate-convex-auth-keys.mjs <dev|staging|production> [--force]');
  process.exit(1);
}

// `staging`'s CONVEX_STAGING_DEPLOY_KEY is already scoped to that one
// preview deployment, same as dev's/production's deploy keys — no extra
// `--deployment`/`--preview-name` flag needed (and "--deployment staging"
// actively fails: the human-readable preview name isn't a valid deployment
// reference on its own, e.g. the "staging" preview currently resolves to
// the deployment slug "uncommon-terrier-974").
const extraArgs = target === 'production' ? ['--prod'] : [];

// `extractable: true` is required so the private key can be exported to
// PKCS8 below — jose defaults to a non-extractable WebCrypto key otherwise.
const keys = await generateKeyPair('RS256', { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: 'sig', ...publicKey }] });
const jwtPrivateKey = privateKey.trimEnd().replace(/\n/g, ' ');

function setEnvVar(name, value) {
  const args = ['convex', 'env', 'set', name, ...extraArgs, ...(force ? ['--force'] : [])];
  const result = spawnSync('npx', args, { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
  if (result.status !== 0) {
    console.error(`Failed to set ${name} on target "${target}".`);
    process.exit(result.status ?? 1);
  }
}

setEnvVar('JWT_PRIVATE_KEY', jwtPrivateKey);
setEnvVar('JWKS', jwks);

console.log(`JWT_PRIVATE_KEY and JWKS set on the "${target}" Convex deployment.`);
console.log('Any previously issued sessions on this deployment are now invalid.');
