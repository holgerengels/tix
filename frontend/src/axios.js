import axios from 'axios';
import { useAuthStore } from './stores/auth';
import { useRequestQueueStore } from './stores/requestQueue';
import { showErrorDialog } from './composables/useToast';

let isExtending = false;

// Request interceptor to add token
axios.interceptors.request.use(config => {
    const auth = useAuthStore();
    if (auth.token) {
        config.headers.Authorization = `Bearer ${auth.token}`;
        
        // Sliding session logic
        try {
            const parts = auth.token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                const timeToExpiryMs = payload.exp * 1000 - Date.now();
                
                // If it is an API call, and token has less than 15 minutes left, and not already extending
                if (timeToExpiryMs > 0 && timeToExpiryMs < 15 * 60 * 1000 
                    && !isExtending 
                    && !config.url.endsWith('/extend') 
                    && !config.url.endsWith('/refresh')) {
                    
                    isExtending = true;
                    // Fire-and-forget background extension
                    axios.post('/api/extend').then(res => {
                        auth.login(res.data.token, res.data.user, auth.refreshToken);
                    }).catch(() => {}).finally(() => {
                        isExtending = false;
                    });
                }
            }
        } catch (e) {
            // Ignore decode errors
        }
    }
    return config;
});

// Refresh state to prevent concurrent refresh requests
let isRefreshing = false;
let refreshSubscribers = [];

const onRefreshed = (token) => {
    refreshSubscribers.forEach(cb => cb(token));
    refreshSubscribers = [];
};

const onRefreshFailed = () => {
    refreshSubscribers = [];
};

const addRefreshSubscriber = (callback) => {
    refreshSubscribers.push(callback);
};

const setAuthHeader = (requestConfig, token) => {
    if (!requestConfig.headers) {
        requestConfig.headers = {};
    }
    if (typeof requestConfig.headers.set === 'function') {
        requestConfig.headers.set('Authorization', `Bearer ${token}`);
    } else {
        requestConfig.headers.Authorization = `Bearer ${token}`;
    }
};

// Response interceptor to handle 401 — try silent refresh first
axios.interceptors.response.use(
    response => response,
    async error => {
        const status = error.response?.status;
        const msg = error.response?.data?.message || error.response?.data?.error || '';
        const isAuthError = (status === 401 || (status === 403 && (msg === 'No token provided' || msg === 'Invalid token format')))
            && error.config && !error.config.url?.endsWith('/login') && !error.config.url?.endsWith('/refresh');

        if (isAuthError) {
            const auth = useAuthStore();
            const requestQueue = useRequestQueueStore();
            const originalRequest = error.config;

            // If we have a refresh token, try silent refresh
            if (auth.refreshToken) {
                if (isRefreshing) {
                    // Another refresh is already in progress — wait for it
                    return new Promise((resolve, reject) => {
                        addRefreshSubscriber((newToken) => {
                            setAuthHeader(originalRequest, newToken);
                            axios(originalRequest).then(resolve).catch(reject);
                        });
                    });
                }

                isRefreshing = true;
                try {
                    const res = await axios.post('/api/refresh', { refreshToken: auth.refreshToken });
                    const { token, user } = res.data;
                    auth.login(token, user);
                    isRefreshing = false;
                    onRefreshed(token);

                    // Retry the original request
                    setAuthHeader(originalRequest, token);
                    return axios(originalRequest);
                } catch (refreshError) {
                    isRefreshing = false;
                    onRefreshFailed();
                    // Refresh token is also invalid — fall through to login overlay
                }
            }

            // No refresh token or refresh failed — show login overlay
            auth.triggerLogin();
            return new Promise((resolve, reject) => {
                requestQueue.add((token) => {
                    setAuthHeader(originalRequest, token);
                    axios(originalRequest).then(resolve).catch(reject);
                });
            });
        }
        
        // Centralized Error Handling for all other API errors
        // Skip if explicitly marked as silent in config
        if (!error.config?.silent && !isAuthError) {
             const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
             showErrorDialog(errorMsg);
             error.isHandled = true;
        }
        
        return Promise.reject(error);
    }
);

