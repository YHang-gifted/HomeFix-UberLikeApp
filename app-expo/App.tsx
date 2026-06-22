import { type ReactElement } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import { apiClient } from './src/api';
import { LoginScreen } from './src/screens/LoginScreen';
import { ServiceRequestsScreen } from './src/screens/ServiceRequestsScreen';

export type RootStackParamList = {
  Login: undefined;
  ServiceRequests: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App(): ReactElement {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator>
        <Stack.Screen name="Login" options={{ title: 'HomeFix' }}>
          {({ navigation }) => (
            <LoginScreen
              client={apiClient}
              onSuccess={() => {
                navigation.replace('ServiceRequests');
              }}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="ServiceRequests" options={{ title: 'Your requests' }}>
          {() => <ServiceRequestsScreen client={apiClient} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
