import { ApiClient } from '../../app/src/services/apiClient';
import { API_BASE_URL } from './config';

// App-wide ApiClient singleton. `login()` stores the JWT on this instance, so
// every screen that uses it after sign-in is authenticated.
export const apiClient = new ApiClient(API_BASE_URL);
