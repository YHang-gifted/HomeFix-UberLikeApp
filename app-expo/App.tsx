import { type ReactElement, createContext, useContext, useEffect, useState } from 'react';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { clearSession, persistSession, restoreSession } from '../app/src/auth/session';
import { registerForPush } from '../app/src/features/notifications/pushRegistration';
import { readResetCode, urlWithoutResetCode } from '../app/src/features/auth/resetLink';
import { apiClient } from './src/api';
import { deviceOpenCheckout } from './src/checkout';
import { DateTimePickerHost, openDeviceDateTimePicker } from './src/dateTimePicker';
import { deviceImagePicker } from './src/imagePicker';
import { deviceGeocoder, deviceLocationProvider } from './src/location';
import { MapPickerHost, deviceMapPicker, mapPickerAvailable } from './src/mapPicker';
import { deviceConnectMessageStream } from './src/messageStream';
import { devicePushTokenProvider } from './src/push';
import { tokenStore } from './src/tokenStore';
import { useFocusRefreshToken } from './src/hooks/useFocusRefreshToken';
import { colors } from './src/theme';
import { AdminCertificationsScreen } from './src/screens/AdminCertificationsScreen';
import { AdminRequestsScreen } from './src/screens/AdminRequestsScreen';
import { AdminStatsScreen } from './src/screens/AdminStatsScreen';
import { AdminUsersScreen } from './src/screens/AdminUsersScreen';
import { AuditLogScreen } from './src/screens/AuditLogScreen';
import { AvailableJobsScreen } from './src/screens/AvailableJobsScreen';
import { CertificationsScreen } from './src/screens/CertificationsScreen';
import { CreateRequestScreen } from './src/screens/CreateRequestScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MessagesScreen } from './src/screens/MessagesScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { RequestDetailScreen } from './src/screens/RequestDetailScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { PaymentsScreen } from './src/screens/PaymentsScreen';
import { PayoutsScreen } from './src/screens/PayoutsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ServiceRequestsScreen } from './src/screens/ServiceRequestsScreen';
import { WorkerJobsScreen } from './src/screens/WorkerJobsScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  /** `token` is set when the user arrived from the emailed reset link (`/?reset=…`). */
  ForgotPassword: { token?: string } | undefined;
  ServiceRequests: undefined;
  CreateRequest: undefined;
  RequestDetail: { id: string };
  WorkerJobs: undefined;
  AvailableJobs: undefined;
  Certifications: undefined;
  AdminRequests: undefined;
  AdminStats: undefined;
  AdminUsers: undefined;
  AdminCertifications: undefined;
  AuditLog: undefined;
  Profile: undefined;
  Notifications: undefined;
  Favorites: undefined;
  Payments: undefined;
  Payouts: undefined;
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

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand,
    background: colors.canvas,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
    notification: colors.accent,
  },
};

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
      onForgotPassword={() => {
        navigation.navigate('ForgotPassword');
      }}
    />
  );
}

function ForgotPasswordRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>): ReactElement {
  const token = route.params?.token;
  return (
    <ForgotPasswordScreen
      client={apiClient}
      {...(token !== undefined ? { initialToken: token } : {})}
      onDone={() => {
        navigation.navigate('Login');
      }}
    />
  );
}

/**
 * The reset token from the emailed magic link (`/?reset=…`), read once at startup.
 *
 * Web only: on native there is no `window.location`, and the code printed in the mail is the
 * fallback for that. Guarded the same way `checkout.ts` guards its web/native split.
 *
 * Read at module scope so it is available before the navigator picks its initial route — but
 * deliberately NOT stripped here (see below), because the URL is the only copy we have and it
 * must not be destroyed on a path that cannot use it.
 */
const linkResetCode: string | undefined =
  Platform.OS === 'web' ? readResetCode(globalThis.window.location.search) : undefined;

/**
 * Remove the token from the address bar, once it has actually been handed to the reset screen.
 *
 * The token is a live credential. Left in the URL it lands in browser history and session
 * restore, it is what gets copied when someone shares "the page I'm on", and it sits in the
 * tab long after the reset is done. `replaceState` rewrites in place, so Back cannot bring it
 * back. (`Referrer-Policy: no-referrer` on the server covers the other half — otherwise the
 * Google Maps SDK on the page would send the whole URL, token and all, as a `Referer`.)
 */
function stripResetCodeFromUrl(): void {
  if (Platform.OS !== 'web') {
    return;
  }
  const { history, location } = globalThis.window;
  history.replaceState(null, '', urlWithoutResetCode(location.href));
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
  const refreshToken = useFocusRefreshToken();

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
      onViewPayments={() => {
        navigation.navigate('Payments');
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
      // Forward geocoding (address search) isn't available on web via
      // expo-location, so hide that field there; current-location (browser
      // geolocation) and manual entry remain.
      geocoder={Platform.OS === 'web' ? undefined : deviceGeocoder}
      imagePicker={deviceImagePicker}
      // Native always has react-native-maps; web has a Google Maps JS picker only
      // when a Maps JavaScript key is configured (`mapPickerAvailable`).
      mapPicker={mapPickerAvailable ? deviceMapPicker : undefined}
      openDateTimePicker={openDeviceDateTimePicker}
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
      openCheckout={deviceOpenCheckout}
      openDateTimePicker={openDeviceDateTimePicker}
      onCancelled={() => {
        navigation.goBack();
      }}
      onReleased={() => {
        navigation.goBack();
      }}
      onReset={() => {
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
  const refreshToken = useFocusRefreshToken();

  return (
    <MessagesScreen
      client={apiClient}
      requestId={route.params.id}
      refreshToken={refreshToken}
      connectStream={deviceConnectMessageStream}
    />
  );
}

function WorkerJobsRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'WorkerJobs'>): ReactElement {
  const { signOut } = useContext(AuthContext);
  const refreshToken = useFocusRefreshToken();

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
      onViewCertifications={() => {
        navigation.navigate('Certifications');
      }}
      onViewPayments={() => {
        navigation.navigate('Payments');
      }}
      onViewPayouts={() => {
        navigation.navigate('Payouts');
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
  const refreshToken = useFocusRefreshToken();

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

function CertificationsRoute(): ReactElement {
  const refreshToken = useFocusRefreshToken();

  return (
    <CertificationsScreen
      client={apiClient}
      imagePicker={deviceImagePicker}
      refreshToken={refreshToken}
    />
  );
}

function AdminRequestsRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'AdminRequests'>): ReactElement {
  const { signOut } = useContext(AuthContext);
  const refreshToken = useFocusRefreshToken();

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
      onViewStats={() => {
        navigation.navigate('AdminStats');
      }}
      onViewUsers={() => {
        navigation.navigate('AdminUsers');
      }}
      onViewCertifications={() => {
        navigation.navigate('AdminCertifications');
      }}
      onLogout={() => {
        signOut();
      }}
    />
  );
}

function AdminStatsRoute(): ReactElement {
  const refreshToken = useFocusRefreshToken();

  return <AdminStatsScreen client={apiClient} refreshToken={refreshToken} />;
}

function AdminUsersRoute(): ReactElement {
  const refreshToken = useFocusRefreshToken();

  return <AdminUsersScreen client={apiClient} refreshToken={refreshToken} />;
}

function AdminCertificationsRoute(): ReactElement {
  const refreshToken = useFocusRefreshToken();

  return <AdminCertificationsScreen client={apiClient} refreshToken={refreshToken} />;
}

function AuditLogRoute(): ReactElement {
  const refreshToken = useFocusRefreshToken();

  return <AuditLogScreen client={apiClient} refreshToken={refreshToken} />;
}

function NotificationsRoute(): ReactElement {
  const refreshToken = useFocusRefreshToken();

  return <NotificationsScreen client={apiClient} refreshToken={refreshToken} />;
}

function FavoritesRoute(): ReactElement {
  const refreshToken = useFocusRefreshToken();

  return <FavoritesScreen client={apiClient} refreshToken={refreshToken} />;
}

function PaymentsRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Payments'>): ReactElement {
  const refreshToken = useFocusRefreshToken();

  return (
    <PaymentsScreen
      client={apiClient}
      refreshToken={refreshToken}
      onSelectRequest={(id) => {
        navigation.navigate('RequestDetail', { id });
      }}
    />
  );
}

function PayoutsRoute(): ReactElement {
  const refreshToken = useFocusRefreshToken();

  return (
    <PayoutsScreen
      client={apiClient}
      refreshToken={refreshToken}
      openCheckout={deviceOpenCheckout}
    />
  );
}

function ProfileRoute(): ReactElement {
  const { signOut } = useContext(AuthContext);
  return (
    <ProfileScreen
      client={apiClient}
      onTokenRefreshed={(token) => {
        // change-password / logout-all rotate the token server-side; persist the
        // fresh one so the session survives an app restart.
        void tokenStore.set(token);
      }}
      onDeleted={() => {
        // The account is gone and every token is revoked; clear the session.
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

  useEffect(() => {
    if (!signedIn) {
      return;
    }
    // Best-effort: register this device for push once signed in. Never throws — but no longer
    // silent. The outcome used to be discarded outright, so a push setup that could not work on
    // any device (no EAS projectId) failed on every launch with nothing to show for it.
    void registerForPush(devicePushTokenProvider, (token) =>
      apiClient.registerDeviceToken(token),
    ).then((outcome) => {
      if (!outcome.ok) {
        // eslint-disable-next-line no-console -- the only channel the device has.
        console.warn(`[push] not registered (${outcome.reason})`, outcome.detail ?? '');
      }
    });
  }, [signedIn]);

  // The reset screen only exists in the signed-out stack, so only take the token once we know
  // it can actually reach it. Stripping the URL unconditionally would destroy the code for a
  // signed-in user who opened the link — the URL is the only copy we hold — leaving them with
  // nothing but the fallback code printed in the mail.
  const resetToken = !booting && !signedIn ? linkResetCode : undefined;
  const usingResetLink = resetToken !== undefined;
  useEffect(() => {
    if (usingResetLink) {
      stripResetCodeFromUrl();
    }
  }, [usingResetLink]);

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
      <NavigationContainer theme={navigationTheme}>
        <StatusBar style="dark" />
        <MapPickerHost />
        <DateTimePickerHost />
        <Stack.Navigator
          // Arriving from the reset link opens straight on the reset screen, rather than the
          // login form the user cannot get past — that is the entire point of the link.
          {...(usingResetLink ? { initialRouteName: 'ForgotPassword' as const } : {})}
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.canvas },
          }}
        >
          {!signedIn && (
            <>
              <Stack.Screen name="Login" component={LoginRoute} options={{ title: 'HomeFix' }} />
              <Stack.Screen
                name="Register"
                component={RegisterRoute}
                options={{ title: 'Create account' }}
              />
              <Stack.Screen
                name="ForgotPassword"
                component={ForgotPasswordRoute}
                options={{ title: 'Reset password' }}
                {...(resetToken !== undefined ? { initialParams: { token: resetToken } } : {})}
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
                name="Certifications"
                component={CertificationsRoute}
                options={{ title: 'Certifications' }}
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
                name="Payments"
                component={PaymentsRoute}
                options={{ title: 'Payments received' }}
              />
              <Stack.Screen
                name="Payouts"
                component={PayoutsRoute}
                options={{ title: 'Payouts' }}
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
                name="AdminStats"
                component={AdminStatsRoute}
                options={{ title: 'Dashboard' }}
              />
              <Stack.Screen
                name="AdminUsers"
                component={AdminUsersRoute}
                options={{ title: 'Users' }}
              />
              <Stack.Screen
                name="AdminCertifications"
                component={AdminCertificationsRoute}
                options={{ title: 'Certification review' }}
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
              <Stack.Screen
                name="Payments"
                component={PaymentsRoute}
                options={{ title: 'Payments' }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
});
