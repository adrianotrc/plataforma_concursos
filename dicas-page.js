// SUBSTITUA O CONTEÚDO INTEIRO DO ARQUIVO dicas-page.js

import { auth, db } from './firebase-config.js';
import { getUsageLimits, gerarDicasPorCategoria, gerarDicaPersonalizada } from './api.js'; 
import { state } from './main-app.js';
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- ELEMENTOS DO DOM ---
const geradorDicasForm = document.getElementById('gerador-dicas-form');
const categoriaSelect = document.getElementById('dica-categoria-select');
const dicaGeradaContainer = document.getElementById('dica-gerada-container');
const historicoContainer = document.getElementById('historico-dicas');
const usageCounterDiv = document.getElementById('usage-counter');

// --- FUNÇÕES ---

function renderizarDicas(dicas) {
    if (!dicaGeradaContainer) return;
    dicaGeradaContainer.innerHTML = '';
    if (dicas && dicas.length > 0) {
        let dicasHtml = '<ul>';
        dicas.forEach(dica => {
            dicasHtml += `<li>${dica}</li>`;
        });
        dicasHtml += '</ul>';
        dicaGeradaContainer.innerHTML = dicasHtml;
    } else {
        dicaGeradaContainer.innerHTML = '<p>Não foi possível gerar dicas neste momento.</p>';
    }
    dicaGeradaContainer.style.display = 'block';
}

async function salvarDicaNoHistorico(categoria, dicas) {
    if (!state.user) return;
    try {
        await addDoc(collection(db, `users/${state.user.uid}/historicoDicas`), {
            categoria,
            dicas,
            criadoEm: serverTimestamp()
        });
    } catch (error) {
        console.error("Erro ao salvar dica no histórico:", error);
    }
}

async function carregarHistoricoDicas() {
    if (!state.user || !historicoContainer) return;
    const q = query(collection(db, `users/${state.user.uid}/historicoDicas`), orderBy("criadoEm", "desc"), limit(5));
    const querySnapshot = await getDocs(q);
    const dicas = [];
    querySnapshot.forEach(doc => dicas.push(doc.data()));
    
    if (dicas.length > 0) {
        historicoContainer.innerHTML = dicas.map(item => {
             const iconePorCategoria = {
                gestao_de_tempo: 'fa-clock',
                metodos_de_estudo: 'fa-brain',
                motivacao: 'fa-heart',
                redacao: 'fa-pen-fancy',
                personalizada: 'fa-robot'
            };
            const icone = iconePorCategoria[item.categoria] || 'fa-lightbulb';
            return `
                <div class="tip-item">
                    <div class="tip-icon"><i class="fas ${icone}"></i></div>
                    <div class="tip-content">
                        <div class="tip-title">${item.categoria.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                        <div class="tip-description">${item.dicas[0]}</div>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        historicoContainer.innerHTML = '<div class="card-placeholder"><p>Seu histórico de dicas aparecerá aqui.</p></div>';
    }
}

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
        
        const btnGerar = geradorDicasForm.querySelector('button[type="submit"]');
        if (btnGerar) {
            btnGerar.disabled = restantes <= 0;
        }

    } catch (error) {
        console.error("Erro ao buscar limites de uso para dicas:", error);
        usageCounterDiv.style.display = 'none';
    }
}

// --- LÓGICA DE EVENTOS ---

geradorDicasForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const categoria = categoriaSelect.value;
    if (!categoria) {
        alert("Por favor, selecione uma categoria.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
    dicaGeradaContainer.style.display = 'none';

    try {
        let resultado;
        if (categoria === 'personalizada') {
            const q = query(collection(db, `users/${state.user.uid}/sessoesExercicios`), limit(50));
            const sessoesSnapshot = await getDocs(q);
            const sessoes = sessoesSnapshot.docs.map(doc => doc.data());
            const desempenhoPorMateria = sessoes.reduce((acc, sessao) => {
                 const resumo = sessao.resumo;
                 if(resumo && resumo.acertos !== undefined) {
                     if (!acc[resumo.materia]) acc[resumo.materia] = { acertos: 0, total: 0 };
                     acc[resumo.materia].acertos += resumo.acertos;
                     acc[resumo.materia].total += resumo.total;
                 }
                 return acc;
            }, {});
            
            const desempenhoParaApi = Object.entries(desempenhoPorMateria).map(([materia, dados]) => ({
                materia,
                taxa_acerto: dados.total > 0 ? Math.round((dados.acertos / dados.total) * 100) : 0
            }));
            
            if (desempenhoParaApi.length === 0) {
                renderizarDicas(["Não há dados de desempenho suficientes para uma dica personalizada."]);
                return;
            }
            // Chama a API com o payload correto
            resultado = await gerarDicaPersonalizada({ userId: state.user.uid, desempenho: desempenhoParaApi });

        } else {
            // Chama a API com o payload correto
            resultado = await gerarDicasPorCategoria({ userId: state.user.uid, categoria: categoria });
        }
        
        renderizarDicas(resultado.dicas_geradas);
        await salvarDicaNoHistorico(categoria, resultado.dicas_geradas);
        await carregarHistoricoDicas();

    } catch (error) {
        alert(error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Gerar Dica';
        await renderUsageInfo();
    }
});

// --- INICIALIZAÇÃO ---

function initDicasPage() {
    if (state.user) {
        renderUsageInfo();
        carregarHistoricoDicas();
    }
}

document.addEventListener('userDataReady', initDicasPage);