// exercicios-page.js - Versão com métricas, revisão de histórico e layout de correção aprimorado

import { auth, db } from './firebase-config.js';
import { collection, addDoc, getDocs, serverTimestamp, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarExercicios } from './api.js';

// --- ELEMENTOS DO DOM ---
const btnAbrirForm = document.getElementById('btn-abrir-form-exercicios');
const formExercicios = document.getElementById('form-exercicios');
const btnFecharForm = document.getElementById('btn-fechar-form-exercicios');
const exerciciosContainer = document.getElementById('exercicios-gerados');
const historicoContainer = document.getElementById('historico-exercicios');

// --- ESTADO LOCAL ---
let currentUser = null;
let sessoesHistorico = []; // Armazena o histórico resumido para exibição
let sessaoAtual = {
    exercicios: [],
    respostas: {}
};

// --- FUNÇÕES DE RENDERIZAÇÃO E UI ---

function exibirSessaoDeExercicios(exercicios) {
    exerciciosContainer.innerHTML = '';
    if (exercicios.length === 0) return;

    let exerciciosHtml = '';
    exercicios.forEach((questao, index) => {
        exerciciosHtml += `
            <div class="questao-bloco" id="questao-${index}">
                <p class="enunciado-questao"><strong>${index + 1}.</strong> ${questao.enunciado}</p>
                <ul class="opcoes-lista">
        `;
        
        // **CORREÇÃO APLICADA AQUI**
        // Removemos o embaralhamento e garantimos a ordem alfabética.
        const opcoesOrdenadas = [...questao.opcoes].sort((a, b) => a.letra.localeCompare(b.letra));

        opcoesOrdenadas.forEach(opcao => {
            exerciciosHtml += `
                <li class="opcao-item">
                    <input type="radio" name="questao-${index}" id="q${index}-${opcao.letra}" value="${opcao.letra}">
                    <label for="q${index}-${opcao.letra}"><strong>${opcao.letra})</strong> ${opcao.texto}</label>
                </li>
            `;
        });
        exerciciosHtml += `</ul><div class="feedback-container" style="display: none;"></div></div>`;
    });

    exerciciosContainer.innerHTML = exerciciosHtml;
    exerciciosContainer.innerHTML += '<button id="btn-corrigir-exercicios" class="btn btn-primary btn-large">Corrigir Exercícios</button>';
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
            feedbackContainer.innerHTML = `
                <p>❌ <strong>Incorreto.</strong></p>
                <p>${respostaTexto}</p>
                <p>A resposta correta é: <strong>${respostaCorreta}</strong></p>
                <hr style="margin: 10px 0;">
                ${explicacaoHtml}
            `;
        }
    });
    return acertos;
}

function renderizarHistorico() {
    if (!historicoContainer) return;
    if (sessoesHistorico.length === 0) {
        historicoContainer.innerHTML = '<div class="card-placeholder"><p>Seu histórico de exercícios aparecerá aqui.</p></div>';
        return;
    }
    historicoContainer.innerHTML = sessoesHistorico.map(sessao => {
        const score = (sessao.resumo.acertos / sessao.resumo.total) * 100;
        let scoreClass = 'bom';
        if (score < 70) scoreClass = 'medio';
        if (score < 50) scoreClass = 'ruim';
        
        return `
            <div class="exercise-history-item">
                <div class="exercise-info">
                    <span class="exercise-subject">${sessao.resumo.materia} - ${sessao.resumo.topico}</span>
                    <span class="exercise-details">${sessao.resumo.total} questões • ${sessao.resumo.acertos} corretas</span>
                </div>
                <div class="exercise-score ${scoreClass}">${score.toFixed(0)}%</div>
                <div class="exercise-time">
                    <p>${sessao.resumo.criadoEm.toDate().toLocaleDateString('pt-BR')}</p>
                    <button class="btn btn-ghost btn-rever-sessao" data-session-id="${sessao.id}">Rever</button>
                </div>
            </div>
        `;
    }).join('');
}

function atualizarMetricasGerais() {
    if (sessoesHistorico.length === 0) return;

    const totalExercicios = sessoesHistorico.reduce((acc, sessao) => acc + sessao.resumo.total, 0);
    const totalAcertos = sessoesHistorico.reduce((acc, sessao) => acc + sessao.resumo.acertos, 0);
    const taxaAcertoGeral = totalExercicios > 0 ? (totalAcertos / totalExercicios) * 100 : 0;

    document.getElementById('stat-exercicios-totais').textContent = totalExercicios;
    document.getElementById('stat-acertos-geral').textContent = `${taxaAcertoGeral.toFixed(0)}%`;
}


// --- LÓGICA DE DADOS E EVENTOS ---

async function salvarSessaoNoFirestore(acertos, total) {
    if (!currentUser) return;
    try {
        const sessaoParaSalvar = {
            resumo: {
                materia: document.getElementById('exercicio-materia').value,
                topico: document.getElementById('exercicio-topico').value,
                acertos: acertos,
                total: total,
                criadoEm: serverTimestamp()
            },
            exercicios: sessaoAtual.exercicios,
            respostasUsuario: sessaoAtual.respostas
        };
        await addDoc(collection(db, `users/${currentUser.uid}/sessoesExercicios`), sessaoParaSalvar);
        await carregarHistoricoDoFirestore(); // Recarrega para incluir a nova sessão
        renderizarHistorico();
        atualizarMetricasGerais();
    } catch (error) {
        console.error("Erro ao salvar sessão de exercícios:", error);
    }
}

async function carregarHistoricoDoFirestore() {
    if (!currentUser) return;
    try {
        const q = query(collection(db, `users/${currentUser.uid}/sessoesExercicios`), orderBy("resumo.criadoEm", "desc"), limit(50));
        const querySnapshot = await getDocs(q);
        sessoesHistorico = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao carregar histórico de exercícios:", error);
    }
}

// Eventos do Formulário
btnAbrirForm?.addEventListener('click', () => formExercicios.style.display = 'block');
btnFecharForm?.addEventListener('click', () => formExercicios.style.display = 'none');

formExercicios?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnGerar = formExercicios.querySelector('button[type="submit"]');
    btnGerar.disabled = true;
    btnGerar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

    const dados = {
        materia: document.getElementById('exercicio-materia').value,
        topico: document.getElementById('exercicio-topico').value,
        quantidade: parseInt(document.getElementById('exercicio-quantidade').value) || 5,
        banca: document.getElementById('exercicio-banca').value
    };

    try {
        const resultado = await gerarExercicios(dados);
        sessaoAtual.exercicios = resultado.exercicios || [];
        sessaoAtual.respostas = {};
        exibirSessaoDeExercicios(sessaoAtual.exercicios);
        formExercicios.style.display = 'none';
    } catch (error) {
        alert('Erro ao gerar exercícios. Tente novamente.');
    } finally {
        btnGerar.disabled = false;
        btnGerar.textContent = 'Gerar';
    }
});

// Delegação de eventos para os containers principais
document.body.addEventListener('click', (e) => {
    // Botão de corrigir
    if (e.target.id === 'btn-corrigir-exercicios') {
        sessaoAtual.exercicios.forEach((_, index) => {
            const respostaSelecionada = document.querySelector(`input[name="questao-${index}"]:checked`);
            if (respostaSelecionada) {
                sessaoAtual.respostas[index] = respostaSelecionada.value;
            }
        });
        const acertos = exibirCorrecao(sessaoAtual.exercicios, sessaoAtual.respostas, exerciciosContainer);
        salvarSessaoNoFirestore(acertos, sessaoAtual.exercicios.length);
        e.target.style.display = 'none';
    }

    // Botão de rever sessão no histórico
    if (e.target.matches('.btn-rever-sessao')) {
        const sessionId = e.target.dataset.sessionId;
        const sessaoSelecionada = sessoesHistorico.find(s => s.id === sessionId);
        if (sessaoSelecionada) {
            exibirSessaoDeExercicios(sessaoSelecionada.exercicios);
            // Um pequeno atraso para garantir que o HTML foi renderizado antes de exibir a correção
            setTimeout(() => {
                exibirCorrecao(sessaoSelecionada.exercicios, sessaoSelecionada.respostasUsuario, exerciciosContainer);
                document.getElementById('btn-corrigir-exercicios')?.remove(); // Remove o botão de corrigir, pois é uma revisão
            }, 100);
        }
    }
});

// --- INICIALIZAÇÃO ---

async function initExerciciosPage() {
    currentUser = auth.currentUser;
    if (currentUser) {
        await carregarHistoricoDoFirestore();
        renderizarHistorico();
        atualizarMetricasGerais();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
        if (user) {
            initExerciciosPage();
        }
    });
});