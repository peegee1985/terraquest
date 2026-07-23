const { withMainActivity } = require('@expo/config-plugins');

// react-native-health-connect's permission-request flow needs its Activity
// Result contract registered against MainActivity (see the library's own
// README "Installation" section) — its companion config plugin
// (expo-health-connect) only patches AndroidManifest.xml, not MainActivity,
// so without this, requestPermission() would never resolve back to JS.
// Written as a small local plugin (not eject/bare workflow) since this is a
// fully managed Expo project — MainActivity.kt is generated fresh by every
// prebuild, so there's no committed native file to hand-edit.
const IMPORT_LINE = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const DELEGATE_CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

function withHealthConnectPermissionDelegate(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      console.warn('withHealthConnectPermissionDelegate: MainActivity is not Kotlin — skipping (Health Connect permission requests may not resolve).');
      return config;
    }

    let contents = config.modResults.contents;
    if (contents.includes('HealthConnectPermissionDelegate')) {
      return config; // Already applied by an earlier prebuild.
    }

    contents = contents.replace(/^(package .+\n)/, `$1\n${IMPORT_LINE}\n`);

    // MainActivity already has an onCreate override (splash-screen theme
    // setup) — this must merge INTO it, not add a second onCreate, which
    // would be a Kotlin compile error.
    const onCreatePattern = /(override fun onCreate\([^)]*\)\s*\{[\s\S]*?super\.onCreate\([^)]*\)\n)/;
    if (onCreatePattern.test(contents)) {
      contents = contents.replace(onCreatePattern, `$1    ${DELEGATE_CALL}\n`);
    } else {
      console.warn('withHealthConnectPermissionDelegate: could not find onCreate/super.onCreate in MainActivity.kt — Health Connect permission requests may not resolve.');
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withHealthConnectPermissionDelegate;
