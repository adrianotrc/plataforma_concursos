import { auth, db } from './firebase-config.js';
import { collection, doc, getDoc, addDoc, serverTimestamp, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarPlanoDeEstudos, getUsageLimits, refinarPlanoDeEstudosAsync } from './api.js';
import { processingUI } from './processing-ui.js';

// --- ELEMENTOS DO DOM ---
const btnAbrirForm = document.getElementById('btn-abrir-form-cronograma');
const containerForm = document.getElementById('container-form-novo-plano');
const formCronograma = document.getElementById('form-cronograma');
const btnFecharForm = document.getElementById('btn-fechar-form-cronograma');
const containerExibicao = document.getElementById('plano-exibicao');
const containerHistorico = document.getElementById('historico-cronogramas');
const usageCounterDiv = document.getElementById('usage-counter'); // Novo elemento
const diasSemanaCheckboxes = document.querySelectorAll('.dias-semana-grid input[type="checkbox"]');
const materiasCheckboxContainer = document.getElementById('materias-checkbox-container');
const materiasContainer = document.getElementById('materias-container');
const materiasInput = document.getElementById('materias-input');

// --- ESTADO LOCAL ---
let currentUser = null;
let unsubHistorico = null;
let planoAbertoAtual = null;

const materiasPreDefinidas = [
    "Língua Portuguesa", "Raciocínio Lógico", "Matemática", "Informática (Noções ou Conhecimentos Básicos de TI)",
    "Legislação Aplicada ao Órgão (ex.: Lei 8.112/90, Regimento Interno)", "Direito Constitucional", "Direito Administrativo",
    "Administração Pública", "Administração Geral", "Atualidades", "Ética no Serviço Público (com base no Decreto 1.171/94)",
    "Direitos Humanos", "Noções de Direito Penal", "Direito Processual Penal", "Direito Civil", "Noções de Direito Processual Civil",
    "Arquivologia", "Gestão de Pessoas / Comportamento Organizacional", "Administração Financeira e Orçamentária (AFO)",
    "Língua Inglesa", "Contabilidade Pública ou Geral", "Legislação Específica (ex.: Lei Maria da Penha, Estatuto da Criança e do Adolescente, etc)",
    "Contabilidade Geral", "Direito Tributário", "Legislação Tributária"
];

// --- FUNÇÕES DE UI ---

function popularMaterias() {
    materiasCheckboxContainer.innerHTML = materiasPreDefinidas.map(materia => `
        <div class="materia-checkbox-item">
            <input type="checkbox" id="materia-${materia.replace(/ /g, '-')}" name="materias" value="${materia}">
            <label for="materia-${materia.replace(/ /g, '-')}">${materia}</label>
        </div>
    `).join('');
}

function adicionarMateriaTag() {
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

function renderizarHistorico(planos) {
    if (!containerHistorico) return;
    if (!planos || planos.length === 0) {
        containerHistorico.innerHTML = '<div class="card-placeholder"><p>Nenhum cronograma gerado ainda.</p></div>';
        return;
    }
    const planosOrdenados = planos.sort((a, b) => (b.criadoEm?.toDate() || 0) - (a.criadoEm?.toDate() || 0));
    containerHistorico.innerHTML = planosOrdenados.map(plano => {
        const dataFormatada = plano.criadoEm?.toDate()?.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) || 'Processando...';
        const isProcessing = plano.status === 'processing' || plano.status === 'processing_refinement';
        const hasFailed = plano.status === 'failed';
        let subtexto = `Gerado em: ${dataFormatada}`;
        if (plano.data_inicio && plano.data_termino) {
             subtexto += ` | Período: ${plano.data_inicio} a ${plano.data_termino}`;
        }
        let statusIcon = '';
        if (isProcessing) {
            statusIcon = '<i class="fas fa-spinner fa-spin"></i>';
        } else if (hasFailed) {
            statusIcon = '<i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>';
        }
        return `
            <div class="plano-item">
                <div>
                    <h3>${plano.concurso_foco || 'Plano de Estudos'} ${statusIcon}</h3>
                    <p>${subtexto}</p>
                </div>
                <button class="btn btn-primary btn-abrir-plano" data-id="${plano.jobId || plano.id}" ${isProcessing || hasFailed ? 'disabled' : ''}>
                    ${plano.status === 'processing' ? 'Gerando...' : plano.status === 'processing_refinement' ? 'Refinando...' : (hasFailed ? 'Falhou' : 'Abrir')}
                </button>
            </div>
        `;
    }).join('');
}

function exibirPlanoNaTela(plano) {
    if (!containerExibicao || !plano) return;
    planoAbertoAtual = plano;
    if (!plano.cronograma_semanal_detalhado) {
        containerExibicao.innerHTML = `<div class="plano-formatado-container"><div class="card-placeholder"><p>O cronograma detalhado não foi encontrado. Tente criar um novo plano.</p></div></div>`;
        containerExibicao.style.display = 'block';
        return;
    }
    const formatarData = (data) => data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const dataInicioPlano = plano.data_inicio ? new Date(plano.data_inicio + 'T00:00:00Z') : new Date();
    const diasDaSemanaOrdenados = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    let cronogramaHtml = `
        <div class="plano-formatado-container">
            <div class="plano-header">
                <div class="feature-info">
                    <h3>Plano de Estudos: ${plano.concurso_foco || ''}</h3>
                    <p style="white-space: pre-wrap;">${plano.resumo_estrategico || 'Sem resumo estratégico.'}</p>
                </div>
                <div class="header-actions">
                    <button id="btn-refinar-plano" class="btn btn-outline"><i class="fas fa-magic"></i> Refinar este Plano</button>
                    <button id="btn-exportar-excel" class="btn btn-primary"><i class="fas fa-file-excel"></i> Exportar</button>
                    <button id="btn-fechar-plano" class="btn btn-outline">Fechar</button>
                </div>
            </div>
            <div id="container-refinamento" class="feature-card" style="display: none; margin-top: 20px;">
                <form id="form-refinamento">
                    <div class="form-field-group">
                        <label for="feedback-input">Que ajustes você gostaria de fazer neste plano?</label>
                        <textarea id="feedback-input" rows="3" placeholder="Ex: 'Gostaria de estudar Português às segundas e ter mais exercícios de Direito Administrativo.'" required></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">Ajustar com IA</button>
                        <button type="button" id="btn-cancelar-refinamento" class="btn btn-ghost">Cancelar</button>
                    </div>
                </form>
            </div>`;
    const semanas = plano.cronograma_semanal_detalhado;
    let dataCorrente = new Date(dataInicioPlano);
    dataCorrente.setDate(dataCorrente.getDate() - dataCorrente.getDay());
    semanas.forEach(semana => {
        const diasDaSemanaApi = (semana.dias_de_estudo || []).reduce((acc, dia) => {
            acc[dia.dia_semana] = dia.atividades || [];
            return acc;
        }, {});
        cronogramaHtml += `<div class="semana-bloco"><h3>Semana ${semana.semana_numero || ''}</h3><div class="cronograma-tabela-container"><table class="cronograma-tabela"><thead><tr>`;
        diasDaSemanaOrdenados.forEach((dia, index) => {
            const dataDoDia = new Date(dataCorrente);
            dataDoDia.setDate(dataCorrente.getDate() + index);
            cronogramaHtml += `<th><div class="dia-header">${dia.replace('-feira', '')}<span class="data">${formatarData(dataDoDia)}</span></div></th>`;
        });
        cronogramaHtml += `</tr></thead><tbody><tr>`;
        diasDaSemanaOrdenados.forEach(dia => {
            const atividades = diasDaSemanaApi[dia] || [];
            cronogramaHtml += '<td><ul>';
            if (atividades.length > 0) {
                atividades.forEach(atividade => {
                    cronogramaHtml += `<li><strong>${atividade.materia || ''}</strong><p class="topico">${atividade.topico_sugerido || ''}</p><p class="tipo-e-duracao">${atividade.tipo_de_estudo || ''} (${atividade.duracao_minutos} min)</p></li>`;
                });
            }
            cronogramaHtml += '</ul></td>';
        });
        cronogramaHtml += `</tr></tbody></table></div></div>`;
        dataCorrente.setDate(dataCorrente.getDate() + 7);
    });
    cronogramaHtml += `<small class="ai-disclaimer"><i class="fas fa-robot"></i> Conteúdo gerado por inteligência artificial.</small></div>`;
    containerExibicao.innerHTML = cronogramaHtml;
    containerExibicao.style.display = 'block';
}

function exportarPlanoParaExcel() {
    if (!planoAbertoAtual || !planoAbertoAtual.cronograma_semanal_detalhado) {
        showToast("Nenhum plano detalhado para exportar.", "error");
        return;
    }

    const plano = planoAbertoAtual;
    const wb = XLSX.utils.book_new();
    const dataInicioPlano = plano.data_inicio ? new Date(plano.data_inicio + 'T00:00:00Z') : new Date();
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

async function renderUsageInfo() {
    if (!currentUser || !usageCounterDiv) return;
    try {
        // A função getUsageLimits já busca os dados do backend
        const data = await getUsageLimits(currentUser.uid);

        // Pega os valores específicos para 'cronogramas'
        const uso = data.usage.cronogramas || 0; // Se não houver uso, considera 0
        const limite = data.limits.cronogramas || 0;
        const restantes = limite - uso;
        const plano = data.plan;

        let mensagem = '';
        
        // Constrói a mensagem correta com os números dinâmicos
        if (plano === 'trial') {
            mensagem = `Você ainda pode gerar ${restantes} de ${limite} cronogramas durante o seu período de teste.`;
        } else {
            mensagem = `Hoje, você ainda pode gerar ${restantes} de ${limite} cronogramas.`;
        }
        
        usageCounterDiv.textContent = mensagem;
        usageCounterDiv.style.display = 'block';

        // Desabilita o botão se o limite foi atingido
        const btnGerar = document.getElementById('btn-abrir-form-cronograma');
        if(btnGerar) {
            btnGerar.disabled = restantes <= 0;
        }

    } catch (error) {
        console.error("Erro ao buscar limites de uso:", error);
        usageCounterDiv.style.display = 'none';
    }
}

// --- LÓGICA DE EVENTOS ---

formCronograma?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === materiasInput) { e.preventDefault(); adicionarMateriaTag(); } });
materiasInput?.addEventListener('keyup', (e) => { if (e.key === ',') adicionarMateriaTag(); });
diasSemanaCheckboxes.forEach(checkbox => { checkbox.addEventListener('change', (e) => { const inputMinutos = e.target.closest('.dia-horario-item').querySelector('input[type="number"]'); if (inputMinutos) { inputMinutos.disabled = !e.target.checked; if (!e.target.checked) inputMinutos.value = ''; } }); });

formCronograma?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) { showToast("Você precisa estar logado.", "error"); return; }
    const btnGerar = formCronograma.querySelector('button[type="submit"]');
    const materiasSelecionadas = [...document.querySelectorAll('#materias-checkbox-container input:checked')].map(cb => cb.value);
    const materiasEmTags = [...document.querySelectorAll('#materias-container .materia-tag')].map(tag => tag.textContent.replace('×', '').trim());
    const todasMaterias = [...new Set([...materiasSelecionadas, ...materiasEmTags])];
    if (todasMaterias.length === 0) { showToast("Adicione pelo menos uma matéria.", "error"); return; }
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
    if (Object.keys(disponibilidade).length === 0) { showToast("Selecione pelo menos um dia.", "error"); return; }

    // --- INÍCIO DA CORREÇÃO DE DATAS ---
    let dataInicio = document.getElementById('data-inicio').value;
    let dataTermino = document.getElementById('data-termino').value;
    // Se preenchido, converte para ISO (YYYY-MM-DD), senão envia null
    function toISODateOrNull(dateStr) {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        // Verifica se a data é válida
        if (isNaN(d.getTime())) return null;
        return d.toISOString().slice(0, 10);
    }
    dataInicio = toISODateOrNull(dataInicio);
    dataTermino = toISODateOrNull(dataTermino);
    // --- FIM DA CORREÇÃO DE DATAS ---

    const dadosParaApi = {
        userId: currentUser.uid,
        concurso_objetivo: document.getElementById('concurso-objetivo').value,
        fase_concurso: document.getElementById('fase-concurso').value,
        materias: todasMaterias,
        disponibilidade_semanal_minutos: disponibilidade,
        duracao_sessao_minutos: parseInt(document.getElementById('duracao-sessao-estudo').value),
        data_inicio: dataInicio,
        data_termino: dataTermino,
        dificuldades_materias: document.getElementById('dificuldades-materias').value || 'Nenhuma informada.',
        outras_consideracoes: document.getElementById('outras-consideracoes').value || 'Nenhuma.',
    };
    // Usa o novo sistema de processamento
    try {
        await processingUI.startProcessingWithConfirmation({
            confirmationTitle: 'Gerar Cronograma Personalizado',
            confirmationMessage: 'Nossa IA vai criar um cronograma personalizado baseado nos seus dados. Este processo pode demorar 30-60 segundos. Deseja continuar?',
            confirmationIcon: 'fas fa-calendar-alt',
            processingTitle: 'Criando seu Cronograma...',
            processingMessage: 'Nossa IA está analisando seus dados e criando um plano de estudos otimizado para você.',
            estimatedTime: '30-60 segundos',
            resultAreaSelector: '#historico-cronogramas',
            onConfirm: async () => {
                // Esconde o formulário
                containerForm.style.display = 'none';
                
                // Envia a solicitação
                return await gerarPlanoDeEstudos(dadosParaApi);
            },
            onCancel: () => {
                // Usuário cancelou, não faz nada
            },
            onComplete: (result) => {
                // Limpa o formulário
                formCronograma.reset();
                document.querySelectorAll('#materias-container .materia-tag').forEach(tag => tag.remove());
                renderUsageInfo();
                
                // Mostra mensagem de sucesso
                showToast("✅ Cronograma solicitado com sucesso! Você será notificado quando estiver pronto.", 'success');
            }
        });
    } catch (error) {
        if (error.message === 'Operação cancelada pelo usuário') {
            // Usuário cancelou, não mostra erro
            return;
        }
        
        // Mostra erro e reabilita o formulário
        showToast(error.message, 'error');
        containerForm.style.display = 'block';
    }
});

document.body.addEventListener('click', async (e) => {
    const abrirBtn = e.target.closest('.btn-abrir-plano');
    const fecharBtn = e.target.closest('#btn-fechar-plano');
    const exportarBtn = e.target.closest('#btn-exportar-excel');
    const refinarBtn = e.target.closest('#btn-refinar-plano');
    const cancelarRefinamentoBtn = e.target.closest('#btn-cancelar-refinamento');

    if (abrirBtn && !abrirBtn.disabled) {
        const planoId = abrirBtn.dataset.id;
        const user = auth.currentUser;
        if (planoId && user) {
            const docRef = doc(db, 'users', user.uid, 'plans', planoId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                exibirPlanoNaTela(docSnap.data());
            } else {
                showToast("Não foi possível encontrar este plano.", "error");
            }
        }
    } else if (refinarBtn) {
        const container = document.getElementById('container-refinamento');
        if (container) container.style.display = container.style.display === 'none' ? 'block' : 'none';
    } else if (cancelarRefinamentoBtn) {
        const container = document.getElementById('container-refinamento');
        if (container) container.style.display = 'none';
    } else if (exportarBtn) {
        exportarPlanoParaExcel();
    } else if (fecharBtn) {
        containerExibicao.style.display = 'none';
        containerExibicao.innerHTML = '';
        planoAbertoAtual = null;
    }
});

btnAbrirForm?.addEventListener('click', () => { containerForm.style.display = 'block'; });
btnFecharForm?.addEventListener('click', () => { containerForm.style.display = 'none'; });

// --- LÓGICA DE INICIALIZAÇÃO ---
function ouvirHistoricoDePlanos() {
    if (unsubHistorico) unsubHistorico();
    const q = query(collection(db, `users/${currentUser.uid}/plans`), orderBy("criadoEm", "desc"));
    unsubHistorico = onSnapshot(q, (querySnapshot) => {
        const planos = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarHistorico(planos);
    });
}

function initCronogramaPage() {
    currentUser = auth.currentUser;
    if (currentUser) {
        popularMaterias();
        ouvirHistoricoDePlanos();
        renderUsageInfo(); 
    }
}

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
        if (user) {
            initCronogramaPage();
        } else {
            if (unsubHistorico) unsubHistorico();
            currentUser = null;
        }
    });
});

document.body.addEventListener('submit', async (e) => {
    if (e.target.id === 'form-refinamento') {
        e.preventDefault();
        if (!planoAbertoAtual) {
            showToast("Nenhum plano aberto para refinar.", "error");
            return;
        }

        const feedbackInput = document.getElementById('feedback-input');
        const feedbackText = feedbackInput.value;
        if (!feedbackText.trim()) {
            showToast("Por favor, descreva o ajuste desejado.", "error");
            return;
        }

        const btnAjustar = e.target.querySelector('button[type="submit"]');
        btnAjustar.disabled = true;
        btnAjustar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ajustando...';

        const dados = {
            userId: currentUser.uid,
            jobId: planoAbertoAtual.jobId || planoAbertoAtual.id,
            originalPlan: planoAbertoAtual,
            feedbackText: feedbackText
        };

        try {
            await refinarPlanoDeEstudosAsync(dados);
            showToast("Solicitação de ajuste enviada! Seu cronograma será atualizado em breve.", 'info');
        
            // Limpa e oculta o formulário de refinamento
            document.getElementById('container-refinamento').style.display = 'none';
            feedbackInput.value = '';
        
            // --- Linhas Adicionadas ---
            // Oculta a visualização do plano atual, retornando ao histórico
            containerExibicao.style.display = 'none';
            containerExibicao.innerHTML = '';
            planoAbertoAtual = null;
            // --- Fim das Linhas Adicionadas ---
        
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            btnAjustar.disabled = false;
            btnAjustar.innerHTML = 'Ajustar com IA';
            renderUsageInfo(); // Atualiza a contagem de uso
        }
    }
});