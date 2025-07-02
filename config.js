// config.js
function isLocal() {
    return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}
export const FRONTEND_URL = isLocal() ? 'http://127.0.0.1:5500' : 'https://www.iaprovas.com.br';
export const API_BASE_URL = isLocal() ? 'http://127.0.0.1:5000' : 'https://iaprovas-backend.onrender.com';
