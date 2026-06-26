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
import { deviceLocationProvider } from './src/location';
import { tokenStore } from './src/tokenStore';
import { AdminRequestsScreen } from './src/screens/AdminRequestsScreen';
import { AuditLogScreen } from './src/screens/AuditLogScreen';
import { AvailableJobsScreen } from './src/screens/AvailableJobsScreen';
import { CreateRequestScreen } from './src/screens/CreateRequestScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MessagesScreen } from './src/screens/MessagesScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { RequestDetailScreen } from './src/screens/RequestDetailScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ServiceRequestsScreen } from './src/screens/ServiceRequestsScreen';
import { WorkerJobsScreen } from './src/screens/WorkerJobsScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ServiceRequests: undefined;
  CreateRequest: undefined;
  RequestDetail: { id: string };
  WorkerJobs: undefined;
  AvailableJobs: undefined;
  AdminRequests: undefined;
  AuditLog: undefined;
  Profile: undefined;
  Notifications: undefined;
  Favorites: undefined;
  Messages: { id: string };
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

function LoginRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Login'>): ReactElement {
  const { signIn } = useContext(AuthContext);
  return (
    <LoginScreen
      client={apiClient}
      onSuccess={(token) => {
        signIn(token);
      }}
      onRegister={() => {
        navigation.navigate('Register');
      }}
    />
  );
}

function RegisterRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Register'>): ReactElement {
  const { signIn } = useContext(AuthContext);
  return (
    <RegisterScreen
      client={apiClient}
      onSuccess={(token) => {
        signIn(token);
      }}
      onBackToLogin={() => {
        navigation.goBack();
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
      onViewProfile={() => {
        navigation.navigate('Profile');
      }}
      onViewNotifications={() => {
        navigation.navigate('Notifications');
      }}
      onViewFavorites={() => {
        navigation.navigate('Favorites');
      }}
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
      locationProvider={deviceLocationProvider}
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
      onViewMessages={() => {
        navigation.navigate('Messages', { id: route.params.id });
      }}
    />
  );
}

function MessagesRoute({
  route,
}: NativeStackScreenProps<RootStackParamList, 'Messages'>): ReactElement {
  const [refreshToken, setRefreshToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshToken((current) => current + 1);
    }, []),
  );

  return (
    <MessagesScreen client={apiClient} requestId={route.params.id} refreshToken={refreshToken} />
  );
}

function WorkerJobsRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'WorkerJobs'>): ReactElement {
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
      onViewProfile={() => {
        navigation.navigate('Profile');
      }}
      onViewNotifications={() => {
        navigation.navigate('Notifications');
      }}
      onViewAvailable={() => {
        navigation.navigate('AvailableJobs');
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

function AvailableJobsRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'AvailableJobs'>): ReactElement {
  const [refreshToken, setRefreshToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshToken((current) => current + 1);
    }, []),
  );

  return (
    <AvailableJobsScreen
      client={apiClient}
      refreshToken={refreshToken}
      onSelectRequest={(id) => {
        navigation.navigate('RequestDetail', { id });
      }}
      onClaimed={(id) => {
        navigation.navigate('RequestDetail', { id });
      }}
    />
  );
}

function AdminRequestsRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'AdminRequests'>): ReactElement {
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
      onViewProfile={() => {
        navigation.navigate('Profile');
      }}
      onSelectRequest={(id) => {
        navigation.navigate('RequestDetail', { id });
      }}
      onViewAudit={() => {
        navigation.navigate('AuditLog');
      }}
      onLogout={() => {
        signOut();
      }}
    />
  );
}

function AuditLogRoute(): ReactElement {
  const [refreshToken, setRefreshToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshToken((current) => current + 1);
    }, []),
  );

  return <AuditLogScreen client={apiClient} refreshToken={refreshToken} />;
}

function NotificationsRoute(): ReactElement {
  const [refreshToken, setRefreshToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshToken((current) => current + 1);
    }, []),
  );

  return <NotificationsScreen client={apiClient} refreshToken={refreshToken} />;
}

function FavoritesRoute(): ReactElement {
  const [refreshToken, setRefreshToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshToken((current) => current + 1);
    }, []),
  );

  return <FavoritesScreen client={apiClient} refreshToken={refreshToken} />;
}

function ProfileRoute(): ReactElement {
  return <ProfileScreen client={apiClient} />;
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
            <>
              <Stack.Screen name="Login" component={LoginRoute} options={{ title: 'HomeFix' }} />
              <Stack.Screen
                name="Register"
                component={RegisterRoute}
                options={{ title: 'Create account' }}
              />
            </>
          )}
          {signedIn && role === 'worker' && (
            <>
              <Stack.Screen
                name="WorkerJobs"
                component={WorkerJobsRoute}
                options={{ title: 'Assigned jobs' }}
              />
              <Stack.Screen
                name="AvailableJobs"
                component={AvailableJobsRoute}
                options={{ title: 'Available jobs' }}
              />
              <Stack.Screen
                name="RequestDetail"
                component={RequestDetailRoute}
                options={{ title: 'Request' }}
              />
              <Stack.Screen
                name="Messages"
                component={MessagesRoute}
                options={{ title: 'Messages' }}
              />
              <Stack.Screen
                name="Profile"
                component={ProfileRoute}
                options={{ title: 'Profile' }}
              />
              <Stack.Screen
                name="Notifications"
                component={NotificationsRoute}
                options={{ title: 'Notifications' }}
              />
            </>
          )}
          {signedIn && role === 'admin' && (
            <>
              <Stack.Screen
                name="AdminRequests"
                component={AdminRequestsRoute}
                options={{ title: 'All requests' }}
              />
              <Stack.Screen
                name="AuditLog"
                component={AuditLogRoute}
                options={{ title: 'Audit log' }}
              />
              <Stack.Screen
                name="RequestDetail"
                component={RequestDetailRoute}
                options={{ title: 'Request' }}
              />
              <Stack.Screen
                name="Messages"
                component={MessagesRoute}
                options={{ title: 'Messages' }}
              />
              <Stack.Screen
                name="Profile"
                component={ProfileRoute}
                options={{ title: 'Profile' }}
              />
              <Stack.Screen
                name="Notifications"
                component={NotificationsRoute}
                options={{ title: 'Notifications' }}
              />
            </>
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
              <Stack.Screen
                name="Messages"
                component={MessagesRoute}
                options={{ title: 'Messages' }}
              />
              <Stack.Screen
                name="Profile"
                component={ProfileRoute}
                options={{ title: 'Profile' }}
              />
              <Stack.Screen
                name="Notifications"
                component={NotificationsRoute}
                options={{ title: 'Notifications' }}
              />
              <Stack.Screen
                name="Favorites"
                component={FavoritesRoute}
                options={{ title: 'Favorite workers' }}
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
