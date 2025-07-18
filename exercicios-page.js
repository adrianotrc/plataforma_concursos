// exercicios-page.js

import { auth, db } from './firebase-config.js';
import { collection, serverTimestamp, query, orderBy, onSnapshot, doc, getDoc, updateDoc, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarExerciciosAsync, getUsageLimits, avaliarQuestao } from './api.js';

// --- ELEMENTOS DO DOM ---
const btnAbrirForm = document.getElementById('btn-abrir-form-exercicios');
const formExercicios = document.getElementById('form-exercicios');
const btnFecharForm = document.getElementById('btn-fechar-form-exercicios');
const exerciciosContainer = document.getElementById('exercicios-gerados');
const historicoContainer = document.getElementById('historico-exercicios');
const statTotalExercicios = document.getElementById('stat-exercicios-totais');
const statAcertoGeral = document.getElementById('stat-acertos-geral');
const usageCounterDiv = document.getElementById('usage-counter');

// --- ESTADO LOCAL ---
let currentUser = null;
let unsubHistorico = null;
let sessaoAberta = null;
let ultimoJobIdSolicitado = null;

// --- FUNÇÕES DE UI ---

function showToast(message, type = 'success', duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `feedback-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => document.body.removeChild(toast), 500);
    }, duration);
}

function exibirSessaoDeExercicios(exercicios, jaCorrigido = false, respostasUsuario = {}) {
    exerciciosContainer.innerHTML = '';
    if (!exercicios || exercicios.length === 0) {
        exerciciosContainer.innerHTML = `<div class="card-placeholder"><p>Ainda não há exercícios para esta sessão.</p></div>`;
        exerciciosContainer.style.display = 'block';
        return;
    };
    let exerciciosHtml = `
        <div class="plano-header" style="margin-bottom: 20px;">
            <h4 style="margin: 0;">Resolva as questões abaixo:</h4>
            <button id="btn-fechar-exercicios" class="btn btn-outline">Fechar</button>
        </div>
    `;
    exercicios.forEach((questao, index) => {
        // Usa o ID da questão que agora vem do backend
        exerciciosHtml += `<div class="questao-bloco" id="questao-${index}" data-question-id="${questao.id || ''}">
                            <p class="enunciado-questao"><strong>${index + 1}.</strong> ${questao.enunciado}</p>
                            <ul class="opcoes-lista">`;
        
        if (questao.tipo_questao === 'certo_errado') {
             const opcoes = [{letra: 'Certo', texto: 'Certo'}, {letra: 'Errado', texto: 'Errado'}];
             opcoes.forEach(opcao => {
                const isChecked = respostasUsuario && respostasUsuario[index] === opcao.letra ? 'checked' : '';
                const isDisabled = jaCorrigido ? 'disabled' : '';
                exerciciosHtml += `<li class="opcao-item"><input type="radio" name="questao-${index}" id="q${index}-${opcao.letra}" value="${opcao.letra}" ${isChecked} ${isDisabled}><label for="q${index}-${opcao.letra}">${opcao.texto}</label></li>`;
             });
        } else {
            const opcoesOrdenadas = [...(questao.opcoes || [])].sort((a, b) => a.letra.localeCompare(b.letra));
            opcoesOrdenadas.forEach(opcao => {
                const isChecked = respostasUsuario && respostasUsuario[index] === opcao.letra ? 'checked' : '';
                const isDisabled = jaCorrigido ? 'disabled' : '';
                exerciciosHtml += `<li class="opcao-item"><input type="radio" name="questao-${index}" id="q${index}-${opcao.letra}" value="${opcao.letra}" ${isChecked} ${isDisabled}><label for="q${index}-${opcao.letra}"><strong>${opcao.letra})</strong> ${opcao.texto}</label></li>`;
            });
        }
        
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
        
        // **CORREÇÃO APLICADA AQUI**
        // 1. Garante que a explicação seja sempre um texto, mesmo que a IA retorne um objeto.
        let textoExplicacao = questao.explicacao;
        if (typeof textoExplicacao === 'object' && textoExplicacao !== null) {
            // Tenta pegar a primeira propriedade do objeto, que geralmente é o texto.
            textoExplicacao = Object.values(textoExplicacao)[0] || "Não foi possível carregar a explicação.";
        }

        // 2. Adiciona o espaçamento solicitado (margin-top) na div dos botões.
        const feedbackButtonsHtml = `
            <div class="user-feedback-actions" style="margin-top: 16px;">
                <span>Esta questão foi útil?</span>
                <button class="btn-feedback" data-evaluation="positiva" data-question-id="${questao.id}"><i class="fas fa-thumbs-up"></i></button>
                <button class="btn-feedback" data-evaluation="negativa" data-question-id="${questao.id}"><i class="fas fa-thumbs-down"></i></button>
            </div>
        `;

        const explicacaoHtml = `<p><strong>Explicação:</strong> ${textoExplicacao}</p>${feedbackButtonsHtml}`;

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
                    <button class="btn btn-primary btn-rever-sessao" data-session-id="${sessao.id}" ${isProcessing || hasFailed ? 'disabled' : ''}>${buttonText}</button>
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

async function renderUsageInfo() {
    if (!currentUser || !usageCounterDiv) return;
    try {
        const data = await getUsageLimits(currentUser.uid);
        const uso = data.usage.exercicios || 0;
        const limite = data.limits.exercicios || 0;
        const restantes = limite - uso;
        const plano = data.plan;
        let mensagem = '';
        if (plano === 'trial') {
            mensagem = `Você ainda pode gerar ${restantes} de ${limite} simulados de exercícios durante o seu período de teste.`;
        } else {
            mensagem = `Hoje, você ainda pode gerar ${restantes} de ${limite} simulados de exercícios.`;
        }
        usageCounterDiv.textContent = mensagem;
        usageCounterDiv.style.display = 'block';
        if(btnAbrirForm) {
            btnAbrirForm.disabled = restantes <= 0;
        }
    } catch (error) {
        console.error("Erro ao buscar limites de uso para exercícios:", error);
        usageCounterDiv.style.display = 'none';
    }
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

btnAbrirForm?.addEventListener('click', () => { formExercicios.style.display = 'block'; });
btnFecharForm?.addEventListener('click', () => { formExercicios.style.display = 'none'; });

formExercicios?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const quantidade = parseInt(document.getElementById('exercicio-quantidade').value) || 0;
    if (quantidade < 1 || quantidade > 10) {
        alert('Por favor, insira uma quantidade de exercícios entre 1 e 10.');
        return;
    }
    
    const dados = {
        userId: currentUser.uid,
        materia: document.getElementById('exercicio-materia').value,
        topico: document.getElementById('exercicio-topico').value,
        quantidade: quantidade,
        banca: document.getElementById('exercicio-banca').value,
        tipo_questao: document.getElementById('exercicio-tipo').value
    };

    // Usa o novo sistema de processamento
    if (!window.processingUI) {
        showToast("Erro: Sistema de processamento não disponível.", "error");
        return;
    }
    window.processingUI.startProcessingWithConfirmation({
        confirmationTitle: 'Gerar Exercícios Personalizados',
        confirmationMessage: 'Nossa IA vai criar exercícios personalizados baseados nos seus critérios. Este processo pode demorar 30-60 segundos. Deseja continuar?',
        confirmationIcon: 'fas fa-question-circle',
        processingTitle: 'Criando seus Exercícios...',
        processingMessage: 'Nossa IA está analisando o banco de dados e criando questões relevantes para você.',
        estimatedTime: '30-60 segundos',
        resultAreaSelector: '#historico-exercicios',
        onConfirm: async () => {
            try {
                // Limpa o container e esconde o formulário
                exerciciosContainer.innerHTML = '';
                exerciciosContainer.style.display = 'none';
                formExercicios.style.display = 'none';
                
                // Envia a solicitação
                const resposta = await gerarExerciciosAsync(dados);
                ultimoJobIdSolicitado = resposta.jobId;
                return resposta;
            } catch (error) {
                // Mostra erro e reabilita o formulário
                showToast(error.message, 'error');
                formExercicios.style.display = 'block';
                throw error; // Re-lança o erro para ser tratado pelo sistema
            }
        },
        onCancel: () => {
            // Usuário cancelou, não faz nada
        },
        onComplete: (result) => {
            // Limpa o formulário e atualiza contadores
            formExercicios.reset();
            renderUsageInfo();
            
            // Mostra mensagem de sucesso
            showToast("✅ Exercícios solicitados com sucesso! Você será notificado quando estiverem prontos.", 'success');
        }
    });
});

document.body.addEventListener('click', async (e) => {
    const feedbackBtn = e.target.closest('.btn-feedback');
    if (feedbackBtn) {
        feedbackBtn.disabled = true;
        const parentActions = feedbackBtn.parentElement;
        parentActions.querySelectorAll('.btn-feedback').forEach(btn => btn.disabled = true);
        
        const questionId = feedbackBtn.dataset.questionId;
        const evaluation = feedbackBtn.dataset.evaluation;

        try {
            await avaliarQuestao(questionId, evaluation);
            parentActions.innerHTML = "<span>Obrigado pelo feedback!</span>";
        } catch (error) {
            console.error("Erro ao enviar avaliação:", error);
            parentActions.innerHTML = "<span>Erro ao enviar.</span>";
        }
        return; // Impede que outros handlers sejam acionados
    }
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

function ouvirHistoricoDeExercicios() {
    if (unsubHistorico) unsubHistorico();
    const q = query(collection(db, `users/${currentUser.uid}/sessoesExercicios`), orderBy("resumo.criadoEm", "desc"), limit(50));
    unsubHistorico = onSnapshot(q, (querySnapshot) => {
        const sessoes = [];
        querySnapshot.docChanges().forEach((change) => {
            const sessao = { id: change.doc.id, ...change.doc.data() };
            if (change.type === "modified" && sessao.status === 'completed' && sessao.jobId === ultimoJobIdSolicitado) {
                sessaoAberta = sessao.id;
                exibirSessaoDeExercicios(sessao.exercicios);
                // Feedback para o usuário
                showToast('✅ Seus exercícios estão prontos!', 'success', 7000);
                if (window.processingUI) {
                    window.processingUI.removeResultAreaHighlight('#historico-exercicios');
                }
                ultimoJobIdSolicitado = null;
            }
        });
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
        renderUsageInfo();
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