import { type ReactElement, useEffect, useState } from 'react';
import { NavigationContainer, useIsFocused } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import { apiClient } from './src/api';
import { CreateRequestScreen } from './src/screens/CreateRequestScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ServiceRequestsScreen } from './src/screens/ServiceRequestsScreen';

export type RootStackParamList = {
  Login: undefined;
  ServiceRequests: undefined;
  CreateRequest: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoginRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Login'>): ReactElement {
  return (
    <LoginScreen
      client={apiClient}
      onSuccess={() => {
        navigation.replace('ServiceRequests');
      }}
    />
  );
}

function ServiceRequestsRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ServiceRequests'>): ReactElement {
  const isFocused = useIsFocused();
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (isFocused) {
      setRefreshToken((current) => current + 1);
    }
  }, [isFocused]);

  return (
    <ServiceRequestsScreen
      client={apiClient}
      refreshToken={refreshToken}
      onNewRequest={() => {
        navigation.navigate('CreateRequest');
      }}
    />
  );
}

function CreateRequestRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'CreateRequest'>): ReactElement {
  return (
    <CreateRequestScreen
      client={apiClient}
      onCreated={() => {
        navigation.goBack();
      }}
    />
  );
}

export default function App(): ReactElement {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator>
        <Stack.Screen name="Login" component={LoginRoute} options={{ title: 'HomeFix' }} />
        <Stack.Screen
          name="ServiceRequests"
          component={ServiceRequestsRoute}
          options={{ title: 'Your requests' }}
        />
        <Stack.Screen
          name="CreateRequest"
          component={CreateRequestRoute}
          options={{ title: 'New request' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
