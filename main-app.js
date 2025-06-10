// main-app.js - Versão CORRIGIDA

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const state = { /* ... seu estado aqui ... */ };

// --- FUNÇÕES DE CÁLCULO DE MÉTRICAS ---
function calcularMetricas(plans, sessions) {
    // Lógica de cálculo permanece a mesma...
    const studyDates = new Set();
    plans.forEach(plan => {
        if (plan.criadoEm) { // Usando o timestamp
            const date = plan.criadoEm.toDate().toISOString().split('T')[0];
            studyDates.add(date);
        }
    });
    state.metrics.diasEstudo = studyDates.size;
    state.metrics.exerciciosRealizados = sessions.length * 10;
    state.metrics.taxaAcerto = 78;
    state.metrics.textosCorrigidos = 5;

    atualizarMetricasDashboard();
}

function atualizarMetricasDashboard() {
    // **CORREÇÃO IMPORTANTE**: Só executa se os elementos existirem na página
    const elDiasEstudo = document.getElementById('stat-dias-estudo');
    if (elDiasEstudo) {
        elDiasEstudo.textContent = state.metrics.diasEstudo;
        document.getElementById('stat-exercicios').textContent = state.metrics.exerciciosRealizados;
        document.getElementById('stat-acertos').textContent = `${state.metrics.taxaAcerto}%`;
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
        const plansSnapshot = await getDocs(collection(db, `users/${userId}/plans`));
        state.savedPlans = plansSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.exerciseSessions = [{date: '2025-06-01'}, {date: '2025-06-03'}]; // Simulação
        
        // **CORREÇÃO IMPORTANTE**: Apenas calcula as métricas se estiver na página do dashboard
        if (document.getElementById('stat-dias-estudo')) {
            calcularMetricas(state.savedPlans, state.exerciseSessions);
        }

    } catch (error) {
        console.error("Erro ao carregar dados do Firestore:", error);
    }
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