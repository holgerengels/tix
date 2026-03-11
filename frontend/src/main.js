import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import './webawesome'
import './axios'
import App from './App.vue'
import router from './router'

const app = createApp(App);
const pinia = createPinia();

app.config.errorHandler = (err, instance, info) => {
    console.error("Global Error:", err);
    console.error("Info:", info);
    // Alert is too intrusive for 401s handled by interceptor
    if (err.response && err.response.status === 401) return;
    alert(`Ein Fehler ist aufgetreten: ${err.message}`);
};

app.use(pinia).use(router).mount('#app');
