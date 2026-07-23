#!/usr/bin/env node
// One-off CI diagnostic helper (see .github/workflows/eas-inspect-postbuild.yml).
//
// `eas build:inspect` normally cannot tell us why a local build failed: its
// own catch block only prints anything when --verbose is OFF, and even then
// it prints a generic "Build failed" hint, never the actual caught error.
// With --verbose ON (which we need to see the native build's own inherited
// stdout/stderr), a failure anywhere before that native build subprocess is
// spawned is swallowed with zero output. This patches a fetched copy of
// eas-cli's build/commands/build/inspect.js (installed fresh into a scratch
// prefix by the workflow, never our own node_modules) to always log the
// real error instead of swallowing it.
'use strict';
const fs = require('fs');

const target = process.argv[2];
if (!target) {
  console.error('usage: node eas-inspect-debug-patch.js <path-to-inspect.js>');
  process.exit(1);
}

const oldBlock = `            catch {
                if (!flags.verbose) {
                    log_1.default.error('Build failed');
                    log_1.default.error(\`Re-run this command with \${chalk_1.default.bold('--verbose')} flag to see the logs\`);
                }
            }`;

const newBlock = `            catch (err) {
                log_1.default.error('Build failed. Real error (debug patch):');
                log_1.default.error(err && err.stack ? err.stack : String(err));
                if (err && err.stdout) log_1.default.error('--- stdout ---\\n' + err.stdout);
                if (err && err.stderr) log_1.default.error('--- stderr ---\\n' + err.stderr);
            }`;

// build:inspect hardcodes `nonInteractive: false` in the flags object it
// passes to runBuildAndSubmitAsync, so validateExpoUpdatesInstalledAsProjectDependencyAsync
// always tries a real interactive confirm prompt — confirmed it checks for
// an actual TTY, not just readable stdin, since piping "n" produced the
// identical "stdin is not readable" error. There's no CLI flag to override
// this (it isn't derived from any flag build:inspect exposes), so flip the
// literal directly. Scoped to the flags-object occurrence only, not the
// earlier getContextAsync(...) call a few lines up, which controls login
// and is left alone.
const oldFlagsBlock = `                    flags: {
                        nonInteractive: false,`;
const newFlagsBlock = `                    flags: {
                        nonInteractive: true,`;

const contents = fs.readFileSync(target, 'utf8');
if (!contents.includes(oldBlock)) {
  console.error('eas-inspect-debug-patch: expected catch block not found — eas-cli internals likely changed, patch needs updating');
  process.exit(1);
}
if (!contents.includes(oldFlagsBlock)) {
  console.error('eas-inspect-debug-patch: expected flags block not found — eas-cli internals likely changed, patch needs updating');
  process.exit(1);
}
const patched = contents.split(oldBlock).join(newBlock).split(oldFlagsBlock).join(newFlagsBlock);
fs.writeFileSync(target, patched);
console.log(`eas-inspect-debug-patch: patched ${target}`);
