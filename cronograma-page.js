import { auth, db } from './firebase-config.js';
import { collection, doc, getDoc, addDoc, serverTimestamp, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarPlanoDeEstudos, getUsageLimits, refinarPlanoDeEstudosAsync, registrarProgresso, obterProgresso, calcularMetricasProgresso, excluirItem } from './api.js';
import { state } from './main-app.js';

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

// --- NOVOS ELEMENTOS PARA MÉTRICAS ---
const metricasContainer = document.getElementById('metricas-cronograma-container');
const metricasContent = document.getElementById('metricas-content');
const seletorCronograma = document.getElementById('seletor-cronograma');

// --- ESTADO LOCAL ---
let currentUser = null;
let unsubHistorico = null;
let planoAbertoAtual = null;
let ultimoJobIdSolicitado = null; // Acompanhar o job mais recente
let planosDisponiveis = []; // Lista de planos para o seletor
let planoSelecionado = null; // Plano atualmente selecionado para métricas

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

// --- FUNÇÕES PARA MÉTRICAS DO CRONOGRAMA ---

function calcularMetricasPlano(plano) {
    if (!plano || !plano.cronograma_semanal_detalhado) {
        return null;
    }

    const semanas = plano.cronograma_semanal_detalhado;
    const totalSemanas = semanas.length;
    
    // Calcular dias de estudo únicos
    const diasEstudo = new Set();
    let totalSessoes = 0;
    let totalMinutos = 0;
    const materiasUnicas = new Set();
    const tecnicasUtilizadas = new Set();

    semanas.forEach(semana => {
        semana.dias_de_estudo?.forEach(dia => {
            diasEstudo.add(dia.dia_semana);
            dia.atividades?.forEach(atividade => {
                totalSessoes++;
                totalMinutos += atividade.duracao_minutos || 0;
                materiasUnicas.add(atividade.materia);
                tecnicasUtilizadas.add(atividade.tipo_de_estudo);
            });
        });
    });

    // Calcular período
    let periodoTexto = 'Período não definido';
    if (plano.data_inicio && plano.data_termino) {
        const dataInicio = new Date(plano.data_inicio);
        const dataTermino = new Date(plano.data_termino);
        const diasPeriodo = Math.ceil((dataTermino - dataInicio) / (1000 * 60 * 60 * 24)) + 1;
        periodoTexto = `${plano.data_inicio} a ${plano.data_termino} (${diasPeriodo} dias)`;
    }

    // Calcular tempo semanal - CORREÇÃO
    let tempoSemanalTotal = 0;
    if (plano.disponibilidade_semanal_minutos && typeof plano.disponibilidade_semanal_minutos === 'object') {
        tempoSemanalTotal = Object.values(plano.disponibilidade_semanal_minutos).reduce((total, minutos) => {
            return total + (parseInt(minutos) || 0);
        }, 0);
    }
    
    const horas = Math.floor(tempoSemanalTotal / 60);
    const minutos = tempoSemanalTotal % 60;
    const tempoSemanalTexto = `${tempoSemanalTotal} min (${horas}h ${minutos}min)`;
    


    // Calcular sessões por semana
    const sessoesPorSemana = Math.floor(tempoSemanalTotal / (plano.duracao_sessao_minutos || 25));

    return {
        concurso: plano.concurso_foco || 'Não especificado',
        fase: obterTextoFase(plano.fase_concurso),
        periodo: periodoTexto,
        materias: materiasUnicas.size,
        diasEstudo: Array.from(diasEstudo).sort(),
        tempoSemanal: tempoSemanalTexto,
        sessoesPorSemana: sessoesPorSemana,
        duracaoSessao: plano.duracao_sessao_minutos || 25,
        totalSemanas: totalSemanas,
        totalSessoes: totalSessoes,
        totalMinutos: totalMinutos,
        tecnicasUtilizadas: Array.from(tecnicasUtilizadas)
    };
}

function obterTextoFase(fase) {
    if (!fase) {
        return 'Não especificada';
    }
    
    const fases = {
        'base_sem_edital_especifico': 'Base sem edital específico',
        'pre_edital_com_foco': 'Pré-edital com foco',
        'pos_edital_publicado': 'Pós-edital publicado'
    };
    
    return fases[fase] || 'Não especificada';
}



function renderizarMetricasPlano(plano) {
    if (!metricasContent || !plano) {
        return;
    }

    const metricas = calcularMetricasPlano(plano);
    if (!metricas) {
        metricasContent.innerHTML = '<p>Não foi possível calcular as métricas para este cronograma.</p>';
        return;
    }

    const diasEstudoTexto = metricas.diasEstudo.map(dia => 
        dia.replace('-feira', '').substring(0, 3)
    ).join(', ');

    metricasContent.innerHTML = `
        <div class="metricas-table">
            <table>
                <tbody>
                    <tr>
                        <td class="metric-label">
                            <i class="fas fa-trophy"></i>
                            Concurso
                        </td>
                        <td class="metric-value">${metricas.concurso}</td>
                    </tr>
                    <tr>
                        <td class="metric-label">
                            <i class="fas fa-flag"></i>
                            Fase
                        </td>
                        <td class="metric-value">${metricas.fase}</td>
                    </tr>
                    <tr>
                        <td class="metric-label">
                            <i class="fas fa-calendar"></i>
                            Período
                        </td>
                        <td class="metric-value">${metricas.periodo}</td>
                    </tr>
                    <tr>
                        <td class="metric-label">
                            <i class="fas fa-book"></i>
                            Matérias
                        </td>
                        <td class="metric-value">${metricas.materias} selecionadas</td>
                    </tr>
                </tbody>
            </table>
            
            <table>
                <tbody>
                    <tr>
                        <td class="metric-label">
                            <i class="fas fa-calendar-week"></i>
                            Dias de Estudo
                        </td>
                        <td class="metric-value">${diasEstudoTexto} <span class="metric-subtitle">(${metricas.diasEstudo.length} dias/semana)</span></td>
                    </tr>
                    <tr>
                        <td class="metric-label">
                            <i class="fas fa-clock"></i>
                            Tempo Semanal
                        </td>
                        <td class="metric-value">${metricas.tempoSemanal}</td>
                    </tr>
                    <tr>
                        <td class="metric-label">
                            <i class="fas fa-stopwatch"></i>
                            Sessões
                        </td>
                        <td class="metric-value">${metricas.duracaoSessao} min cada <span class="metric-subtitle">(~${metricas.sessoesPorSemana}/semana)</span></td>
                    </tr>
                    <tr>
                        <td class="metric-label">
                            <i class="fas fa-chart-bar"></i>
                            Plano Completo
                        </td>
                        <td class="metric-value">${metricas.totalSemanas} semanas <span class="metric-subtitle">(${metricas.totalSessoes} sessões totais)</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

function popularSeletorCronogramas(planos) {
    if (!seletorCronograma) return;
    
    // Limpar opções existentes
    seletorCronograma.innerHTML = '<option value="">Selecione um cronograma...</option>';
    
    // Filtrar apenas planos completos
    const planosCompletos = planos.filter(plano => 
        plano.status === 'completed' && plano.cronograma_semanal_detalhado
    );
    
    planosCompletos.forEach(plano => {
        const dataFormatada = plano.criadoEm?.toDate()?.toLocaleDateString('pt-BR') || 'Data desconhecida';
        const option = document.createElement('option');
        option.value = plano.jobId || plano.id;
        option.textContent = `${plano.concurso_foco || 'Plano'} - ${dataFormatada}`;
        seletorCronograma.appendChild(option);
    });
    
    // Se há planos, selecionar o mais recente e carregar dados automaticamente
    if (planosCompletos.length > 0) {
        const planoMaisRecente = planosCompletos[0];
        seletorCronograma.value = planoMaisRecente.jobId || planoMaisRecente.id;
        planoSelecionado = planoMaisRecente;
        
        // Carrega métricas do plano
        renderizarMetricasPlano(planoMaisRecente);
        metricasContainer.style.display = 'block';
        
        // Carrega progresso automaticamente
        carregarMetricasProgresso(planoMaisRecente.jobId || planoMaisRecente.id);
        progressoContainer.style.display = 'block';
    } else {
        metricasContainer.style.display = 'none';
        progressoContainer.style.display = 'none';
    }
}

function renderizarHistorico(planos) {
    if (!containerHistorico) return;
    
    // Atualizar lista global de planos
    planosDisponiveis = planos || [];
    
    // Popular seletor de cronogramas
    popularSeletorCronogramas(planosDisponiveis);
    
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
                <div class="plano-actions">
                    <button class="btn btn-primary btn-abrir-plano" data-id="${plano.jobId || plano.id}" ${isProcessing || hasFailed ? 'disabled' : ''}>
                        ${plano.status === 'processing' ? 'Gerando...' : plano.status === 'processing_refinement' ? 'Refinando...' : (hasFailed ? 'Falhou' : 'Abrir')}
                    </button>
                    ${!isProcessing ? `
                        <div class="action-buttons">
                            <button class="btn btn-outline btn-excluir" data-id="${plano.jobId || plano.id}" title="Excluir plano">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
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
                    <button id="btn-refinar-plano" class="btn btn-primary"><i class="fas fa-magic"></i> Refinar este Plano</button>
                    <button id="btn-exportar-excel" class="btn btn-primary"><i class="fas fa-file-excel"></i> Exportar</button>
                    <button id="btn-fechar-plano" class="btn btn-outline">Fechar</button>
                </div>
                <div class="plano-orientacao">
                    <p><i class="fas fa-lightbulb"></i> <strong>Dica:</strong> Use os botões de cada matéria para marcar seu progresso e acompanhar suas estatísticas em tempo real!</p>
                </div>
                <div class="status-legend">
                    <span class="legend-title">Legenda dos Status:</span>
                    <div class="legend-items">
                        <span class="legend-item legend-concluido"><i class="fas fa-check"></i> Concluído</span>
                        <span class="legend-item legend-modificado"><i class="fas fa-edit"></i> Modificado</span>
                        <span class="legend-item legend-incompleto"><i class="fas fa-times"></i> Incompleto</span>
                    </div>
                </div>
            </div>
            <div id="container-refinamento" class="feature-card" style="display: none; margin-top: 20px;" data-debug="container-criado">
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
                cronogramaHtml += `<li class="atividade-item">
                    <div class="materia-nome">${atividade.materia || ''}</div>
                    <div class="topico">${atividade.topico_sugerido || ''}</div>
                    <div class="tipo-e-duracao">${atividade.tipo_de_estudo || ''} (${atividade.duracao_minutos} min)</div>
                </li>`;
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
    
    // Debug: verifica se o container foi criado corretamente
    setTimeout(() => {
        const containerRefinamento = document.getElementById('container-refinamento');
        if (containerRefinamento) {
            console.log('Container criado, display inicial:', containerRefinamento.style.display);
            console.log('Container tem data-debug?', containerRefinamento.hasAttribute('data-debug'));
        }
    }, 50);
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
    console.log('Verificando processingUI antes do uso:', window.processingUI);
    if (!window.processingUI) {
        showToast("Erro: Sistema de processamento não disponível.", "error");
        return;
    }
    window.processingUI.startProcessingWithConfirmation({
        confirmationTitle: 'Gerar Cronograma Personalizado',
        confirmationMessage: 'Nossa IA vai criar um cronograma personalizado baseado nos seus dados. Este processo pode demorar 30-60 segundos. Deseja continuar?',
        confirmationIcon: 'fas fa-calendar-alt',
        processingTitle: 'Criando seu Cronograma...',
        processingMessage: 'Nossa IA está analisando seus dados e criando um plano de estudos otimizado para você.',
        estimatedTime: '30-60 segundos',
        resultAreaSelector: '#historico-cronogramas',
        onConfirm: async () => {
            try {
                // Esconde o formulário
                containerForm.style.display = 'none';
                
                // Envia a solicitação
                const resposta = await gerarPlanoDeEstudos(dadosParaApi);
                // Guarda o jobId para identificar quando ficar pronto
                ultimoJobIdSolicitado = resposta.jobId;
                return resposta;
            } catch (error) {
                // Mostra erro e reabilita o formulário
                showToast(error.message, 'error');
                containerForm.style.display = 'block';
                throw error; // Re-lança o erro para ser tratado pelo sistema
            }
        },
        onCancel: () => {
            // Usuário cancelou, não faz nada
        },
        onComplete: (result) => {
            // Limpa o formulário
            formCronograma.reset();
            document.querySelectorAll('#materias-container .materia-tag').forEach(tag => tag.remove());
            renderUsageInfo();
            
            // Toast informativo curto
            showToast("Cronograma solicitado! Gerando...", 'info', 3000);
            
            // Scroll para o histórico para acompanhar o progresso
            setTimeout(() => {
                document.querySelector('#historico-cronogramas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 500);
        }
    });
});

document.body.addEventListener('click', async (e) => {
    const abrirBtn = e.target.closest('.btn-abrir-plano');
    const fecharBtn = e.target.closest('#btn-fechar-plano');
    const exportarBtn = e.target.closest('#btn-exportar-excel');
    const refinarBtn = e.target.closest('#btn-refinar-plano');
    const cancelarRefinamentoBtn = e.target.closest('#btn-cancelar-refinamento');
    const btnExcluir = e.target.closest('.btn-excluir');


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
    } else if (btnExcluir) {
        const planoId = btnExcluir.dataset.id;
        const plano = planosDisponiveis.find(p => (p.jobId || p.id) === planoId);
        
        if (plano) {
            const confirmed = await window.confirmCustom({
                title: 'Excluir Plano',
                message: `Tem certeza que deseja excluir o plano "${plano.concurso_foco || 'Plano de Estudos'}"?`,
                confirmText: 'Excluir',
                cancelText: 'Cancelar',
                confirmClass: 'btn-danger',
                icon: 'fas fa-trash'
            });
            
            if (confirmed) {
                try {
                    btnExcluir.disabled = true;
                    btnExcluir.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    
                    await excluirItem(state.user.uid, 'plans', planoId);
                    showToast("Plano excluído com sucesso!", "success");
                    
                    // Remove o item da lista local
                    planosDisponiveis = planosDisponiveis.filter(p => (p.jobId || p.id) !== planoId);
                    renderizarHistorico(planosDisponiveis);
                    
                } catch (error) {
                    console.error("Erro ao excluir plano:", error);
                    showToast("Erro ao excluir plano. Tente novamente.", "error");
                    btnExcluir.disabled = false;
                    btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
                }
                      }
      }
    } else if (refinarBtn) {
        // Removido - conflito com o event listener separado
        console.log('Event listener duplicado detectado - ignorando');
    } else if (cancelarRefinamentoBtn) {
        // Removido - conflito com o event listener separado
        console.log('Event listener duplicado detectado - ignorando');
    } else if (exportarBtn) {
        exportarPlanoParaExcel();
    } else if (fecharBtn) {
        containerExibicao.style.display = 'none';
        containerExibicao.innerHTML = '';
        planoAbertoAtual = null;
    }
});

btnAbrirForm?.addEventListener('click', () => { 
    containerForm.style.display = 'block'; 
    // Scroll suave para o formulário
    containerForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
btnFecharForm?.addEventListener('click', () => { 
    containerForm.style.display = 'none'; 
    // Scroll suave para o topo da seção
    document.querySelector('.welcome-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Event listener para o seletor de cronogramas
seletorCronograma?.addEventListener('change', async (e) => {
    const planoId = e.target.value;
    if (!planoId) {
        metricasContainer.style.display = 'none';
        progressoContainer.style.display = 'none';
        planoSelecionado = null;
        return;
    }
    
    const plano = planosDisponiveis.find(p => (p.jobId || p.id) === planoId);
    if (plano) {
        planoSelecionado = plano;
        renderizarMetricasPlano(plano);
        metricasContainer.style.display = 'block';
        
        // Carrega progresso automaticamente
        await carregarMetricasProgresso(plano.jobId || plano.id);
        progressoContainer.style.display = 'block';
    }
});

// --- LÓGICA DE INICIALIZAÇÃO ---
function ouvirHistoricoDePlanos() {
    if (unsubHistorico) unsubHistorico();
    const q = query(collection(db, `users/${currentUser.uid}/plans`), orderBy("criadoEm", "desc"));
    unsubHistorico = onSnapshot(q, (querySnapshot) => {
        const planos = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarHistorico(planos);

        // Verifica se algum plano recém-solicitado foi concluído
        querySnapshot.docChanges().forEach((change) => {
            if (change.type === 'modified') {
                const dado = change.doc.data();
                if (dado.status === 'completed' && change.doc.id === ultimoJobIdSolicitado) {
                    showToast('✅ Seu novo cronograma está pronto! Abrindo automaticamente...', 'success', 5000);
                    
                    // Remove destaque da área de resultado se ainda existir
                    if (window.processingUI) {
                        window.processingUI.removeResultAreaHighlight('#historico-cronogramas');
                    }
                    
                    // Abre automaticamente o cronograma recém-criado
                    setTimeout(() => {
                        exibirPlanoComProgresso(dado);
                        // Scroll para o topo do cronograma
                        containerExibicao.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 1000);
                    
                    ultimoJobIdSolicitado = null;
                }
            }
        });
    });
}

function initCronogramaPage() {
    currentUser = auth.currentUser;
    if (currentUser) {
        popularMaterias();
        ouvirHistoricoDePlanos();
        renderUsageInfo();
        
        // O progresso será mostrado automaticamente quando houver planos disponíveis
        // Não escondemos mais aqui, pois será controlado pela função popularSeletorCronogramas
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

// --- SISTEMA DE ACOMPANHAMENTO DE PROGRESSO ---

// Elementos do DOM para progresso
const progressoContainer = document.getElementById('progresso-container');
const progressoConcluidas = document.getElementById('progresso-concluidas');
const progressoStreak = document.getElementById('progresso-streak');
const progressoPorcentagem = document.getElementById('progresso-porcentagem');

// Estado do progresso
let progressoAtual = null;
let metricasProgresso = null;
let progressoCache = new Map(); // Cache para métricas de progresso

// Função para adicionar botões de ação nas sessões
function adicionarBotoesAcao(sessaoElement, sessaoId, planoId) {
    const acoesDiv = document.createElement('div');
    acoesDiv.className = 'sessao-acoes';
    
    // Botões menores com apenas ícones
    const btnConcluido = document.createElement('button');
    btnConcluido.className = 'btn-acao btn-concluido';
    btnConcluido.innerHTML = '<i class="fas fa-check"></i>';
    btnConcluido.title = 'Marcar como concluído';
    btnConcluido.onclick = () => registrarProgressoSessao(sessaoId, planoId, 'completed');
    
    const btnModificado = document.createElement('button');
    btnModificado.className = 'btn-acao btn-modificado';
    btnModificado.innerHTML = '<i class="fas fa-edit"></i>';
    btnModificado.title = 'Marcar como modificado';
    btnModificado.onclick = () => registrarProgressoSessao(sessaoId, planoId, 'modified');
    
    const btnIncompleto = document.createElement('button');
    btnIncompleto.className = 'btn-acao btn-incompleto';
    btnIncompleto.innerHTML = '<i class="fas fa-times"></i>';
    btnIncompleto.title = 'Marcar como incompleto';
    btnIncompleto.onclick = () => registrarProgressoSessao(sessaoId, planoId, 'incomplete');
    
    acoesDiv.appendChild(btnConcluido);
    acoesDiv.appendChild(btnModificado);
    acoesDiv.appendChild(btnIncompleto);
    
    sessaoElement.appendChild(acoesDiv);
}

// Função para registrar progresso de uma sessão
async function registrarProgressoSessao(sessaoId, planoId, status) {
    if (!currentUser) {
        showToast('Usuário não autenticado', 'error');
        return;
    }
    
    try {
        const dados = {
            userId: currentUser.uid,
            planoId: planoId,
            sessaoId: sessaoId,
            status: status,
            observacoes: '',
            tempoReal: 0
        };
        
        await registrarProgresso(dados);
        
        // Atualiza o status visual da sessão
        atualizarStatusSessao(sessaoId, status);
        
        // Invalida o cache para forçar recarregamento
        const cacheKey = `${currentUser.uid}_${planoId}`;
        progressoCache.delete(cacheKey);
        
        // Atualiza as métricas de progresso de forma assíncrona (sem bloquear)
        setTimeout(() => {
            carregarMetricasProgresso(planoId);
        }, 200);
        
        const statusText = {
            'completed': 'concluída',
            'modified': 'modificada', 
            'incomplete': 'marcada como incompleta'
        };
        
        showToast(`Sessão ${statusText[status]} com sucesso!`, 'success');
        
    } catch (error) {
        console.error('Erro ao registrar progresso:', error);
        showToast('Erro ao registrar progresso', 'error');
    }
}

// Função para atualizar o status visual de uma sessão
function atualizarStatusSessao(sessaoId, status) {
    const sessaoElement = document.querySelector(`[data-sessao-id="${sessaoId}"]`);
    if (!sessaoElement) return;
    
    // Remove status anteriores
    sessaoElement.classList.remove('status-concluido', 'status-modificado', 'status-incompleto');
    
    // Adiciona novo status
    const statusClass = `status-${status}`;
    sessaoElement.classList.add(statusClass);
    
    // Remove badge anterior se existir
    const statusBadgeAnterior = sessaoElement.querySelector('.sessao-status');
    if (statusBadgeAnterior) {
        statusBadgeAnterior.remove();
    }
    
    // Cria novo badge de status com melhor formatação
    const statusBadge = document.createElement('div');
    statusBadge.className = `sessao-status status-${status}`;
    
    const statusConfig = {
        'completed': {
            icon: 'fas fa-check',
            text: 'Concluído',
            color: '#065f46'
        },
        'modified': {
            icon: 'fas fa-edit',
            text: 'Modificado',
            color: '#92400e'
        },
        'incomplete': {
            icon: 'fas fa-times',
            text: 'Incompleto',
            color: '#991b1b'
        }
    };
    
    const config = statusConfig[status];
    statusBadge.innerHTML = `
        <i class="${config.icon}" style="color: ${config.color}; margin-right: 4px;"></i>
        <span style="color: ${config.color}; font-weight: 500;">${config.text}</span>
    `;
    
    // Adiciona o badge de forma segura, preservando outros elementos
    const acoesDiv = sessaoElement.querySelector('.sessao-acoes');
    if (acoesDiv) {
        // Insere o badge após os botões de ação
        acoesDiv.parentNode.insertBefore(statusBadge, acoesDiv.nextSibling);
    } else {
        // Fallback: adiciona no final da sessão
        sessaoElement.appendChild(statusBadge);
    }
}

// Função para carregar métricas de progresso
async function carregarMetricasProgresso(planoId) {
    if (!currentUser || !planoId) return;
    
    // Verifica se já temos os dados em cache
    const cacheKey = `${currentUser.uid}_${planoId}`;
    const cachedData = progressoCache.get(cacheKey);
    
    // Se temos dados em cache e não são muito antigos (menos de 120 segundos), usa cache
    if (cachedData && (Date.now() - cachedData.timestamp) < 120000) {
        metricasProgresso = cachedData.data;
        renderizarProgressoFromCache();
        return;
    }
    
    // Mostra loading state apenas se não há dados em cache
    if (progressoContainer && !metricasProgresso) {
        progressoContainer.style.display = 'block';
        progressoContainer.innerHTML = `
            <div class="loading-progresso">
                <div class="spinner"></div>
                <p>Carregando progresso...</p>
            </div>
        `;
    }
    
    try {
        // Timeout de 10 segundos para evitar travamento
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await calcularMetricasProgresso(currentUser.uid, planoId);
        clearTimeout(timeoutId);
        
        metricasProgresso = response;
        
        // Salva no cache
        progressoCache.set(cacheKey, {
            data: response,
            timestamp: Date.now()
        });
        
        // Restaura o conteúdo original do container
        if (progressoContainer) {
            progressoContainer.innerHTML = `
                <div class="progresso-header">
                    <h3><i class="fas fa-chart-line"></i> Acompanhamento de Progresso</h3>
                    <div class="progresso-orientacao">
                        <p><i class="fas fa-info-circle"></i> Para acompanhar seu progresso, clique nos botões de cada matéria no cronograma para marcar como <strong>Concluído</strong>, <strong>Modificado</strong> ou <strong>Incompleto</strong>.</p>
                    </div>
                </div>
                <div class="progresso-stats">
                    <div class="stat-item">
                        <div class="stat-value" id="progresso-concluidas">0</div>
                        <div class="stat-label">Sessões Concluídas</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="progresso-streak">0</div>
                        <div class="stat-label">Dias Consecutivos</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="progresso-porcentagem">0%</div>
                        <div class="stat-label">Conclusão</div>
                    </div>
                </div>
                <div class="progresso-grafico">
                    <h4>Progresso por Semana</h4>
                    <div id="grafico-progresso"></div>
                </div>
            `;
        }
        
        // Atualiza os elementos da interface
        const progressoConcluidas = document.getElementById('progresso-concluidas');
        const progressoStreak = document.getElementById('progresso-streak');
        const progressoPorcentagem = document.getElementById('progresso-porcentagem');
        
        if (progressoConcluidas) {
            progressoConcluidas.textContent = metricasProgresso.sessoesCompletadas;
        }
        if (progressoStreak) {
            progressoStreak.textContent = metricasProgresso.diasConsecutivos;
        }
        if (progressoPorcentagem) {
            progressoPorcentagem.textContent = `${metricasProgresso.porcentagemConclusao}%`;
        }
        
        // Gera o gráfico de progresso de forma assíncrona
        setTimeout(() => {
            gerarGraficoProgresso(planoId);
        }, 100);
        
    } catch (error) {
        console.error('Erro ao carregar métricas de progresso:', error);
        if (progressoContainer) {
            progressoContainer.innerHTML = `
                <div class="error-progresso">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Erro ao carregar progresso. Tente novamente.</p>
                </div>
            `;
        }
    }
}

// Função para renderizar progresso a partir do cache (sem loading)
function renderizarProgressoFromCache() {
    if (!progressoContainer || !metricasProgresso) return;
    
    // Restaura o conteúdo original do container
    progressoContainer.innerHTML = `
        <div class="progresso-header">
            <h3><i class="fas fa-chart-line"></i> Acompanhamento de Progresso</h3>
            <div class="progresso-orientacao">
                <p><i class="fas fa-info-circle"></i> Para acompanhar seu progresso, clique nos botões de cada matéria no cronograma para marcar como <strong>Concluído</strong>, <strong>Modificado</strong> ou <strong>Incompleto</strong>.</p>
            </div>
        </div>
        <div class="progresso-stats">
            <div class="stat-item">
                <div class="stat-value" id="progresso-concluidas">0</div>
                <div class="stat-label">Sessões Concluídas</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" id="progresso-streak">0</div>
                <div class="stat-label">Dias Consecutivos</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" id="progresso-porcentagem">0%</div>
                <div class="stat-label">Conclusão</div>
            </div>
        </div>
        <div class="progresso-grafico">
            <h4>Progresso por Semana</h4>
            <div id="grafico-progresso"></div>
        </div>
    `;
    
    // Atualiza os elementos da interface
    const progressoConcluidas = document.getElementById('progresso-concluidas');
    const progressoStreak = document.getElementById('progresso-streak');
    const progressoPorcentagem = document.getElementById('progresso-porcentagem');
    
    if (progressoConcluidas) {
        progressoConcluidas.textContent = metricasProgresso.sessoesCompletadas;
    }
    if (progressoStreak) {
        progressoStreak.textContent = metricasProgresso.diasConsecutivos;
    }
    if (progressoPorcentagem) {
        progressoPorcentagem.textContent = `${metricasProgresso.porcentagemConclusao}%`;
    }
    
    // Gera o gráfico de progresso
    if (planoSelecionado) {
        gerarGraficoProgresso(planoSelecionado.jobId || planoSelecionado.id);
    }
}

// Função para gerar gráfico de progresso por semana
function gerarGraficoProgresso(planoId) {
    const graficoContainer = document.getElementById('grafico-progresso');
    if (!graficoContainer) return;
    
    // Usa planoAbertoAtual se disponível, senão usa planoSelecionado
    const planoParaGrafico = planoAbertoAtual || planoSelecionado;
    if (!planoParaGrafico) return;
    
    // Se não há dados de progresso, não gera o gráfico
    if (!metricasProgresso) return;
    
    const semanas = planoParaGrafico.cronograma_semanal_detalhado || [];
    const progresso = metricasProgresso?.progresso || [];
    
    let graficoHtml = '';
    
    // Calcula progresso geral primeiro
    const totalGeral = metricasProgresso?.totalSessoes || 0;
    const concluidasGeral = metricasProgresso?.sessoesCompletadas || 0;
    const modificadasGeral = metricasProgresso?.sessoesModificadas || 0;
    const incompletasGeral = metricasProgresso?.sessoesIncompletas || 0;
    
    const pctConcluidaGeral = totalGeral > 0 ? (concluidasGeral / totalGeral) * 100 : 0;
    const pctModificadaGeral = totalGeral > 0 ? (modificadasGeral / totalGeral) * 100 : 0;
    const pctIncompletaGeral = totalGeral > 0 ? (incompletasGeral / totalGeral) * 100 : 0;
    
    // Adiciona barra de progresso geral
    graficoHtml += `
        <div class="semana-progresso progresso-geral">
            <div class="semana-label">Progresso Geral</div>
            <div class="semana-barras">
                ${pctConcluidaGeral > 0 ? `<div class="barra-progresso barra-concluida" style="width: ${pctConcluidaGeral}%"></div>` : ''}
                ${pctModificadaGeral > 0 ? `<div class="barra-progresso barra-modificada" style="width: ${pctModificadaGeral}%"></div>` : ''}
                ${pctIncompletaGeral > 0 ? `<div class="barra-progresso barra-incompleta" style="width: ${pctIncompletaGeral}%"></div>` : ''}
            </div>
            <div class="semana-stats">
                <div class="stat-barra stat-concluida">
                    <i></i>
                    <span>${concluidasGeral}/${totalGeral}</span>
                </div>
                <div class="stat-barra stat-modificada">
                    <i></i>
                    <span>${modificadasGeral}</span>
                </div>
                <div class="stat-barra stat-incompleta">
                    <i></i>
                    <span>${incompletasGeral}</span>
                </div>
            </div>
        </div>
    `;
    
    // Calcula progresso por semana individual
    let sessaoIndexGlobal = 0;
    semanas.forEach((semana, index) => {
        const semanaNum = semana.semana_numero || (index + 1);
        const totalSessoes = semana.dias_de_estudo?.reduce((total, dia) => {
            return total + (dia.atividades?.length || 0);
        }, 0) || 0;
        
        // Conta progresso por status para esta semana específica
        const sessoesSemana = [];
        semana.dias_de_estudo?.forEach(dia => {
            dia.atividades?.forEach((atividade, atvIndex) => {
                const sessaoId = `sessao_${planoId}_${sessaoIndexGlobal}`;
                sessoesSemana.push(sessaoId);
                sessaoIndexGlobal++;
            });
        });
        
        const concluidas = progresso.filter(p => 
            sessoesSemana.includes(p.sessaoId) && p.status === 'completed'
        ).length;
        
        const modificadas = progresso.filter(p => 
            sessoesSemana.includes(p.sessaoId) && p.status === 'modified'
        ).length;
        
        const incompletas = progresso.filter(p => 
            sessoesSemana.includes(p.sessaoId) && p.status === 'incomplete'
        ).length;
        
        // Calcula porcentagens para as barras
        const pctConcluida = totalSessoes > 0 ? (concluidas / totalSessoes) * 100 : 0;
        const pctModificada = totalSessoes > 0 ? (modificadas / totalSessoes) * 100 : 0;
        const pctIncompleta = totalSessoes > 0 ? (incompletas / totalSessoes) * 100 : 0;
        
        graficoHtml += `
            <div class="semana-progresso">
                <div class="semana-label">Semana ${semanaNum}</div>
                <div class="semana-barras">
                    ${pctConcluida > 0 ? `<div class="barra-progresso barra-concluida" style="width: ${pctConcluida}%"></div>` : ''}
                    ${pctModificada > 0 ? `<div class="barra-progresso barra-modificada" style="width: ${pctModificada}%"></div>` : ''}
                    ${pctIncompleta > 0 ? `<div class="barra-progresso barra-incompleta" style="width: ${pctIncompleta}%"></div>` : ''}
                </div>
                <div class="semana-stats">
                    <div class="stat-barra stat-concluida">
                        <i></i>
                        <span>${concluidas}/${totalSessoes}</span>
                    </div>
                    <div class="stat-barra stat-modificada">
                        <i></i>
                        <span>${modificadas}</span>
                    </div>
                    <div class="stat-barra stat-incompleta">
                        <i></i>
                        <span>${incompletas}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    graficoContainer.innerHTML = graficoHtml;
}

// Função para carregar progresso existente
async function carregarProgressoExistente(planoId) {
    if (!currentUser || !planoId) return;
    
    try {
        const response = await obterProgresso(currentUser.uid, planoId);
        progressoAtual = response.progresso;
        
        // Aplica os status visuais para sessões já registradas
        progressoAtual.forEach(registro => {
            atualizarStatusSessao(registro.sessaoId, registro.status);
        });
        
    } catch (error) {
        console.error('Erro ao carregar progresso existente:', error);
    }
}

// Função para modificar a exibição do plano para incluir botões de ação
function exibirPlanoComProgresso(plano) {
    // Mantém a seção de progresso sempre visível
    // Não esconde mais a caixa de progresso
    
    // Chama a função original de exibição
    exibirPlanoNaTela(plano);
    
    // Aguarda um pouco para o DOM ser renderizado
    setTimeout(() => {
        // Adiciona botões de ação em todas as sessões
        const sessoes = document.querySelectorAll('.atividade-item');
        sessoes.forEach((sessao, index) => {
            const sessaoId = `sessao_${plano.jobId || plano.id}_${index}`;
            sessao.setAttribute('data-sessao-id', sessaoId);
            adicionarBotoesAcao(sessao, sessaoId, plano.jobId || plano.id);
        });
        
        // Carrega progresso existente de forma assíncrona
        setTimeout(() => {
            carregarProgressoExistente(plano.jobId || plano.id);
        }, 50);
        
        // Carrega métricas de progresso de forma assíncrona
        setTimeout(() => {
            carregarMetricasProgresso(plano.jobId || plano.id);
        }, 100);
    }, 100);
}

// Modifica o event listener para usar a nova função
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
                // Usa a nova função que inclui progresso
                exibirPlanoComProgresso(docSnap.data());
            } else {
                showToast("Não foi possível encontrar este plano.", "error");
            }
        }
    } else if (exportarBtn) {
        exportarPlanoParaExcel();
    } else if (fecharBtn) {
        containerExibicao.style.display = 'none';
        containerExibicao.innerHTML = '';
        planoAbertoAtual = null;
        
        // A caixa de progresso permanece visível sempre que há um plano selecionado
        // Não precisa fazer nada aqui
    }
});

// Event listener separado para refinar e cancelar refinamento
document.body.addEventListener('click', (e) => {
    const refinarBtn = e.target.closest('#btn-refinar-plano');
    const cancelarRefinamentoBtn = e.target.closest('#btn-cancelar-refinamento');

    if (refinarBtn) {
        const container = document.getElementById('container-refinamento');
        if (container) {
            const novoDisplay = container.style.display === 'none' ? 'block' : 'none';
            container.style.display = novoDisplay;
        }
    } else if (cancelarRefinamentoBtn) {
        const container = document.getElementById('container-refinamento');
        if (container) container.style.display = 'none';
    }
});