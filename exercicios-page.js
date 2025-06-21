// SUBSTITUA O CONTEÚDO INTEIRO DO ARQUIVO exercicios-page.js

import { auth, db } from './firebase-config.js';
import { collection, serverTimestamp, query, orderBy, onSnapshot, doc, getDoc, updateDoc, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarExerciciosAsync } from './api.js';

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
let ultimoJobIdSolicitado = null; // <-- NOVO: Guarda o ID da última solicitação

// --- FUNÇÕES DE RENDERIZAÇÃO E UI ---

function exibirSessaoDeExercicios(exercicios, jaCorrigido = false, respostasUsuario = {}) {
    exerciciosContainer.innerHTML = '';
    if (!exercicios || exercicios.length === 0) {
        exerciciosContainer.innerHTML = `<div class="card-placeholder"><p>Ainda não há exercícios para esta sessão.</p></div>`;
        exerciciosContainer.style.display = 'block';
        return;
    };
    // Adiciona o cabeçalho com o botão "Fechar"
    let exerciciosHtml = `
        <div class="plano-header" style="margin-bottom: 20px;">
            <h4 style="margin: 0;">Resolva as questões abaixo:</h4>
            <button id="btn-fechar-exercicios" class="btn btn-outline">Fechar</button>
        </div>
    `;
    exercicios.forEach((questao, index) => {
        exerciciosHtml += `<div class="questao-bloco" id="questao-${index}"><p class="enunciado-questao"><strong>${index + 1}.</strong> ${questao.enunciado}</p><ul class="opcoes-lista">`;
        const opcoesOrdenadas = [...questao.opcoes].sort((a, b) => a.letra.localeCompare(b.letra));
        opcoesOrdenadas.forEach(opcao => {
            const isChecked = respostasUsuario && respostasUsuario[index] === opcao.letra ? 'checked' : '';
            const isDisabled = jaCorrigido ? 'disabled' : '';
            exerciciosHtml += `<li class="opcao-item"><input type="radio" name="questao-${index}" id="q${index}-${opcao.letra}" value="${opcao.letra}" ${isChecked} ${isDisabled}><label for="q${index}-${opcao.letra}"><strong>${opcao.letra})</strong> ${opcao.texto}</label></li>`;
        });
        exerciciosHtml += `</ul><div class="feedback-container" style="display: none;"></div></div>`;
    });

    exerciciosContainer.innerHTML = exerciciosHtml;
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
        const respostaUsuario = respostas ? respostas[index] : undefined;
        const explicacaoHtml = `<p><strong>Explicação:</strong> ${questao.explicacao}</p>`;
        feedbackContainer.style.display = 'block';
        if (respostaUsuario === questao.resposta_correta) {
            acertos++;
            feedbackContainer.className = 'feedback-container correto';
            feedbackContainer.innerHTML = `<p>✅ <strong>Correto!</strong></p>${explicacaoHtml}`;
        } else {
            feedbackContainer.className = 'feedback-container incorreto';
            const respostaTexto = respostaUsuario ? `Sua resposta: ${respostaUsuario}` : 'Você não respondeu.';
            feedbackContainer.innerHTML = `<p>❌ <strong>Incorreto.</strong></p><p>${respostaTexto}</p><p>A resposta correta é: <strong>${questao.resposta_correta}</strong></p><hr style="margin: 10px 0;">${explicacaoHtml}`;
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
        const isProcessing = sessao.status === 'processing';
        const hasFailed = sessao.status === 'failed';
        const isCompleted = sessao.status === 'completed';
        const isAttempted = isCompleted && resumo.acertos !== undefined;
        let scoreHtml = '';
        if (isAttempted) {
            const score = resumo.total > 0 ? (resumo.acertos / resumo.total) * 100 : 0;
            let scoreClass = score >= 70 ? 'bom' : (score >= 50 ? 'medio' : 'ruim');
            scoreHtml = `<div class="exercise-score ${scoreClass}">${score.toFixed(0)}%</div>`;
        }
        let statusIcon = '';
        if (isProcessing) statusIcon = '<i class="fas fa-spinner fa-spin"></i>';
        else if (hasFailed) statusIcon = '<i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>';
        let buttonText = 'Rever';
        if (isProcessing) buttonText = 'Gerando...';
        else if (hasFailed) buttonText = 'Falhou';
        else if (isCompleted && !isAttempted) buttonText = 'Iniciar';

        return `
            <div class="exercise-history-item">
                <div class="exercise-info">
                    <span class="exercise-subject">${resumo.materia || 'Sessão'} - ${resumo.topico || 'Geral'} ${statusIcon}</span>
                    <span class="exercise-details">${resumo.total || 0} questões</span>
                </div>
                ${scoreHtml}
                <div class="exercise-time">
                    <p>${resumo.criadoEm?.toDate().toLocaleDateString('pt-BR')}</p>
                    {/* MUDANÇA: btn-ghost para btn-outline */}
                    <button class="btn btn-outline btn-rever-sessao" data-session-id="${sessao.id}" ${isProcessing || hasFailed ? 'disabled' : ''}>${buttonText}</button>
                </div>
            </div>
        `;
    }).join('');
    atualizarMetricasGerais(sessoes);
}

function atualizarMetricasGerais(sessoes) {
    if (!statTotalExercicios || !statAcertoGeral) return;
    const sessoesCompletas = sessoes.filter(s => s.status === 'completed' && s.resumo.acertos !== undefined);
    const totalExercicios = sessoesCompletas.reduce((acc, sessao) => acc + (sessao.resumo?.total || 0), 0);
    const totalAcertos = sessoesCompletas.reduce((acc, sessao) => acc + (sessao.resumo?.acertos || 0), 0);
    const taxaAcertoGeral = totalExercicios > 0 ? (totalAcertos / totalExercicios) * 100 : 0;
    statTotalExercicios.textContent = totalExercicios;
    statAcertoGeral.textContent = `${taxaAcertoGeral.toFixed(0)}%`;
}

// --- LÓGICA DE DADOS E EVENTOS ---

async function salvarCorrecaoNoFirestore(respostasUsuario, acertos) {
    if (!currentUser || !sessaoAberta) return;
    try {
        const sessaoRef = doc(db, `users/${currentUser.uid}/sessoesExercicios`, sessaoAberta);
        await updateDoc(sessaoRef, { 'resumo.acertos': acertos, respostasUsuario });
    } catch (error) {
        console.error("Erro ao salvar correção:", error);
    }
}

// Eventos do Formulário
btnAbrirForm?.addEventListener('click', () => { formExercicios.style.display = 'block'; });
btnFecharForm?.addEventListener('click', () => { formExercicios.style.display = 'none'; });

formExercicios?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const quantidade = parseInt(document.getElementById('exercicio-quantidade').value) || 0;
    if (quantidade < 1 || quantidade > 10) {
        alert('Por favor, insira uma quantidade de exercícios entre 1 e 10.');
        return;
    }

    const btnGerar = formExercicios.querySelector('button[type="submit"]');
    btnGerar.disabled = true;
    btnGerar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Solicitando...';
    
    exerciciosContainer.innerHTML = '';
    exerciciosContainer.style.display = 'none';

    const dados = {
        userId: currentUser.uid,
        materia: document.getElementById('exercicio-materia').value,
        topico: document.getElementById('exercicio-topico').value,
        quantidade: quantidade,
        banca: document.getElementById('exercicio-banca').value
    };

    try {
        const respostaInicial = await gerarExerciciosAsync(dados);
        // GUARDA o ID do job que acabamos de solicitar.
        ultimoJobIdSolicitado = respostaInicial.jobId;
        formExercicios.style.display = 'none';
        formExercicios.reset();
    } catch (error) {
        alert('Erro ao solicitar exercícios. Tente novamente.');
    } finally {
        btnGerar.disabled = false;
        btnGerar.textContent = 'Gerar';
    }
});

// Delegação de eventos
document.body.addEventListener('click', async (e) => {
    const reverBtn = e.target.closest('.btn-rever-sessao');
    const corrigirBtn = e.target.closest('#btn-corrigir-exercicios');

    if (corrigirBtn) {
        corrigirBtn.disabled = true;
        corrigirBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Corrigindo...';
        
        const respostasUsuario = {};
        const sessoesRef = doc(db, `users/${currentUser.uid}/sessoesExercicios`, sessaoAberta);
        try {
            const sessaoSnap = await getDoc(sessoesRef);
            if (!sessaoSnap.exists()) {
                 corrigirBtn.innerHTML = 'Erro'; return;
            }
            const exercicios = sessaoSnap.data().exercicios;
            exercicios.forEach((_, index) => {
                const respostaSelecionada = document.querySelector(`input[name="questao-${index}"]:checked`);
                if (respostaSelecionada) respostasUsuario[index] = respostaSelecionada.value;
            });
            const acertos = exibirCorrecao(exercicios, respostasUsuario, exerciciosContainer);
            await salvarCorrecaoNoFirestore(respostasUsuario, acertos);
            corrigirBtn.remove();
        } catch(error) {
            console.error("Erro no processo de correção:", error);
            alert("Houve um erro ao corrigir. Tente novamente.");
            corrigirBtn.disabled = false;
            corrigirBtn.innerHTML = 'Corrigir Exercícios';
        }
    } else if (reverBtn && !reverBtn.disabled) {
        const sessionId = reverBtn.dataset.sessionId;
        const sessaoRef = doc(db, `users/${currentUser.uid}/sessoesExercicios`, sessionId);
        const sessaoSnap = await getDoc(sessaoRef);
        if (sessaoSnap.exists()) {
            const sessaoData = sessaoSnap.data();
            sessaoAberta = sessionId;
            const jaCorrigido = sessaoData.resumo && sessaoData.resumo.acertos !== undefined;
            exibirSessaoDeExercicios(sessaoData.exercicios, jaCorrigido, sessaoData.respostasUsuario);
        }
    }
    if (e.target.id === 'btn-fechar-exercicios') {
        exerciciosContainer.innerHTML = '';
        exerciciosContainer.style.display = 'none';
        sessaoAberta = null;
    }
});

// --- INICIALIZAÇÃO ---
function ouvirHistoricoDeExercicios() {
    if (unsubHistorico) unsubHistorico();
    const q = query(collection(db, `users/${currentUser.uid}/sessoesExercicios`), orderBy("resumo.criadoEm", "desc"), limit(50));
    unsubHistorico = onSnapshot(q, (querySnapshot) => {
        const sessoes = [];
        // APRIMORAMENTO: Verifica as mudanças para encontrar a sessão recém-completada
        querySnapshot.docChanges().forEach((change) => {
            const sessao = { id: change.doc.id, ...change.doc.data() };
            // Se uma sessão foi modificada (de 'processing' para 'completed')
            // E é a que acabamos de pedir
            if (change.type === "modified" && sessao.status === 'completed' && sessao.jobId === ultimoJobIdSolicitado) {
                // Abre a sessão automaticamente
                sessaoAberta = sessao.id;
                exibirSessaoDeExercicios(sessao.exercicios);
                ultimoJobIdSolicitado = null; // Reseta o ID para não abrir de novo
            }
        });

        // Atualiza a lista completa para o histórico
        querySnapshot.forEach(doc => {
            sessoes.push({ id: doc.id, ...doc.data() });
        });
        
        renderizarHistorico(sessoes);
    }, (error) => {
        console.error("Erro ao carregar o histórico de exercícios:", error);
        historicoContainer.innerHTML = '<div class="card-placeholder"><p>Não foi possível carregar o histórico. Tente recarregar a página.</p></div>';
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