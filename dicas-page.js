// SUBSTITUA O CONTEÚDO INTEIRO DO ARQUIVO dicas-page.js

import { auth, db } from './firebase-config.js';
import { getUsageLimits, gerarDicaCategoria, gerarDicaPersonalizada } from './api.js';
import { state } from './main-app.js';
import { collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- ELEMENTOS DO DOM ---
const botoesCategoria = document.querySelectorAll('.category-buttons .btn');
const dicasContainer = document.getElementById('dicas-geradas-container');
const usageCounterDiv = document.getElementById('usage-counter'); // Novo elemento

// --- FUNÇÕES ---

function renderizarDicas(dicas) {
    if (!dicasContainer) return;
    dicasContainer.innerHTML = ''; // Limpa o container
    if (dicas && dicas.length > 0) {
        dicas.forEach(dica => {
            const dicaElemento = document.createElement('div');
            dicaElemento.className = 'tip-item';
            dicaElemento.innerHTML = `
                <div class="tip-icon"><i class="fas fa-lightbulb"></i></div>
                <div class="tip-content">
                    <p>${dica}</p>
                </div>
            `;
            dicasContainer.appendChild(dicaElemento);
        });
    } else {
        dicasContainer.innerHTML = '<p>Não foi possível gerar dicas neste momento.</p>';
    }
}

async function handleGerarDica(botao, gerarDicaFn, params) {
    botao.disabled = true;
    botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
    try {
        const resultado = await gerarDicaFn(params);
        renderizarDicas(resultado.dicas_geradas);
    } catch (error) {
        alert(error.message); // Exibe o erro de limite excedido
    } finally {
        botao.disabled = false;
        botao.innerHTML = botao.dataset.originalText || 'Gerar Dica';
        await renderUsageInfo(); // Atualiza a contagem
    }
}

async function buscarDesempenhoRecente() {
    if (!state.user) return [];
    const q = query(
        collection(db, `users/${state.user.uid}/sessoesExercicios`),
        where("resumo.acertos", "!=", null),
        orderBy("resumo.criadoEm", "desc"),
        limit(20)
    );
    const querySnapshot = await getDocs(q);
    const desempenhoPorMateria = {};
    querySnapshot.forEach(doc => {
        const data = doc.data().resumo;
        if (!desempenhoPorMateria[data.materia]) {
            desempenhoPorMateria[data.materia] = { acertos: 0, total: 0 };
        }
        desempenhoPorMateria[data.materia].acertos += data.acertos;
        desempenhoPorMateria[data.materia].total += data.total;
    });
    return Object.entries(desempenhoPorMateria).map(([materia, dados]) => ({
        materia: materia,
        taxa_acerto: dados.total > 0 ? Math.round((dados.acertos / dados.total) * 100) : 0
    }));
}

// **NOVA FUNÇÃO PARA EXIBIR O USO**
async function renderUsageInfo() {
    if (!state.user || !usageCounterDiv) return;
    try {
        const data = await getUsageLimits(state.user.uid);
        const uso = data.usage.dicas || 0;
        const limite = data.limits.dicas || 0;
        const restantes = limite - uso;
        const plano = data.plan;

        let mensagem = '';
        if (plano === 'trial') {
            mensagem = `Você ainda pode gerar ${restantes} de ${limite} dicas durante o seu período de teste.`;
        } else {
            mensagem = `Hoje, você ainda pode gerar ${restantes} de ${limite} dicas.`;
        }
        
        usageCounterDiv.textContent = mensagem;
        usageCounterDiv.style.display = 'block';
        
        // Desabilita todos os botões de gerar dica se o limite foi atingido
        botoesCategoria.forEach(btn => {
            btn.disabled = restantes <= 0;
        });

    } catch (error) {
        console.error("Erro ao buscar limites de uso para dicas:", error);
        usageCounterDiv.style.display = 'none';
    }
}


// --- LÓGICA DE EVENTOS ---

botoesCategoria.forEach(botao => {
    botao.dataset.originalText = botao.innerHTML; // Salva o texto original
    botao.addEventListener('click', async () => {
        const categoria = botao.dataset.category;
        let params = { userId: state.user.uid };

        if (categoria === 'personalizada') {
            params.desempenho = await buscarDesempenhoRecente();
            if (params.desempenho.length === 0) {
                renderizarDicas(["Não há dados de desempenho recentes suficientes para uma dica personalizada. Resolva mais exercícios!"]);
                return;
            }
            await handleGerarDica(botao, gerarDicaPersonalizada, params);
        } else {
            params.categoria = categoria;
            await handleGerarDica(botao, gerarDicaCategoria, params);
        }
    });
});

// --- INICIALIZAÇÃO ---

function initDicasPage() {
    if (state.user) {
        renderUsageInfo(); // Chama a nova função na inicialização
    }
}

document.addEventListener('userDataReady', initDicasPage);