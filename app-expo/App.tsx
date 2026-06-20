import { type ReactElement } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';

import { LoginScreen } from './src/screens/LoginScreen';

export default function App(): ReactElement {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="auto" />
      <LoginScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
