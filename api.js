// api.js - Versão com todas as funções de API implementadas

const API_BASE_URL = 'https://iaprovas-backend.onrender.com';

// Função auxiliar genérica para chamadas de API
async function fetchApi(endpoint, options) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        if (!response.ok) {
            // Tenta ler o corpo do erro para dar mais detalhes
            const errorBody = await response.json().catch(() => ({ erro: response.statusText }));
            throw new Error(`Erro do servidor: ${errorBody.erro_geral || response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Falha ao chamar o endpoint ${endpoint}:`, error);
        throw error;
    }
}

// --- Funções existentes ---
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


// --- FUNÇÕES NOVAS E COMPLETAS ---

/**
 * Gera um enunciado de questão discursiva.
 * @param {object} criterios - Os critérios do formulário.
 * @returns {Promise<object>}
 */
export async function gerarEnunciadoDiscursiva(criterios) {
    return fetchApi('/gerar-enunciado-discursiva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criterios),
    });
}

/**
 * Envia um texto para correção da IA.
 * @param {object} dadosCorrecao - Contém o enunciado, a resposta e o foco da correção.
 * @returns {Promise<object>}
 */
export async function corrigirDiscursiva(dadosCorrecao) {
    return fetchApi('/corrigir-discursiva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosCorrecao),
    });
}