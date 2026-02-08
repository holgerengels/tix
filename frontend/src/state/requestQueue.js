const queue = [];

export const requestQueue = {
    add(requestFactory) {
        queue.push(requestFactory);
    },
    retryAll(token) {
        console.log(`Retrying ${queue.length} failed requests...`);
        queue.forEach(factory => factory(token));
        queue.length = 0;
    },
    clear() {
        queue.length = 0;
    }
};
