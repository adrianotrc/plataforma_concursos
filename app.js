// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    serverTimestamp,
    query,
    where,
    getDocs,
    orderBy,
    limit // Importar limit para as dicas recentes
} from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js"; 

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDu-bfPtdZPCfci3NN1knVZYAzG7Twztrg", // Sua chave REAL e RESTRINGIDA aqui
  authDomain: "plataforma-concursos-ai.firebaseapp.com",
  projectId: "plataforma-concursos-ai",
  storageBucket: "plataforma-concursos-ai.firebasestorage.app",
  messagingSenderId: "620928521514",
  appId: "1:620928521514:web:4bf7e6addab3485055ba53"
  // measurementId: "G-FCHSYJJ7FB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); 

console.log("Firebase App inicializado");
console.log("Firebase Auth inicializado");
console.log("Firestore inicializado:", db);

// --- FUNÇÕES AUXILIARES ---

function exibirPlanoNaTela(planoDeEstudosObjeto) { /* ... (Função como na última versão, sem alterações) ... */ 
    const areaPlano = document.getElementById('area-plano-estudos');
    if (!areaPlano) {
        console.warn("Elemento 'area-plano-estudos' não encontrado no DOM para exibir o plano.");
        return;
    }
    if (planoDeEstudosObjeto) {
        const planoConteudo = planoDeEstudosObjeto; 
        areaPlano.innerHTML = ""; 
        let htmlTopoPlano = `<div class="feature-header" style="margin-bottom:10px;">
                               <div class="feature-icon blue"><i class="fas fa-calendar-check"></i></div>
                               <div class="feature-info"><h3>${planoConteudo.mensagem_inicial || 'Seu Plano de Estudos!'}</h3></div>
                           </div>`;
        htmlTopoPlano += `<p style="margin-bottom:15px;"><strong>Concurso Foco:</strong> ${planoConteudo.concurso_foco || 'Não informado'}</p>`;
        htmlTopoPlano += `<button id="botao-fechar-plano-exibido" class="botao-fechar-plano">Fechar Detalhes do Plano</button>`;
        htmlTopoPlano += `<hr style="margin-bottom: 10px; margin-top: 15px;">`;
        areaPlano.innerHTML = htmlTopoPlano;
        const cronogramaContainerPrincipal = document.createElement('div');
        cronogramaContainerPrincipal.className = 'schedule-container'; 
        cronogramaContainerPrincipal.style.marginTop = '10px';
        if (planoConteudo.visao_geral_periodos && Array.isArray(planoConteudo.visao_geral_periodos)) {
            planoConteudo.visao_geral_periodos.forEach((periodoItem, indicePeriodo) => {
                const periodoDiv = document.createElement('div');
                periodoDiv.className = 'feature-card'; 
                periodoDiv.style.marginTop = '20px';
                periodoDiv.style.padding = '15px';
                let periodoHtml = `<div class="day-header">${periodoItem.periodo_descricao || `Período ${indicePeriodo + 1}`}</div>`;
                periodoHtml +=    `<p style="font-style: italic; margin-bottom: 10px;"><strong>Foco:</strong> ${periodoItem.foco_principal_periodo || 'Não especificado'}</p>`;
                if(periodoItem.materias_prioritarias_periodo && Array.isArray(periodoItem.materias_prioritarias_periodo) && periodoItem.materias_prioritarias_periodo.length > 0){
                    periodoHtml += `<p><strong>Matérias Prioritárias:</strong> ${periodoItem.materias_prioritarias_periodo.join(", ")}</p>`;
                }
                periodoDiv.innerHTML = periodoHtml;
                if (periodoItem.cronograma_semanal_detalhado_do_periodo && Array.isArray(periodoItem.cronograma_semanal_detalhado_do_periodo)) {
                    periodoItem.cronograma_semanal_detalhado_do_periodo.forEach((semanaItem) => {
                        const semanaDiv = document.createElement('div');
                        semanaDiv.style.marginTop = "15px";
                        semanaDiv.innerHTML = `<h5 style="margin-bottom:10px; border-top: 1px solid #eee; padding-top:10px;">Semana ${semanaItem.semana_numero_no_periodo || ''}: ${semanaItem.foco_da_semana_especifico || 'Foco da semana não especificado'}</h5>`;
                        if (semanaItem.dias_de_estudo && Array.isArray(semanaItem.dias_de_estudo)) {
                            const diasContainer = document.createElement('div');
                            semanaItem.dias_de_estudo.forEach(diaItem => {
                                const diaDiv = document.createElement('div');
                                diaDiv.className = 'schedule-day'; 
                                let diaHtmlDetalhe = `<div class="day-header">${diaItem.dia_da_semana || 'Dia não especificado'}</div>`;
                                if (diaItem.atividades && Array.isArray(diaItem.atividades)) {
                                    diaHtmlDetalhe += "<div class='day-tasks'>"; 
                                    diaItem.atividades.forEach(atividade => {
                                        diaHtmlDetalhe += `<div class="task-item">`;
                                        diaHtmlDetalhe +=    `<span class="task-time">${atividade.duracao_sugerida_minutos || '?'} min</span>`;
                                        diaHtmlDetalhe +=    `<span class="task-subject">${atividade.materia || ''}${atividade.topico_sugerido ? ' (' + atividade.topico_sugerido + ')' : ''} - ${atividade.tipo_de_estudo || ''}</span>`;
                                        diaHtmlDetalhe +=    `<span class="task-status pending">○</span>`; 
                                        diaHtmlDetalhe += `</div>`; 
                                    });
                                    diaHtmlDetalhe += "</div>"; 
                                } else { diaHtmlDetalhe += "<p>Nenhuma atividade detalhada para este dia.</p>"; }
                                diaDiv.innerHTML = diaHtmlDetalhe;
                                diasContainer.appendChild(diaDiv); 
                            });
                            semanaDiv.appendChild(diasContainer); 
                        } else { semanaDiv.innerHTML += "<p>Nenhum dia de estudo detalhado para esta semana.</p>"; }
                        periodoDiv.appendChild(semanaDiv);
                    });
                } else if (indicePeriodo >= 0) { 
                     periodoDiv.innerHTML += `<p style="margin-top:10px; color: #555;"><em>(Visão geral para este período.)</em></p>`;
                }
                cronogramaContainerPrincipal.appendChild(periodoDiv);
            });
        } else {
             cronogramaContainerPrincipal.innerHTML = "<p>Nenhuma estrutura de visão geral de períodos disponível neste plano.</p>";
        }
        areaPlano.appendChild(cronogramaContainerPrincipal); 
        console.log("Plano exibido na tela (layout Lovable).");
        const botaoFechar = document.getElementById('botao-fechar-plano-exibido');
        if (botaoFechar) {
            botaoFechar.addEventListener('click', () => {
                areaPlano.innerHTML = `
                    <div class="feature-header" style="margin-bottom:10px;">
                        <div class="feature-icon blue"><i class="fas fa-info-circle"></i></div>
                        <div class="feature-info"><h3>Plano Fechado</h3><p>Selecione um plano da lista "Meus Planos Salvos" ou gere um novo.</p></div>
                    </div>`;
                console.log("Detalhes do plano fechados.");
            });
        }
    } else {
        areaPlano.innerHTML = `
            <div class="feature-header" style="margin-bottom:10px;">
                <div class="feature-icon blue"><i class="fas fa-info-circle"></i></div>
                <div class="feature-info"><h3>Nenhum Plano Selecionado</h3><p>Não foi possível carregar os detalhes do plano.</p></div>
            </div>`;
    }
}

async function salvarPlanoNoFirestore(usuarioId, dadosDoPlanoCompletoRecebidoDaIA) { /* ... (Função como antes) ... */ 
    if (!usuarioId || !dadosDoPlanoCompletoRecebidoDaIA || !dadosDoPlanoCompletoRecebidoDaIA.plano_de_estudos) {
        console.error("Dados insuficientes para salvar o plano."); return;
    }
    try {
        const colecaoPlanos = collection(db, "planos_usuarios");
        await addDoc(colecaoPlanos, {
            uidUsuario: usuarioId,
            concursoFoco: dadosDoPlanoCompletoRecebidoDaIA.plano_de_estudos.concurso_foco || "Não especificado",
            planoSalvo: dadosDoPlanoCompletoRecebidoDaIA.plano_de_estudos, 
            dataCriacao: serverTimestamp(), 
        });
        console.log("Plano salvo no Firestore.");
    } catch (e) { console.error("Erro ao salvar plano no Firestore: ", e); alert("Houve um erro ao salvar seu plano."); }
}

async function carregarPlanosSalvos(uidUsuario) { /* ... (Função como antes) ... */ 
    const listaPlanosUl = document.getElementById('lista-planos-salvos');
    const mensagemSemPlanos = document.getElementById('mensagem-sem-planos');
    const areaPlanoAtual = document.getElementById('area-plano-estudos'); 
    if (!listaPlanosUl || !mensagemSemPlanos) { console.warn("Elementos da lista de planos não encontrados (cronograma.html)."); return;}
    listaPlanosUl.innerHTML = '<li>Carregando...</li>'; 
    mensagemSemPlanos.style.display = 'none';
    if(areaPlanoAtual && !areaPlanoAtual.querySelector('.feature-header')) { 
        areaPlanoAtual.innerHTML = `
            <div class="feature-header" style="margin-bottom:10px;">
                <div class="feature-icon blue"><i class="fas fa-info-circle"></i></div>
                <div class="feature-info"><h3>Selecione ou Gere um Plano</h3><p>Use a lista ou o botão "+ Gerar Novo Cronograma".</p></div>
            </div>`;
    }
    try {
        const q = query(collection(db, "planos_usuarios"), where("uidUsuario", "==", uidUsuario), orderBy("dataCriacao", "desc"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            listaPlanosUl.innerHTML = ''; 
            mensagemSemPlanos.style.display = 'block'; 
            if(areaPlanoAtual && !areaPlanoAtual.querySelector('.feature-header')) {
                 areaPlanoAtual.innerHTML = `
                    <div class="feature-header" style="margin-bottom:10px;">
                        <div class="feature-icon blue"><i class="fas fa-info-circle"></i></div>
                        <div class="feature-info"><h3>Nenhum Plano Salvo</h3><p>Clique em "+ Gerar Novo Cronograma" para criar o seu primeiro!</p></div>
                    </div>`;
            } return;
        }
        listaPlanosUl.innerHTML = ''; 
        querySnapshot.forEach((docSnapshot) => {
            const dadosFirestore = docSnapshot.data();
            const planoParaExibirOnClick = dadosFirestore.planoSalvo; 
            if (!planoParaExibirOnClick) return; 
            const listItem = document.createElement('li');
            listItem.className = 'activity-item'; 
            listItem.style.cursor = 'pointer'; listItem.style.padding = '10px 0'; 
            const dataCriacao = dadosFirestore.dataCriacao?.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || 'Data desconhecida';
            listItem.innerHTML = `
                <div class="activity-dot blue" style="align-self: flex-start; margin-top: 5px;"></div>
                <div class="activity-text" style="flex-direction: column; align-items: flex-start;">
                    <strong>Concurso: ${planoParaExibirOnClick.concurso_foco || 'Não especificado'}</strong>
                    <small>Criado em: ${dataCriacao}</small>
                </div>`;
            listItem.addEventListener('click', () => { if(areaPlanoAtual) { exibirPlanoNaTela(planoParaExibirOnClick); window.scrollTo({ top: areaPlanoAtual.offsetTop - 80, behavior: 'smooth' }); }});
            listaPlanosUl.appendChild(listItem);
        });
    } catch (error) { console.error("Erro ao carregar planos salvos:", error); /* ... */ }
}

// -------- NOVAS FUNÇÕES PARA DICAS ESTRATÉGICAS --------
async function salvarDicaRecente(uidUsuario, dicaTexto, categoriaDica) {
    if (!uidUsuario || !dicaTexto) { /* ... */ return; }
    try {
        const colecaoDicas = collection(db, "dicas_recentes_usuarios");
        await addDoc(colecaoDicas, { /* ... */ });
        console.log("Dica salva no Firestore.");

        // Atualiza a lista APENAS SE os elementos existirem
        if (window.location.pathname.includes('dicas-estrategicas.html')) {
            const listaDicasRecentesDiv = document.getElementById('dicas-recentes-lista');
            const mensagemSemDicas = document.getElementById('mensagem-sem-dicas-recentes');
            if (listaDicasRecentesDiv && mensagemSemDicas) { // Verifica antes de chamar
                carregarDicasRecentes(uidUsuario);
            } else {
                console.log("Elementos de dicas recentes não encontrados para atualização imediata após salvar.");
            }
        }
    } catch (e) { /* ... */ }
}

async function carregarDicasRecentes(uidUsuario) {
    const listaDicasRecentesDiv = document.getElementById('dicas-recentes-lista');
    // CORREÇÃO: Usar o ID correto da página de dicas
    const mensagemSemDicas = document.getElementById('mensagem-sem-dicas-recentes'); 

    if (!listaDicasRecentesDiv || !mensagemSemDicas) {
        console.warn("Elementos para 'Dicas Recentes' ('dicas-recentes-lista' ou 'mensagem-sem-dicas-recentes') não encontrados na página 'dicas-estrategicas.html'.");
        return;
    }

    listaDicasRecentesDiv.innerHTML = '<div class="activity-item" style="padding:10px 0;"><div class="activity-dot grey" style="background-color: #ccc; align-self:flex-start; margin-top:5px;"></div><span class="activity-text">Carregando dicas recentes...</span></div>';
    mensagemSemDicas.style.display = 'none'; // CORREÇÃO: Usar a variável correta

    try {
        const q = query(collection(db, "dicas_recentes_usuarios"), 
                        where("uidUsuario", "==", uidUsuario), 
                        orderBy("dataGeracao", "desc"), 
                        limit(5)); // Limita a 5 dicas recentes

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            listaDicasRecentesDiv.innerHTML = ''; 
            mensagemSemDicas.style.display = 'block'; // CORREÇÃO: Usar a variável correta
            console.log("Nenhuma dica recente encontrada para este usuário.");
            return;
        }

        listaDicasRecentesDiv.innerHTML = ''; // Limpa "Carregando..."
        querySnapshot.forEach((doc) => {
            const dica = doc.data();
            const divItem = document.createElement('div');
            divItem.className = 'tip-item'; // Usando a classe do HTML do Lovable

            const dataFormatada = dica.dataGeracao?.toDate().toLocaleDateString('pt-BR', {hour:'2-digit', minute:'2-digit'}) || 'Recentemente';

            divItem.innerHTML = `
                <div class="tip-icon"><i class="fas fa-lightbulb"></i></div>
                <div class="tip-content">
                    <div class="tip-title">${dica.categoria || 'Dica Estratégica'}</div>
                    <div class="tip-description">${dica.textoDica}</div>
                </div>
                <div class="tip-status new" style="font-size: 0.8em; color: #6b7280; white-space:nowrap;">
                    ${dataFormatada}
                </div>
            `;
            listaDicasRecentesDiv.appendChild(divItem);
        });

    } catch (error) {
        console.error("Erro ao carregar dicas recentes:", error);
        listaDicasRecentesDiv.innerHTML = '<div class="activity-item" style="padding:10px 0;"><div class="activity-dot red" style="background-color: red; align-self:flex-start; margin-top:5px;"></div><span class="activity-text" style="color:red;">Erro ao carregar dicas.</span></div>';
        mensagemSemDicas.style.display = 'none'; // CORREÇÃO: Usar a variável correta
    }
}

// --- LÓGICA DE AUTENTICAÇÃO (CADASTRO, LOGIN, LOGOUT) ---
// (Mantida como estava, pois funcionava)
const formCadastro = document.getElementById('form-cadastro');
if (formCadastro) { /* ... (código de cadastro como antes) ... */ 
    formCadastro.addEventListener('submit', (evento) => {
        evento.preventDefault(); 
        const email = document.getElementById('cadastro-email').value;
        const senha = document.getElementById('cadastro-senha').value;
        const confirmaSenha = document.getElementById('cadastro-confirma-senha').value;
        if (senha !== confirmaSenha) { alert("As senhas não coincidem!"); return; }
        if (email && senha) {
            createUserWithEmailAndPassword(auth, email, senha)
                .then((userCredential) => {
                    console.log("Usuário cadastrado:", userCredential.user.uid);
                    alert("Cadastro realizado com sucesso!");
                    window.location.href = 'index.html'; 
                })
                .catch((error) => { 
                    console.error("Erro no cadastro:", error.code, error.message); 
                    if (error.code === 'auth/email-already-in-use') {
                        alert("Este e-mail já está em uso.");
                    } else if (error.code === 'auth/weak-password') {
                        alert("A senha é muito fraca (mínimo 6 caracteres).");
                    } else {
                        alert("Erro ao cadastrar: " + error.message);
                    }
                });
        } else { alert("Por favor, preencha e-mail e senha."); }
    });
}

const formLogin = document.getElementById('form-login');
if (formLogin) { /* ... (código de login como antes) ... */ 
    formLogin.addEventListener('submit', (evento) => {
        evento.preventDefault(); 
        const email = document.getElementById('login-email').value;
        const senha = document.getElementById('login-senha').value;
        if (email && senha) {
            signInWithEmailAndPassword(auth, email, senha)
                .then((userCredential) => { 
                    console.log("Usuário logado:", userCredential.user.uid); 
                    window.location.href = 'home.html'; 
                })
                .catch((error) => { 
                    console.error("Erro no login:", error.code, error.message); 
                    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                        alert("E-mail ou senha inválidos.");
                    } else {
                        alert("Erro ao fazer login: " + error.message);
                    }
                });
        } else { alert("Por favor, preencha e-mail e senha."); }
    });
}

const botaoLogout = document.getElementById('botao-logout');
if (botaoLogout) { /* ... (código de logout como antes) ... */ 
    botaoLogout.addEventListener('click', (evento) => {
        evento.preventDefault(); 
        signOut(auth).then(() => { 
            console.log("Usuário deslogado"); 
            window.location.href = 'index.html'; 
        })
        .catch((error) => { console.error("Erro ao fazer logout:", error); alert("Erro ao desconectar."); });
    });
}

// --- OBSERVADOR DE ESTADO DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    let currentPageName = "index.html"; 
    try { /* ... (lógica para currentPageName como antes) ... */ 
        const pathName = window.location.pathname;
        const pathParts = pathName.split('/');
        let lastPart = pathParts.pop();
        if (lastPart === "" && pathParts.length > 0 && pathName !== "/") { lastPart = pathParts.pop(); }
        currentPageName = lastPart || "index.html"; 
        if (pathName === "/" && !lastPart) { currentPageName = "index.html"; }
    } catch (e) { console.warn("Não foi possível obter a página atual da URL:", e); }
    
    if (user) {
        console.log("Auth State: Logado - Usuário:", user.uid, "| Página:", currentPageName);
        if ((currentPageName === 'index.html' || currentPageName === 'cadastro.html')) {
            const targetPage = window.location.pathname.split('/').pop();
            if (!['home.html', 'cronograma.html', 'dicas-estrategicas.html'].includes(targetPage)) {
                window.location.href = 'home.html';
            }
        } else if (currentPageName === 'cronograma.html') {
            if (document.getElementById('lista-planos-salvos')) { carregarPlanosSalvos(user.uid); }
        } else if (currentPageName === 'dicas-estrategicas.html') {
            if (document.getElementById('dicas-recentes-lista')) { carregarDicasRecentes(user.uid); }
        }
    } else {
        console.log("Auth State: Deslogado. Página:", currentPageName);
        if (['home.html', 'cronograma.html', 'dicas-estrategicas.html'].includes(currentPageName)) {
            window.location.href = 'index.html';
        }
    }
});

// --- LÓGICA ESPECÍFICA DA PÁGINA CRONOGRAMA.HTML ---
if (window.location.pathname.includes('cronograma.html')) {
    // ... (código do formPlanoEstudos e botaoMostrarForm como antes) ...
    const formPlanoEstudos = document.getElementById('form-plano-estudos');
    const areaPlanoLocal = document.getElementById('area-plano-estudos'); 
    const botaoMostrarForm = document.getElementById('botao-mostrar-form-novo-plano');
    const containerForm = document.getElementById('container-form-novo-plano');

    if(botaoMostrarForm && containerForm){
        botaoMostrarForm.addEventListener('click', () => {
            if (containerForm.style.display === 'none' || containerForm.style.display === '') {
                containerForm.style.display = 'block';
                botaoMostrarForm.innerHTML = '<i class="fas fa-minus"></i> Esconder Formulário de Novo Plano';
                if(areaPlanoLocal) {
                     areaPlanoLocal.innerHTML = `
                        <div class="feature-header" style="margin-bottom:10px;">
                            <div class="feature-icon blue"><i class="fas fa-pen-alt"></i></div>
                            <div class="feature-info"><h3>Novo Plano</h3><p>Preencha o formulário acima para gerar um novo plano.</p></div>
                        </div>`;
                }
            } else {
                containerForm.style.display = 'none';
                botaoMostrarForm.innerHTML = '<i class="fas fa-plus"></i> Gerar Novo Cronograma';
                if (auth.currentUser && areaPlanoLocal && document.getElementById('lista-planos-salvos')) {
                     carregarPlanosSalvos(auth.currentUser.uid); 
                }
            }
        });
    }

    if (formPlanoEstudos && areaPlanoLocal) {
        formPlanoEstudos.addEventListener('submit', async (evento) => {
            evento.preventDefault(); 
            areaPlanoLocal.innerHTML = "<p>Gerando seu plano, aguarde...</p>";
            const dadosParaPlano = { /* ... (coleta de dados do formulário como antes) ... */
                usuarioId: auth.currentUser ? auth.currentUser.uid : null,
                concurso: document.getElementById('concurso-objetivo').value,
                fase: document.getElementById('fase-concurso').value,
                materias: document.getElementById('materias-edital').value,
                horas_semanais: document.getElementById('horas-estudo-semanais').value,
                dias_estudo: Array.from(document.querySelectorAll('#dias-semana-estudo input[name="dia_semana"]:checked')).map(cb => cb.value), 
                data_prova: document.getElementById('data-prova').value || null, 
                dificuldades: document.getElementById('dificuldades-materias').value || null,
                outras_obs: document.getElementById('outras-consideracoes').value || null
            };
            if (dadosParaPlano.dias_estudo.length === 0 && (dadosParaPlano.concurso || dadosParaPlano.fase || dadosParaPlano.materias) ) {
                alert("Por favor, selecione pelo menos um dia da semana.");
                areaPlanoLocal.innerHTML = "<p>Selecione os dias da semana.</p>"; return; 
            }
            try {
                const resposta = await fetch('http://127.0.0.1:5000/gerar-plano-estudos', { /* ... */ });
                if (!resposta.ok) { /* ... */ throw new Error(/* ... */); }
                const dadosDoPlano = await resposta.json(); 
                if (dadosDoPlano && dadosDoPlano.plano_de_estudos) {
                    exibirPlanoNaTela(dadosDoPlano.plano_de_estudos);
                    if (auth.currentUser) {
                        await salvarPlanoNoFirestore(auth.currentUser.uid, dadosDoPlano);
                        if (document.getElementById('lista-planos-salvos')) { await carregarPlanosSalvos(auth.currentUser.uid); }
                    }
                } else if (dadosDoPlano && (dadosDoPlano.erro_processamento || dadosDoPlano.erro_geral)) { 
                    if(areaPlanoLocal) areaPlanoLocal.innerHTML = `<p style="color: red;">Erro da IA: ${dadosDoPlano.erro_processamento || dadosDoPlano.erro_geral}</p><pre>${JSON.stringify(dadosDoPlano.resposta_bruta_ia, null, 2)}</pre>`;
                } else { if(areaPlanoLocal) areaPlanoLocal.innerHTML = "<p>Resposta da IA inesperada.</p>"; console.log("Resposta inesperada:", dadosDoPlano); }
            } catch (error) { console.error("Erro ao gerar plano:", error); if(areaPlanoLocal) areaPlanoLocal.innerHTML = `<p>Erro: ${error.message}</p>`; }
        });
    }
}

// --- LÓGICA ESPECÍFICA DA PÁGINA DICAS-ESTRATEGICAS.HTML ---
if (window.location.pathname.includes('dicas-estrategicas.html')) {
    const botaoGerarDica = document.getElementById('botao-gerar-dica');
    const dicaDoDiaArea = document.getElementById('dica-do-dia-area');
    const botoesCategoriaDica = document.querySelectorAll('.btn-categoria-dica');

    if (botaoGerarDica && dicaDoDiaArea) {
        botaoGerarDica.addEventListener('click', async () => {
            dicaDoDiaArea.innerHTML = '<div class="tip-highlight" style="display:flex; align-items:center; gap:10px;"><i class="fas fa-spinner fa-spin"></i> <span>Gerando sua dica, aguarde...</span></div>';
            try {
                const resposta = await fetch('http://127.0.0.1:5000/gerar-dica-do-dia', {
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ usuarioId: auth.currentUser ? auth.currentUser.uid : null }) 
                });
                if (!resposta.ok) { const errText = await resposta.text(); throw new Error(`Erro servidor (dica dia): ${resposta.status} - ${errText}`);}
                const dadosDica = await resposta.json();
                if (dadosDica && dadosDica.dica_estrategica) {
                    dicaDoDiaArea.innerHTML = `
                        <div class="tip-highlight">
                            <i class="fas fa-lightbulb"></i>
                            <span>${dadosDica.dica_estrategica}</span>
                        </div>`;
                    // Salva a dica do dia como "Dica do Dia"
                    if (auth.currentUser) {
                        await salvarDicaRecente(auth.currentUser.uid, dadosDica.dica_estrategica, "Dica do Dia");
                    }
                } else {
                    dicaDoDiaArea.innerHTML = '<div class="tip-highlight"><i class="fas fa-exclamation-circle"></i> <span>Não foi possível gerar uma dica.</span></div>';
                }
            } catch (error) {
                console.error("Erro ao gerar dica do dia:", error);
                dicaDoDiaArea.innerHTML = `<div class="tip-highlight"><i class="fas fa-exclamation-triangle"></i> <span style="color:red;">Erro: ${error.message}</span></div>`;
            }
        });
    }

    if (botoesCategoriaDica.length > 0) { // Não precisa de dicaDoDiaArea aqui
        botoesCategoriaDica.forEach(botao => {
            botao.addEventListener('click', async (evento) => {
                evento.preventDefault(); 
                const categoria = botao.dataset.categoria;
                if (!categoria) { console.error("Botão sem data-categoria."); return; }

                const targetDisplayArea = document.getElementById(`tips-${categoria}`);
                if (!targetDisplayArea) { console.error(`Área de exibição tips-${categoria} não encontrada.`); return; }

                if (targetDisplayArea.style.display === 'block' && targetDisplayArea.innerHTML !== '' && !targetDisplayArea.innerHTML.includes('spinner')) {
                    targetDisplayArea.style.display = 'none';
                    targetDisplayArea.innerHTML = ''; 
                    botao.innerHTML = 'Ver Dicas';
                    return; 
                }
                
                targetDisplayArea.style.display = 'block';
                targetDisplayArea.innerHTML = `<div style="display:flex; align-items:center; gap:10px; padding:10px;"><i class="fas fa-spinner fa-spin"></i> <span>Buscando dicas...</span></div>`;
                botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';

                try {
                    const resposta = await fetch('http://127.0.0.1:5000/gerar-dicas-por-categoria', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json',},
                        body: JSON.stringify({ categoria: categoria, usuarioId: auth.currentUser ? auth.currentUser.uid : null })
                    });
                    if (!resposta.ok) { const errText = await resposta.text(); throw new Error(`Erro servidor (dicas categoria): ${resposta.status} - ${errText}`);}
                    const dadosResposta = await resposta.json();

                    if (dadosResposta && dadosResposta.dicas_categoria && Array.isArray(dadosResposta.dicas_categoria.dicas)) {
                        let htmlDicasCategoria = `<h5 style="margin-bottom:10px;">Dicas sobre ${dadosResposta.dicas_categoria.categoria_dica || categoria.replace("_", " ")}:</h5>`;
                        htmlDicasCategoria += "<ul style='list-style-type: disc; padding-left: 20px; margin-bottom: 15px;'>";
                        dadosResposta.dicas_categoria.dicas.forEach(dica => {
                            htmlDicasCategoria += `<li style='margin-bottom: 8px;'>${dica}</li>`;
                            // Salva cada dica da categoria
                            if (auth.currentUser) {
                                salvarDicaRecente(auth.currentUser.uid, dica, dadosResposta.dicas_categoria.categoria_dica || categoria.replace("_", " "));
                            }
                        });
                        htmlDicasCategoria += "</ul>";
                        htmlDicasCategoria += `<button class="btn-fechar-categoria-dicas" style="background-color: #6c757d; color:white; padding: 5px 10px; border:none; border-radius:4px; cursor:pointer; font-size:0.8em;">Fechar Dicas</button>`;
                        targetDisplayArea.innerHTML = htmlDicasCategoria;
                        botao.innerHTML = 'Esconder Dicas';

                        targetDisplayArea.querySelector('.btn-fechar-categoria-dicas').addEventListener('click', function() {
                            targetDisplayArea.style.display = 'none';
                            targetDisplayArea.innerHTML = '';
                            botao.innerHTML = 'Ver Dicas';
                        });
                    } else {
                        targetDisplayArea.innerHTML = '<p>Nenhuma dica encontrada para esta categoria.</p>';
                        botao.innerHTML = 'Ver Dicas';
                    }
                } catch (error) {
                    console.error(`Erro ao buscar dicas para ${categoria}:`, error);
                    targetDisplayArea.innerHTML = `<p style="color:red;">Erro: ${error.message}</p>`;
                    botao.innerHTML = 'Ver Dicas';
                }
            });
        });
    }
}