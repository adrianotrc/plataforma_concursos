// config.js

function isLocal() {
    // Retorna true se o hostname for localhost ou 127.0.0.1
    return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

// Define as URLs com base no ambiente de forma dinâmica
export const FRONTEND_URL = isLocal() 
    ? 'http://127.0.0.1:5500' // URL para desenvolvimento local
    : 'https://www.iaprovas.com.br';   // Sua URL oficial de produção

export const API_BASE_URL = isLocal()
    ? 'http://127.0.0.1:5000' // Backend de desenvolvimento
    : 'https://iaprovas-backend.onrender.com'; // Backend de produção
