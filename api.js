// api.js - Módulo para comunicação com o backend (Python/Flask)

// O endereço do seu servidor Flask. Se estiver rodando localmente, será este.
const API_BASE_URL = 'http://127.0.0.1:5000';

/**
 * Função para chamar o endpoint de geração de plano de estudos.
 * @param {object} dadosDoFormulario - Os dados do formulário do cronograma.
 * @returns {Promise<object>} - A resposta da API com o plano gerado.
 */
export async function gerarPlanoDeEstudos(dadosDoFormulario) {
    try {
        const response = await fetch(`${API_BASE_URL}/gerar-plano-estudos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(dadosDoFormulario),
        });

        if (!response.ok) {
            // Se a resposta do servidor não for bem-sucedida, lança um erro.
            throw new Error(`Erro do servidor: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Falha ao gerar plano de estudos:', error);
        // Lança o erro novamente para que a função que chamou possa tratá-lo.
        throw error;
    }
}

/**
 * **NOVA FUNÇÃO**
 * Função para chamar o endpoint de geração de exercícios.
 * @param {object} dadosDoFormulario - Os dados do formulário de exercícios.
 * @returns {Promise<object>} - A resposta da API com os exercícios gerados.
 */
export async function gerarExercicios(dadosDoFormulario) {
    try {
        const response = await fetch(`${API_BASE_URL}/gerar-exercicios`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(dadosDoFormulario),
        });

        if (!response.ok) {
            throw new Error(`Erro do servidor: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Falha ao gerar exercícios:', error);
        throw error;
    }
}