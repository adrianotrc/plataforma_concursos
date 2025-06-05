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

console.log("app.js: Firebase App inicializado");

// --- FUNÇÕES AUXILIARES ---
// (Definições completas de todas as funções)

function exibirPlanoNaTela(planoDeEstudosObjeto) {
    const areaPlano = document.getElementById('area-plano-estudos');
    if (!areaPlano) return;
    if (planoDeEstudosObjeto) {
        const planoConteudo = planoDeEstudosObjeto; 
        areaPlano.innerHTML = ""; 
        let htmlTopoPlano = `<div class="feature-header" style="margin-bottom:10px;"><div class="feature-icon blue"><i class="fas fa-calendar-check"></i></div><div class="feature-info"><h3>${planoConteudo.mensagem_inicial || 'Seu Plano de Estudos!'}</h3></div></div>`;
        htmlTopoPlano += `<p style="margin-bottom:15px;"><strong>Concurso Foco:</strong> ${planoConteudo.concurso_foco || 'Não informado'}</p>`;
        htmlTopoPlano += `<button id="botao-fechar-plano-exibido" class="botao-fechar-plano">Fechar Detalhes</button>`;
        htmlTopoPlano += `<hr style="margin-bottom: 10px; margin-top: 15px;">`;
        areaPlano.innerHTML = htmlTopoPlano;
        const cronogramaContainerPrincipal = document.createElement('div');
        cronogramaContainerPrincipal.className = 'schedule-container';
        if (planoConteudo.visao_geral_periodos?.length > 0) {
            planoConteudo.visao_geral_periodos.forEach((periodoItem, indicePeriodo) => {
                const periodoDiv = document.createElement('div');
                periodoDiv.className = 'feature-card'; 
                periodoDiv.style.marginTop = '20px'; periodoDiv.style.padding = '15px';
                let periodoHtml = `<div class="day-header">${periodoItem.periodo_descricao || `Período ${indicePeriodo + 1}`}</div><p style="font-style:italic;margin-bottom:10px;"><strong>Foco:</strong> ${periodoItem.foco_principal_periodo || 'Não especificado'}</p>`;
                if(periodoItem.materias_prioritarias_periodo?.length > 0) { periodoHtml += `<p><strong>Matérias Prioritárias:</strong> ${periodoItem.materias_prioritarias_periodo.join(", ")}</p>`; }
                periodoDiv.innerHTML = periodoHtml;
                if (periodoItem.cronograma_semanal_detalhado_do_periodo?.length > 0) {
                    periodoItem.cronograma_semanal_detalhado_do_periodo.forEach((semanaItem) => {
                        const semanaDiv = document.createElement('div');
                        semanaDiv.style.marginTop = "15px";
                        semanaDiv.innerHTML = `<h5 style="margin-bottom:10px;border-top:1px solid #eee;padding-top:10px;">Semana ${semanaItem.semana_numero_no_periodo || ''}: ${semanaItem.foco_da_semana_especifico || 'Foco'}</h5>`;
                        if (semanaItem.dias_de_estudo?.length > 0) {
                            const diasContainer = document.createElement('div');
                            semanaItem.dias_de_estudo.forEach(diaItem => {
                                const diaDiv = document.createElement('div');
                                diaDiv.className = 'schedule-day'; 
                                let diaHtml = `<div class="day-header">${diaItem.dia_da_semana || 'Dia'}</div>`;
                                if (diaItem.atividades?.length > 0) {
                                    diaHtml += "<div class='day-tasks'>"; 
                                    diaItem.atividades.forEach(atividade => { diaHtml += `<div class="task-item"><span class="task-time">${atividade.duracao_sugerida_minutos || '?'} min</span><span class="task-subject">${atividade.materia || ''}${atividade.topico_sugerido ? ` (${atividade.topico_sugerido})` : ''} - ${atividade.tipo_de_estudo || ''}</span><span class="task-status pending">○</span></div>`; });
                                    diaHtml += "</div>"; 
                                } else { diaHtml += "<p>Nenhuma atividade.</p>"; }
                                diaDiv.innerHTML = diaHtml;
                                diasContainer.appendChild(diaDiv); 
                            });
                            semanaDiv.appendChild(diasContainer); 
                        } else { semanaDiv.innerHTML += "<p>Nenhum dia de estudo.</p>"; }
                        periodoDiv.appendChild(semanaDiv);
                    });
                } else { periodoDiv.innerHTML += `<p style="margin-top:10px; color: #555;"><em>(Visão geral para este período.)</em></p>`; }
                cronogramaContainerPrincipal.appendChild(periodoDiv);
            });
        }
        areaPlano.appendChild(cronogramaContainerPrincipal); 
        const botaoFechar = document.getElementById('botao-fechar-plano-exibido');
        if (botaoFechar) { botaoFechar.addEventListener('click', () => { areaPlano.innerHTML = `<div class="feature-header"><div class="feature-icon blue"><i class="fas fa-info-circle"></i></div><div class="feature-info"><h3>Plano Fechado</h3><p>Selecione um plano salvo ou gere um novo.</p></div></div>`; }); }
    } else { areaPlano.innerHTML = `<div class="feature-header"><div class="feature-icon blue"><i class="fas fa-info-circle"></i></div><div class="feature-info"><h3>Nenhum Plano</h3><p>Não foi possível carregar detalhes.</p></div></div>`; }
}
async function salvarPlanoNoFirestore(usuarioId, dadosDoPlano) {
    if (!usuarioId || !dadosDoPlano?.plano_de_estudos) { console.error("Dados insuficientes para salvar plano."); return; }
    try {
        await addDoc(collection(db, "planos_usuarios"), { uidUsuario: usuarioId, concursoFoco: dadosDoPlano.plano_de_estudos.concurso_foco, planoSalvo: dadosDoPlano.plano_de_estudos, dataCriacao: serverTimestamp() });
        console.log("Plano salvo no Firestore.");
    } catch (e) { console.error("Erro ao salvar plano no Firestore:", e); }
}
async function carregarPlanosSalvos(uidUsuario) {
    const listaPlanosUl = document.getElementById('lista-planos-salvos');
    const mensagemSemPlanos = document.getElementById('mensagem-sem-planos');
    const areaPlanoAtual = document.getElementById('area-plano-estudos'); 
    if (!listaPlanosUl || !mensagemSemPlanos) { return;}
    if(areaPlanoAtual && !areaPlanoAtual.querySelector('h3')) { 
        areaPlanoAtual.innerHTML = `<div class="feature-header" style="margin-bottom:10px;"><div class="feature-icon blue"><i class="fas fa-info-circle"></i></div><div class="feature-info"><h3>Selecione ou Gere um Plano</h3><p>Use a lista ou o botão acima.</p></div></div>`;
    }
    listaPlanosUl.innerHTML = '<li>Carregando...</li>'; 
    mensagemSemPlanos.style.display = 'none';
    try {
        const q = query(collection(db, "planos_usuarios"), where("uidUsuario", "==", uidUsuario), orderBy("dataCriacao", "desc"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            listaPlanosUl.innerHTML = ''; 
            mensagemSemPlanos.style.display = 'block'; 
            if(areaPlanoAtual && !areaPlanoAtual.querySelector('h3')) {
                 areaPlanoAtual.innerHTML = `<div class="feature-header" style="margin-bottom:10px;"><div class="feature-icon blue"><i class="fas fa-info-circle"></i></div><div class="feature-info"><h3>Nenhum Plano Salvo</h3><p>Clique para gerar seu primeiro!</p></div></div>`;
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
            const dataCriacao = dadosFirestore.dataCriacao?.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || 'Data';
            listItem.innerHTML = `<div class="activity-dot blue"></div><div class="activity-text" style="display:flex;flex-direction:column;"><strong>${planoParaExibirOnClick.concurso_foco || 'Plano Salvo'}</strong><small>Criado em: ${dataCriacao}</small></div>`;
            listItem.addEventListener('click', () => { if(areaPlanoAtual) { exibirPlanoNaTela(planoParaExibirOnClick); window.scrollTo({ top: areaPlanoAtual.offsetTop - 80, behavior: 'smooth' }); }});
            listaPlanosUl.appendChild(listItem);
        });
    } catch (error) { console.error("Erro ao carregar planos salvos:", error); listaPlanosUl.innerHTML = '<li>Erro ao carregar.</li>';}
}
async function salvarDicaRecente(uidUsuario, dicaTexto, categoriaDica) {
    if (!uidUsuario || !dicaTexto) { return; }
    try {
        await addDoc(collection(db, "dicas_recentes_usuarios"), { uidUsuario, textoDica: dicaTexto, categoria: categoriaDica || "Dica do Dia", dataGeracao: serverTimestamp() });
        if (getCurrentPageName() === 'dicas-estrategicas.html') { carregarDicasRecentes(uidUsuario); }
    } catch (e) { console.error("Erro ao salvar dica recente:", e); }
}
async function carregarDicasRecentes(uidUsuario) {
    const listaDicas = document.getElementById('dicas-recentes-lista');
    const msgSemDicas = document.getElementById('mensagem-sem-dicas-recentes'); 
    if (!listaDicas || !msgSemDicas) { return; }
    listaDicas.innerHTML = '<div class="activity-item"><div class="activity-dot grey"></div>Carregando...</div>';
    msgSemDicas.style.display = 'none';
    try {
        const q = query(collection(db, "dicas_recentes_usuarios"), where("uidUsuario", "==", uidUsuario), orderBy("dataGeracao", "desc"), limit(5));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            listaDicas.innerHTML = ''; msgSemDicas.style.display = 'block'; return;
        }
        listaDicas.innerHTML = ''; 
        querySnapshot.forEach((doc) => {
            const dica = doc.data(); const item = document.createElement('div');
            item.className = 'tip-item'; 
            const data = dica.dataGeracao?.toDate().toLocaleDateString('pt-BR', {hour:'2-digit', minute:'2-digit'}) || '';
            item.innerHTML = `<div class="tip-icon"><i class="fas fa-lightbulb"></i></div><div class="tip-content"><div class="tip-title">${dica.categoria || 'Dica'}</div><div class="tip-description">${dica.textoDica}</div></div><div class="tip-status new" style="font-size:0.8em;color:#6b7280;white-space:nowrap;">${data}</div>`;
            listaDicas.appendChild(item);
        });
    } catch (error) { console.error("Erro ao carregar dicas recentes:", error); listaDicas.innerHTML = '<li>Erro ao carregar.</li>';}
}
async function getAuthenticatedUserProfile(user) {
    if (!user) return null;
    let nomeFinal = user.displayName;
    let firestoreData = {};
    try {
        const userDocRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            firestoreData = docSnap.data();
            if (firestoreData.nome) { nomeFinal = firestoreData.nome; }
        }
        if (nomeFinal && user.displayName !== nomeFinal) {
            await updateProfile(user, { displayName: nomeFinal });
            console.log("Nome do Auth sincronizado com o do Firestore.");
        }
    } catch (error) { console.error("Erro ao buscar/sincronizar dados do perfil:", error); }
    return { uid: user.uid, email: user.email, nome: nomeFinal, firestoreData };
}
async function carregarDadosDoPerfil(userProfile) {
    if (!userProfile) return;
    const nomeInput = document.getElementById('perfil-nome');
    const emailInput = document.getElementById('perfil-email');
    const telInput = document.getElementById('perfil-telefone');
    const nascInput = document.getElementById('perfil-nascimento');
    const planoSpan = document.getElementById('plano-atual-usuario');

    if (nomeInput) nomeInput.value = userProfile.nome || '';
    if (emailInput) emailInput.value = userProfile.email || '';
    if (emailInput) emailInput.disabled = true;
    if (nomeInput) nomeInput.disabled = false;

    if (userProfile.firestoreData) {
        if (telInput) telInput.value = userProfile.firestoreData.telefone || '';
        if (nascInput) nascInput.value = userProfile.firestoreData.dataNascimento || '';
        if (planoSpan) planoSpan.textContent = userProfile.firestoreData.planoAssinatura || 'Experimental';
    }
}
function getCurrentPageName() {
    try {
        const pathName = window.location.pathname;
        let pageName = pathName.substring(pathName.lastIndexOf('/') + 1);
        if (pageName === "") pageName = "index.html";
        return pageName;
    } catch (e) { return "index.html"; }
}

// --- LÓGICA DE INICIALIZAÇÃO E EVENTOS ---

// Função que anexa todos os event listeners da página atual
function attachPageEventListeners(currentPage, user) {
    console.log("Anexando listeners para a página:", currentPage);

    // Listener de Logout (anexado se o botão existir)
    const elBotaoLogout = document.getElementById('botao-logout');
    if (elBotaoLogout && !elBotaoLogout.dataset.listenerAttached) {
        elBotaoLogout.addEventListener('click', (e) => {
            e.preventDefault();
            signOut(auth).catch(err => console.error("Erro no logout:", err));
        });
        elBotaoLogout.dataset.listenerAttached = 'true';
        console.log("Listener de Logout ANEXADO.");
    }
    
    // Listeners específicos da página
    if (currentPage === 'login.html') {
        const formLogin = document.getElementById('form-login');
        if (formLogin) {
            formLogin.addEventListener('submit', (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value;
                const senha = document.getElementById('login-senha').value;
                if (!email || !senha) { alert("Preencha e-mail e senha."); return; }
                signInWithEmailAndPassword(auth, email, senha)
                    .catch(err => alert(err.code === 'auth/invalid-credential' ? "E-mail ou senha inválidos." : "Erro: " + err.message));
            });
        }
    } else if (currentPage === 'cadastro.html') {
        const formCadastro = document.getElementById('form-cadastro');
        if (formCadastro) {
            formCadastro.addEventListener('submit', (e) => {
                e.preventDefault();
                const nome = document.getElementById('cadastro-nome').value;
                const email = document.getElementById('cadastro-email').value;
                const senha = document.getElementById('cadastro-senha').value;
                const confirmaSenha = document.getElementById('cadastro-confirma-senha').value;
                if (senha !== confirmaSenha) { alert("As senhas não coincidem."); return; }
                if (document.getElementById('terms')?.checked && email && senha) {
                    createUserWithEmailAndPassword(auth, email, senha)
                        .then(async (userCredential) => {
                            const userAuth = userCredential.user;
                            if (nome) { await updateProfile(userAuth, { displayName: nome }); }
                            await setDoc(doc(db, "usuarios", userAuth.uid), { nome: nome || null, email: userAuth.email, dataCriacao: serverTimestamp() }, { merge: true });
                            alert("Cadastro realizado! Por favor, faça o login."); 
                            window.location.href = 'login.html';
                        })
                        .catch(err => alert(err.code === 'auth/email-already-in-use' ? "E-mail em uso." : "Erro: " + err.message));
                }
            });
        }
    } else if (currentPage === 'cronograma.html') {
        const checkboxesDias = document.querySelectorAll('input[name="dia_semana_check"]');
        checkboxesDias.forEach(checkbox => {
            const dia = checkbox.value;
            const inputHoras = document.querySelector(`input.horas-por-dia-input[data-dia="${dia}"]`);
            if (inputHoras) { checkbox.addEventListener('change', () => { inputHoras.disabled = !checkbox.checked; if(!checkbox.checked) inputHoras.value = ''; else inputHoras.focus(); }); }
        });
        const botaoMostrarForm = document.getElementById('botao-mostrar-form-novo-plano');
        const containerForm = document.getElementById('container-form-novo-plano');
        if(botaoMostrarForm && containerForm){
            botaoMostrarForm.addEventListener('click', () => {
                const isHidden = containerForm.style.display === 'none' || !containerForm.style.display;
                containerForm.style.display = isHidden ? 'block' : 'none';
                botaoMostrarForm.innerHTML = isHidden ? '<i class="fas fa-minus"></i> Esconder Formulário' : '<i class="fas fa-plus"></i> Gerar Novo Cronograma';
            });
        }
        const formPlanoEstudos = document.getElementById('form-plano-estudos');
        if (formPlanoEstudos) {
            formPlanoEstudos.addEventListener('submit', async (e) => {
                e.preventDefault(); 
                const areaPlano = document.getElementById('area-plano-estudos');
                if(areaPlano) areaPlano.innerHTML = "<p>Gerando plano...</p>";
                const dados = {
                    usuarioId: user?.uid,
                    concurso: document.getElementById('concurso-objetivo').value,
                    fase: document.getElementById('fase-concurso').value,
                    materias: document.getElementById('materias-edital').value,
                    horarios_estudo_dias: Array.from(document.querySelectorAll('#horarios-dias-semana input:checked')).map(cb => ({dia: cb.value, horas: parseFloat(document.querySelector(`.horas-por-dia-input[data-dia="${cb.value}"]`).value) || 0 })).filter(d => d.horas > 0),
                    duracao_bloco_estudo_minutos: parseInt(document.getElementById('duracao-sessao-estudo').value),
                    data_prova: document.getElementById('data-prova').value || null, 
                    dificuldades: document.getElementById('dificuldades-materias').value || null,
                    outras_obs: document.getElementById('outras-consideracoes').value || null
                };
                if (dados.horarios_estudo_dias.length === 0) {
                    alert("Selecione dias e horas de estudo.");
                    if(areaPlano) areaPlano.innerHTML = "<p>Selecione dias e horas.</p>"; return; 
                }
                try {
                    const resp = await fetch('http://127.0.0.1:5000/gerar-plano-estudos', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(dados) });
                    if (!resp.ok) { throw new Error(`Erro servidor: ${resp.status}`); }
                    const plano = await resp.json(); 
                    if (plano?.plano_de_estudos) {
                        exibirPlanoNaTela(plano.plano_de_estudos);
                        if (user) { await salvarPlanoNoFirestore(user.uid, plano); await carregarPlanosSalvos(user.uid); }
                    } else { throw new Error('Resposta da IA inválida.'); }
                } catch (error) { if(areaPlano) areaPlano.innerHTML = `<p style="color:red;">Erro: ${error.message}</p>`; }
            });
        }
    } else if (currentPage === 'dicas-estrategicas.html') {
        const botaoGerarDica = document.getElementById('botao-gerar-dica');
        const dicaDoDiaArea = document.getElementById('dica-do-dia-area');
        if (botaoGerarDica && dicaDoDiaArea) {
            botaoGerarDica.addEventListener('click', async () => {
                dicaDoDiaArea.innerHTML = '<div class="tip-highlight"><i class="fas fa-spinner fa-spin"></i> <span>Gerando...</span></div>';
                try {
                    const resp = await fetch('http://127.0.0.1:5000/gerar-dica-do-dia', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ usuarioId: user?.uid }) });
                    if (!resp.ok) { throw new Error(`Erro servidor: ${resp.status}`); }
                    const dados = await resp.json();
                    if (dados?.dica_estrategica) {
                        dicaDoDiaArea.innerHTML = `<div class="tip-highlight"><i class="fas fa-lightbulb"></i><span>${dados.dica_estrategica}</span></div>`;
                        if (user) { await salvarDicaRecente(user.uid, dados.dica_estrategica, "Dica do Dia"); }
                    } else { dicaDoDiaArea.innerHTML = '<div class="tip-highlight"><i class="fas fa-times-circle"></i> <span>Nenhuma dica.</span></div>'; }
                } catch (error) { dicaDoDiaArea.innerHTML = `<div class="tip-highlight"><i class="fas fa-exclamation-triangle"></i> <span style="color:red;">Erro: ${error.message}</span></div>`; }
            });
        }
        const botoesCategoriaDica = document.querySelectorAll('.btn-categoria-dica');
        if (botoesCategoriaDica.length > 0 ) { 
            botoesCategoriaDica.forEach(botao => { 
                botao.addEventListener('click', async (e) => {
                    e.preventDefault(); const categoria = botao.dataset.categoria;
                    const targetArea = document.getElementById(`tips-${categoria}`);
                    if (!targetArea) return; 
                    if (targetArea.style.display === 'block') { targetArea.style.display = 'none'; targetArea.innerHTML = ''; botao.innerHTML = 'Ver Dicas'; return; }
                    targetArea.style.display = 'block';
                    targetArea.innerHTML = `<div><i class="fas fa-spinner fa-spin"></i> Buscando...</div>`;
                    botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    try {
                        const resp = await fetch('http://127.0.0.1:5000/gerar-dicas-por-categoria', { method: 'POST', headers: { 'Content-Type': 'application/json',}, body: JSON.stringify({ categoria, usuarioId: user?.uid }) });
                        if (!resp.ok) { throw new Error(`Erro servidor: ${resp.status}`); }
                        const dados = await resp.json();
                        if (dados?.dicas_categoria?.dicas) {
                            let html = `<h5 style="margin-bottom:10px;">Dicas: ${dados.dicas_categoria.categoria_dica || categoria}</h5><ul>`;
                            dados.dicas_categoria.dicas.forEach(dica => {
                                html += `<li style='margin-bottom:8px;'>${dica}</li>`;
                                if (user) { salvarDicaRecente(user.uid, dica, dados.dicas_categoria.categoria_dica || categoria); }
                            });
                            html += "</ul><button class='btn-fechar-categoria-dicas'>Fechar</button>";
                            targetArea.innerHTML = html; botao.innerHTML = 'Esconder Dicas';
                            targetArea.querySelector('.btn-fechar-categoria-dicas').addEventListener('click', () => {
                                targetArea.style.display = 'none'; targetArea.innerHTML = ''; botao.innerHTML = 'Ver Dicas';
                            });
                        } else { targetArea.innerHTML = '<p>Nenhuma dica.</p>'; botao.innerHTML = 'Ver Dicas'; }
                    } catch (error) { targetArea.innerHTML = `<p style="color:red;">Erro.</p>`; botao.innerHTML = 'Ver Dicas'; }
                }); 
            });
        }
    } else if (currentPage === 'meu-perfil.html') {
        const formPerfil = document.getElementById('form-perfil-pessoal');
        const formSenha = document.getElementById('form-alterar-senha');
        if (formPerfil) { 
            formPerfil.addEventListener('submit', async (e) => {
                e.preventDefault();
                const currentUser = auth.currentUser; if (!currentUser) return;
                const nomeInput = document.getElementById('perfil-nome');
                const novoNome = nomeInput.value;
                try {
                    const userDocRef = doc(db, "usuarios", currentUser.uid);
                    await setDoc(userDocRef, { 
                        nome: novoNome || null, 
                        telefone: document.getElementById('perfil-telefone').value || null,
                        dataNascimento: document.getElementById('perfil-nascimento').value || null,
                    }, { merge: true }); 
                    if (novoNome && novoNome !== currentUser.displayName) {
                        await updateProfile(currentUser, { displayName: novoNome });
                    }
                    alert("Perfil salvo!");
                    const nomeDashboard = document.getElementById('nome-usuario-dashboard');
                    if(nomeDashboard) nomeDashboard.textContent = novoNome || currentUser.email;
                } catch (error) { alert("Erro ao salvar perfil: " + error.message); }
            });
        }
        if (formSenha) { 
            formSenha.addEventListener('submit', async (e) => {
                e.preventDefault();
                const currentUser = auth.currentUser; if (!currentUser) return;
                const senhaAtual = document.getElementById('senha-atual').value;
                const novaSenha = document.getElementById('nova-senha').value;
                const confirmaSenha = document.getElementById('confirma-nova-senha').value;
                if (!novaSenha || novaSenha.length < 6) { alert("Nova senha: mín 6 caracteres."); return; }
                if (novaSenha !== confirmaSenha) { alert("Novas senhas não coincidem."); return; }
                if (!senhaAtual) { alert("Forneça a senha atual."); return; }
                try {
                    const cred = EmailAuthProvider.credential(currentUser.email, senhaAtual);
                    await reauthenticateWithCredential(currentUser, cred);
                    await updatePassword(currentUser, novaSenha);
                    alert("Senha alterada!"); formSenha.reset(); 
                } catch (error) {
                    alert(error.code === 'auth/wrong-password' ? "Senha atual incorreta." : "Erro: " + error.message);
                }
            });
        }
    }
}

// --- Ponto de Entrada Principal ---

// Configura o observador de autenticação para rodar imediatamente
onAuthStateChanged(auth, async (user) => {
    // A lógica de roteamento e carregamento de dados é tratada aqui.
    // Ela garante que, quando o DOM carregar, o estado do usuário já seja conhecido.
    const currentPageNameAuth = getCurrentPageName();
    const paginasProtegidas = ['home.html', 'cronograma.html', 'dicas-estrategicas.html', 'meu-perfil.html'];
    const paginasDeLoginOuCadastro = ['login.html', 'cadastro.html'];
    const landingPage = 'index.html';

    if (user) {
        const userProfile = await getAuthenticatedUserProfile(user);
        if (!userProfile) { signOut(auth); return; }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                const nomeUsuarioDashboard = document.getElementById('nome-usuario-dashboard');
                if (nomeUsuarioDashboard) { nomeUsuarioDashboard.textContent = userProfile.nome || userProfile.email; }
            });
        } else {
            const nomeUsuarioDashboard = document.getElementById('nome-usuario-dashboard');
            if (nomeUsuarioDashboard) { nomeUsuarioDashboard.textContent = userProfile.nome || userProfile.email; }
        }

        if (paginasDeLoginOuCadastro.includes(currentPageNameAuth) || currentPageNameAuth === landingPage) {
            window.location.href = 'home.html';
        } else if (currentPageNameAuth === 'cronograma.html') {
            carregarPlanosSalvos(user.uid);
        } else if (currentPageNameAuth === 'dicas-estrategicas.html') {
            carregarDicasRecentes(user.uid);
        } else if (currentPageNameAuth === 'meu-perfil.html') {
            carregarDadosDoPerfil(userProfile);
        }
    } else {
        if (paginasProtegidas.includes(currentPageNameAuth)) {
            window.location.href = 'login.html';
        }
    }
});

// A anexação dos listeners de clique/submit depende do DOM
document.addEventListener('DOMContentLoaded', () => {
    const currentPage = getCurrentPageName();
    attachPageEventListeners(currentPage, auth.currentUser);
});