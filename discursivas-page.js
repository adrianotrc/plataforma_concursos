// discursivas-page.js - Versão final e definitiva

import { auth, db } from './firebase-config.js';
import { collection, addDoc, getDocs, serverTimestamp, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarEnunciadoDiscursiva, corrigirDiscursiva } from './api.js';

// --- ELEMENTOS DO DOM ---
const formGerarEnunciado = document.getElementById('form-gerar-enunciado');
const enunciadoContainer = document.getElementById('enunciado-container');
const areaResposta = document.getElementById('area-resposta');
const respostaTextarea = document.getElementById('resposta-discursiva');
const btnCorrigir = document.getElementById('btn-corrigir-texto');
const correcaoContainer = document.getElementById('correcao-container');
const historicoContainer = document.getElementById('historico-discursivas');

// --- ESTADO LOCAL ---
let currentUser = null;
let sessaoAtual = {};
let historicoDiscursivas = [];

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

    // Constrói a lista de critérios de forma segura
    let analiseHtml = correcao.analise_por_criterio?.map(item => `
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
    container.style.display = 'block';
}

function renderHistorico() {
    if (!historicoContainer) return;
    if (historicoDiscursivas.length === 0) {
        historicoContainer.innerHTML = '<p>Seu histórico de correções aparecerá aqui.</p>';
        return;
    }
    historicoContainer.innerHTML = historicoDiscursivas.map(item => {
        const materia = item.criterios?.materia || 'Discursiva';
        const nota = item.correcao?.nota_atribuida?.toFixed(1) || 'N/A';
        const data = item.criadoEm?.toDate().toLocaleDateString('pt-BR') || 'Data indefinida';

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
    const total = historicoDiscursivas.length;
    const somaNotas = historicoDiscursivas.reduce((acc, item) => acc + (item.correcao?.nota_atribuida || 0), 0);
    const notaMedia = total > 0 ? (somaNotas / total) : 0;
    
    document.getElementById('stat-discursivas-total').textContent = total;
    document.getElementById('stat-discursivas-media').textContent = notaMedia.toFixed(1);
}

// --- LÓGICA DE EVENTOS ---
formGerarEnunciado?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = formGerarEnunciado.querySelector('button[type="submit"]');
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

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

    try {
        const resultado = await gerarEnunciadoDiscursiva(criterios);
        sessaoAtual = { criterios, enunciado: resultado.enunciado_gerado, resposta: null, correcao: null };
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
        sessaoAtual.correcao = resultado;
        renderCorrecao(sessaoAtual.correcao, correcaoContainer);
        if (currentUser) {
            await addDoc(collection(db, `users/${currentUser.uid}/discursivasCorrigidas`), {
                criterios: sessaoAtual.criterios,
                enunciado: sessaoAtual.enunciado,
                resposta: sessaoAtual.resposta,
                correcao: resultado,
                criadoEm: serverTimestamp(),
            });
            await carregarHistorico(); // Recarrega os dados do Firestore
            renderHistorico(); // Re-renderiza a lista de histórico
            atualizarMetricasDiscursivas(); // Re-calcula e exibe as métricas
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
        const sessaoSelecionada = historicoDiscursivas.find(item => item.id === id);
        if (sessaoSelecionada) {
            renderEnunciado(sessaoSelecionada.enunciado);
            respostaTextarea.value = sessaoSelecionada.resposta;
            renderCorrecao(sessaoSelecionada.correcao, correcaoContainer);
            correcaoContainer.scrollIntoView({ behavior: 'smooth' });
        }
    }
});

// --- LÓGICA DE DADOS E INICIALIZAÇÃO ---
async function carregarHistorico() {
    if (!currentUser) return;
    const q = query(collection(db, `users/${currentUser.uid}/discursivasCorrigidas`), orderBy("criadoEm", "desc"), limit(20));
    const querySnapshot = await getDocs(q);
    historicoDiscursivas = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function initDiscursivasPage() {
    currentUser = auth.currentUser;
    if (currentUser) {
        await carregarHistorico();
        renderHistorico();
        atualizarMetricasDiscursivas();
    }
}
document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
        if (user) { initDiscursivasPage(); }
    });
});