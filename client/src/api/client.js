import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const TOKEN_STORAGE_KEY = 'taskpilot_auth_token';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error?.response?.data?.error ||
      error?.response?.data?.details?.map((d) => d.message).join(', ') ||
      error?.message ||
      'Request failed';
    return Promise.reject(new Error(message));
  }
);

export function getExecutionStreamUrl(executionId) {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  return `${API_BASE_URL}/executions/${executionId}/stream?token=${encodeURIComponent(token)}`;
}
