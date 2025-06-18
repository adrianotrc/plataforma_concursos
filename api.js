// api.js - Versão final com URL dinâmica para desenvolvimento e produção

// Esta função determina se estamos no ambiente local (desenvolvimento)
function isLocalEnvironment() {
    // Endereços comuns para desenvolvimento local
    const localhosts = ['127.0.0.1', 'localhost'];
    return localhosts.includes(window.location.hostname);
}

// Define a URL base da API dinamicamente
const API_BASE_URL = isLocalEnvironment() 
    ? 'http://127.0.0.1:5000' // URL para desenvolvimento local
    : 'https://iaprovas-backend.onrender.com'; // URL para produção

// Função auxiliar genérica para chamadas de API
async function fetchApi(endpoint, options) {
    try {
        console.log(`Fazendo chamada para: ${API_BASE_URL}${endpoint}`);
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ erro: response.statusText }));
            console.error(`Erro do servidor ao chamar ${endpoint}:`, errorBody);
            throw new Error(`Erro do servidor: ${errorBody.erro_geral || response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Falha grave ao chamar o endpoint ${endpoint}:`, error);
        throw error;
    }
}

// --- Funções da Aplicação ---

export async function enviarEmailBoasVindas(email, nome) {
    console.log(`Tentando enviar e-mail de boas-vindas para ${email}`);
    return fetchApi('/enviar-email-boas-vindas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nome }),
    });
}

export async function gerarPlanoDeEstudos(dadosDoFormulario) {
    return fetchApi('/gerar-plano-estudos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosDoFormulario),
    });
}

export async function gerarExercicios(dadosDoFormulario) {
    return fetchApi('/gerar-exercicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosDoFormulario),
    });
}

export async function gerarDicasPorCategoria(categoria) {
    return fetchApi('/gerar-dica-categoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria }),
    });
}

export async function gerarDicaPersonalizada(dadosDesempenho) {
    return fetchApi('/gerar-dica-personalizada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desempenho: dadosDesempenho }),
    });
}

export async function gerarEnunciadoDiscursiva(criterios) {
    return fetchApi('/gerar-enunciado-discursiva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criterios),
    });
}

export async function corrigirDiscursiva(dadosCorrecao) {
    return fetchApi('/corrigir-discursiva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosCorrecao),
    });
}

export async function criarSessaoCheckout(plano, userId) {
    return fetchApi('/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plano, userId: userId }),
    });
}