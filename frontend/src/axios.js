import axios from 'axios';
import { useAuthStore } from './stores/auth';
import { useRequestQueueStore } from './stores/requestQueue';
import { showErrorDialog } from './composables/useToast';

// Request interceptor to add token
axios.interceptors.request.use(config => {
    const auth = useAuthStore();
    if (auth.token) {
        config.headers.Authorization = `Bearer ${auth.token}`;
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

// Response interceptor to handle 401 — try silent refresh first
axios.interceptors.response.use(
    response => response,
    async error => {
        if (error.response && error.response.status === 401 && !error.config.url.endsWith('/login') && !error.config.url.endsWith('/refresh')) {
            const auth = useAuthStore();
            const requestQueue = useRequestQueueStore();
            const originalRequest = error.config;

            // If we have a refresh token, try silent refresh
            if (auth.refreshToken) {
                if (isRefreshing) {
                    // Another refresh is already in progress — wait for it
                    return new Promise((resolve, reject) => {
                        addRefreshSubscriber((newToken) => {
                            originalRequest.headers.Authorization = `Bearer ${newToken}`;
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
                    originalRequest.headers.Authorization = `Bearer ${token}`;
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
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    axios(originalRequest).then(resolve).catch(reject);
                });
            });
        }
        
        // Centralized Error Handling for all other API errors
        // Skip if explicitly marked as silent in config
        if (!error.config?.silent) {
            const status = error.response?.status;
            // Ignore 401s handled above, or other expected silent statuses if added
            if (status !== 401) {
                 const msg = error.response?.data?.message || error.response?.data?.error || error.message;
                 showErrorDialog(msg);
                 error.isHandled = true;
            }
        }
        
        return Promise.reject(error);
    }
);

