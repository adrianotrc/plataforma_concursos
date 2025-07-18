// main-app.js - Versão COMPLETA E CORRIGIDA com dispatch de evento

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, query, orderBy, limit, doc, getDoc, setDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const state = { user: null, metrics: { diasEstudo: 0, exerciciosRealizados: 0, taxaAcerto: 0, textosCorrigidos: 0, flashcardsRevisados: 0, flashcardsFaceis:0 }, savedPlans: [], sessoesExercicios: [], sessoesDiscursivas: [], userData: null };

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

function calcularMetricas() {
    const studyDates = new Set();
    // Adiciona verificação para toDate, prevenindo erros se o dado não for um Timestamp
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
    // Flashcards revisados já é incrementado via eventos em tempo real
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
    const elFlash = document.getElementById('stat-flashcards');
    if (elFlash) {
        elFlash.textContent = state.metrics.flashcardsRevisados;
    }
    const elFlashEasy = document.getElementById('stat-flash-easy');
    if(elFlashEasy){
        const percEasy = state.metrics.flashcardsRevisados>0? Math.round(state.metrics.flashcardsFaceis*100/state.metrics.flashcardsRevisados):0;
        elFlashEasy.textContent = `${percEasy}% fácil`;
    }
    const elFlashDetail=document.getElementById('stat-flash-detail');
    if(elFlashDetail){
        elFlashDetail.textContent=`${state.metrics.flashcardsFaceis}/${state.metrics.flashcardsRevisados}`;
    }
}

function updateUserInfo(user, userData) {
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) {
        userNameElement.textContent = userData?.nome || user.email;
    }
}

export async function carregarDadosDoUsuario(userId) {
    try {
        const userDocRef = doc(db, "users", userId);
        const userDocSnap = await getDoc(userDocRef);
        state.userData = userDocSnap.data();

        const collectionsToLoad = {
            savedPlans: query(collection(db, `users/${userId}/plans`), orderBy("criadoEm", "desc"), limit(50)),
            sessoesExercicios: query(collection(db, `users/${userId}/sessoesExercicios`), orderBy("resumo.criadoEm", "desc"), limit(50)),
            sessoesDiscursivas: query(collection(db, `users/${userId}/discursivasCorrigidas`), orderBy("criadoEm", "desc"), limit(50)),
            decksFlashcards: collection(db, `users/${userId}/flashcards`)
        };
        const promises = Object.entries(collectionsToLoad).map(async ([key, q]) => {
            const snapshot = await getDocs(q);
            state[key] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        await Promise.all(promises);

        // calcular métricas flashcards
        const easy = state.decksFlashcards? state.decksFlashcards.reduce((acc,d)=>acc+((d.stats?.q4||0)+(d.stats?.q5||0)),0):0;
        const totalF = state.decksFlashcards? state.decksFlashcards.reduce((acc,d)=>acc+((d.stats?.q0||0)+(d.stats?.q1||0)+(d.stats?.q2||0)+(d.stats?.q3||0)+(d.stats?.q4||0)+(d.stats?.q5||0)),0):0;
        state.metrics.flashcardsFaceis=easy;
        state.metrics.flashcardsRevisados=totalF;
        atualizarMetricasDashboard();

        if (document.getElementById('stat-dias-estudo')) {
            calcularMetricas();
        }
    } catch (error) { console.error("Erro ao carregar dados de atividades do Firestore:", error); }
}

function verificarAcessoUsuario() {
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
        if (user) {
            state.user = user;

            const userDocRef = doc(db, "users", user.uid);
            let userDocSnap = await getDoc(userDocRef);

            if (!userDocSnap.exists()) {
                console.log("Novo usuário ou documento não encontrado. Criando perfil de trial...");
                const dataExpiracao = new Date();
                dataExpiracao.setDate(dataExpiracao.getDate() + 7);
                const novoUserData = {
                    email: user.email,
                    nome: user.email.split('@')[0],
                    plano: "trial",
                    criadoEm: serverTimestamp(),
                    trialFim: Timestamp.fromDate(dataExpiracao)
                };
                await setDoc(userDocRef, novoUserData);
                userDocSnap = await getDoc(userDocRef);
            }
            state.userData = userDocSnap.data();
            
            await carregarDadosDoUsuario(user.uid);
            updateUserInfo(user, state.userData);
            controlarAcessoFuncionalidades(state.userData.plano);
            verificarAcessoUsuario();

            const btnSair = document.getElementById('btn-sair');
            if (btnSair) {
                btnSair.addEventListener('click', () => {
                    signOut(auth).then(() => {
                        window.location.href = 'login.html';
                    }).catch((error) => {
                        console.error('Erro ao tentar fazer logout:', error);
                    });
                });
            }
            
            // AQUI A MUDANÇA: Avisa que os dados estão prontos.
            document.dispatchEvent(new Event('userDataReady'));

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

    // Ouvinte para revisões de flashcards
    document.addEventListener('flashcardReviewed', (e) => {
        state.metrics.flashcardsRevisados++;
        if(e.detail && e.detail.quality>=4) state.metrics.flashcardsFaceis++;
        atualizarMetricasDashboard();
    });
}

document.addEventListener('DOMContentLoaded', initializeApp);