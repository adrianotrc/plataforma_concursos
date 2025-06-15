// main-app.js - Versão com criação de documento de usuário e verificação de trial

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, query, orderBy, limit, doc, getDoc, setDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const state = { user: null, metrics: { diasEstudo: 0, exerciciosRealizados: 0, taxaAcerto: 0, textosCorrigidos: 0, }, savedPlans: [], sessoesExercicios: [], sessoesDiscursivas: [], userData: null };


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

function updateUserInfo(user, userData) {
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) {
        userNameElement.textContent = userData?.nome || user.email;
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
    } catch (error) { console.error("Erro ao carregar dados de atividades do Firestore:", error); }
}

function verificarAcessoUsuario() {
    if (!state.userData) return;
    const plano = state.userData.plano;
    if (plano === 'premium') return;
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
        if (user) {
            state.user = user;

            // Tenta buscar o documento principal do usuário
            const userDocRef = doc(db, "users", user.uid);
            let userDocSnap = await getDoc(userDocRef);

            // Se o documento NÃO EXISTE, cria ele com o trial padrão
            if (!userDocSnap.exists()) {
                console.log("Novo usuário ou documento não encontrado. Criando perfil de trial...");
                const dataExpiracao = new Date();
                dataExpiracao.setDate(dataExpiracao.getDate() + 7);
                
                const novoUserData = {
                    email: user.email,
                    nome: user.email.split('@')[0], // Usa o início do email como nome padrão
                    plano: "trial",
                    criadoEm: serverTimestamp(),
                    trialFim: Timestamp.fromDate(dataExpiracao)
                };

                await setDoc(userDocRef, novoUserData);
                userDocSnap = await getDoc(userDocRef); // Re-busca o documento recém-criado
            }
            
            state.userData = userDocSnap.data();
            
            updateUserInfo(user, state.userData);
            verificarAcessoUsuario();
            await carregarDadosDoUsuario(user.uid);

            const btnSair = document.getElementById('btn-sair');
            if (btnSair) {
                btnSair.addEventListener('click', () => signOut(auth));
            }
        } else {
            const paginasProtegidas = ['home.html', 'cronograma.html', 'exercicios.html', 'dicas-estrategicas.html', 'meu-perfil.html'];
            const paginaAtual = window.location.pathname.split('/').pop();
            if (paginasProtegidas.includes(paginaAtual)) {
                window.location.href = 'login.html';
            }
        }
    });

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