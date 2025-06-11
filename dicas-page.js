// dicas-page.js - Versão final com todas as correções

import { state } from './main-app.js';
import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, serverTimestamp, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarDicasPorCategoria, gerarDicaPersonalizada } from './api.js';

// --- ELEMENTOS DO DOM ---
const geradorDicasForm = document.getElementById('gerador-dicas-form');
const categoriaSelect = document.getElementById('dica-categoria-select');
const dicaGeradaContainer = document.getElementById('dica-gerada-container');
const historicoContainer = document.getElementById('historico-dicas');

// --- ESTADO LOCAL ---
let currentUser = null;
let historicoDicas = []; // Usaremos esta variável local consistentemente

// --- FUNÇÕES DE RENDERIZAÇÃO E UI ---
function renderizarDicas(dicas) {
    if (!dicaGeradaContainer || !dicas || dicas.length === 0) {
        dicaGeradaContainer.innerHTML = '<p>Não foi possível gerar dicas para esta categoria.</p>';
        dicaGeradaContainer.style.display = 'block';
        return;
    }
    let dicasHtml = '<ul>';
    dicas.forEach(dica => {
        dicasHtml += `<li>${dica}</li>`;
    });
    dicasHtml += '</ul>';
    dicaGeradaContainer.innerHTML = dicasHtml;
    dicaGeradaContainer.style.display = 'block';
}

function renderizarHistorico() {
    if (!historicoContainer) return;
    // **CORREÇÃO**: Usa a variável local `historicoDicas` em vez de `state.historicoDicas`
    if (historicoDicas.length === 0) {
        historicoContainer.innerHTML = '<div class="card-placeholder"><p>Seu histórico de dicas aparecerá aqui.</p></div>';
        return;
    }
    historicoContainer.innerHTML = historicoDicas.map(item => {
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
                <button class="btn btn-ghost btn-rever-dica" data-dica-id="${item.id}">Rever</button>
            </div>
        `;
    }).join('');
}


// --- LÓGICA DE DADOS E EVENTOS ---
async function salvarDicaNoHistorico(categoria, dicas) {
    if (!currentUser) return;
    try {
        const dicaParaSalvar = { categoria, dicas, criadoEm: serverTimestamp() };
        const docRef = await addDoc(collection(db, `users/${currentUser.uid}/historicoDicas`), dicaParaSalvar);
        // Adiciona a nova dica localmente para evitar uma nova leitura do DB
        historicoDicas.unshift({ id: docRef.id, ...dicaParaSalvar });
        renderizarHistorico();
    } catch (error) {
        console.error("Erro ao salvar dica no histórico:", error);
    }
}

async function carregarHistoricoDoFirestore() {
    if (!currentUser) return;
    try {
        const q = query(collection(db, `users/${currentUser.uid}/historicoDicas`), orderBy("criadoEm", "desc"), limit(10));
        const querySnapshot = await getDocs(q);
        historicoDicas = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao carregar histórico de dicas:", error);
    }
}

geradorDicasForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const categoria = categoriaSelect.value;
    if (!categoria) {
        alert('Por favor, selecione uma categoria.');
        return;
    }

    // **CORREÇÃO**: Adiciona o estado de "carregando" ao botão
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
    dicaGeradaContainer.style.display = 'none';

    try {
        let resultado;
        if (categoria === 'personalizada') {
            const dadosDesempenho = state.sessoesExercicios.reduce((acc, sessao) => {
                const materia = sessao.resumo.materia;
                if (!acc[materia]) {
                    acc[materia] = { acertos: 0, total: 0 };
                }
                acc[materia].acertos += sessao.resumo.acertos;
                acc[materia].total += sessao.resumo.total;
                return acc;
            }, {});
            const resumoParaApi = Object.entries(dadosDesempenho).map(([materia, data]) => ({
                materia,
                taxa_acerto: data.total > 0 ? parseFloat(((data.acertos / data.total) * 100).toFixed(2)) : 0
            }));
            resultado = await gerarDicaPersonalizada(resumoParaApi);
        } else {
            resultado = await gerarDicasPorCategoria(categoria);
        }
        const dicas = resultado.dicas_geradas || [];
        renderizarDicas(dicas);
        await salvarDicaNoHistorico(categoria, dicas);
    } catch (error) {
        alert('Erro ao gerar dicas. Tente novamente.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Gerar Dica';
    }
});

historicoContainer?.addEventListener('click', (e) => {
    const btnRever = e.target.closest('.btn-rever-dica');
    if (btnRever) {
        const dicaId = btnRever.dataset.dicaId;
        const dicaSelecionada = historicoDicas.find(d => d.id === dicaId);
        if (dicaSelecionada) {
            renderizarDicas(dicaSelecionada.dicas);
        }
    }
});

// --- INICIALIZAÇÃO ---
async function initDicasPage() {
    currentUser = state.user;
    if (currentUser) {
        await carregarHistoricoDoFirestore();
        renderizarHistorico();
    }
}
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initDicasPage();
    }, 300); // Um pequeno atraso para garantir que o main-app carregou os dados globais
});