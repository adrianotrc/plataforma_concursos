
// api.js - Versão final com todas as funções

const API_BASE_URL = 'https://iaprovas-backend.onrender.com';

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


// ... (outras funções como gerarPlanoDeEstudos, gerarExercicios, etc. devem estar aqui)
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