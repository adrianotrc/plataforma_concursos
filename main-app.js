// main-app.js - Versão FINAL, COMPLETA e CORRIGIDA

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, query, orderBy, limit, doc, getDoc, updateDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { enviarEmailBoasVindas } from './api.js';

// ESTADO GLOBAL DA APLICAÇÃO
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

// FUNÇÃO RESTAURADA: Controla quais links da barra lateral estão ativos
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

// FUNÇÃO RESTAURADA: Calcula as métricas para o dashboard
function calcularMetricas() {
    // Dias de Estudo
    const studyDates = new Set();
    [...state.savedPlans, ...state.sessoesExercicios, ...state.sessoesDiscursivas].forEach(item => {
        const dateSource = item.criadoEm || item.resumo?.criadoEm;
        if (dateSource && typeof dateSource.toDate === 'function') {
            studyDates.add(dateSource.toDate().toISOString().split('T')[0]);
        }
    });
    state.metrics.diasEstudo = studyDates.size;

    // Exercícios e Acertos
    const sessoesCompletas = state.sessoesExercicios.filter(s => s.status === 'completed' && s.resumo.acertos !== undefined);
    const totalExercicios = sessoesCompletas.reduce((acc, sessao) => acc + (sessao.resumo?.total || 0), 0);
    const totalAcertos = sessoesCompletas.reduce((acc, sessao) => acc + (sessao.resumo?.acertos || 0), 0);
    state.metrics.exerciciosRealizados = totalExercicios;
    state.metrics.taxaAcerto = totalExercicios > 0 ? (totalAcertos / totalExercicios) * 100 : 0;
    
    // Redações
    state.metrics.textosCorrigidos = state.sessoesDiscursivas.filter(s => s.status === 'correcao_pronta').length;
    
    atualizarMetricasDashboard();
}

// FUNÇÃO RESTAURADA: Atualiza os números no painel do dashboard
function atualizarMetricasDashboard() {
    const elDiasEstudo = document.getElementById('stat-dias-estudo');
    if (elDiasEstudo) {
        elDiasEstudo.textContent = state.metrics.diasEstudo;
        document.getElementById('stat-exercicios').textContent = state.metrics.exerciciosRealizados;
        document.getElementById('stat-acertos').textContent = `${state.metrics.taxaAcerto.toFixed(0)}%`;
        document.getElementById('stat-redacoes').textContent = state.metrics.textosCorrigidos;
    }
}

// FUNÇÃO RESTAURADA: Atualiza o nome do usuário na interface
function updateUserInfo(user, userData) {
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) {
        userNameElement.textContent = userData?.nome || user.email;
    }
}

// FUNÇÃO CORRIGIDA: Carrega todos os dados do usuário, incluindo a lógica de boas-vindas
async function carregarDadosIniciais(user) {
    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (!userDocSnap.exists()) {
            console.error("Usuário autenticado, mas sem registro no Firestore. Deslogando.");
            await signOut(auth);
            return;
        }

        state.userData = userDocSnap.data();

        // Lógica de boas-vindas no primeiro acesso verificado
        if (state.userData.boasVindasEnviado === false) {
             console.log("Detectado primeiro acesso verificado. Enviando e-mail de boas-vindas...");
             await enviarEmailBoasVindas(state.userData.email, state.userData.nome);
             await updateDoc(userDocRef, { boasVindasEnviado: true });
        }

        // Carrega dados das outras coleções
        const collectionsToLoad = {
            savedPlans: query(collection(db, `users/${user.uid}/plans`), orderBy("criadoEm", "desc"), limit(50)),
            sessoesExercicios: query(collection(db, `users/${user.uid}/sessoesExercicios`), orderBy("resumo.criadoEm", "desc"), limit(50)),
            sessoesDiscursivas: query(collection(db, `users/${user.uid}/discursivasCorrigidas`), orderBy("criadoEm", "desc"), limit(50))
        };
        const promises = Object.entries(collectionsToLoad).map(async ([key, q]) => {
            const snapshot = await getDocs(q);
            state[key] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        await Promise.all(promises);

        // Dispara todos os cálculos e atualizações de UI
        if (document.getElementById('stat-dias-estudo')) {
            calcularMetricas();
        }
        updateUserInfo(user, state.userData);
        controlarAcessoFuncionalidades(state.userData.plano);
        verificarAcessoUsuario();
        document.dispatchEvent(new CustomEvent('userDataReady', { detail: state }));

    } catch (error) {
        console.error("Erro crítico ao carregar dados do usuário:", error);
        await signOut(auth);
    }
}

// FUNÇÃO RESTAURADA: Verifica o status do plano trial
function verificarAcessoUsuario() {
    if (!state.userData) return;
    const plano = state.userData.plano;
    if (plano !== 'trial' || !state.userData.trialFim) return;

    const dataFimTrial = state.userData.trialFim.toDate();
    if (new Date() > dataFimTrial) {
        alert("Seu período de teste de 7 dias acabou. Para continuar usando todas as funcionalidades da IAprovas, por favor, escolha um de nossos planos.");
        window.location.href = 'index.html#planos';
    }
}

// FUNÇÃO PRINCIPAL: Gerencia o estado de autenticação e inicializa o app
function initializeApp() {
    onAuthStateChanged(auth, async (user) => {
        const paginasProtegidas = ['home.html', 'cronograma.html', 'exercicios.html', 'dicas-estrategicas.html', 'meu-perfil.html', 'discursivas.html', 'material-de-estudo.html'];
        const paginaAtual = window.location.pathname.split('/').pop();

        if (user) {
            await user.reload(); // Força a sincronização do status de verificação
            const freshUser = auth.currentUser;

            if (freshUser && freshUser.emailVerified) {
                state.user = freshUser;
                await carregarDadosIniciais(freshUser); // Carrega todos os dados do usuário

                const btnSair = document.getElementById('btn-sair');
                if (btnSair) {
                    btnSair.addEventListener('click', () => { signOut(auth).then(() => { window.location.href = 'login.html'; }); });
                }
            } else {
                // Se não verificado, desloga e redireciona
                await signOut(auth);
                if (paginasProtegidas.includes(paginaAtual)) {
                    window.location.href = 'login.html';
                }
            }
        } else {
            // Se não há usuário, redireciona
            if (paginasProtegidas.includes(paginaAtual)) {
                window.location.href = 'login.html';
            }
        }
    });

    // Lógica da sidebar
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