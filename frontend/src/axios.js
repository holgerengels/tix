import axios from 'axios';
import { useAuthStore } from './stores/auth';
import { useRequestQueueStore } from './stores/requestQueue';

// Request interceptor to add token
axios.interceptors.request.use(config => {
    const auth = useAuthStore();
    if (auth.token) {
        config.headers.Authorization = `Bearer ${auth.token}`;
    }
    return config;
});

// Response interceptor to handle 401
axios.interceptors.response.use(
    response => response,
    error => {
        if (error.response && error.response.status === 401 && !error.config.url.endsWith('/login')) {
            const auth = useAuthStore();
            const requestQueue = useRequestQueueStore();

            // Trigger Login Overlay
            auth.triggerLogin();

            // Create a promise that resolves when the request is retried
            return new Promise((resolve, reject) => {
                requestQueue.add((token) => {
                    const originalRequest = error.config;
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    axios(originalRequest).then(resolve).catch(reject);
                });
            });
        }
        return Promise.reject(error);
    }
);
