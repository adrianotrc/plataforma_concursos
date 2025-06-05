// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile, 
    reauthenticateWithCredential, 
    EmailAuthProvider, 
    updatePassword,
    sendPasswordResetEmail
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
    doc, 
    setDoc, 
    getDoc,
    limit 
} from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js"; 

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDu-bfPtdZPCfci3NN1knVZYAzG7Twztrg", // Sua chave REAL e RESTRINGIDA aqui
  authDomain: "plataforma-concursos-ai.firebaseapp.com",
  projectId: "plataforma-concursos-ai",
  storageBucket: "plataforma-concursos-ai.firebasestorage.app",
  messagingSenderId: "620928521514",
  appId: "1:620928521514:web:4bf7e6addab3485055ba53"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); 

console.log("Firebase App inicializado");
console.log("Firebase Auth inicializado");
console.log("Firestore inicializado:", db);

// --- FUNÇÕES AUXILIARES ---
function exibirPlanoNaTela(planoDeEstudosObjeto) {
    const areaPlano = document.getElementById('area-plano-estudos');
    if (!areaPlano) { console.warn("Elemento 'area-plano-estudos' não encontrado."); return; }
    if (planoDeEstudosObjeto) {
        const planoConteudo = planoDeEstudosObjeto; 
        areaPlano.innerHTML = ""; 
        let htmlTopoPlano = `<div class="feature-header" style="margin-bottom:10px;"><div class="feature-icon blue"><i class="fas fa-calendar-check"></i></div><div class="feature-info"><h3>${planoConteudo.mensagem_inicial || 'Seu Plano de Estudos!'}</h3></div></div>`;
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
                periodoDiv.style.marginTop = '20px'; periodoDiv.style.padding = '15px';
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
                            const diasContainerParaSemana = document.createElement('div');
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
                                } else { diaHtmlDetalhe += "<p>Nenhuma atividade.</p>"; }
                                diaDiv.innerHTML = diaHtmlDetalhe;
                                diasContainerParaSemana.appendChild(diaDiv); 
                            });
                            semanaDiv.appendChild(diasContainerParaSemana); 
                        } else { semanaDiv.innerHTML += "<p>Nenhum dia de estudo.</p>"; }
                        periodoDiv.appendChild(semanaDiv);
                    });
                } else if (indicePeriodo >= 0) { 
                     periodoDiv.innerHTML += `<p style="margin-top:10px; color: #555;"><em>(Visão geral para este período.)</em></p>`;
                }
                cronogramaContainerPrincipal.appendChild(periodoDiv);
            });
        } else { cronogramaContainerPrincipal.innerHTML = "<p>Nenhuma estrutura de períodos.</p>";}
        areaPlano.appendChild(cronogramaContainerPrincipal); 
        const botaoFechar = document.getElementById('botao-fechar-plano-exibido');
        if (botaoFechar) {
            botaoFechar.addEventListener('click', () => {
                areaPlano.innerHTML = `<div class="feature-header"><div class="feature-icon blue"><i class="fas fa-info-circle"></i></div><div class="feature-info"><h3>Plano Fechado</h3><p>Selecione um plano salvo ou gere um novo.</p></div></div>`;
            });
        }
    } else { areaPlano.innerHTML = `<div class="feature-header"><div class="feature-icon blue"><i class="fas fa-info-circle"></i></div><div class="feature-info"><h3>Nenhum Plano</h3><p>Não foi possível carregar detalhes.</p></div></div>`; }
}
async function salvarPlanoNoFirestore(usuarioId, dadosDoPlanoCompletoRecebidoDaIA) {
    if (!usuarioId || !dadosDoPlanoCompletoRecebidoDaIA || !dadosDoPlanoCompletoRecebidoDaIA.plano_de_estudos) {console.error("Dados insuficientes para salvar o plano."); return;}
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
async function carregarPlanosSalvos(uidUsuario) {
    const listaPlanosUl = document.getElementById('lista-planos-salvos');
    const mensagemSemPlanos = document.getElementById('mensagem-sem-planos');
    const areaPlanoAtual = document.getElementById('area-plano-estudos'); 
    if (!listaPlanosUl || !mensagemSemPlanos) { console.warn("Elementos da lista de planos não encontrados (cronograma.html)."); return;}
    if(areaPlanoAtual && !areaPlanoAtual.querySelector('.feature-header') && !areaPlanoAtual.querySelector('h3')) { 
        areaPlanoAtual.innerHTML = `<div class="feature-header" style="margin-bottom:10px;"><div class="feature-icon blue"><i class="fas fa-info-circle"></i></div><div class="feature-info"><h3>Selecione ou Gere um Plano</h3><p>Use a lista ou o botão "+ Gerar Novo Cronograma".</p></div></div>`;
    }
    listaPlanosUl.innerHTML = '<li>Carregando...</li>'; 
    mensagemSemPlanos.style.display = 'none';
    try {
        const q = query(collection(db, "planos_usuarios"), where("uidUsuario", "==", uidUsuario), orderBy("dataCriacao", "desc"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            listaPlanosUl.innerHTML = ''; 
            mensagemSemPlanos.style.display = 'block'; 
            if(areaPlanoAtual && !areaPlanoAtual.querySelector('.feature-header') && !areaPlanoAtual.querySelector('h3')) {
                 areaPlanoAtual.innerHTML = `<div class="feature-header" style="margin-bottom:10px;"><div class="feature-icon blue"><i class="fas fa-info-circle"></i></div><div class="feature-info"><h3>Nenhum Plano Salvo</h3><p>Clique em "+ Gerar Novo Cronograma" para criar o seu primeiro!</p></div></div>`;
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
            listItem.innerHTML = `<div class="activity-dot blue" style="align-self:flex-start;margin-top:5px;"></div><div class="activity-text" style="flex-direction:column;align-items:flex-start;"><strong>Concurso: ${planoParaExibirOnClick.concurso_foco || 'Não especificado'}</strong><small>Criado em: ${dataCriacao}</small></div>`;
            listItem.addEventListener('click', () => { if(areaPlanoAtual) { exibirPlanoNaTela(planoParaExibirOnClick); window.scrollTo({ top: areaPlanoAtual.offsetTop - 80, behavior: 'smooth' }); }});
            listaPlanosUl.appendChild(listItem);
        });
    } catch (error) { console.error("Erro ao carregar planos salvos:", error); listaPlanosUl.innerHTML = '<li>Erro ao carregar.</li>';}
}
async function salvarDicaRecente(uidUsuario, dicaTexto, categoriaDica) {
    if (!uidUsuario || !dicaTexto) { console.error("Dados insuficientes para salvar a dica."); return; }
    try {
        const colecaoDicas = collection(db, "dicas_recentes_usuarios");
        await addDoc(colecaoDicas, {
            uidUsuario: uidUsuario, textoDica: dicaTexto, categoria: categoriaDica || "Dica do Dia", 
            dataGeracao: serverTimestamp()
        });
        console.log("Dica salva no Firestore.");
        if (getCurrentPageName() === 'dicas-estrategicas.html') { 
            if (document.getElementById('dicas-recentes-lista')) { carregarDicasRecentes(uidUsuario); }
        }
    } catch (e) { console.error("Erro ao salvar dica recente:", e); }
}
async function carregarDicasRecentes(uidUsuario) {
    const listaDicasRecentesDiv = document.getElementById('dicas-recentes-lista');
    const mensagemSemDicas = document.getElementById('mensagem-sem-dicas-recentes'); 
    if (!listaDicasRecentesDiv || !mensagemSemDicas) { console.warn("Elementos de Dicas Recentes não encontrados."); return; }
    listaDicasRecentesDiv.innerHTML = '<div class="activity-item"><div class="activity-dot grey"></div><span class="activity-text">Carregando...</span></div>';
    mensagemSemDicas.style.display = 'none';
    try {
        const q = query(collection(db, "dicas_recentes_usuarios"), where("uidUsuario", "==", uidUsuario), orderBy("dataGeracao", "desc"), limit(5));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            listaDicasRecentesDiv.innerHTML = ''; 
            mensagemSemDicas.style.display = 'block'; return;
        }
        listaDicasRecentesDiv.innerHTML = ''; 
        querySnapshot.forEach((doc) => {
            const dica = doc.data(); const divItem = document.createElement('div');
            divItem.className = 'tip-item'; 
            const dataFormatada = dica.dataGeracao?.toDate().toLocaleDateString('pt-BR', {hour:'2-digit', minute:'2-digit'}) || 'Recentemente';
            divItem.innerHTML = `<div class="tip-icon"><i class="fas fa-lightbulb"></i></div><div class="tip-content"><div class="tip-title">${dica.categoria || 'Dica'}</div><div class="tip-description">${dica.textoDica}</div></div><div class="tip-status new" style="font-size:0.8em;color:#6b7280;white-space:nowrap;">${dataFormatada}</div>`;
            listaDicasRecentesDiv.appendChild(divItem);
        });
    } catch (error) { console.error("Erro ao carregar dicas recentes:", error); listaDicasRecentesDiv.innerHTML = '<li>Erro ao carregar.</li>';}
}
async function carregarDadosDoPerfil(currentUser) {
    if (!currentUser) { console.log("carregarDadosDoPerfil: currentUser é nulo."); return; }
    const perfilNomeInput = document.getElementById('perfil-nome');
    const perfilEmailInput = document.getElementById('perfil-email');
    const perfilTelefoneInput = document.getElementById('perfil-telefone');
    const perfilNascimentoInput = document.getElementById('perfil-nascimento');
    const planoAtualUsuarioSpan = document.getElementById('plano-atual-usuario');

    if(perfilNomeInput) perfilNomeInput.value = currentUser.displayName || '';
    if(perfilEmailInput) perfilEmailInput.value = currentUser.email || '';
    if(perfilEmailInput) perfilEmailInput.disabled = true; 
    if(perfilNomeInput) perfilNomeInput.disabled = false; 

    try {
        const userDocRef = doc(db, "usuarios", currentUser.uid);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            const userData = docSnap.data();
            if(perfilTelefoneInput) perfilTelefoneInput.value = userData.telefone || '';
            if(perfilNascimentoInput) perfilNascimentoInput.value = userData.dataNascimento || '';
            if(planoAtualUsuarioSpan) planoAtualUsuarioSpan.textContent = userData.planoAssinatura || 'Experimental (7 dias)';
            if(perfilNomeInput && !currentUser.displayName && userData.nome) {
                perfilNomeInput.value = userData.nome;
            }
        } else {
            console.log("Novo usuário Firestore: definindo nome do Auth se existir.");
            if(perfilNomeInput && currentUser.displayName) perfilNomeInput.value = currentUser.displayName;
            if(planoAtualUsuarioSpan) planoAtualUsuarioSpan.textContent = 'Experimental (7 dias)'; 
        }
    } catch (error) {
        console.error("Erro ao buscar dados do perfil do Firestore:", error);
        if(planoAtualUsuarioSpan) planoAtualUsuarioSpan.textContent = 'Não foi possível carregar';
    }
}

function getCurrentPageName() {
    let pageName = "index.html"; // Default para a landing page pública
    try {
        const pathName = window.location.pathname;
        const segments = pathName.split('/').filter(segment => segment.length > 0); 
        if (segments.length > 0) {
            pageName = segments[segments.length - 1];
        } else if (pathName === "/" || pathName === "") { 
            pageName = "index.html"; 
        }
        // Verifica se o nome da página é um dos arquivos HTML esperados.
        // Se não for, e não contiver '.', pode ser uma URL "limpa" ou um erro.
        // Para robustez, se não for um arquivo .html conhecido, default para index.html.
        const knownHtmlFiles = ['index.html', 'login.html', 'cadastro.html', 'home.html', 'cronograma.html', 'dicas-estrategicas.html', 'meu-perfil.html'];
        if (!knownHtmlFiles.includes(pageName)) {
            if(!pageName.includes('.')){ // Se não tem extensão e não é conhecido
                 // console.warn(`Página '${pageName}' não reconhecida, default para index.html.`);
                 pageName = "index.html";
            }
            // Se tem extensão mas não é um dos conhecidos, mantém (pode ser um recurso como .css, .js)
        }
    } catch (e) { 
        console.warn("Não foi possível obter página atual da URL:", e);
    }
    return pageName;
}

// --- LÓGICA PRINCIPAL EXECUTADA APÓS O DOM ESTAR PRONTO ---
document.addEventListener('DOMContentLoaded', () => {
    const currentPage = getCurrentPageName();
    console.log("DOM Carregado. Página atual para lógica de listeners:", currentPage);

    // --- OBSERVADOR DE ESTADO DE AUTENTICAÇÃO ---
    onAuthStateChanged(auth, (user) => {
        const currentPageNameAuth = getCurrentPageName(); 
        console.log("Auth State Change. User:", user ? user.uid : "Nenhum", "| Página (Auth):", currentPageNameAuth);

        const paginasProtegidas = ['home.html', 'cronograma.html', 'dicas-estrategicas.html', 'meu-perfil.html'];
        const paginasDeLogin = ['login.html']; // login.html é a única página de login agora
        const paginaCadastro = 'cadastro.html';
        const landingPage = 'index.html'; // index.html é a landing page

        if (user) { 
            const nomeUsuarioDashboard = document.getElementById('nome-usuario-dashboard');
            if (nomeUsuarioDashboard && (currentPageNameAuth === 'home.html' || document.body.classList.contains('dashboard-layout'))) {
                 nomeUsuarioDashboard.textContent = user.displayName || user.email; 
            }

            // Se usuário logado está na landing, login ou cadastro, redireciona para home (dashboard)
            if (currentPageNameAuth === landingPage || paginasDeLogin.includes(currentPageNameAuth) || currentPageNameAuth === paginaCadastro) {
                console.log("Usuário logado, redirecionando de", currentPageNameAuth, "para home.html (Dashboard)");
                window.location.href = 'home.html';
                return; // Importante para evitar executar mais lógicas após o redirecionamento
            }

            // Carrega dados específicos da página se o usuário estiver logado e na página correta
            if (currentPageNameAuth === 'cronograma.html') {
                const listaPlanos = document.getElementById('lista-planos-salvos');
                if(listaPlanos) { carregarPlanosSalvos(user.uid); }
            } else if (currentPageNameAuth === 'dicas-estrategicas.html') {
                const listaDicas = document.getElementById('dicas-recentes-lista');
                if(listaDicas) { carregarDicasRecentes(user.uid); }
            } else if (currentPageNameAuth === 'meu-perfil.html') {
                const formPerfil = document.getElementById('form-perfil-pessoal');
                if(formPerfil) { carregarDadosDoPerfil(user); }
            }
        
        } else { // Usuário deslogado
            // Se usuário deslogado e tentando acessar uma página protegida, redireciona para login.html
            if (paginasProtegidas.includes(currentPageNameAuth)) {
                console.log("Usuário deslogado, redirecionando de", currentPageNameAuth, "para login.html");
                window.location.href = 'login.html';
            }
            // Se estiver em index.html (landing), login.html ou cadastro.html, permanece lá.
        }
    });

    // --- EVENT LISTENERS POR PÁGINA ---

    // LOGIN PAGE LOGIC (login.html)
    if (currentPage === 'login.html') {
        const formLogin = document.getElementById('form-login');
        if (formLogin) {
            console.log("Anexando listener para form-login na página:", currentPage);
            formLogin.addEventListener('submit', (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value; // ID ajustado
                const senha = document.getElementById('login-senha').value; // ID ajustado
                if (email && senha) {
                    signInWithEmailAndPassword(auth, email, senha)
                        .then(() => { window.location.href = 'home.html'; })
                        .catch(err => { 
                            alert(err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' ? "E-mail ou senha inválidos." : "Erro: " + err.message);
                        });
                } else { alert("Por favor, preencha e-mail e senha."); }
            });
        }
        const linkEsqueciSenha = document.getElementById('forgotPasswordLink');
        if (linkEsqueciSenha) {
            linkEsqueciSenha.addEventListener('click', (e) => {
                e.preventDefault();
                const emailInput = document.getElementById('login-email'); 
                const emailRecuperacao = emailInput ? emailInput.value : '';
                const emailParaReset = emailRecuperacao || prompt("Seu e-mail para redefinição de senha:");
                if (emailParaReset) {
                    sendPasswordResetEmail(auth, emailParaReset)
                        .then(() => { alert("E-mail de redefinição enviado!"); })
                        .catch((error) => { alert("Erro: " + error.message); });
                }
            });
        }
    }

    // CADASTRO PAGE LOGIC
    if (currentPage === 'cadastro.html') {
        const formCadastro = document.getElementById('form-cadastro');
        if (formCadastro) {
            console.log("Anexando listener para form-cadastro na página:", currentPage);
            formCadastro.addEventListener('submit', (e) => {
                e.preventDefault();
                const nome = document.getElementById('cadastro-nome').value; // ID ajustado
                const email = document.getElementById('cadastro-email').value; // ID ajustado
                const senha = document.getElementById('cadastro-senha').value; // ID ajustado
                const confirmaSenha = document.getElementById('cadastro-confirma-senha').value; // ID ajustado
                const terms = document.getElementById('terms');
                if (senha !== confirmaSenha) { alert("Senhas não coincidem."); return; }
                if (terms && !terms.checked) { alert("Aceite os termos."); return; }
                if (email && senha) {
                    createUserWithEmailAndPassword(auth, email, senha)
                        .then(async (userCredential) => {
                            const user = userCredential.user;
                            if (nome) { try { await updateProfile(user, { displayName: nome }); } catch (err) { console.error("Erro nome Auth:", err); }}
                            try {
                                await setDoc(doc(db, "usuarios", user.uid), { nome: nome || user.displayName || null, email: user.email, dataCriacao: serverTimestamp(), planoAssinatura: "experimental_7_dias" }, { merge: true });
                            } catch (err) { console.error("Erro Firestore usuário:", err); }
                            alert("Cadastro realizado!"); window.location.href = 'login.html';
                        })
                        .catch(err => { alert(err.code === 'auth/email-already-in-use' ? "E-mail em uso." : (err.code === 'auth/weak-password' ? "Senha fraca." : "Erro: " + err.message)); });
                } else { alert("Preencha e-mail e senha."); }
            });
        }
        const termsLink = document.getElementById('termsLink');
        if (termsLink) { termsLink.addEventListener('click', (e) => { e.preventDefault(); alert('Termos de uso (placeholder).'); });}
        const privacyLink = document.getElementById('privacyLink');
        if (privacyLink) { privacyLink.addEventListener('click', (e) => { e.preventDefault(); alert('Política de privacidade (placeholder).'); });}
    }
    
    // LOGOUT BUTTON LOGIC
    if (document.body.classList.contains('dashboard-layout')) {
        const elBotaoLogout = document.getElementById('botao-logout');
        if (elBotaoLogout) {
            if (!elBotaoLogout.dataset.listenerAttachedLogout) {
                console.log("Anexando listener para botao-logout na página:", currentPage);
                elBotaoLogout.addEventListener('click', (e) => {
                    e.preventDefault();
                    signOut(auth).then(() => { window.location.href = 'login.html'; })
                    .catch(err => { console.error("Erro ao fazer logout:", err); alert("Erro ao desconectar."); });
                });
                elBotaoLogout.dataset.listenerAttachedLogout = 'true';
            }
        }
    }

    // CRONOGRAMA PAGE LOGIC
    if (currentPage === 'cronograma.html') {
        console.log("Executando lógica específica para cronograma.html");
        const formPlanoEstudos = document.getElementById('form-plano-estudos');
        const areaPlanoLocal = document.getElementById('area-plano-estudos'); 
        const botaoMostrarForm = document.getElementById('botao-mostrar-form-novo-plano');
        const containerForm = document.getElementById('container-form-novo-plano');
        const checkboxesDias = document.querySelectorAll('#horarios-dias-semana input[name="dia_semana_check"]');
        
        checkboxesDias.forEach(checkbox => {
            const dia = checkbox.value;
            const inputHorasCorrespondente = document.querySelector(`#horarios-dias-semana input.horas-por-dia-input[data-dia="${dia}"]`);
            if (inputHorasCorrespondente) {
                if(!checkbox.dataset.listenerAttachedDayCheck) {
                    checkbox.addEventListener('change', () => {
                        inputHorasCorrespondente.disabled = !checkbox.checked;
                        if (!checkbox.checked) { inputHorasCorrespondente.value = ''; } 
                        else { inputHorasCorrespondente.focus(); }
                    });
                    checkbox.dataset.listenerAttachedDayCheck = 'true';
                }
            }
        });

        if(botaoMostrarForm && containerForm){
            if(!botaoMostrarForm.dataset.listenerAttachedShowForm) {
                botaoMostrarForm.addEventListener('click', () => {
                    if (containerForm.style.display === 'none' || containerForm.style.display === '') {
                        containerForm.style.display = 'block';
                        botaoMostrarForm.innerHTML = '<i class="fas fa-minus"></i> Esconder Formulário';
                        if(areaPlanoLocal) { 
                            areaPlanoLocal.innerHTML = `<div class="feature-header"><div class="feature-icon blue"><i class="fas fa-pen-alt"></i></div><div class="feature-info"><h3>Novo Plano</h3><p>Preencha para gerar.</p></div></div>`;
                        }
                    } else {
                        containerForm.style.display = 'none';
                        botaoMostrarForm.innerHTML = '<i class="fas fa-plus"></i> Gerar Novo Cronograma';
                        if (auth.currentUser && areaPlanoLocal && document.getElementById('lista-planos-salvos')) { 
                            carregarPlanosSalvos(auth.currentUser.uid); 
                        }
                    }
                });
                botaoMostrarForm.dataset.listenerAttachedShowForm = 'true';
            }
        }

        if (formPlanoEstudos && areaPlanoLocal) {
            if(!formPlanoEstudos.dataset.listenerAttachedSubmit) {
                formPlanoEstudos.addEventListener('submit', async (evento) => {
                    evento.preventDefault(); 
                    areaPlanoLocal.innerHTML = "<p>Gerando plano...</p>";
                    const dadosParaPlano = {
                        usuarioId: auth.currentUser ? auth.currentUser.uid : null,
                        concurso: document.getElementById('concurso-objetivo').value,
                        fase: document.getElementById('fase-concurso').value,
                        materias: document.getElementById('materias-edital').value,
                        horarios_estudo_dias: Array.from(document.querySelectorAll('#horarios-dias-semana input[name="dia_semana_check"]:checked')).map(cb => ({dia: cb.value, horas: parseFloat(document.querySelector(`.horas-por-dia-input[data-dia="${cb.value}"]`).value) || 0 })),
                        duracao_bloco_estudo_minutos: parseInt(document.getElementById('duracao-sessao-estudo').value),
                        data_prova: document.getElementById('data-prova').value || null, 
                        dificuldades: document.getElementById('dificuldades-materias').value || null,
                        outras_obs: document.getElementById('outras-consideracoes').value || null
                    };
                    dadosParaPlano.horarios_estudo_dias = dadosParaPlano.horarios_estudo_dias.filter(d => d.horas > 0);
                    if (dadosParaPlano.horarios_estudo_dias.length === 0 && (dadosParaPlano.concurso || dadosParaPlano.fase || dadosParaPlano.materias) ) {
                        alert("Selecione dias e horas de estudo.");
                        areaPlanoLocal.innerHTML = "<p>Selecione dias e horas.</p>"; return; 
                    }
                    console.log("Enviando para backend (cronograma.html):", dadosParaPlano);
                    try {
                        const resposta = await fetch('http://127.0.0.1:5000/gerar-plano-estudos', { method: 'POST', headers: {'Content-Type': 'application/json',}, body: JSON.stringify(dadosParaPlano) });
                        if (!resposta.ok) { const errTxt = await resposta.text(); throw new Error(`Erro servidor: ${resposta.status} - ${errTxt}`);}
                        const dadosDoPlano = await resposta.json(); 
                        if (dadosDoPlano && dadosDoPlano.plano_de_estudos) {
                            exibirPlanoNaTela(dadosDoPlano.plano_de_estudos);
                            if (auth.currentUser) { await salvarPlanoNoFirestore(auth.currentUser.uid, dadosDoPlano); if (document.getElementById('lista-planos-salvos')) { await carregarPlanosSalvos(auth.currentUser.uid); }}
                        } else if (dadosDoPlano && (dadosDoPlano.erro_processamento || dadosDoPlano.erro_geral)) { 
                            if(areaPlanoLocal) areaPlanoLocal.innerHTML = `<p style="color: red;">Erro da IA: ${dadosDoPlano.erro_processamento || dadosDoPlano.erro_geral}</p><pre>${JSON.stringify(dadosDoPlano.resposta_bruta_ia, null, 2)}</pre>`;
                        } else { if(areaPlanoLocal) areaPlanoLocal.innerHTML = "<p>Resposta da IA inesperada.</p>"; console.log("Resposta inesperada:", dadosDoPlano); }
                    } catch (error) { console.error("Erro ao gerar plano (cronograma.html):", error); if(areaPlanoLocal) areaPlanoLocal.innerHTML = `<p>Erro: ${error.message}</p>`; }
                });
                formPlanoEstudos.dataset.listenerAttachedSubmit = 'true';
            }
        }
    }

    // DICAS ESTRATÉGICAS PAGE LOGIC
    if (currentPage === 'dicas-estrategicas.html') {
        console.log("Executando lógica específica para dicas-estrategicas.html");
        const botaoGerarDica = document.getElementById('botao-gerar-dica');
        const dicaDoDiaArea = document.getElementById('dica-do-dia-area');
        const botoesCategoriaDica = document.querySelectorAll('.btn-categoria-dica');
        if (botaoGerarDica && dicaDoDiaArea) { 
            if(!botaoGerarDica.dataset.listenerAttachedDicaDia){
                botaoGerarDica.addEventListener('click', async () => {
                    dicaDoDiaArea.innerHTML = '<div class="tip-highlight"><i class="fas fa-spinner fa-spin"></i> <span>Gerando...</span></div>';
                    try {
                        const resposta = await fetch('http://127.0.0.1:5000/gerar-dica-do-dia', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ usuarioId: auth.currentUser ? auth.currentUser.uid : null }) });
                        if (!resposta.ok) { const errText = await resposta.text(); throw new Error(`Erro servidor: ${resposta.status} - ${errText}`);}
                        const dadosDica = await resposta.json();
                        if (dadosDica && dadosDica.dica_estrategica) {
                            dicaDoDiaArea.innerHTML = `<div class="tip-highlight"><i class="fas fa-lightbulb"></i><span>${dadosDica.dica_estrategica}</span></div>`;
                            if (auth.currentUser) { await salvarDicaRecente(auth.currentUser.uid, dadosDica.dica_estrategica, "Dica do Dia"); }
                        } else { dicaDoDiaArea.innerHTML = '<div class="tip-highlight"><i class="fas fa-times-circle"></i> <span>Nenhuma dica.</span></div>';}
                    } catch (error) { dicaDoDiaArea.innerHTML = `<div class="tip-highlight"><i class="fas fa-exclamation-triangle"></i> <span style="color:red;">Erro: ${error.message}</span></div>`;}
                });
                botaoGerarDica.dataset.listenerAttachedDicaDia = 'true';
            }
        }
        if (botoesCategoriaDica.length > 0 ) { 
            botoesCategoriaDica.forEach(botao => { 
                if(!botao.dataset.listenerAttachedCatDica){
                    botao.addEventListener('click', async (evento) => {
                        evento.preventDefault(); 
                        const categoria = botao.dataset.categoria;
                        if (!categoria) return; 
                        const targetDisplayArea = document.getElementById(`tips-${categoria}`);
                        if (!targetDisplayArea) return; 
                        if (targetDisplayArea.style.display === 'block' && !targetDisplayArea.innerHTML.includes('spinner')) {
                            targetDisplayArea.style.display = 'none'; targetDisplayArea.innerHTML = ''; botao.innerHTML = 'Ver Dicas'; return; 
                        }
                        targetDisplayArea.style.display = 'block';
                        targetDisplayArea.innerHTML = `<div><i class="fas fa-spinner fa-spin"></i> Buscando...</div>`;
                        botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
                        try {
                            const resposta = await fetch('http://127.0.0.1:5000/gerar-dicas-por-categoria', { method: 'POST', headers: { 'Content-Type': 'application/json',}, body: JSON.stringify({ categoria: categoria, usuarioId: auth.currentUser ? auth.currentUser.uid : null }) });
                            if (!resposta.ok) { const errText = await resposta.text(); throw new Error(`Erro servidor: ${resposta.status} - ${errText}`);}
                            const dadosResposta = await resposta.json();
                            if (dadosResposta && dadosResposta.dicas_categoria && Array.isArray(dadosResposta.dicas_categoria.dicas)) {
                                let htmlDicas = `<h5 style="margin-bottom:10px;">Dicas: ${dadosResposta.dicas_categoria.categoria_dica || categoria}</h5><ul>`;
                                dadosResposta.dicas_categoria.dicas.forEach(dica => {
                                    htmlDicas += `<li style='margin-bottom:8px;'>${dica}</li>`;
                                    if (auth.currentUser) { salvarDicaRecente(auth.currentUser.uid, dica, dadosResposta.dicas_categoria.categoria_dica || categoria);}
                                });
                                htmlDicas += "</ul>";
                                htmlDicas += `<button class="btn-fechar-categoria-dicas">Fechar</button>`;
                                targetDisplayArea.innerHTML = htmlDicas;
                                botao.innerHTML = 'Esconder Dicas';
                                targetDisplayArea.querySelector('.btn-fechar-categoria-dicas').addEventListener('click', function() {
                                    targetDisplayArea.style.display = 'none'; targetDisplayArea.innerHTML = ''; botao.innerHTML = 'Ver Dicas';
                                });
                            } else { targetDisplayArea.innerHTML = '<p>Nenhuma dica.</p>'; botao.innerHTML = 'Ver Dicas';}
                        } catch (error) { targetDisplayArea.innerHTML = `<p style="color:red;">Erro: ${error.message}</p>`; botao.innerHTML = 'Ver Dicas';}
                    });
                    botao.dataset.listenerAttachedCatDica = 'true';
                } 
            });
        }
    }

    // MEU PERFIL PAGE LOGIC
    if (currentPage === 'meu-perfil.html') {
        console.log("Executando lógica específica para meu-perfil.html");
        const formPerfilPessoal = document.getElementById('form-perfil-pessoal');
        const formAlterarSenha = document.getElementById('form-alterar-senha');
        // carregarDadosDoPerfil é chamado pelo onAuthStateChanged
        if (formPerfilPessoal) { 
            if(!formPerfilPessoal.dataset.listenerAttachedPerfil){
                formPerfilPessoal.addEventListener('submit', async (evento) => {
                    evento.preventDefault();
                    const currentUser = auth.currentUser; if (!currentUser) { alert("Não logado."); return; }
                    const perfilNomeInput = document.getElementById('perfil-nome');
                    const novoNome = perfilNomeInput.value;
                    const novoTelefone = document.getElementById('perfil-telefone').value;
                    const novaDataNascimento = document.getElementById('perfil-nascimento').value;
                    try {
                        if (novoNome && (novoNome !== currentUser.displayName || (perfilNomeInput && !perfilNomeInput.disabled))) {
                            await updateProfile(currentUser, { displayName: novoNome });
                        }
                        const userDocRef = doc(db, "usuarios", currentUser.uid);
                        const docSnap = await getDoc(userDocRef);
                        await setDoc(userDocRef, { 
                            nome: novoNome || currentUser.displayName || null, 
                            email: currentUser.email, 
                            telefone: novoTelefone || null,
                            dataNascimento: novaDataNascimento || null,
                            planoAssinatura: docSnap.exists() ? (docSnap.data().planoAssinatura || "experimental_7_dias") : "experimental_7_dias" 
                        }, { merge: true }); 
                        alert("Perfil salvo!");
                    } catch (error) { alert("Erro ao salvar perfil: " + error.message); }
                });
                formPerfilPessoal.dataset.listenerAttachedPerfil = 'true';
            }
        }
        if (formAlterarSenha) { 
            if(!formAlterarSenha.dataset.listenerAttachedSenha){
                formAlterarSenha.addEventListener('submit', async (evento) => {
                    evento.preventDefault();
                    const currentUser = auth.currentUser; if (!currentUser) { alert("Não logado."); return; }
                    const senhaAtual = document.getElementById('senha-atual').value;
                    const novaSenha = document.getElementById('nova-senha').value;
                    const confirmaNovaSenha = document.getElementById('confirma-nova-senha').value;
                    if (!novaSenha || novaSenha.length < 6) { alert("Nova senha: mín 6 caracteres."); return; }
                    if (novaSenha !== confirmaNovaSenha) { alert("Novas senhas não coincidem."); return; }
                    if (!senhaAtual) { alert("Forneça a senha atual."); return; }
                    try {
                        const credential = EmailAuthProvider.credential(currentUser.email, senhaAtual);
                        await reauthenticateWithCredential(currentUser, credential);
                        await updatePassword(currentUser, novaSenha);
                        alert("Senha alterada!"); formAlterarSenha.reset(); 
                    } catch (error) {
                        alert(error.code === 'auth/wrong-password' ? "Senha atual incorreta." : (error.code === 'auth/requires-recent-login' ? "Login recente necessário." : "Erro: " + error.message));
                    }
                });
                formAlterarSenha.dataset.listenerAttachedSenha = 'true';
            }
        }
    }
});