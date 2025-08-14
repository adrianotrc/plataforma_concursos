// exercicios-page.js

import { auth, db } from './firebase-config.js';
import { collection, serverTimestamp, query, orderBy, onSnapshot, doc, getDoc, updateDoc, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarExerciciosAsync, getUsageLimits, avaliarQuestao, excluirItem } from './api.js';
import { state } from './main-app.js';

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
let topicosSelecionados = new Set();

// --- LISTA DE MATÉRIAS DISPONÍVEIS ---
const MATERIAS_DISPONIVEIS = [
    "Língua Portuguesa", "Raciocínio Lógico", "Matemática", "Matemática Financeira",
    "Informática", "Legislação Aplicada", "Direito Constitucional", "Direito Administrativo",
    "Administração Pública", "Administração Geral", "Atualidades", "Ética no Serviço Público",
    "Direitos Humanos", "Direito Penal", "Direito Processual Penal", "Direito Civil",
    "Direito Processual Civil", "Arquivologia", "Gestão de Pessoas",
    "Administração Financeira e Orçamentária", "Língua Inglesa", "Contabilidade Pública",
    "Contabilidade Geral", "Direito Tributário", "Legislação Tributária", "História",
    "Geografia", "Economia", "Economia Monetária", "Economia Internacional", "Economia Fiscal",
    "Auditoria", "Auditoria Governamental", "Direito Internacional", "Direito Internacional Privado",
    "Direito Internacional Público", "Direito Internacional Penal", "Relações Internacionais",
    "Ciências Políticas", "Direito Concorrencial", "Direito Previdenciário", "Direito Financeiro",
    "Lógica Formal", "Outros"
];

// --- SUGESTÕES DE TÓPICOS POR MATÉRIA ---
const TOPICOS_SUGERIDOS = {
    "Língua Portuguesa": [
        "Análise Sintática",
        "Concordância Verbal",
        "Regência Verbal",
        "Uso da Vírgula",
        "Uso da Crase",
        "Pronomes e suas funções",
        "Plural de Substantivos",
        "Figuras de Linguagem",
        "Acordo Ortográfico",
        "Locuções Prepositivas",
        "Uso de Pronomes Relativos"
    ],
    "Matemática Financeira": [
        "Juros Compostos",
        "Taxa de Juros",
        "Valor Presente e Futuro",
        "Séries de Pagamentos",
        "Amortização",
        "Desconto",
        "Equivalência de Capitais"
    ],
    "Direito Constitucional": [
        "Direitos Fundamentais",
        "Direito à Vida",
        "Direitos e Deveres Individuais e Coletivos",
        "Fundamentos da República",
        "Competências Legislativas",
        "Competência do Tribunal de Contas",
        "Competências do Poder Legislativo"
    ],
    "Direito Administrativo": [
        "Modalidades de Licitação",
        "Princípios da Administração Pública",
        "Ato Administrativo",
        "Contrato Administrativo",
        "Serviço Público",
        "Responsabilidade Civil do Estado",
        "Processo Administrativo",
        "Organizações Sociais",
        "Parcerias Público-Privadas",
        "Consórcios Públicos",
        "Afastamento cautelar de dirigentes",
        "Nomeação e Aprovação de Conselheiros",
        "Acesso à Informação",
        "Extinção de Contrato de Concessão",
        "Divisão Territorial do Distrito Federal",
        "Processo Administrativo e Sigilo",
        "Função do Ministério Público junto ao Tribunal de Contas"
    ],
    "Contabilidade Pública": [
        "Superávit Financeiro",
        "Despesas de Exercícios Anteriores",
        "Demonstração dos Fluxos de Caixa",
        "Provisões no Passivo",
        "Restos a Pagar",
        "Reavaliação de Ativos",
        "Depreciação, Amortização e Exaustão",
        "Dívida Fundada"
    ],
    "Direito Financeiro": [
        "Princípios Orçamentários",
        "Lei de Diretrizes Orçamentárias",
        "Emissão de Títulos da Dívida Pública",
        "Crédito Extraordinário"
    ],
    "Auditoria Governamental": [
        "Planejamento da Auditoria",
        "Relatório de Auditoria",
        "Responsabilidade do Auditor"
    ],
    "Auditoria": [
        "Risco Inerente",
        "Amostragem Estatística",
        "Materialidade em Auditoria",
        "Testes de Controle",
        "Princípios da Auditoria Governamental"
    ],
    "Direito Tributário": [
        "Competência Tributária",
        "Lançamento de Tributos"
    ],
    "Administração Financeira e Orçamentária": [
        "Despesas Correntes",
        "Regra de Ouro Orçamentária",
        "Restos a Pagar"
    ],
    "Geografia": [
        "Clima",
        "Relevo Brasileiro",
        "Bacias Hidrográficas",
        "Urbanização no Brasil",
        "Integração Econômica",
        "Conhecimentos sobre o Distrito Federal",
        "Política Internacional",
        "Estado-nação",
        "Biomas Brasileiros",
        "Monções",
        "Formação de Dobramentos Modernos",
        "Sahel",
        "Agronegócio",
        "Biomas do Brasil",
        "Hemisférios da Terra"
    ],
    "História": [
        "Revolta de Beckman",
        "Política Pombalina",
        "Inconfidência Mineira",
        "Transferência da Corte Portuguesa",
        "Constituição de 1824",
        "Guerra do Paraguai",
        "Política do Café com Leite",
        "Estado Novo",
        "Plano de Metas de Juscelino Kubitschek",
        "Redemocratização do Brasil",
        "Reforma Protestante",
        "Iluminismo",
        "Revolução Francesa",
        "Congresso de Viena",
        "Primeira Guerra Mundial",
        "Crise de 1929",
        "Guerra Fria",
        "Descolonização da África e da Ásia",
        "Queda do Muro de Berlim",
        "Globalização",
        "Conflitos Diplomáticos",
        "Política Externa do Brasil",
        "Mercantilismo",
        "Doutrina Truman",
        "Revolta da Vacina",
        "Renascimento",
        "Revolução de 1930",
        "Revolução Industrial",
        "Abolicionismo e Lei Áurea",
        "Plano Marshall",
        "Tenentismo",
        "Perestroika e Glasnost",
        "Lei de Terras de 1850",
        "Apartheid"
    ],
    "Raciocínio Lógico": [
        "Conjunções",
        "Negação de Proposições",
        "Tabela-Verdade"
    ],
    "Economia": [
        "Inflação de Custos",
        "Curva de Laffer",
        "Desigualdade de Renda"
    ],
    "Economia Monetária": [
        "Regimes de Câmbio",
        "Política Monetária"
    ],
    "Economia Internacional": [
        "Teoria da Vantagem Comparativa",
        "Balanço de Pagamentos"
    ],
    "Economia Fiscal": [
        "Superávit Primário"
    ],
    "Direito Internacional": [
        "Princípios das Relações Internacionais",
        "Princípio do Pacta Sunt Servanda",
        "Nacionalidade",
        "Celebração de Tratados",
        "Asilo Político",
        "Responsabilidade de Proteger (R2P)",
        "Nacionalidade e Carreira Diplomática"
    ],
    "Direito Internacional Privado": [
        "Homologação de Sentenças Estrangeiras"
    ],
    "Direito Internacional Público": [
        "Imunidade de Jurisdição dos Estados Estrangeiros"
    ],
    "Direito Internacional Penal": [
        "Competência do Tribunal Penal Internacional"
    ],
    "Relações Internacionais": [
        "Teoria Realista"
    ],
    "Ciências Políticas": [
        "Teoria da Paz Democrática"
    ],
    "Direito Concorrencial": [
        "Cartéis e Práticas Anticoncorrenciais"
    ],
    "Língua Inglesa": [
        "Voz Passiva",
        "Phrasal Verbs",
        "Vocabulário Econômico",
        "Expressões Idiomáticas"
    ],
    "Direito Penal": [
        "Extradição de Brasileiro Nato"
    ]
};

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

function filtrarMaterias(termo) {
    return MATERIAS_DISPONIVEIS.filter(materia => 
        materia.toLowerCase().includes(termo.toLowerCase())
    );
}

function mostrarSugestoesMateria(termo) {
    const sugestoesContainer = document.getElementById('materia-sugestoes');
    const materiasFiltradas = filtrarMaterias(termo);
    
    if (materiasFiltradas.length === 0 || termo.length < 2) {
        sugestoesContainer.style.display = 'none';
        return;
    }
    
    sugestoesContainer.innerHTML = materiasFiltradas.map(materia => 
        `<div class="sugestao-item" data-materia="${materia}">${materia}</div>`
    ).join('');
    
    sugestoesContainer.style.display = 'block';
}

function adicionarTopico(topico) {
    const topicoLimpo = topico.trim();
    
    if (!topicoLimpo || topicosSelecionados.has(topicoLimpo)) {
        return;
    }
    
    topicosSelecionados.add(topicoLimpo);
    atualizarTopicosSelecionados();
    
    // Limpa o input
    document.getElementById('exercicio-topico').value = '';
    
    showToast(`Tópico "${topicoLimpo}" adicionado!`, 'success', 2000);
}

function removerTopico(topico) {
    topicosSelecionados.delete(topico);
    atualizarTopicosSelecionados();
    showToast(`Tópico "${topico}" removido!`, 'info', 2000);
}

function atualizarTopicosSelecionados() {
    const container = document.getElementById('topicos-selecionados');
    
    if (!container) return;
    
    if (topicosSelecionados.size === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = Array.from(topicosSelecionados).map(topico => `
        <div class="topico-tag">
            ${topico}
            <button type="button" class="remove-btn" data-topico="${topico}">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
    
    container.style.display = 'flex';
}

function atualizarSugestoesTopicos() {
    const materiaInput = document.getElementById('exercicio-materia');
    const topicoInput = document.getElementById('exercicio-topico');
    const sugestoesContainer = document.getElementById('sugestoes-topicos');
    
    if (!materiaInput || !topicoInput) return;
    
    const materiaSelecionada = materiaInput.value;
    const topicosSugeridos = TOPICOS_SUGERIDOS[materiaSelecionada] || [];
    
    // Remove container anterior se existir
    if (sugestoesContainer) {
        sugestoesContainer.remove();
    }
    
    if (topicosSugeridos.length > 0) {
        // Cria novo container de sugestões
        const novoContainer = document.createElement('div');
        novoContainer.id = 'sugestoes-topicos';
        novoContainer.style.cssText = `
            margin-top: 8px;
            padding: 8px;
            background: #f8fafc;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
        `;
        
        novoContainer.innerHTML = `
            <small style="color: #6b7280; font-size: 0.875rem; display: block; margin-bottom: 8px;">
                <i class="fas fa-lightbulb"></i> Sugestões de tópicos para ${materiaSelecionada}:
            </small>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                ${topicosSugeridos.map(topico => `
                    <button type="button" class="btn-topico-sugerido" 
                            style="background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; 
                                   padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; 
                                   cursor: pointer; transition: all 0.2s;">
                        ${topico}
                    </button>
                `).join('')}
            </div>
        `;
        
        // Insere após o input de tópico
        topicoInput.parentNode.insertBefore(novoContainer, topicoInput.nextSibling);
        
        // Adiciona event listeners aos botões de sugestão
        novoContainer.querySelectorAll('.btn-topico-sugerido').forEach(btn => {
            btn.addEventListener('click', () => {
                adicionarTopico(btn.textContent.trim());
            });
            
            btn.addEventListener('mouseenter', () => {
                btn.style.background = '#c7d2fe';
            });
            
            btn.addEventListener('mouseleave', () => {
                btn.style.background = '#e0e7ff';
            });
        });
    }
}

function processarTextoNegrito(texto) {
    // Converte **texto** para <strong>texto</strong>
    return texto.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
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
                const textoProcessado = processarTextoNegrito(opcao.texto);
                exerciciosHtml += `<li class="opcao-item"><input type="radio" name="questao-${index}" id="q${index}-${opcao.letra}" value="${opcao.letra}" ${isChecked} ${isDisabled}><label for="q${index}-${opcao.letra}"><strong>${opcao.letra})</strong> ${textoProcessado}</label></li>`;
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
    
    console.log('Renderizando histórico de exercícios:', sessoes); // DEBUG
    
    historicoContainer.innerHTML = sessoes.map(sessao => {
        const resumo = sessao.resumo || {};
        const isProcessing = sessao.status === 'processing';
        const hasFailed = sessao.status === 'failed';
        const isCompleted = sessao.status === 'completed';
        const isAttempted = isCompleted && resumo.acertos !== undefined;

        console.log('Sessão:', sessao.id, 'Status:', sessao.status, 'Resumo:', resumo, 'isAttempted:', isAttempted); // DEBUG
        console.log('Detalhes do resumo:', {
            acertos: resumo.acertos,
            total: resumo.total,
            acertosType: typeof resumo.acertos,
            totalType: typeof resumo.total
        }); // DEBUG

        let percHtml = '';
        if (isAttempted) {
            const score = resumo.total > 0 ? (resumo.acertos / resumo.total) * 100 : 0;
            percHtml = `<span class='badge-accuracy' style='background:#ecfdf5;color:#065f46;padding:2px 6px;border-radius:12px;font-size:0.75rem;margin-left:6px;'>${score.toFixed(0)}% acertos</span>`;
            console.log('Gerando badge para sessão:', sessao.id, 'Score:', score); // DEBUG
        } else if (isCompleted) {
            // Sessão completa mas sem tentativas
            percHtml = `<span class='badge-accuracy' style='background:#ecfdf5;color:#065f46;padding:2px 6px;border-radius:12px;font-size:0.75rem;margin-left:6px;'>0% acertos</span>`;
        } else {
            // Sessão em processamento ou não iniciada
            if (isProcessing) {
                percHtml = `<span class='badge-accuracy' style='background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:12px;font-size:0.75rem;margin-left:6px;'>Gerando...</span>`;
            } else {
                percHtml = `<span class='badge-accuracy' style='background:#f3f4f6;color:#6b7280;padding:2px 6px;border-radius:12px;font-size:0.75rem;margin-left:6px;'>Não respondido</span>`;
            }
        }

        let statusIcon = '';
        if (isProcessing) statusIcon = '<i class="fas fa-spinner fa-spin"></i>';
        else if (hasFailed) statusIcon = '<i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>';

        let buttonText = 'Rever';
        if (isProcessing) buttonText = 'Gerando...';
        else if (hasFailed) buttonText = 'Falhou';
        else if (isCompleted && !isAttempted) buttonText = 'Iniciar';

        const htmlGerado = `
            <div class="exercise-history-item">
                <div class="exercise-info">
                    <span class="exercise-subject">${resumo.materia || 'Sessão'} - ${resumo.topico || 'Geral'} ${statusIcon} ${percHtml}</span>
                    <span class="exercise-details">${resumo.total || 0} questões</span>
                </div>
                <div class="exercise-time">
                    <p>${resumo.criadoEm?.toDate().toLocaleDateString('pt-BR')}</p>
                    <div class="exercise-actions">
                        <button class="btn btn-primary btn-rever-sessao" data-session-id="${sessao.id}" ${isProcessing || hasFailed ? 'disabled' : ''}>${buttonText}</button>
                        ${!isProcessing ? `
                            <div class="action-buttons">
                                <button class="btn btn-outline btn-excluir" data-session-id="${sessao.id}" title="Excluir sessão">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        console.log('HTML gerado para sessão:', sessao.id, 'PercHtml:', percHtml); // DEBUG
        return htmlGerado;
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
        console.log('Salvando correção:', { sessaoAberta, acertos, respostasUsuario }); // DEBUG
        const sessaoRef = doc(db, `users/${currentUser.uid}/sessoesExercicios`, sessaoAberta);
        await updateDoc(sessaoRef, { 'resumo.acertos': acertos, respostasUsuario });
        console.log('Correção salva com sucesso'); // DEBUG
    } catch (error) {
        console.error("Erro ao salvar correção:", error);
    }
}

btnAbrirForm?.addEventListener('click', () => { formExercicios.style.display = 'block'; });
btnFecharForm?.addEventListener('click', () => { 
    formExercicios.style.display = 'none'; 
    // Limpa os tópicos selecionados
    topicosSelecionados.clear();
    atualizarTopicosSelecionados();
    document.getElementById('exercicio-materia').value = '';
    document.getElementById('exercicio-topico').value = '';
});

// Event listeners para autocomplete de matéria
const materiaInput = document.getElementById('exercicio-materia');
if (materiaInput) {
    materiaInput.addEventListener('input', (e) => {
        mostrarSugestoesMateria(e.target.value);
    });
    
    materiaInput.addEventListener('focus', () => {
        if (materiaInput.value.length >= 2) {
            mostrarSugestoesMateria(materiaInput.value);
        }
    });
    
    // Event listener para seleção de matéria
    document.getElementById('materia-sugestoes')?.addEventListener('click', (e) => {
        const sugestaoItem = e.target.closest('.sugestao-item');
        if (sugestaoItem) {
            const materia = sugestaoItem.dataset.materia;
            materiaInput.value = materia;
            document.getElementById('materia-sugestoes').style.display = 'none';
            atualizarSugestoesTopicos();
        }
    });
    
    // Esconde sugestões ao clicar fora
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#exercicio-materia') && !e.target.closest('#materia-sugestoes')) {
            document.getElementById('materia-sugestoes').style.display = 'none';
        }
    });
}

// Event listener para múltipla seleção de tópicos
const topicoInput = document.getElementById('exercicio-topico');
if (topicoInput) {
    topicoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const topico = topicoInput.value.trim();
            if (topico) {
                adicionarTopico(topico);
            }
        }
    });
}

// Event listener para remoção de tópicos
document.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.remove-btn');
    if (removeBtn) {
        const topico = removeBtn.dataset.topico;
        removerTopico(topico);
    }
});

formExercicios?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Validações
    const materia = document.getElementById('exercicio-materia').value.trim();
    if (!materia) {
        showToast('Por favor, selecione uma matéria.', 'error');
        return;
    }
    
    if (topicosSelecionados.size === 0) {
        showToast('Por favor, selecione pelo menos um tópico.', 'error');
        return;
    }
    
    const quantidade = parseInt(document.getElementById('exercicio-quantidade').value) || 0;
    if (quantidade < 1 || quantidade > 20) {
        showToast('Por favor, insira uma quantidade de exercícios entre 1 e 20.', 'error');
        return;
    }
    
    const dados = {
        userId: currentUser.uid,
        materia: materia,
        topico: Array.from(topicosSelecionados).join(', '), // Envia os tópicos selecionados
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
            
            // ADICIONE ESTAS DUAS LINHAS
            topicosSelecionados.clear();
            atualizarTopicosSelecionados();

            renderUsageInfo();
            
            // Aviso curto
            showToast("Exercícios solicitados! Gerando...", 'info', 3000);
        }
    });
});

document.body.addEventListener('click', async (e) => {
    const feedbackBtn = e.target.closest('.btn-feedback');
    const btnExcluir = e.target.closest('.btn-excluir');

    
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
    
    if (btnExcluir) {
        const sessionId = btnExcluir.dataset.sessionId;
        const confirmed = await window.confirmCustom({
            title: 'Excluir Sessão',
            message: 'Tem certeza que deseja excluir esta sessão de exercícios?',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            confirmClass: 'btn-danger',
            icon: 'fas fa-trash'
        });
        
        if (confirmed) {
            try {
                btnExcluir.disabled = true;
                btnExcluir.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                await excluirItem(state.user.uid, 'sessoesExercicios', sessionId);
                showToast("Sessão excluída com sucesso!", "success");
                
            } catch (error) {
                console.error("Erro ao excluir sessão:", error);
                showToast("Erro ao excluir sessão. Tente novamente.", "error");
                btnExcluir.disabled = false;
                btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
            }
        }
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