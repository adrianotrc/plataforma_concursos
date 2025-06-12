// discursivas-page.js - Versão definitiva e funcional

import { auth, db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarEnunciadoDiscursiva, corrigirDiscursiva } from './api.js';
// **CORREÇÃO**: Importa o estado e a função de carregamento do main-app
import { state, carregarDadosDoUsuario } from './main-app.js';

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

// --- ESTADO LOCAL ---
let sessaoAtual = {};

// --- FUNÇÕES DE RENDERIZAÇÃO ---
function renderEnunciado(enunciado) {
    enunciadoContainer.innerHTML = `<h4>Enunciado Gerado:</h4><p>${enunciado.replace(/\n/g, '<br>')}</p>`;
    enunciadoContainer.style.display = 'block';
    areaResposta.style.display = 'block';
    correcaoContainer.style.display = 'none';
    respostaTextarea.value = '';
    enunciadoContainer.scrollIntoView({ behavior: 'smooth' });
}

function renderCorrecao(correcao, container) {
    if (!container || !correcao) return;
    const analiseHtml = correcao.analise_por_criterio?.map(item => `
        <div class="criterio-analise">
            <h5>${item.criterio} (Nota: ${item.nota_criterio?.toFixed(1) || 'N/A'})</h5>
            <p>${item.comentario || 'Sem comentários para este critério.'}</p>
        </div>
    `).join('') || '<p>Análise detalhada não disponível.</p>';
    container.innerHTML = `
        <h4>Análise da IA (Nota Final: ${correcao.nota_atribuida?.toFixed(1) || 'N/A'} / 10.0)</h4>
        <p><strong>Comentário Geral:</strong> ${correcao.comentario_geral || 'Sem comentário geral.'}</p>
        <hr style="margin: 16px 0;">
        ${analiseHtml}
    `;
    container.innerHTML += `<small class="ai-disclaimer"><i class="fas fa-robot"></i> Análise e nota geradas por inteligência artificial. Utilize como um guia para seus estudos.</small>`;
    container.style.display = 'block';
}

function renderHistorico() {
    if (!historicoContainer) return;
    const historico = state.sessoesDiscursivas || [];
    if (historico.length === 0) {
        historicoContainer.innerHTML = '<p>Seu histórico de correções aparecerá aqui.</p>';
        return;
    }
    historicoContainer.innerHTML = historico.map(item => {
        const materia = item.criterios?.materia || 'Discursiva';
        const nota = item.correcao?.nota_atribuida?.toFixed(1) || 'N/A';
        const data = item.criadoEm?.toDate().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) || 'Data indefinida';
        return `
            <div class="tip-item">
                <div class="tip-icon"><i class="fas fa-file-alt"></i></div>
                <div class="tip-content">
                    <div class="tip-title">${materia}</div>
                    <div class="tip-description">Nota: ${nota} | Em: ${data}</div>
                </div>
                <button class="btn btn-ghost btn-rever-correcao" data-id="${item.id}">Rever</button>
            </div>
        `;
    }).join('');
}

function atualizarMetricasDiscursivas() {
    if (!statTotal || !statMedia) return;
    const historico = state.sessoesDiscursivas || [];
    const total = historico.length;
    const somaNotas = historico.reduce((acc, item) => acc + (item.correcao?.nota_atribuida || 0), 0);
    const notaMedia = total > 0 ? (somaNotas / total) : 0;
    
    statTotal.textContent = total;
    statMedia.textContent = notaMedia.toFixed(1);
}

// --- LÓGICA DE EVENTOS ---
btnAbrirForm?.addEventListener('click', () => {
    containerGerador.style.display = 'block';
    btnAbrirForm.style.display = 'none';
});
btnCancelarGeracao?.addEventListener('click', () => {
    containerGerador.style.display = 'none';
    btnAbrirForm.style.display = 'block';
});

formGerarEnunciado?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = formGerarEnunciado.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
    const criterios = {
        concurso: document.getElementById('discursiva-concurso').value,
        banca: document.getElementById('discursiva-banca').value,
        materia: document.getElementById('discursiva-materia').value,
        topico: document.getElementById('discursiva-topico').value,
        tipo_questao: document.getElementById('discursiva-tipo').value,
        num_linhas: document.getElementById('discursiva-linhas').value,
        dificuldade: document.getElementById('discursiva-dificuldade').value,
        foco_correcao: document.getElementById('discursiva-foco').value,
    };
    try {
        const resultado = await gerarEnunciadoDiscursiva(criterios);
        sessaoAtual = { criterios, enunciado: resultado.enunciado_gerado };
        renderEnunciado(sessaoAtual.enunciado);
    } catch (error) {
        alert('Falha ao gerar o enunciado.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cogs"></i> Gerar Enunciado';
    }
});

btnCorrigir?.addEventListener('click', async () => {
    const resposta = respostaTextarea.value;
    if (!resposta.trim() || !sessaoAtual.enunciado) {
        return alert('Por favor, escreva sua resposta antes de pedir a correção.');
    }
    btnCorrigir.disabled = true;
    btnCorrigir.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Corrigindo...';
    
    const dadosParaCorrecao = {
        enunciado: sessaoAtual.enunciado,
        resposta: resposta,
        foco_correcao: sessaoAtual.criterios.foco_correcao,
    };
    try {
        const resultado = await corrigirDiscursiva(dadosParaCorrecao);
        renderCorrecao(resultado, correcaoContainer);
        if (state.user) {
            await addDoc(collection(db, `users/${state.user.uid}/discursivasCorrigidas`), {
                criterios: sessaoAtual.criterios,
                enunciado: sessaoAtual.enunciado,
                resposta: resposta,
                correcao: resultado,
                criadoEm: serverTimestamp(),
            });
            // **CORREÇÃO**: Chama a função global para recarregar todos os dados
            await carregarDadosDoUsuario(state.user.uid);
            renderHistorico();
            atualizarMetricasDiscursivas();
        }
    } catch (error) {
        alert('Falha ao obter a correção.');
        console.error(error);
    } finally {
        btnCorrigir.disabled = false;
        btnCorrigir.textContent = 'Corrigir Texto';
    }
});

historicoContainer?.addEventListener('click', (e) => {
    const btnRever = e.target.closest('.btn-rever-correcao');
    if (btnRever) {
        const id = btnRever.dataset.id;
        const sessaoSelecionada = state.sessoesDiscursivas.find(item => item.id === id);
        if (sessaoSelecionada) {
            renderEnunciado(sessaoSelecionada.enunciado);
            respostaTextarea.value = sessaoSelecionada.resposta;
            renderCorrecao(sessaoSelecionada.correcao, correcaoContainer);
        }
    }
});

// --- INICIALIZAÇÃO ---
// A inicialização agora é mais simples, pois depende do main-app.js
function initDiscursivasPage() {
    if (!state.user) return; // Sai se o usuário ainda não foi carregado pelo main-app
    // Usa os dados que o main-app já carregou
    renderHistorico();
    atualizarMetricasDiscursivas();
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initDiscursivasPage();
    }, 500);
});