import {
  type ReactElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { clearSession, persistSession, restoreSession } from '../app/src/auth/session';
import { apiClient } from './src/api';
import { tokenStore } from './src/tokenStore';
import { AdminRequestsScreen } from './src/screens/AdminRequestsScreen';
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
  AdminRequests: undefined;
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
  const [refreshToken, setRefreshToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshToken((current) => current + 1);
    }, []),
  );

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
  const [refreshToken, setRefreshToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshToken((current) => current + 1);
    }, []),
  );

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

function AdminRequestsRoute(): ReactElement {
  const { signOut } = useContext(AuthContext);
  const [refreshToken, setRefreshToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshToken((current) => current + 1);
    }, []),
  );

  return (
    <AdminRequestsScreen
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

  useEffect(() => {
    apiClient.setUnauthorizedHandler(() => {
      void clearSession(tokenStore, apiClient).then(() => {
        setSignedIn(false);
      });
    });
    return () => {
      apiClient.setUnauthorizedHandler(undefined);
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

  const role = apiClient.getPrincipal()?.role;

  return (
    <AuthContext.Provider value={actions}>
      <NavigationContainer>
        <StatusBar style="auto" />
        <Stack.Navigator>
          {!signedIn && (
            <Stack.Screen name="Login" component={LoginRoute} options={{ title: 'HomeFix' }} />
          )}
          {signedIn && role === 'worker' && (
            <Stack.Screen
              name="WorkerJobs"
              component={WorkerJobsRoute}
              options={{ title: 'Assigned jobs' }}
            />
          )}
          {signedIn && role === 'admin' && (
            <Stack.Screen
              name="AdminRequests"
              component={AdminRequestsRoute}
              options={{ title: 'All requests' }}
            />
          )}
          {signedIn && role !== 'worker' && role !== 'admin' && (
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
