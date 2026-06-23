import { type ReactElement, createContext, useContext, useEffect, useState } from 'react';
import { NavigationContainer, useIsFocused } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { clearSession, persistSession, restoreSession } from '../app/src/auth/session';
import { apiClient } from './src/api';
import { tokenStore } from './src/tokenStore';
import { CreateRequestScreen } from './src/screens/CreateRequestScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { RequestDetailScreen } from './src/screens/RequestDetailScreen';
import { ServiceRequestsScreen } from './src/screens/ServiceRequestsScreen';
import { WorkerJobsScreen } from './src/screens/WorkerJobsScreen';

export type RootStackParamList = {
  Login: undefined;
  ServiceRequests: undefined;
  CreateRequest: undefined;
  RequestDetail: { id: string };
  WorkerJobs: undefined;
};

interface AuthActions {
  signIn: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthActions>({
  signIn: () => undefined,
  signOut: () => undefined,
});

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoginRoute(): ReactElement {
  const { signIn } = useContext(AuthContext);
  return (
    <LoginScreen
      client={apiClient}
      onSuccess={(token) => {
        signIn(token);
      }}
    />
  );
}

function ServiceRequestsRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ServiceRequests'>): ReactElement {
  const { signOut } = useContext(AuthContext);
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
      onSelectRequest={(id) => {
        navigation.navigate('RequestDetail', { id });
      }}
      onLogout={() => {
        signOut();
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

function RequestDetailRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'RequestDetail'>): ReactElement {
  return (
    <RequestDetailScreen
      client={apiClient}
      requestId={route.params.id}
      onCancelled={() => {
        navigation.goBack();
      }}
    />
  );
}

function WorkerJobsRoute(): ReactElement {
  const { signOut } = useContext(AuthContext);
  const isFocused = useIsFocused();
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (isFocused) {
      setRefreshToken((current) => current + 1);
    }
  }, [isFocused]);

  return (
    <WorkerJobsScreen
      client={apiClient}
      refreshToken={refreshToken}
      onLogout={() => {
        signOut();
      }}
    />
  );
}

export default function App(): ReactElement {
  const [booting, setBooting] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    restoreSession(tokenStore, apiClient)
      .then((restored) => {
        if (active) {
          setSignedIn(restored);
        }
      })
      .catch(() => {
        if (active) {
          setSignedIn(false);
        }
      })
      .finally(() => {
        if (active) {
          setBooting(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const actions: AuthActions = {
    signIn: (token) => {
      void persistSession(tokenStore, apiClient, token).then(() => {
        setSignedIn(true);
      });
    },
    signOut: () => {
      void clearSession(tokenStore, apiClient).then(() => {
        setSignedIn(false);
      });
    },
  };

  if (booting) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator />
      </View>
    );
  }

  const isWorker = apiClient.getPrincipal()?.role === 'worker';

  return (
    <AuthContext.Provider value={actions}>
      <NavigationContainer>
        <StatusBar style="auto" />
        <Stack.Navigator>
          {!signedIn && (
            <Stack.Screen name="Login" component={LoginRoute} options={{ title: 'HomeFix' }} />
          )}
          {signedIn && isWorker && (
            <Stack.Screen
              name="WorkerJobs"
              component={WorkerJobsRoute}
              options={{ title: 'Assigned jobs' }}
            />
          )}
          {signedIn && !isWorker && (
            <>
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
              <Stack.Screen
                name="RequestDetail"
                component={RequestDetailRoute}
                options={{ title: 'Request' }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
});
