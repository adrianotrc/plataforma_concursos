// SUBSTITUA O CONTEÚDO INTEIRO DO ARQUIVO discursivas-page.js

import { auth, db } from './firebase-config.js';
import { collection, onSnapshot, query, orderBy, limit, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarEnunciadoDiscursivaAsync, corrigirDiscursivaAsync, getUsageLimits } from './api.js';
import { state } from './main-app.js';

// --- ELEMENTOS DO DOM ---
const btnAbrirForm = document.getElementById('btn-abrir-form-discursiva');
const containerGerador = document.getElementById('container-gerador-enunciado');
const btnCancelarGeracao = document.getElementById('btn-cancelar-geracao');
const formGerarEnunciado = document.getElementById('form-gerar-enunciado');
const enunciadoContainer = document.getElementById('enunciado-container');
const areaResposta = document.getElementById('area-resposta');
const respostaTextarea = document.getElementById('resposta-discursiva');
const btnCorrigir = document.getElementById('btn-corrigir-texto');
const correcaoContainer = document.getElementById('correcao-container');
const historicoContainer = document.getElementById('historico-discursivas');
const statTotal = document.getElementById('stat-discursivas-total');
const statMedia = document.getElementById('stat-discursivas-media');
// **CORREÇÃO: A variável agora é declarada no escopo global do módulo**
const usageCounterDiv = document.getElementById('usage-counter');

// --- ESTADO LOCAL ---
let sessaoAberta = null;
let unsubHistorico = null;
let ultimoJobIdSolicitado = null;

// --- FUNÇÕES DE RENDERIZAÇÃO E UI ---

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

function renderEnunciado(enunciado) {
    enunciadoContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h4>Enunciado Gerado:</h4>
            <button id="btn-fechar-visualizacao" class="btn btn-outline" style="padding: 4px 8px; font-size: 12px;">Fechar</button>
        </div>
        <p>${enunciado.replace(/\n/g, '<br>')}</p>
    `;
    enunciadoContainer.style.display = 'block';
    areaResposta.style.display = 'block';
    correcaoContainer.style.display = 'none';
    correcaoContainer.innerHTML = '';
    respostaTextarea.value = '';
    enunciadoContainer.scrollIntoView({ behavior: 'smooth' });
}

function renderCorrecao(correcao, container) {
    if (!container || !correcao) return;
    const analiseHtml = correcao.analise_por_criterio?.map(item => `
        <div class="criterio-analise" style="margin-bottom: 1rem;">
            <h5>${item.criterio} (Nota: ${item.nota_criterio?.toFixed(1) || 'N/A'})</h5>
            <p style="white-space: pre-wrap;">${item.comentario || 'Sem comentários.'}</p>
        </div>
    `).join('') || '<p>Análise detalhada não disponível.</p>';
    container.innerHTML = `
        <h4>Análise da IA (Nota Final: ${correcao.nota_atribuida?.toFixed(1) || 'N/A'} / 10.0)</h4>
        <p><strong>Comentário Geral:</strong> ${correcao.comentario_geral || 'Sem comentário geral.'}</p>
        <hr style="margin: 16px 0;">
        ${analiseHtml}
        <small class="ai-disclaimer"><i class="fas fa-robot"></i> Análise e nota geradas por IA.</small>
    `;
    container.style.display = 'block';
}

function renderHistorico(sessoes) {
    if (!historicoContainer) return;
    if (sessoes.length === 0) {
        historicoContainer.innerHTML = '<p>Seu histórico de correções aparecerá aqui.</p>';
        return;
    }
    historicoContainer.innerHTML = sessoes.map(item => {
        const materia = item.criterios?.materia || 'Discursiva';
        const nota = item.correcao?.nota_atribuida?.toFixed(1) || 'N/A';
        const data = item.criadoEm?.toDate().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) || 'Data indefinida';
        let statusIcon = '';
        if (item.status === 'processing_enunciado' || item.status === 'processing_correcao') {
            statusIcon = '<i class="fas fa-spinner fa-spin"></i>';
        } else if (item.status === 'failed') {
            statusIcon = '<i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>';
        }

        const isProcessing = item.status === 'processing_enunciado' || item.status === 'processing_correcao';
        const hasFailed = item.status === 'failed';
        let buttonText = 'Rever';
        if (isProcessing) buttonText = 'Gerando...';
        else if (hasFailed) buttonText = 'Falhou';
        
        return `
            <div class="tip-item">
                <div class="tip-icon"><i class="fas fa-file-alt"></i></div>
                <div class="tip-content">
                    <div class="tip-title">${materia} ${statusIcon}</div>
                    <div class="tip-description">Nota: ${nota} | Em: ${data}</div>
                </div>
                <button class="btn btn-primary btn-rever-correcao" data-id="${item.id}" ${isProcessing || hasFailed ? 'disabled' : ''}>${buttonText}</button>
            </div>
        `;
    }).join('');
    atualizarMetricasDiscursivas(sessoes);
}

function atualizarMetricasDiscursivas(sessoes) {
    if (!statTotal || !statMedia) return;
    const sessoesCorrigidas = sessoes.filter(s => s.status === 'correcao_pronta');
    const total = sessoesCorrigidas.length;
    const somaNotas = sessoesCorrigidas.reduce((acc, item) => acc + (item.correcao?.nota_atribuida || 0), 0);
    const notaMedia = total > 0 ? (somaNotas / total) : 0;
    statTotal.textContent = total;
    statMedia.textContent = notaMedia.toFixed(1);
}

async function renderUsageInfo() {
    if (!state.user || !usageCounterDiv) return;
    try {
        const data = await getUsageLimits(state.user.uid);
        // Informações sobre geração de enunciados
        const usoGeracao = data.usage.discursivas || 0;
        const limiteGeracao = data.limits.discursivas || 0;
        const restantesGeracao = limiteGeracao - usoGeracao;
        
        // Informações sobre correções
        const usoCorrecoes = data.usage.correcoes_discursivas || 0;
        const limiteCorrecoes = data.limits.correcoes_discursivas || 0;
        const restantesCorrecoes = limiteCorrecoes - usoCorrecoes;
        
        const plano = data.plan;

        let mensagem = '';
        // Nova lógica para criar a mensagem de forma clara e consistente
        if (plano === 'trial') {
            mensagem = `Você ainda pode gerar ${restantesGeracao} enunciados e fazer ${restantesCorrecoes} correções durante o seu período de teste.`;
        } else {
            mensagem = `Hoje, você ainda pode gerar ${restantesGeracao} enunciados e fazer ${restantesCorrecoes} correções.`;
        }

        usageCounterDiv.textContent = mensagem;
        usageCounterDiv.style.display = 'block';

        // Desabilita botão de geração se não há saldo
        const btnAbrirForm = document.getElementById('btn-abrir-form-discursiva');
        if(btnAbrirForm) {
            btnAbrirForm.disabled = restantesGeracao <= 0;
        }

        // Armazena informações de saldo para uso posterior
        window.discursivasSaldo = {
            restantesGeracao,
            restantesCorrecoes,
            plano
        };

    } catch (error) {
        console.error("Erro ao buscar limites de uso para discursivas:", error);
        usageCounterDiv.style.display = 'none';
    }
}

// --- LÓGICA DE EVENTOS ---
btnAbrirForm?.addEventListener('click', () => { containerGerador.style.display = 'block'; btnAbrirForm.style.display = 'none'; });
btnCancelarGeracao?.addEventListener('click', () => { containerGerador.style.display = 'none'; btnAbrirForm.style.display = 'block'; });

formGerarEnunciado?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const criterios = {
        userId: state.user.uid,
        concurso: document.getElementById('discursiva-concurso').value,
        banca: document.getElementById('discursiva-banca').value,
        materia: document.getElementById('discursiva-materia').value,
        topico: document.getElementById('discursiva-topico').value,
        tipo_questao: document.getElementById('discursiva-tipo').value,
        num_linhas: document.getElementById('discursiva-linhas').value,
        dificuldade: document.getElementById('discursiva-dificuldade').value,
        foco_correcao: document.getElementById('discursiva-foco').value,
    };

    // Usa o novo sistema de processamento
    if (!window.processingUI) {
        showToast("Erro: Sistema de processamento não disponível.", "error");
        return;
    }
    window.processingUI.startProcessingWithConfirmation({
        confirmationTitle: 'Gerar Enunciado Discursivo',
        confirmationMessage: 'Nossa IA vai criar um enunciado discursivo personalizado baseado nos seus critérios. Este processo pode demorar 30-60 segundos. Deseja continuar?',
        confirmationIcon: 'fas fa-file-alt',
        processingTitle: 'Criando seu Enunciado...',
        processingMessage: 'Nossa IA está analisando os critérios e criando um enunciado relevante para você.',
        estimatedTime: '30-60 segundos',
        resultAreaSelector: '#historico-discursivas',
        onConfirm: async () => {
            try {
                // Esconde o formulário
                containerGerador.style.display = 'none';
                btnAbrirForm.style.display = 'block';
                
                // Envia a solicitação
                const resposta = await gerarEnunciadoDiscursivaAsync(criterios);
                ultimoJobIdSolicitado = resposta.jobId;
                return resposta;
            } catch (error) {
                // Mostra erro e reabilita o formulário
                showToast(error.message, 'error');
                containerGerador.style.display = 'block';
                btnAbrirForm.style.display = 'none';
                throw error; // Re-lança o erro para ser tratado pelo sistema
            }
        },
        onCancel: () => {
            // Usuário cancelou, não faz nada
        },
        onComplete: (result) => {
            // Atualiza contadores
            renderUsageInfo();
            
            // Mostra aviso curto de que a solicitação foi aceita
            showToast("Enunciado solicitado! Gerando...", 'info', 3000);
        }
    });
});

document.body.addEventListener('click', async (e) => {
    const corrigirBtn = e.target.closest('#btn-corrigir-texto');
    const reverBtn = e.target.closest('.btn-rever-correcao');
    const fecharBtn = e.target.closest('#btn-fechar-visualizacao');

    if (corrigirBtn) {
        const resposta = respostaTextarea.value;
        if (!resposta.trim() || !sessaoAberta?.enunciado) {
            return alert('Por favor, escreva sua resposta antes de pedir a correção.');
        }
        
        // Verifica saldo para correções
        if (!window.discursivasSaldo || window.discursivasSaldo.restantesCorrecoes <= 0) {
            const plano = window.discursivasSaldo?.plano || 'trial';
            const mensagem = plano === 'trial' 
                ? 'Você não tem mais saldo para correções no período de teste. Faça upgrade para continuar.'
                : 'Você não tem mais saldo para correções hoje. Tente novamente amanhã.';
            showToast(mensagem, 'error');
            return;
        }
        
        corrigirBtn.disabled = true;
        corrigirBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando para correção...';
        
        const dadosParaCorrecao = {
            userId: state.user.uid,
            jobId: sessaoAberta.id,
            enunciado: sessaoAberta.enunciado,
            resposta: resposta,
            foco_correcao: sessaoAberta.criterios.foco_correcao,
        };
        try {
            await corrigirDiscursivaAsync(dadosParaCorrecao);
            corrigirBtn.textContent = "Aguardando correção da IA...";
        } catch (error) {
            showToast(error.message, 'error');
            corrigirBtn.disabled = false;
            corrigirBtn.textContent = 'Corrigir Texto';
        } finally {
            await renderUsageInfo();
        }
    } else if (reverBtn && !reverBtn.disabled) {
        const id = reverBtn.dataset.id;
        const sessaoDoc = await getDoc(doc(db, `users/${state.user.uid}/discursivasCorrigidas`, id));
        if (sessaoDoc.exists()) {
            sessaoAberta = { id: sessaoDoc.id, ...sessaoDoc.data() };
            renderEnunciado(sessaoAberta.enunciado);
            respostaTextarea.value = sessaoAberta.resposta || '';
            if (sessaoAberta.status === 'correcao_pronta') {
                renderCorrecao(sessaoAberta.correcao, correcaoContainer);
            }
        }
    } else if (fecharBtn) {
        enunciadoContainer.style.display = 'none';
        areaResposta.style.display = 'none';
        correcaoContainer.style.display = 'none';
        sessaoAberta = null;
    }
});

// --- INICIALIZAÇÃO ---
function ouvirHistoricoDiscursivas() {
    if (unsubHistorico) unsubHistorico();
    const q = query(collection(db, `users/${state.user.uid}/discursivasCorrigidas`), orderBy("criadoEm", "desc"), limit(50));
    unsubHistorico = onSnapshot(q, (snapshot) => {
        const sessoes = [];
        snapshot.forEach(doc => sessoes.push({ id: doc.id, ...doc.data() }));

        snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified') {
                const data = change.doc.data();
                if (data.status === 'enunciado_pronto' && change.doc.id === ultimoJobIdSolicitado) {
                    // Aviso ao usuário
                    showToast('✅ Seu enunciado discursivo está pronto!', 'success', 7000);
                    if (window.processingUI) {
                        window.processingUI.removeResultAreaHighlight('#historico-discursivas');
                    }
                    ultimoJobIdSolicitado = null;
                }
                if (data.status === 'enunciado_pronto' && (!sessaoAberta || sessaoAberta.id === change.doc.id)) {
                    sessaoAberta = { id: change.doc.id, ...data };
                    renderEnunciado(data.enunciado);
                } else if (data.status === 'correcao_pronta' && sessaoAberta && sessaoAberta.id === change.doc.id) {
                    renderCorrecao(data.correcao, correcaoContainer);
                    const btn = document.getElementById('btn-corrigir-texto');
                    if(btn) btn.style.display = 'none';
                }
            }
        });
        renderHistorico(sessoes);
    });
}

function initDiscursivasPage() {
    if (state.user) {
        ouvirHistoricoDiscursivas();
        renderUsageInfo();
    }
}

document.addEventListener('userDataReady', initDiscursivasPage);