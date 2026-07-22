import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';

import { colors } from '@/theme/tokens';

export default function Index() {
  const [destination, setDestination] = useState<'/(tabs)' | '/onboarding' | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('terraquest:onboarding-complete')
      .then((value) => setDestination(value === 'true' ? '/(tabs)' : '/onboarding'))
      .catch(() => setDestination('/onboarding'));
  }, []);

  if (!destination) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.brand} /></SafeAreaView>;
  }

  return <Redirect href={destination} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
