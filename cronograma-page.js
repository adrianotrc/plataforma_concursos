// cronograma-page.js - Versão com a lógica de habilitação de campos CORRIGIDA

import { auth, db } from './firebase-config.js';
import { collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarPlanoDeEstudos } from './api.js';

// --- ELEMENTOS DO DOM ---
const btnAbrirForm = document.getElementById('btn-abrir-form-cronograma');
const containerForm = document.getElementById('container-form-novo-plano');
const formCronograma = document.getElementById('form-cronograma');
const btnFecharForm = document.getElementById('btn-fechar-form-cronograma');
const containerHistorico = document.getElementById('historico-cronogramas');
const containerExibicao = document.getElementById('plano-exibicao');
const diasSemanaCheckboxes = document.querySelectorAll('.dias-semana-grid input[type="checkbox"]');
const materiasContainer = document.getElementById('materias-container');
const materiasInput = document.getElementById('materias-input');

// --- ESTADO LOCAL ---
let savedPlans = [];
let currentUser = null;

// --- FUNÇÕES DE RENDERIZAÇÃO (UI) ---

function renderizarHistorico() {
    // A lógica desta função permanece a mesma da versão anterior.
    if (!containerHistorico) return;
    if (!savedPlans || savedPlans.length === 0) { /* ... */ }
    const planosOrdenados = savedPlans.sort(/* ... */);
    containerHistorico.innerHTML = planosOrdenados.map(plano => {
        const dataFormatada = plano.criadoEm?.toDate().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) || 'Data indisponível';
        return `
            <div class="plano-item" data-id="${plano.id}">
                <div>
                    <h3>Plano para ${plano.concurso_foco || 'Concurso'}</h3>
                    <p>Gerado em: ${dataFormatada}</p>
                </div>
                <button class="btn btn-primary btn-abrir-plano" data-id="${plano.id}">Abrir</button>
            </div>
        `;
    }).join('');
}

function exibirPlanoNaTela(plano) {
    if (!containerExibicao) return;

    // --- Lógica de cálculo de datas ---
    const formatarData = (data) => data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    // Define a data de início. Se não houver, usa a data de hoje.
    const dataInicioPlano = plano.data_inicio ? new Date(plano.data_inicio + 'T00:00:00') : new Date();
    let dataCorrente = new Date(dataInicioPlano);

    // Ajusta a data de início para o primeiro domingo (início da semana 1)
    const diaDaSemana = dataCorrente.getDay(); // 0 = Domingo, 1 = Segunda, ...
    dataCorrente.setDate(dataCorrente.getDate() - diaDaSemana);
    
    let periodoPlano = '';
    if (plano.data_inicio && plano.data_termino) {
        periodoPlano = `Período do Plano: ${formatarData(new Date(plano.data_inicio + 'T00:00:00'))} a ${formatarData(new Date(plano.data_termino + 'T00:00:00'))}`;
    }

    const iconePorTipo = { /* ... */ };
    let cronogramaHtml = `
        <div class="plano-formatado-container">
            <div class="feature-header" style="margin-bottom: 20px;">
                <div class="feature-icon blue"><i class="fas fa-calendar-check"></i></div>
                <div class="feature-info">
                    <h3>Plano de Estudos: ${plano.concurso_foco || ''}</h3>
                    <p style="font-weight: 500; color: #374151;">${periodoPlano}</p>
                    <p style="white-space: pre-wrap;">${plano.resumo_estrategico || 'Sem resumo estratégico.'}</p>
                </div>
            </div>
    `;

    const semanas = plano.cronograma_semanal_detalhado;
    if (Array.isArray(semanas)) {
        semanas.forEach(semana => {
            const dataFimSemana = new Date(dataCorrente);
            dataFimSemana.setDate(dataFimSemana.getDate() + 6); // Sábado
            
            cronogramaHtml += `
                <div class="semana-bloco">
                    <h3>Semana ${semana.semana_numero || ''}</h3>
                    <p class="semana-datas">${formatarData(dataCorrente)} a ${formatarData(dataFimSemana)}</p>
            `;
            
            // Avança a data para o início da próxima semana
            dataCorrente.setDate(dataCorrente.getDate() + 7);

            const dias = semana.dias_de_estudo;
            if (Array.isArray(dias)) {
                dias.forEach(dia => {
                    cronogramaHtml += `<div class="dia-bloco"><h4>${dia.dia_semana || 'Dia não especificado'}</h4><ul class="atividades-lista">`;

                    // **VERIFICAÇÃO DE SEGURANÇA 3**: Checa se a lista de atividades existe
                    const atividades = dia.atividades;
                    if (Array.isArray(atividades)) {
                        atividades.forEach(atividade => {
                            const icone = iconePorTipo[atividade.tipo_de_estudo] || 'fa-tasks';
                            cronogramaHtml += `
                                <li class="atividade-item">
                                    <i class="fas ${icone}"></i>
                                    <div class="atividade-detalhes">
                                        <p><strong>${atividade.materia || 'Matéria?'}</strong> (${atividade.duracao_minutos || 'N/A'} min)</p>
                                        <p>${atividade.topico_sugerido || 'Tópico não sugerido.'}</p>
                                        <p class="atividade-tipo">${atividade.tipo_de_estudo || 'Atividade'}</p>
                                    </div>
                                </li>
                            `;
                        });
                    }
                    cronogramaHtml += `</ul></div>`;
                });
            }
            cronogramaHtml += `</div>`;
        });
    } else {
        cronogramaHtml += `<p style="color: red;">O cronograma detalhado não foi encontrado na resposta da IA.</p>`;
    }
    
    cronogramaHtml += `<button id="btn-fechar-plano" class="btn btn-ghost" style="margin-top: 16px;"><i class="fas fa-times"></i> Fechar Plano</button></div>`;
    
    containerExibicao.innerHTML = cronogramaHtml;
    containerExibicao.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- LÓGICA DO FORMULÁRIO APRIMORADO ---

function adicionarMateria() {
    const textoMateria = materiasInput.value.trim().replace(/,/g, '');
    if (textoMateria) {
        const tag = document.createElement('span');
        tag.className = 'materia-tag';
        tag.textContent = textoMateria;
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', `Remover ${textoMateria}`);
        closeBtn.onclick = () => tag.remove();
        
        tag.appendChild(closeBtn);
        materiasContainer.insertBefore(tag, materiasInput);
        materiasInput.value = '';
    }
}

formCronograma?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === materiasInput) {
        e.preventDefault();
        adicionarMateria();
    }
});

materiasInput?.addEventListener('keyup', (e) => {
    if (e.key === ',') {
        adicionarMateria();
    }
});

// Esta função garante que o campo de minutos seja habilitado/desabilitado.
diasSemanaCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
        const inputMinutos = e.target.closest('.dia-horario-item').querySelector('input[type="number"]');
        if (inputMinutos) {
            inputMinutos.disabled = !e.target.checked;
            if (!e.target.checked) {
                inputMinutos.value = '';
            }
        }
    });
});

formCronograma?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (materiasInput.value.trim()) {
        adicionarMateria();
    }
    
    const btnGerar = formCronograma.querySelector('button[type="submit"]');

    const materias = [...document.querySelectorAll('.materia-tag')].map(tag => tag.textContent.replace('×', '').trim());
    if (materias.length === 0) {
        alert("Por favor, adicione pelo menos uma matéria.");
        return;
    }
    const disponibilidade = {};
    document.querySelectorAll('.dias-semana-grid .dia-horario-item').forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox.checked) {
            const dia = checkbox.value;
            const minutosInput = item.querySelector('input[type="number"]');
            if (minutosInput && minutosInput.value && parseInt(minutosInput.value, 10) > 0) {
                disponibilidade[dia] = parseInt(minutosInput.value, 10);
            }
        }
    });
     if (Object.keys(disponibilidade).length === 0) {
        alert("Por favor, selecione pelo menos um dia da semana e informe os minutos de estudo.");
        return;
    }
    
    const dadosParaApi = {
        concurso_objetivo: document.getElementById('concurso-objetivo').value,
        fase_concurso: document.getElementById('fase-concurso').value,
        materias: materias,
        disponibilidade_semanal_minutos: disponibilidade,
        duracao_sessao_minutos: parseInt(document.getElementById('duracao-sessao-estudo').value),
        data_inicio: document.getElementById('data-inicio').value || null,
        data_termino: document.getElementById('data-termino').value || null,
        dificuldades_materias: document.getElementById('dificuldades-materias').value || 'Nenhuma informada.',
        outras_consideracoes: document.getElementById('outras-consideracoes').value || 'Nenhuma.',
    };

    btnGerar.disabled = true;
    btnGerar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando, isso pode levar um momento...';

    try {
        const novoPlanoGerado = await gerarPlanoDeEstudos(dadosParaApi);
        
        // **CORREÇÃO PRINCIPAL**: Adiciona as datas ao objeto que será salvo no Firestore
        const planoParaSalvar = {
            ...novoPlanoGerado.plano_de_estudos,
            criadoEm: serverTimestamp(),
            data_inicio: dadosParaApi.data_inicio, // Salva a data de início
            data_termino: dadosParaApi.data_termino // Salva a data de término
        };
        
        await addDoc(collection(db, `users/${currentUser.uid}/plans`), planoParaSalvar);
        
        await carregarPlanosDoFirestore();
        exibirPlanoNaTela(planoParaSalvar);
        renderizarHistorico();
        containerForm.style.display = 'none';
        formCronograma.reset();

    } catch (error) {
        alert('Ocorreu um erro ao gerar seu cronograma. Verifique o console para mais detalhes.');
        console.error(error);
    } finally {
        btnGerar.disabled = false;
        btnGerar.textContent = 'Gerar Cronograma';
    }
});



// --- INICIALIZAÇÃO E EVENTOS GERAIS ---
// Nova função para centralizar o carregamento de planos
async function carregarPlanosDoFirestore() {
    try {
        const querySnapshot = await getDocs(collection(db, `users/${currentUser.uid}/plans`));
        savedPlans = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Erro ao carregar cronogramas do Firestore:", error);
        // Opcional: mostrar um erro para o usuário
    }
}

async function initCronogramaPage() {
    currentUser = auth.currentUser;
    if (currentUser) {
        await carregarPlanosDoFirestore();
        renderizarHistorico();
    }
}

// Eventos de abrir/fechar formulário e abrir/fechar plano (sem alterações)
btnAbrirForm?.addEventListener('click', () => { containerForm.style.display = 'block'; });
btnFecharForm?.addEventListener('click', () => { containerForm.style.display = 'none'; });
document.body.addEventListener('click', (e) => {
    if (e.target.matches('.btn-abrir-plano')) {
        const planoId = e.target.dataset.id;
        const planoSelecionado = savedPlans.find(p => p.id === planoId);
        if (planoSelecionado) exibirPlanoNaTela(planoSelecionado);
    }
    if (e.target.matches('#btn-fechar-plano, #btn-fechar-plano *')) {
        containerExibicao.innerHTML = '';
    }
});


document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
        if (user) {
            initCronogramaPage();
        }
    });
});