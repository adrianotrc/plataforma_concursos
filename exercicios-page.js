// SUBSTITUA O CONTEÚDO INTEIRO DO ARQUIVO exercicios-page.js

import { auth, db } from './firebase-config.js';
// CORREÇÃO 1: Adiciona 'limit' à lista de importações do Firestore.
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, getDoc, updateDoc, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// CORREÇÃO 2: Importa a função da API correta (gerarExerciciosAsync foi um nome temporário)
import { gerarExercicios } from './api.js';

// --- ELEMENTOS DO DOM ---
const btnAbrirForm = document.getElementById('btn-abrir-form-exercicios');
const formExercicios = document.getElementById('form-exercicios');
const btnFecharForm = document.getElementById('btn-fechar-form-exercicios');
const exerciciosContainer = document.getElementById('exercicios-gerados');
const historicoContainer = document.getElementById('historico-exercicios');
const statTotalExercicios = document.getElementById('stat-exercicios-totais');
const statAcertoGeral = document.getElementById('stat-acertos-geral');

// --- ESTADO LOCAL ---
let currentUser = null;
let unsubHistorico = null;
let sessaoAberta = null;

// --- FUNÇÕES DE RENDERIZAÇÃO E UI ---

function exibirSessaoDeExercicios(exercicios, jaCorrigido = false, respostasUsuario = {}) {
    exerciciosContainer.innerHTML = '';
    if (!exercicios || exercicios.length === 0) return;

    let exerciciosHtml = '';
    exercicios.forEach((questao, index) => {
        exerciciosHtml += `<div class="questao-bloco" id="questao-${index}"><p class="enunciado-questao"><strong>${index + 1}.</strong> ${questao.enunciado}</p><ul class="opcoes-lista">`;
        const opcoesOrdenadas = [...questao.opcoes].sort((a, b) => a.letra.localeCompare(b.letra));
        opcoesOrdenadas.forEach(opcao => {
            const isChecked = respostasUsuario[index] === opcao.letra ? 'checked' : '';
            const isDisabled = jaCorrigido ? 'disabled' : '';
            exerciciosHtml += `<li class="opcao-item"><input type="radio" name="questao-${index}" id="q${index}-${opcao.letra}" value="${opcao.letra}" ${isChecked} ${isDisabled}><label for="q${index}-${opcao.letra}"><strong>${opcao.letra})</strong> ${opcao.texto}</label></li>`;
        });
        exerciciosHtml += `</ul><div class="feedback-container" style="display: none;"></div></div>`;
    });

    exerciciosContainer.innerHTML = exerciciosHtml;
    exerciciosContainer.innerHTML += `<small class="ai-disclaimer"><i class="fas fa-robot"></i> Conteúdo gerado por inteligência artificial. Revise sempre.</small>`;
    if (!jaCorrigido) {
        exerciciosContainer.innerHTML += '<button id="btn-corrigir-exercicios" class="btn btn-primary btn-large">Corrigir Exercícios</button>';
    } else {
        exibirCorrecao(exercicios, respostasUsuario, exerciciosContainer);
    }
    exerciciosContainer.style.display = 'block';
    exerciciosContainer.scrollIntoView({ behavior: 'smooth' });
}

function exibirCorrecao(exercicios, respostas, container) {
    let acertos = 0;
    exercicios.forEach((questao, index) => {
        const questaoContainer = container.querySelector(`#questao-${index}`);
        if (!questaoContainer) return;
        const feedbackContainer = questaoContainer.querySelector('.feedback-container');
        const respostaUsuario = respostas[index];
        const respostaCorreta = questao.resposta_correta;
        const explicacaoHtml = `<p><strong>Explicação:</strong> ${questao.explicacao}</p>`;
        feedbackContainer.style.display = 'block';
        if (respostaUsuario === respostaCorreta) {
            acertos++;
            feedbackContainer.className = 'feedback-container correto';
            feedbackContainer.innerHTML = `<p>✅ <strong>Correto!</strong></p>${explicacaoHtml}`;
        } else {
            feedbackContainer.className = 'feedback-container incorreto';
            const respostaTexto = respostaUsuario ? `Sua resposta: ${respostaUsuario}` : 'Você não respondeu.';
            feedbackContainer.innerHTML = `<p>❌ <strong>Incorreto.</strong></p><p>${respostaTexto}</p><p>A resposta correta é: <strong>${respostaCorreta}</strong></p><hr style="margin: 10px 0;">${explicacaoHtml}`;
        }
    });
    return acertos;
}

function renderizarHistorico(sessoes) {
    if (!historicoContainer) return;
    if (sessoes.length === 0) {
        historicoContainer.innerHTML = '<div class="card-placeholder"><p>Seu histórico de exercícios aparecerá aqui.</p></div>';
        return;
    }
    historicoContainer.innerHTML = sessoes.map(sessao => {
        const resumo = sessao.resumo || {};
        const score = resumo.total > 0 ? (resumo.acertos / resumo.total) * 100 : 0;
        let scoreClass = 'bom';
        if (score < 70) scoreClass = 'medio';
        if (score < 50) scoreClass = 'ruim';
        return `
            <div class="exercise-history-item">
                <div class="exercise-info">
                    <span class="exercise-subject">${resumo.materia || 'Sessão'} - ${resumo.topico || 'Geral'}</span>
                    <span class="exercise-details">${resumo.total || 0} questões</span>
                </div>
                ${resumo.acertos !== undefined ? `<div class="exercise-score ${scoreClass}">${score.toFixed(0)}%</div>` : ''}
                <div class="exercise-time">
                    <p>${resumo.criadoEm?.toDate().toLocaleDateString('pt-BR')}</p>
                    <button class="btn btn-ghost btn-rever-sessao" data-session-id="${sessao.id}">Rever</button>
                </div>
            </div>
        `;
    }).join('');
    atualizarMetricasGerais(sessoes);
}

function atualizarMetricasGerais(sessoes) {
    if (!statTotalExercicios || !statAcertoGeral) return;
    const totalExercicios = sessoes.reduce((acc, sessao) => acc + (sessao.resumo?.total || 0), 0);
    const totalAcertos = sessoes.reduce((acc, sessao) => acc + (sessao.resumo?.acertos || 0), 0);
    const taxaAcertoGeral = totalExercicios > 0 ? (totalAcertos / totalExercicios) * 100 : 0;
    statTotalExercicios.textContent = totalExercicios;
    statAcertoGeral.textContent = `${taxaAcertoGeral.toFixed(0)}%`;
}

// --- LÓGICA DE DADOS E EVENTOS ---

async function salvarSessaoNoFirestore(exerciciosGerados, dadosForm) {
    if (!currentUser) return;
    try {
        const sessaoParaSalvar = {
            exercicios: exerciciosGerados,
            resumo: {
                materia: dadosForm.materia,
                topico: dadosForm.topico,
                total: exerciciosGerados.length,
                criadoEm: serverTimestamp()
            },
        };
        await addDoc(collection(db, `users/${currentUser.uid}/sessoesExercicios`), sessaoParaSalvar);
    } catch (error) {
        console.error("Erro ao salvar sessão de exercícios:", error);
    }
}

// Eventos do Formulário
btnAbrirForm?.addEventListener('click', () => { formExercicios.style.display = 'block'; });
btnFecharForm?.addEventListener('click', () => { formExercicios.style.display = 'none'; });

formExercicios?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnGerar = formExercicios.querySelector('button[type="submit"]');
    btnGerar.disabled = true;
    btnGerar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
    // CORREÇÃO 3: Adiciona o container de feedback para o usuário.
    exerciciosContainer.innerHTML = `<div class="card-placeholder"><p><i class="fas fa-spinner fa-spin"></i> A IA está gerando seus exercícios... Isso pode levar um momento.</p></div>`;
    exerciciosContainer.style.display = 'block';
    
    const dados = {
        materia: document.getElementById('exercicio-materia').value,
        topico: document.getElementById('exercicio-topico').value,
        quantidade: parseInt(document.getElementById('exercicio-quantidade').value) || 5,
        banca: document.getElementById('exercicio-banca').value
    };

    try {
        const resultado = await gerarExercicios(dados);
        sessaoAberta = null; // Limpa sessão aberta anterior
        exibirSessaoDeExercicios(resultado.exercicios);
        await salvarSessaoNoFirestore(resultado.exercicios, dados);
    } catch (error) {
        alert('Erro ao gerar exercícios. Tente novamente.');
        exerciciosContainer.innerHTML = '<div class="card-placeholder"><p>Ocorreu um erro. Por favor, tente gerar novamente.</p></div>';
    } finally {
        btnGerar.disabled = false;
        btnGerar.textContent = 'Gerar';
        formExercicios.style.display = 'none';
        formExercicios.reset();
    }
});

// Delegação de eventos
document.body.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-corrigir-exercicios') {
        const respostasUsuario = {};
        const sessoesRef = doc(db, `users/${currentUser.uid}/sessoesExercicios`, sessaoAberta);
        const sessaoSnap = await getDoc(sessoesRef);
        const exercicios = sessaoSnap.data().exercicios;

        exercicios.forEach((_, index) => {
            const respostaSelecionada = document.querySelector(`input[name="questao-${index}"]:checked`);
            if (respostaSelecionada) respostasUsuario[index] = respostaSelecionada.value;
        });
        const acertos = exibirCorrecao(exercicios, respostasUsuario, exerciciosContainer);
        // Atualiza o documento no Firestore com as respostas e acertos
        await updateDoc(sessoesRef, { 'resumo.acertos': acertos, respostasUsuario });
        e.target.style.display = 'none';
    }

    if (e.target.matches('.btn-rever-sessao')) {
        const sessionId = e.target.dataset.sessionId;
        const sessaoRef = doc(db, `users/${currentUser.uid}/sessoesExercicios`, sessionId);
        const sessaoSnap = await getDoc(sessaoRef);
        if (sessaoSnap.exists()) {
            const sessaoData = sessaoSnap.data();
            sessaoAberta = sessionId;
            const jaCorrigido = sessaoData.resumo && sessaoData.resumo.acertos !== undefined;
            exibirSessaoDeExercicios(sessaoData.exercicios, jaCorrigido, sessaoData.respostasUsuario);
        }
    }
});

// --- INICIALIZAÇÃO ---

function ouvirHistoricoDeExercicios() {
    if (unsubHistorico) unsubHistorico();
    // A linha abaixo causava o erro. 'limit' foi importado e agora a função deve funcionar.
    const q = query(collection(db, `users/${currentUser.uid}/sessoesExercicios`), orderBy("resumo.criadoEm", "desc"), limit(50));
    unsubHistorico = onSnapshot(q, (querySnapshot) => {
        const sessoes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarHistorico(sessoes);
    });
}

function initExerciciosPage() {
    currentUser = auth.currentUser;
    if (currentUser) {
        ouvirHistoricoDeExercicios();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
        if (user) {
            initExerciciosPage();
        } else if (unsubHistorico) {
            unsubHistorico();
        }
    });
});