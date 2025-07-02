// main-app.js - Versão FINAL, COMPLETA e CORRIGIDA

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, query, orderBy, limit, doc, getDoc, updateDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { enviarEmailBoasVindas } from './api.js';

// ESTADO GLOBAL COMPLETO (RESTAURADO)
export const state = {
    user: null,
    userData: null,
    metrics: {
        diasEstudo: 0,
        exerciciosRealizados: 0,
        taxaAcerto: 0,
        textosCorrigidos: 0,
    },
    savedPlans: [],
    sessoesExercicios: [],
    sessoesDiscursivas: []
};

// FUNÇÃO DE CONTROLE DE ACESSO (RESTAURADA)
function controlarAcessoFuncionalidades(plano) {
    const permissoes = {
        'trial': ['dashboard', 'cronograma', 'exercicios', 'discursivas', 'dicas', 'estudo'],
        'basico': ['dashboard', 'cronograma', 'dicas', 'estudo'],
        'intermediario': ['dashboard', 'cronograma', 'dicas', 'exercicios', 'estudo'],
        'premium': ['dashboard', 'cronograma', 'dicas', 'exercicios', 'discursivas', 'estudo'],
        'anual': ['dashboard', 'cronograma', 'dicas', 'exercicios', 'discursivas', 'estudo']
    };
    const todasFuncionalidades = ['dashboard', 'cronograma', 'exercicios', 'discursivas', 'dicas', 'estudo'];
    const funcionalidadesPermitidas = permissoes[plano] || [];
    todasFuncionalidades.forEach(func => {
        const elemento = document.getElementById(`nav-${func}`);
        if (elemento) {
            elemento.classList.toggle('disabled', !funcionalidadesPermitidas.includes(func));
        }
    });
}

// FUNÇÕES DE MÉTRICAS (RESTAURADAS)
function calcularMetricas() {
    const studyDates = new Set();
    [...state.savedPlans, ...state.sessoesExercicios, ...state.sessoesDiscursivas].forEach(item => {
        const dateSource = item.criadoEm || item.resumo?.criadoEm;
        if (dateSource && typeof dateSource.toDate === 'function') {
            studyDates.add(dateSource.toDate().toISOString().split('T')[0]);
        }
    });
    state.metrics.diasEstudo = studyDates.size;
    const sessoesCompletas = state.sessoesExercicios.filter(s => s.status === 'completed' && s.resumo.acertos !== undefined);
    const totalExercicios = sessoesCompletas.reduce((acc, sessao) => acc + (sessao.resumo?.total || 0), 0);
    const totalAcertos = sessoesCompletas.reduce((acc, sessao) => acc + (sessao.resumo?.acertos || 0), 0);
    state.metrics.exerciciosRealizados = totalExercicios;
    state.metrics.taxaAcerto = totalExercicios > 0 ? (totalAcertos / totalExercicios) * 100 : 0;
    state.metrics.textosCorrigidos = state.sessoesDiscursivas.filter(s => s.status === 'correcao_pronta').length;
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

// FUNÇÃO PARA ATUALIZAR INFORMAÇÕES DO USUÁRIO NA UI (RESTAURADA)
function updateUserInfo(user, userData) {
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) {
        userNameElement.textContent = userData?.nome || user.email;
    }
}

// FUNÇÃO DE CARREGAMENTO DE DADOS (RESTAURADA E CORRIGIDA)
async function carregarDadosIniciais(user) {
    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (!userDocSnap.exists()) { await signOut(auth); return; }
        
        state.userData = userDocSnap.data();

        // Lógica de boas-vindas no primeiro acesso verificado
        if (state.userData.boasVindasEnviado === false) {
             await enviarEmailBoasVindas(state.userData.email, state.userData.nome);
             await updateDoc(userDocRef, { boasVindasEnviado: true });
        }

        // Carrega todos os dados de atividades do usuário
        const collectionsToLoad = {
            savedPlans: query(collection(db, `users/${user.uid}/plans`), orderBy("criadoEm", "desc"), limit(50)),
            sessoesExercicios: query(collection(db, `users/${user.uid}/sessoesExercicios`), orderBy("resumo.criadoEm", "desc"), limit(50)),
            sessoesDiscursivas: query(collection(db, `users/${user.uid}/discursivasCorrigidas`), orderBy("criadoEm", "desc"), limit(50))
        };
        const promises = Object.entries(collectionsToLoad).map(async ([key, q]) => {
            const snapshot = await getDocs(q);
            state[key] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        });
        await Promise.all(promises);

        // Dispara todas as atualizações de UI
        if (document.getElementById('stat-dias-estudo')) {
            calcularMetricas();
        }
        updateUserInfo(user, state.userData);
        controlarAcessoFuncionalidades(state.userData.plano);
        
        // Dispara o evento para que outras páginas saibam que os dados estão prontos
        document.dispatchEvent(new CustomEvent('userDataReady', { detail: state }));

    } catch (error) {
        console.error("Erro ao carregar dados do usuário:", error);
        await signOut(auth);
    }
}

// FUNÇÃO PRINCIPAL DA APLICAÇÃO (COM LÓGICA DE VERIFICAÇÃO ROBUSTA)
function initializeApp() {
    onAuthStateChanged(auth, async (user) => {
        const paginasProtegidas = ['home.html', 'cronograma.html', 'exercicios.html', 'dicas-estrategicas.html', 'meu-perfil.html', 'discursivas.html', 'material-de-estudo.html'];
        const paginaAtual = window.location.pathname.split('/').pop();

        if (user) {
            // A verificação acontece aqui. Se o usuário chegou logado via link de verificação,
            // a sessão já foi atualizada pela página `acao.html` e `user.emailVerified` será true.
            if (user.emailVerified) {
                state.user = user;
                await carregarDadosIniciais(user);
            } else {
                // Se um usuário não verificado tentar acessar uma página protegida, ele é deslogado.
                await signOut(auth);
                if (paginasProtegidas.includes(paginaAtual)) {
                    window.location.href = 'login.html';
                }
            }
        } else {
            // Se não há usuário logado, redireciona para o login se a página for protegida.
            if (paginasProtegidas.includes(paginaAtual)) {
                window.location.href = 'login.html';
            }
        }
    });

    document.getElementById('btn-sair')?.addEventListener('click', () => { signOut(auth).then(() => { window.location.href = 'login.html'; }); });
    
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