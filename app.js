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
    orderBy
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

// --- FUNÇÕES AUXILIARES PARA PLANOS DE ESTUDO ---

function exibirPlanoNaTela(planoDeEstudosObjeto) {
    const areaPlano = document.getElementById('area-plano-estudos');
    if (!areaPlano) {
        console.error("Elemento 'area-plano-estudos' não encontrado no DOM para exibir o plano.");
        return;
    }

    if (planoDeEstudosObjeto) {
        const planoConteudo = planoDeEstudosObjeto; 

        let htmlPlano = `<h3>${planoConteudo.mensagem_inicial || 'Seu Plano de Estudos!'}</h3>`;
        htmlPlano += `<p><strong>Concurso Foco:</strong> ${planoConteudo.concurso_foco || 'Não informado'}</p>`;
        
        if (planoConteudo.visao_geral_periodos && Array.isArray(planoConteudo.visao_geral_periodos)) {
            planoConteudo.visao_geral_periodos.forEach((periodoItem, indicePeriodo) => {
                htmlPlano += `<div class="periodo-plano" style="margin-top: 20px; padding:15px; border: 1px dashed #007bff; border-radius: 5px;">`;
                htmlPlano += `<h4>${periodoItem.periodo_descricao || `Período ${indicePeriodo + 1}`}: ${periodoItem.foco_principal_periodo || 'Foco do período não especificado'}</h4>`;
                
                if(periodoItem.materias_prioritarias_periodo && Array.isArray(periodoItem.materias_prioritarias_periodo) && periodoItem.materias_prioritarias_periodo.length > 0){
                    htmlPlano += `<p><strong>Matérias Prioritárias no Período:</strong> ${periodoItem.materias_prioritarias_periodo.join(", ")}</p>`;
                }

                if (periodoItem.cronograma_semanal_detalhado_do_periodo && Array.isArray(periodoItem.cronograma_semanal_detalhado_do_periodo)) {
                    periodoItem.cronograma_semanal_detalhado_do_periodo.forEach((semanaItem) => {
                        htmlPlano += `<div class="semana-plano" style="margin-top: 10px; padding-top:10px; border-top: 1px solid #ccc;">`;
                        htmlPlano += `<h5>Semana ${semanaItem.semana_numero_no_periodo || ''}: ${semanaItem.foco_da_semana_especifico || 'Foco da semana não especificado'}</h5>`;
                        
                        if (semanaItem.dias_de_estudo && Array.isArray(semanaItem.dias_de_estudo)) {
                            htmlPlano += "<ul style='margin-left: 15px;'>"; 
                            semanaItem.dias_de_estudo.forEach(diaItem => {
                                htmlPlano += `<li style="margin-bottom: 10px;"><strong>${diaItem.dia_da_semana || 'Dia não especificado'}:</strong>`;
                                if (diaItem.atividades && Array.isArray(diaItem.atividades)) {
                                    htmlPlano += "<ul style='list-style-type: circle; margin-left: 20px;'>"; 
                                    diaItem.atividades.forEach(atividade => {
                                        htmlPlano += `<li>${atividade.materia || ''}${atividade.topico_sugerido ? ' (' + atividade.topico_sugerido + ')' : ''} - ${atividade.tipo_de_estudo || ''} (${atividade.duracao_sugerida_minutos || '?'} min)</li>`;
                                    });
                                    htmlPlano += "</ul>";
                                } else {
                                    htmlPlano += " Nenhuma atividade detalhada para este dia.";
                                }
                                htmlPlano += `</li>`;
                            });
                            htmlPlano += "</ul>"; 
                        } else {
                            htmlPlano += "<p>Nenhum dia de estudo detalhado para esta semana.</p>";
                        }
                        htmlPlano += `</div>`; 
                    });
                }
                htmlPlano += `</div>`; 
            });
        } else {
             htmlPlano += "<p>Nenhuma estrutura de visão geral de períodos disponível neste plano.</p>";
        }
        areaPlano.innerHTML = htmlPlano;
        console.log("Plano exibido na tela pela função exibirPlanoNaTela.");
    
    } else {
        areaPlano.innerHTML = "<p>Não foi possível carregar os detalhes do plano (objeto vazio).</p>";
        console.log("Objeto do plano para exibição está vazio ou inválido:", planoDeEstudosObjeto);
    }
}

async function salvarPlanoNoFirestore(usuarioId, dadosDoPlanoCompletoRecebidoDaIA) {
    if (!usuarioId || !dadosDoPlanoCompletoRecebidoDaIA || !dadosDoPlanoCompletoRecebidoDaIA.plano_de_estudos) {
        console.error("Dados insuficientes para salvar o plano: usuário não logado ou estrutura de plano inválida.");
        return;
    }
    try {
        const colecaoPlanos = collection(db, "planos_usuarios");
        const docRef = await addDoc(colecaoPlanos, {
            uidUsuario: usuarioId,
            concursoFoco: dadosDoPlanoCompletoRecebidoDaIA.plano_de_estudos.concurso_foco || "Não especificado",
            planoSalvo: dadosDoPlanoCompletoRecebidoDaIA.plano_de_estudos, 
            dataCriacao: serverTimestamp(), 
        });
        console.log("Plano salvo no Firestore com ID: ", docRef.id);
    } catch (e) {
        console.error("Erro ao salvar plano no Firestore: ", e);
        alert("Houve um erro ao tentar salvar seu plano de estudos.");
    }
}

async function carregarPlanosSalvos(uidUsuario) {
    const listaPlanosUl = document.getElementById('lista-planos-salvos');
    const mensagemSemPlanos = document.getElementById('mensagem-sem-planos');
    const areaPlanoAtual = document.getElementById('area-plano-estudos'); 
    
    if (!listaPlanosUl || !mensagemSemPlanos) { 
        console.warn("Elementos 'lista-planos-salvos' ou 'mensagem-sem-planos' não encontrados. Verifique se está na página correta (cronograma.html).");
        return;
    }

    listaPlanosUl.innerHTML = '<li>Carregando seus planos...</li>'; 
    mensagemSemPlanos.style.display = 'none';

    try {
        const colecaoPlanos = collection(db, "planos_usuarios");
        const q = query(colecaoPlanos, 
                        where("uidUsuario", "==", uidUsuario), 
                        orderBy("dataCriacao", "desc"));

        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            listaPlanosUl.innerHTML = ''; 
            mensagemSemPlanos.style.display = 'block'; 
            if(areaPlanoAtual){ // Limpa área principal se não há planos
                areaPlanoAtual.innerHTML = '<p>Nenhum plano salvo encontrado. Gere um novo plano!</p>';
            }
            console.log("Nenhum plano salvo encontrado para este usuário.");
            return;
        }

        listaPlanosUl.innerHTML = ''; 
        let primeiroPlano = true; 
        querySnapshot.forEach((docSnapshot) => {
            const dadosFirestore = docSnapshot.data();
            const planoParaExibir = dadosFirestore.planoSalvo; 

            if (!planoParaExibir) { 
                console.warn("Documento de plano salvo não contém a estrutura 'planoSalvo':", docSnapshot.id);
                return; 
            }

            const listItem = document.createElement('li');
            listItem.style.padding = '10px';
            listItem.style.borderBottom = '1px solid #eee';
            listItem.style.cursor = 'pointer';
            
            const dataCriacao = dadosFirestore.dataCriacao && dadosFirestore.dataCriacao.toDate ? 
                                dadosFirestore.dataCriacao.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 
                                'Data desconhecida';

            listItem.innerHTML = `
                <strong>Concurso:</strong> ${planoParaExibir.concurso_foco || 'Não especificado'} <br>
                <small>Criado em: ${dataCriacao}</small>
            `;
            
            listItem.addEventListener('click', () => {
                console.log("Exibindo plano salvo do Firestore:", planoParaExibir);
                if(areaPlanoAtual) { 
                    areaPlanoAtual.innerHTML = ""; 
                    exibirPlanoNaTela(planoParaExibir); 
                    window.scrollTo({ top: areaPlanoAtual.offsetTop - 80, behavior: 'smooth' }); // Ajustado o scroll
                } else {
                    console.error("Elemento 'area-plano-estudos' não encontrado para exibir o plano salvo.")
                }
            });

            listItem.addEventListener('mouseover', () => listItem.style.backgroundColor = '#f9f9f9');
            listItem.addEventListener('mouseout', () => listItem.style.backgroundColor = 'transparent');

            listaPlanosUl.appendChild(listItem);

            // Se for o primeiro plano da lista e estivermos na página de cronograma, exibe-o
            if (primeiroPlano && window.location.pathname.includes('cronograma.html')) {
                if(areaPlanoAtual){
                    areaPlanoAtual.innerHTML = ""; // Limpa "Nenhum plano para exibir..."
                    exibirPlanoNaTela(planoParaExibir);
                }
                primeiroPlano = false; 
            }
        });

    } catch (error) {
        console.error("Erro ao carregar planos salvos:", error);
        listaPlanosUl.innerHTML = '<li>Ocorreu um erro ao carregar seus planos.</li>';
        mensagemSemPlanos.style.display = 'none';
    }
}

// --- LÓGICA PARA A PÁGINA DE CADASTRO (cadastro.html) ---
const formCadastro = document.getElementById('form-cadastro');
if (formCadastro) {
    formCadastro.addEventListener('submit', (evento) => {
        evento.preventDefault(); 
        const nome = document.getElementById('cadastro-nome').value; 
        const email = document.getElementById('cadastro-email').value;
        const senha = document.getElementById('cadastro-senha').value;
        const confirmaSenha = document.getElementById('cadastro-confirma-senha').value;
        if (senha !== confirmaSenha) {
            alert("As senhas não coincidem!");
            return; 
        }
        if (email && senha) {
            createUserWithEmailAndPassword(auth, email, senha)
                .then((userCredential) => {
                    console.log("Usuário cadastrado:", userCredential.user.uid);
                    alert("Cadastro realizado com sucesso! Você será redirecionado para o login.");
                    window.location.href = 'index.html'; 
                })
                .catch((error) => {
                    const errorCode = error.code;
                    const errorMessage = error.message;
                    console.error("Erro no cadastro:", errorCode, errorMessage);
                    if (errorCode === 'auth/email-already-in-use') {
                        alert("Este e-mail já está em uso. Tente outro.");
                    } else if (errorCode === 'auth/weak-password') {
                        alert("A senha é muito fraca. Use pelo menos 6 caracteres.");
                    } else {
                        alert("Erro ao cadastrar: " + errorMessage);
                    }
                });
        } else {
            alert("Por favor, preencha e-mail e senha.");
        }
    });
}

// --- LÓGICA PARA A PÁGINA DE LOGIN (index.html) ---
const formLogin = document.getElementById('form-login');
if (formLogin) {
    formLogin.addEventListener('submit', (evento) => {
        evento.preventDefault(); 
        const email = document.getElementById('login-email').value;
        const senha = document.getElementById('login-senha').value;
        if (email && senha) {
            signInWithEmailAndPassword(auth, email, senha)
                .then((userCredential) => {
                    console.log("Usuário logado:", userCredential.user.uid);
                    // alert("Login realizado com sucesso!"); // Removido para navegação mais rápida
                    window.location.href = 'home.html'; // Redireciona para o novo dashboard (home.html)
                })
                .catch((error) => {
                    const errorCode = error.code;
                    const errorMessage = error.message;
                    console.error("Erro no login:", errorCode, errorMessage);
                    if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
                        alert("E-mail ou senha inválidos. Por favor, tente novamente.");
                    } else {
                        alert("Erro ao fazer login: " + errorMessage);
                    }
                });
        } else {
            alert("Por favor, preencha e-mail e senha.");
        }
    });
}

// --- LÓGICA PARA A PÁGINA HOME (Dashboard) E LOGOUT ---
const botaoLogout = document.getElementById('botao-logout');
if (botaoLogout) {
    botaoLogout.addEventListener('click', (evento) => {
        evento.preventDefault(); // Adicionado para caso o botão de logout seja um link <a>
        signOut(auth).then(() => {
            console.log("Usuário deslogado");
            window.location.href = 'index.html'; 
        }).catch((error) => {
            console.error("Erro ao fazer logout:", error);
            alert("Erro ao desconectar: " + error.message);
        });
    });
}

// --- OBSERVADOR DE ESTADO DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    let currentPageName = "";
    try {
        const pathParts = window.location.pathname.split('/');
        currentPageName = pathParts.pop() || pathParts.pop() || "index.html"; // Assume index.html se path for /
        if (currentPageName === "") currentPageName = "index.html"; // Garante que a raiz seja tratada como index
    } catch (e) {
        console.warn("Não foi possível obter a página atual da URL:", e);
        currentPageName = "index.html"; // Fallback
    }
    
    if (user) {
        console.log("Usuário está logado:", user.uid, "| Página Atual:", currentPageName);
        // Redireciona para o dashboard se estiver nas páginas de login/cadastro
        if (currentPageName === 'index.html' || currentPageName === 'cadastro.html') {
            console.log("Redirecionando para home.html (Dashboard) pois usuário está logado.");
            window.location.href = 'home.html';
        } else if (currentPageName === 'cronograma.html') {
            // Se estiver na página de cronograma, carrega os planos salvos
            console.log("Usuário na cronograma.html, carregando planos salvos...");
            // Garante que os elementos da lista existam antes de chamar
            if (document.getElementById('lista-planos-salvos') && document.getElementById('mensagem-sem-planos')) {
                carregarPlanosSalvos(user.uid); 
            } else {
                console.warn("Tentou carregar planos na cronograma.html, mas elementos da lista não foram encontrados.");
            }
        }
        // NÃO chamaremos carregarPlanosSalvos para home.html (Dashboard) aqui,
        // pois os elementos da lista de planos não existem mais lá.
        
    } else {
        console.log("Usuário está deslogado. Página Atual:", currentPageName);
        if (currentPageName === 'home.html' || currentPageName === 'cronograma.html') {
            console.log("Redirecionando para index.html pois usuário não está logado.");
            window.location.href = 'index.html';
        }
    }
});

// --- LÓGICA PARA GERAR PLANO DE ESTUDOS (AGORA NA cronograma.html) ---
// Precisamos garantir que esta lógica só tente rodar se os elementos existirem na página atual.
// A melhor forma é verificar a página atual ou garantir que os IDs são únicos para cronograma.html
if (window.location.pathname.includes('cronograma.html')) {
    const formPlanoEstudos = document.getElementById('form-plano-estudos');
    const areaPlanoEstudos = document.getElementById('area-plano-estudos');
    const botaoMostrarForm = document.getElementById('botao-mostrar-form-novo-plano');
    const containerForm = document.getElementById('container-form-novo-plano');

    if(botaoMostrarForm && containerForm){
        botaoMostrarForm.addEventListener('click', () => {
            if (containerForm.style.display === 'none' || containerForm.style.display === '') {
                containerForm.style.display = 'block';
                botaoMostrarForm.innerHTML = '<i class="fas fa-minus"></i> Esconder Formulário de Novo Plano';
            } else {
                containerForm.style.display = 'none';
                botaoMostrarForm.innerHTML = '<i class="fas fa-plus"></i> Gerar Novo Cronograma';
            }
        });
    }

    if (formPlanoEstudos && areaPlanoEstudos) {
        formPlanoEstudos.addEventListener('submit', async (evento) => {
            evento.preventDefault(); 

            console.log("Formulário 'Gerar Plano de Estudos' enviado (cronograma.html).");
            areaPlanoEstudos.innerHTML = "<p>Gerando seu plano, aguarde...</p>";

            const concursoObjetivo = document.getElementById('concurso-objetivo').value;
            const faseConcurso = document.getElementById('fase-concurso').value;
            const materiasEdital = document.getElementById('materias-edital').value;
            const horasEstudoSemanais = document.getElementById('horas-estudo-semanais').value;
            const diasSelecionados = [];
            document.querySelectorAll('#dias-semana-estudo input[name="dia_semana"]:checked').forEach((checkbox) => {
                diasSelecionados.push(checkbox.value);
            });
            const dataProva = document.getElementById('data-prova').value;
            const dificuldadesMaterias = document.getElementById('dificuldades-materias').value;
            const outrasConsideracoes = document.getElementById('outras-consideracoes').value;

            if (diasSelecionados.length === 0 && (concursoObjetivo || faseConcurso || materiasEdital) ) {
                alert("Por favor, selecione pelo menos um dia da semana para estudar.");
                areaPlanoEstudos.innerHTML = "<p>Por favor, selecione os dias da semana para gerar o plano.</p>";
                return; 
            }

            const dadosParaPlano = { /* ... (seu objeto dadosParaPlano como antes) ... */
                usuarioId: auth.currentUser ? auth.currentUser.uid : null,
                concurso: concursoObjetivo,
                fase: faseConcurso,
                materias: materiasEdital,
                horas_semanais: horasEstudoSemanais,
                dias_estudo: diasSelecionados, 
                data_prova: dataProva || null, 
                dificuldades: dificuldadesMaterias || null,
                outras_obs: outrasConsideracoes || null
            };

            console.log("Enviando para o backend (cronograma.html):", dadosParaPlano);

            try {
                const resposta = await fetch('http://127.0.0.1:5000/gerar-plano-estudos', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json',},
                    body: JSON.stringify(dadosParaPlano), 
                });

                console.log("Resposta do fetch recebida (cronograma.html), status:", resposta.status);

                if (!resposta.ok) {
                    const erroTexto = await resposta.text(); 
                    console.error("Resposta do servidor não OK (cronograma.html):", erroTexto);
                    throw new Error(`Erro do servidor: ${resposta.status} - ${erroTexto}`);
                }

                const dadosDoPlano = await resposta.json(); 
                console.log("Plano recebido do backend (para gerar e salvar na cronograma.html):", dadosDoPlano);

                if (dadosDoPlano && dadosDoPlano.plano_de_estudos) {
                    console.log("Gerando exibição para o novo plano_de_estudos (cronograma.html)");
                    exibirPlanoNaTela(dadosDoPlano.plano_de_estudos);
                    
                    if (auth.currentUser) {
                        console.log("Tentando salvar o plano gerado (cronograma.html)...");
                        await salvarPlanoNoFirestore(auth.currentUser.uid, dadosDoPlano);
                        if (document.getElementById('lista-planos-salvos')) { // Garante que a lista exista
                           await carregarPlanosSalvos(auth.currentUser.uid);
                        }
                    } else {
                        console.warn("Usuário não está logado, plano gerado não será salvo (cronograma.html).");
                    }
                
                } else if (dadosDoPlano && dadosDoPlano.erro_processamento) { 
                    // ... (seu tratamento de erro_processamento, como na versão anterior)
                } else if (dadosDoPlano && dadosDoPlano.erro_geral) { 
                    // ... (seu tratamento de erro_geral, como na versão anterior)
                } else {
                    // ... (seu tratamento de else final, como na versão anterior)
                }

            } catch (error) {
                console.error("Erro GERAL ao chamar a API ou processar o plano (cronograma.html):", error);
                areaPlanoEstudos.innerHTML = `<p>Ocorreu um erro GRAVE ao gerar seu plano: ${error.message}</p>`;
            }
        });
    }
}