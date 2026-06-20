import { type ReactElement } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import { LoginScreen } from './src/screens/LoginScreen';

export default function App(): ReactElement {
  return (
    <View style={styles.root}>
      <StatusBar style="auto" />
      <LoginScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
