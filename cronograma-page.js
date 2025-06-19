// cronograma-page.js - Versão com formatação do Excel corrigida

import { auth, db } from './firebase-config.js';
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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
let planoAbertoAtual = null; // Armazena o plano que está sendo exibido

// --- FUNÇÕES DE RENDERIZAÇÃO (UI) ---

function renderizarHistorico(planos) {
    if (!containerHistorico) return;
    if (!planos || planos.length === 0) {
        containerHistorico.innerHTML = '<div class="card-placeholder"><p>Nenhum cronograma gerado ainda.</p></div>';
        return;
    }
    const planosOrdenados = planos.sort((a, b) => (b.criadoEm?.toDate() || 0) - (a.criadoEm?.toDate() || 0));
    containerHistorico.innerHTML = planosOrdenados.map(plano => {
        const dataFormatada = plano.criadoEm?.toDate()?.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) || 'Processando...';
        const isProcessing = plano.status === 'processing';
        return `
            <div class="plano-item" data-id="${plano.jobId || plano.id}">
                <div>
                    <h3>${plano.concurso_foco || 'Plano de Estudos'} ${isProcessing ? '<i class="fas fa-spinner fa-spin"></i>' : ''}</h3>
                    <p>Gerado em: ${dataFormatada}</p>
                </div>
                <button class="btn btn-primary btn-abrir-plano" data-id="${plano.jobId || plano.id}" ${isProcessing ? 'disabled' : ''}>
                    ${isProcessing ? 'Gerando...' : 'Abrir'}
                </button>
            </div>
        `;
    }).join('');
}

function exibirPlanoNaTela(plano) {
    if (!containerExibicao) return;
    planoAbertoAtual = plano; // Salva o plano atual para ser usado na exportação

    const formatarData = (data) => data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const dataInicioPlano = plano.data_inicio ? new Date(plano.data_inicio + 'T00:00:00') : new Date();
    
    // Mapeia os dias da semana para garantir a ordem correta na tabela
    const diasDaSemanaOrdenados = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
    
    let cronogramaHtml = `
        <div class="plano-formatado-container">
            <div class="plano-header">
                <div class="feature-info">
                    <h3>Plano de Estudos: ${plano.concurso_foco || ''}</h3>
                    <p style="white-space: pre-wrap;">${plano.resumo_estrategico || 'Sem resumo estratégico.'}</p>
                </div>
                <button id="btn-exportar-excel" class="btn btn-primary">
                    <i class="fas fa-file-excel"></i> Exportar para Excel
                </button>
            </div>
    `;

    const semanas = plano.cronograma_semanal_detalhado;
    if (Array.isArray(semanas)) {
        let dataCorrente = new Date(dataInicioPlano);
        dataCorrente.setDate(dataCorrente.getDate() - dataCorrente.getDay()); // Ajusta para o domingo da semana inicial

        semanas.forEach(semana => {
            const diasDaSemanaApi = (semana.dias_de_estudo || []).reduce((acc, dia) => {
                const diaSemanaCorrigido = dia.dia_semana.endsWith(" Feira") ? dia.dia_semana.split(" ")[0] : dia.dia_semana;
                acc[diaSemanaCorrigido] = dia.atividades || [];
                return acc;
            }, {});

            cronogramaHtml += `
                <div class="semana-bloco">
                    <h3>Semana ${semana.semana_numero || ''}</h3>
                    <div class="cronograma-tabela-container">
                        <table class="cronograma-tabela">
                            <thead>
                                <tr>
            `;
            diasDaSemanaOrdenados.forEach((dia, index) => {
                const dataDoDia = new Date(dataCorrente);
                dataDoDia.setDate(dataCorrente.getDate() + index);
                const diaAbreviado = dia.substring(0, 3);
                cronogramaHtml += `<th><div class="dia-header">${diaAbreviado}<span class="data">${formatarData(dataDoDia)}</span></div></th>`;
            });
            cronogramaHtml += `
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
            `;
            diasDaSemanaOrdenados.forEach(dia => {
                const atividades = diasDaSemanaApi[dia] || [];
                cronogramaHtml += '<td><ul>';
                if (atividades.length > 0) {
                    atividades.forEach(atividade => {
                        cronogramaHtml += `
                            <li>
                                <strong>${atividade.materia || ''}</strong>
                                <p class="topico">${atividade.topico_sugerido || ''}</p>
                                <p class="tipo-e-duracao">${atividade.tipo_de_estudo || ''} (${atividade.duracao_minutos} min)</p>
                            </li>
                        `;
                    });
                }
                cronogramaHtml += '</ul></td>';
            });

            cronogramaHtml += `
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            dataCorrente.setDate(dataCorrente.getDate() + 7);
        });
    }

    cronogramaHtml += `<small class="ai-disclaimer"><i class="fas fa-robot"></i> Conteúdo gerado por inteligência artificial.</small></div>`;
    containerExibicao.innerHTML = cronogramaHtml;
    containerExibicao.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


function exportarPlanoParaExcel(plano) {
    if (!plano) {
        alert("Nenhum plano para exportar.");
        return;
    }

    const wb = XLSX.utils.book_new();
    const dataInicioPlano = plano.data_inicio ? new Date(plano.data_inicio + 'T00:00:00') : new Date();
    let dataCorrente = new Date(dataInicioPlano);
    dataCorrente.setDate(dataCorrente.getDate() - dataCorrente.getDay());

    const diasDaSemanaOrdenados = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];

    plano.cronograma_semanal_detalhado.forEach(semana => {
        const dadosPlanilha = [];
        
        const atividadesPorDia = (semana.dias_de_estudo || []).reduce((acc, dia) => {
            const diaSemanaCorrigido = dia.dia_semana.endsWith(" Feira") ? dia.dia_semana.split(" ")[0] : dia.dia_semana;
            acc[diaSemanaCorrigido] = (dia.atividades || []).map(atv => 
                `${atv.materia || ''}\n${atv.topico_sugerido || ''}\n${atv.tipo_de_estudo || ''} (${atv.duracao_minutos} min)`
            );
            return acc;
        }, {});
        
        const maxAtividades = Math.max(0, ...Object.values(atividadesPorDia).map(arr => arr.length));

        const diaHeaderRow = [];
        const dataHeaderRow = [];
        diasDaSemanaOrdenados.forEach((dia, index) => {
            const dataDoDia = new Date(dataCorrente);
            dataDoDia.setDate(dataCorrente.getDate() + index);
            diaHeaderRow.push(dia);
            dataHeaderRow.push(dataDoDia.toLocaleDateString('pt-BR'));
        });

        dadosPlanilha.push(diaHeaderRow);
        dadosPlanilha.push(dataHeaderRow);
        
        for (let i = 0; i < maxAtividades; i++) {
            const atividadeRow = [];
            diasDaSemanaOrdenados.forEach(dia => {
                atividadeRow.push(atividadesPorDia[dia]?.[i] || "");
            });
            dadosPlanilha.push(atividadeRow);
        }
        
        const ws = XLSX.utils.aoa_to_sheet(dadosPlanilha);

        ws['!cols'] = diasDaSemanaOrdenados.map(() => ({ wch: 35 }));
        
        const estiloCelula = { alignment: { wrapText: true, vertical: 'top' } };
        dadosPlanilha.forEach((row, r) => {
            row.forEach((cell, c) => {
                const cellAddress = XLSX.utils.encode_cell({ r, c });
                if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: "" };
                ws[cellAddress].s = estiloCelula;
            });
        });

        XLSX.utils.book_append_sheet(wb, ws, `Semana ${semana.semana_numero}`);

        dataCorrente.setDate(dataCorrente.getDate() + 7);
    });

    XLSX.writeFile(wb, `Plano_de_Estudos_${(plano.concurso_foco || 'IAprovas').replace(/ /g, '_')}.xlsx`);
}


// --- LÓGICA DO FORMULÁRIO ---

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
    containerForm.style.display = 'none'; // Esconde o formulário

    try {
        // Envia a solicitação e o backend responde imediatamente
        const respostaInicial = await gerarPlanoDeEstudos(dadosParaApi);
        if (respostaInicial.status === 'processing' && respostaInicial.jobId) {
            alert("Sua solicitação foi recebida! Estamos gerando seu plano. Ele aparecerá no histórico em alguns instantes.");
            // O listener do Firestore (onSnapshot) já cuidará de atualizar a lista automaticamente.
        } else {
            throw new Error('Falha ao iniciar a geração do plano.');
        }

    } catch (error) {
        alert('Ocorreu um erro ao solicitar seu cronograma. Tente novamente.');
        console.error(error);
    } finally {
        btnGerar.disabled = false;
        btnGerar.textContent = 'Gerar Cronograma';
        // Limpa o formulário
        formCronograma.reset();
        materiasContainer.querySelectorAll('.materia-tag').forEach(tag => tag.remove());
        diasSemanaCheckboxes.forEach(cb => {
            const input = cb.closest('.dia-horario-item').querySelector('input[type="number"]');
            if (input) input.disabled = true;
        });
    }
});

// --- LÓGICA DE DADOS (COM LISTENER EM TEMPO REAL) ---
function ouvirHistoricoDePlanos() {
    if (unsubHistorico) unsubHistorico(); // Cancela o listener anterior se existir

    const q = query(collection(db, `users/${currentUser.uid}/plans`), orderBy("criadoEm", "desc"));
    
    unsubHistorico = onSnapshot(q, (querySnapshot) => {
        const planos = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarHistorico(planos);
    }, (error) => {
        console.error("Erro ao ouvir histórico de planos:", error);
    });
}


// --- INICIALIZAÇÃO E EVENTOS ---
async function initCronogramaPage() {
    currentUser = auth.currentUser;
    if (currentUser) {
        ouvirHistoricoDePlanos();
    }
}


// --- INICIALIZAÇÃO E EVENTOS GERAIS ---
async function carregarPlanosDoFirestore() {
    try {
        const q = query(collection(db, `users/${currentUser.uid}/plans`), orderBy("criadoEm", "desc"));
        const querySnapshot = await getDocs(q);
        savedPlans = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Erro ao carregar cronogramas do Firestore:", error);
    }
}

async function initCronogramaPage() {
    currentUser = auth.currentUser;
    if (currentUser) {
        await carregarPlanosDoFirestore();
        renderizarHistorico();
    }
}

document.body.addEventListener('click', async (e) => {
    if (e.target.matches('.btn-abrir-plano') && !e.target.disabled) {
        const planoId = e.target.dataset.id;
        const user = auth.currentUser;
        if (planoId && user) {
            const docRef = doc(db, 'users', user.uid, 'plans', planoId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                exibirPlanoNaTela(docSnap.data());
            }
        }
    }
    if (e.target.matches('#btn-exportar-excel, #btn-exportar-excel *')) {
        exportarPlanoParaExcel(planoAbertoAtual);
    }
});

btnAbrirForm?.addEventListener('click', () => { containerForm.style.display = 'block'; });
btnFecharForm?.addEventListener('click', () => { containerForm.style.display = 'none'; });

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
        if (user) {
            initCronogramaPage();
        } else {
            if (unsubHistorico) unsubHistorico();
        }
    });
});