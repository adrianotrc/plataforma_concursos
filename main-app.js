// main-app.js - Versão com correção definitiva de sincronização

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, query, orderBy, limit, doc, getDoc, setDoc, serverTimestamp, Timestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { enviarEmailBoasVindas } from './api.js';

export const state = { user: null, metrics: { diasEstudo: 0, exerciciosRealizados: 0, taxaAcerto: 0, textosCorrigidos: 0, }, savedPlans: [], sessoesExercicios: [], sessoesDiscursivas: [], userData: null };

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
            if (funcionalidadesPermitidas.includes(func)) {
                elemento.classList.remove('disabled');
            } else {
                elemento.classList.add('disabled');
            }
        }
    });
}

// ... (as funções de métricas permanecem as mesmas)
function calcularMetricas() {
    const studyDates = new Set();
    [...state.savedPlans, ...state.sessoesExercicios, ...state.sessoesDiscursivas].forEach(item => {
        const dateSource = item.criadoEm || item.resumo?.criadoEm;
        if (dateSource && typeof dateSource.toDate === 'function') {
            studyDates.add(dateSource.toDate().toISOString().split('T')[0]);
        }
    });
    state.metrics.diasEstudo = studyDates.size;
    const totalExercicios = state.sessoesExercicios.reduce((acc, sessao) => acc + (sessao.resumo?.total || 0), 0);
    const totalAcertos = state.sessoesExercicios.reduce((acc, sessao) => acc + (sessao.resumo?.acertos || 0), 0);
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

function updateUserInfo(user, userData) {
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) {
        userNameElement.textContent = userData?.nome || user.email;
    }
}

async function carregarDadosDoUsuario(userId) {
    try {
        const userDocRef = doc(db, "users", userId);
        const userDocSnap = await getDoc(userDocRef);
        
        if (!userDocSnap.exists()) {
            console.error("Documento do usuário não encontrado. Deslogando.");
            signOut(auth);
            return;
        }

        state.userData = userDocSnap.data();

        if (state.userData.boasVindasEnviado === false) {
             console.log("Detectado primeiro acesso verificado. Enviando e-mail de boas-vindas...");
             await enviarEmailBoasVindas(state.userData.email, state.userData.nome);
             await updateDoc(userDocRef, { boasVindasEnviado: true });
        }

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
    } catch (error) { console.error("Erro ao carregar dados do usuário:", error); }
}

function verificarAcessoUsuario() {
    // ... (esta função permanece a mesma)
    if (!state.userData) return;
    const plano = state.userData.plano;
    if (plano === 'premium' || plano === 'anual' || plano === 'intermediario' || plano === 'basico') return;
    if (plano === 'trial' && state.userData.trialFim) {
        const dataFimTrial = state.userData.trialFim.toDate();
        if (new Date() > dataFimTrial) {
            alert("Seu período de teste de 7 dias acabou. Para continuar usando todas as funcionalidades da IAprovas, por favor, escolha um de nossos planos.");
            window.location.href = 'index.html#planos';
        }
    }
}

function initializeApp() {
    onAuthStateChanged(auth, async (user) => {
        const paginasProtegidas = ['home.html', 'cronograma.html', 'exercicios.html', 'dicas-estrategicas.html', 'meu-perfil.html', 'discursivas.html', 'material-de-estudo.html'];
        const paginaAtual = window.location.pathname.split('/').pop();

        if (user) {
            // ===== CORREÇÃO DEFINITIVA =====
            // Força a atualização do estado do usuário ANTES de qualquer verificação.
            await user.reload();
            // Após o reload, pegamos o estado mais fresco do usuário.
            const freshUser = auth.currentUser;

            if (freshUser && freshUser.emailVerified) {
                // Se o usuário está verificado, continue com o carregamento do app.
                state.user = freshUser;
                await carregarDadosDoUsuario(freshUser.uid);
                updateUserInfo(freshUser, state.userData);
                controlarAcessoFuncionalidades(state.userData.plano);
                verificarAcessoUsuario();

                const btnSair = document.getElementById('btn-sair');
                if (btnSair) {
                    btnSair.addEventListener('click', () => { signOut(auth).then(() => { window.location.href = 'login.html'; }); });
                }
                
                document.dispatchEvent(new Event('userDataReady'));

            } else {
                // Se mesmo após o reload o usuário não está verificado, desloga e redireciona.
                await signOut(auth);
                if (paginasProtegidas.includes(paginaAtual)) {
                    window.location.href = 'login.html';
                }
            }
        } else {
            // Se não há usuário, redireciona para o login se a página for protegida.
            if (paginasProtegidas.includes(paginaAtual)) {
                window.location.href = 'login.html';
            }
        }
    });

    // ... (o código da sidebar permanece o mesmo)
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