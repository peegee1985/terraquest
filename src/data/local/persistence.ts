// Metro resolves the real `./persistence` import to persistence.native.ts (iOS/Android)
// or persistence.web.ts at bundle time, same convention as explorer-map.tsx. This bare
// file exists only so non-Metro tooling (tsc) has an unambiguous target to resolve to.
export { getLocalPersistence } from './persistence.native';
export type { LocalPersistence } from './persistence.native';
