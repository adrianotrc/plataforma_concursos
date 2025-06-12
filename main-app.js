// main-app.js - Versão que calcula todas as métricas, incluindo textos corrigidos

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const state = { user: null, metrics: { diasEstudo: 0, exerciciosRealizados: 0, taxaAcerto: 0, textosCorrigidos: 0, }, savedPlans: [], sessoesExercicios: [], sessoesDiscursivas: [], };


/**
 * **FUNÇÃO ATUALIZADA**
 * Calcula as métricas com base nos dados reais do usuário.
 */
function calcularMetricas() {
    const studyDates = new Set();
    [...state.savedPlans, ...state.sessoesExercicios, ...state.sessoesDiscursivas].forEach(item => {
        const dateSource = item.criadoEm || item.resumo?.criadoEm;
        if (dateSource) {
            studyDates.add(dateSource.toDate().toISOString().split('T')[0]);
        }
    });
    state.metrics.diasEstudo = studyDates.size;
    const totalExercicios = state.sessoesExercicios.reduce((acc, sessao) => acc + sessao.resumo.total, 0);
    const totalAcertos = state.sessoesExercicios.reduce((acc, sessao) => acc + sessao.resumo.acertos, 0);
    state.metrics.exerciciosRealizados = totalExercicios;
    state.metrics.taxaAcerto = totalExercicios > 0 ? (totalAcertos / totalExercicios) * 100 : 0;
    state.metrics.textosCorrigidos = state.sessoesDiscursivas.length;
    atualizarMetricasDashboard();
}

function atualizarMetricasDashboard() {
    const elDiasEstudo = document.getElementById('stat-dias-estudo');
    if (elDiasEstudo) {
        elDiasEstudo.textContent = state.metrics.diasEstudo;
        document.getElementById('stat-exercicios').textContent = state.metrics.exerciciosRealizados;
        document.getElementById('stat-acertos').textContent = `${state.metrics.taxaAcerto.toFixed(0)}%`;
        document.getElementById('stat-redacoes').textContent = state.metrics.textosCorrigidos;
    }
}

function updateUserInfo(user) {
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) {
        userNameElement.textContent = user.email;
    }
}

async function carregarDadosDoUsuario(userId) {
    try {
        const collectionsToLoad = {
            savedPlans: query(collection(db, `users/${userId}/plans`), orderBy("criadoEm", "desc"), limit(50)),
            sessoesExercicios: query(collection(db, `users/${userId}/sessoesExercicios`), orderBy("resumo.criadoEm", "desc"), limit(50)),
            sessoesDiscursivas: query(collection(db, `users/${userId}/discursivasCorrigidas`), orderBy("criadoEm", "desc"), limit(50))
        };
        const promises = Object.entries(collectionsToLoad).map(async ([key, q]) => {
            const snapshot = await getDocs(q);
            state[key] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        await Promise.all(promises);
        if (document.getElementById('stat-dias-estudo')) {
            calcularMetricas();
        }
    } catch (error) { console.error("Erro ao carregar dados do Firestore:", error); }
}


// --- INICIALIZAÇÃO E CONTROLE DE AUTENTICAÇÃO ---
function initializeApp() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.user = user;
            updateUserInfo(user);
            await carregarDadosDoUsuario(user.uid);

            const btnSair = document.getElementById('btn-sair');
            if (btnSair) {
                btnSair.addEventListener('click', async () => {
                    try {
                        await signOut(auth);
                        window.location.href = 'login.html';
                    } catch (error) {
                        console.error('Erro ao fazer logout:', error);
                    }
                });
            }

        } else {
            const paginasProtegidas = ['home.html', 'cronograma.html', 'exercicios.html', 'dicas-estrategicas.html', 'meu-perfil.html'];
            const paginaAtual = window.location.pathname.split('/').pop();
            if (paginasProtegidas.includes(paginaAtual)) {
                window.location.href = 'login.html';
            }
        }
    });

    // Lógica da Sidebar
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarToggle && sidebar && sidebarOverlay) {
        const toggleSidebar = () => {
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('show');
        };
        sidebarToggle.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', toggleSidebar);
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);