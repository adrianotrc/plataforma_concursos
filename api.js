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
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        
        // Se a resposta não for OK (ex: 429, 500), trata como erro
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ 
                message: `Erro ${response.status}: ${response.statusText}` 
            }));
            // Lança um erro com a mensagem do servidor
            throw new Error(errorBody.message || 'Ocorreu um erro desconhecido.');
        }

        // Se a resposta for OK, mas não houver conteúdo (ex: status 202 ou 204)
        if (response.status === 202 || response.status === 204) {
            return {}; // Retorna um objeto vazio para não quebrar a cadeia de 'then'
        }

        return await response.json();
    } catch (error) {
        console.error(`Falha grave ao chamar o endpoint ${endpoint}:`, error.message);
        throw error; // Propaga o erro para ser tratado pela função que chamou
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

export async function gerarExerciciosAsync(dadosDoFormulario) {
    return fetchApi('/gerar-exercicios-async', {
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

export async function criarSessaoPortal(userId) {
    return fetchApi('/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    });
}

export async function deletarContaUsuario(userId) {
    return fetchApi('/delete-user-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    });
}

export async function verificarStatusPlano(userId, jobId) {
    return fetchApi(`/verificar-plano/<span class="math-inline">\{userId\}/</span>{jobId}`, {
        method: 'GET',
    });
}

// ADICIONE ESTAS DUAS FUNÇÕES NO FINAL DO ARQUIVO api.js

export async function gerarEnunciadoDiscursivaAsync(criterios) {
    return fetchApi('/gerar-enunciado-discursiva-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criterios),
    });
}

export async function corrigirDiscursivaAsync(dadosCorrecao) {
    return fetchApi('/corrigir-discursiva-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosCorrecao),
    });
}

export async function getUsageLimits(userId) {
    return fetchApi(`/get-usage-limits/${userId}`, {
        method: 'GET',
    });
}