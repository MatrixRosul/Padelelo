import Constants from 'expo-constants';
import axios from 'axios';

function resolveApiBaseUrl(): string {
  const explicitUrl = process.env.EXPO_PUBLIC_API_URL;
  if (explicitUrl) {
    return explicitUrl;
  }

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0] ?? 'localhost';

  return `http://${host}:4000/api`;
}

function toBearerToken(token: string): string {
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let currentAuthToken = process.env.EXPO_PUBLIC_API_TOKEN ?? null;

export function setApiAuthToken(token: string | null): void {
  currentAuthToken = token;

  if (token) {
    apiClient.defaults.headers.common.Authorization = toBearerToken(token);
    return;
  }

  delete apiClient.defaults.headers.common.Authorization;
}

export function getApiAuthToken(): string | null {
  return currentAuthToken;
}

setApiAuthToken(currentAuthToken);
