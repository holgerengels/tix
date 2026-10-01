import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import axios from 'axios';
import './axios';
import { useAuthStore } from './stores/auth';
import { useRequestQueueStore } from './stores/requestQueue';
import { showErrorDialog } from './composables/useToast';

vi.mock('./composables/useToast', () => ({
    showErrorDialog: vi.fn(),
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn()
    }
}));

describe('Axios interceptors & Auth handling', () => {
    let authStore;
    let requestQueueStore;
    let responseErrorHandler;
    let requestHandler;

    beforeEach(() => {
        setActivePinia(createPinia());
        authStore = useAuthStore();
        requestQueueStore = useRequestQueueStore();
        vi.clearAllMocks();
        localStorage.clear();

        // Extract handlers from axios interceptors
        const reqHandlers = axios.interceptors.request.handlers;
        requestHandler = reqHandlers[reqHandlers.length - 1]?.fulfilled;

        const resHandlers = axios.interceptors.response.handlers;
        responseErrorHandler = resHandlers[resHandlers.length - 1]?.rejected;
    });

    it('attaches Bearer token in request interceptor when authenticated', () => {
        authStore.token = 'test-token-123';
        const config = { headers: {} };
        const modified = requestHandler(config);

        expect(modified.headers.Authorization).toBe('Bearer test-token-123');
    });

    it('does not attach Authorization header when not authenticated', () => {
        authStore.token = null;
        const config = { headers: {} };
        const modified = requestHandler(config);

        expect(modified.headers.Authorization).toBeUndefined();
    });

    it('intercepts 401 error, triggers login, queues request, and does NOT show error dialog', async () => {
        const error = {
            config: { url: '/api/tickets', headers: {} },
            response: { status: 401, data: { message: 'Failed to authenticate token' } }
        };

        const promise = responseErrorHandler(error);
        promise.catch(() => {}); // Catch expected network error when axios retries in test env

        expect(authStore.showLogin).toBe(true);
        expect(requestQueueStore.queue.length).toBe(1);
        expect(showErrorDialog).not.toHaveBeenCalled();

        // When user logs in and retries
        requestQueueStore.retryAll('new-valid-token');
        expect(error.config.headers.Authorization).toBe('Bearer new-valid-token');
    });

    it('intercepts 403 "No token provided" error as an auth error without showing error dialog', async () => {
        const error = {
            config: { url: '/api/tickets', headers: {} },
            response: { status: 403, data: { message: 'No token provided' } }
        };

        const promise = responseErrorHandler(error);
        promise.catch(() => {});

        expect(authStore.showLogin).toBe(true);
        expect(requestQueueStore.queue.length).toBe(1);
        expect(showErrorDialog).not.toHaveBeenCalled();
    });

    it('shows error dialog for genuine non-auth errors (e.g. 500 or 400)', async () => {
        const error = {
            config: { url: '/api/tickets', headers: {} },
            response: { status: 500, data: { message: 'Internal Database Error' } }
        };

        await expect(responseErrorHandler(error)).rejects.toEqual(error);

        expect(showErrorDialog).toHaveBeenCalledWith('Internal Database Error');
        expect(authStore.showLogin).toBe(false);
        expect(requestQueueStore.queue.length).toBe(0);
    });

    it('shows error dialog for 403 permission errors (not token errors)', async () => {
        const error = {
            config: { url: '/api/tickets/1/action', headers: {} },
            response: { status: 403, data: { message: 'Keine Berechtigung für diese Aktion' } }
        };

        await expect(responseErrorHandler(error)).rejects.toEqual(error);

        expect(showErrorDialog).toHaveBeenCalledWith('Keine Berechtigung für diese Aktion');
        expect(authStore.showLogin).toBe(false);
    });
});
