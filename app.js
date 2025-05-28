// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
// ADICIONE/DESCOMENTE AS IMPORTAÇÕES DO FIRESTORE ABAIXO:
import { 
    getFirestore, 
    collection, 
    addDoc, 
    serverTimestamp // Para registrar a data de criação
    // doc, setDoc, getDoc, updateDoc, deleteDoc, query, where, getDocs, onSnapshot // Outras funções que poderemos usar no futuro
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
const db = getFirestore(app); // INICIALIZE O FIRESTORE (db)

console.log("Firebase App inicializado");
console.log("Firebase Auth inicializado");
console.log("Firestore inicializado:", db); // Log para confirmar

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
                    const user = userCredential.user;
                    console.log("Usuário cadastrado:", user);
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
                    const user = userCredential.user;
                    console.log("Usuário logado:", user);
                    alert("Login realizado com sucesso!");
                    window.location.href = 'home.html';
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

// --- LÓGICA PARA A PÁGINA HOME (home.html) E LOGOUT ---
const botaoLogout = document.getElementById('botao-logout');

if (botaoLogout) {
    botaoLogout.addEventListener('click', () => {
        signOut(auth).then(() => {
            console.log("Usuário deslogado");
            alert("Você foi desconectado.");
            window.location.href = 'index.html'; 
        }).catch((error) => {
            console.error("Erro ao fazer logout:", error);
            alert("Erro ao desconectar: " + error.message);
        });
    });
}

// --- OBSERVADOR DE ESTADO DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    let currentPage = "";
    try {
        const pathParts = window.location.pathname.split('/');
        currentPage = pathParts.pop() || pathParts.pop() || ""; 
    } catch (e) {
        console.warn("Não foi possível obter a página atual da URL:", e);
    }
    
    if (user) {
        console.log("Usuário está logado:", user.uid, "Página Atual:", currentPage);
        if (currentPage === 'index.html' || currentPage === 'cadastro.html' || currentPage === '') {
            console.log("Redirecionando para home.html pois usuário está logado e em página de auth/raiz.");
            window.location.href = 'home.html';
        }
    } else {
        console.log("Usuário está deslogado. Página Atual:", currentPage);
        if (currentPage === 'home.html') {
            console.log("Redirecionando para index.html pois usuário não está logado e tentou acessar home.html.");
            window.location.href = 'index.html';
        }
    }
});

async function salvarPlanoNoFirestore(usuarioId, dadosDoPlanoGerado) {
    if (!usuarioId || !dadosDoPlanoGerado || !dadosDoPlanoGerado.plano_de_estudos) {
        console.error("Dados insuficientes para salvar o plano ou usuário não logado.");
        return; // Não tenta salvar se não tiver os dados necessários
    }

    try {
        // Cria uma referência para a coleção 'planos_usuarios'
        // Se a coleção não existir, o Firebase a criará automaticamente.
        const colecaoPlanos = collection(db, "planos_usuarios");

        // Adiciona um novo documento à coleção
        const docRef = await addDoc(colecaoPlanos, {
            uidUsuario: usuarioId,
            concursoFoco: dadosDoPlanoGerado.plano_de_estudos.concurso_foco || "Não especificado",
            planoCompleto: dadosDoPlanoGerado.plano_de_estudos, // Salva todo o objeto do plano
            dataCriacao: serverTimestamp(), // Pega a data/hora do servidor Firebase
            // Você pode adicionar outros metadados aqui se desejar
        });
        console.log("Plano salvo no Firestore com ID: ", docRef.id);
        alert("Seu plano de estudos foi salvo com sucesso!");

    } catch (e) {
        console.error("Erro ao salvar plano no Firestore: ", e);
        alert("Houve um erro ao tentar salvar seu plano de estudos. Por favor, tente novamente.");
    }
}

// --- LÓGICA PARA GERAR PLANO DE ESTUDOS (home.html) ---
const formPlanoEstudos = document.getElementById('form-plano-estudos');
const areaPlanoEstudos = document.getElementById('area-plano-estudos');

if (formPlanoEstudos && areaPlanoEstudos) {
    formPlanoEstudos.addEventListener('submit', async (evento) => {
        evento.preventDefault(); 

        console.log("Formulário 'Gerar Plano de Estudos' enviado.");
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

        if (diasSelecionados.length === 0 && (concursoObjetivo || faseConcurso || materiasEdital) ) { // Alerta só se outros campos foram preenchidos
            alert("Por favor, selecione pelo menos um dia da semana para estudar.");
            areaPlanoEstudos.innerHTML = "<p>Por favor, selecione os dias da semana para gerar o plano.</p>";
            return; 
        }

        const dadosParaPlano = {
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

        console.log("Enviando para o backend:", dadosParaPlano);

        try {
            const resposta = await fetch('http://127.0.0.1:5000/gerar-plano-estudos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(dadosParaPlano), 
            });

            console.log("Resposta do fetch recebida, status:", resposta.status);

            if (!resposta.ok) {
                const erroTexto = await resposta.text(); 
                console.error("Resposta do servidor não OK:", erroTexto);
                throw new Error(`Erro do servidor: ${resposta.status} - ${erroTexto}`);
            }

            const dadosDoPlano = await resposta.json(); 
            console.log("Plano recebido do backend (estrutura da IA):", dadosDoPlano);

            // ########## INÍCIO DA LÓGICA DE EXIBIÇÃO ATUALIZADA ##########
            if (dadosDoPlano && dadosDoPlano.plano_de_estudos) {
                console.log("Entrou no if principal para exibir plano_de_estudos");
                const planoConteudo = dadosDoPlano.plano_de_estudos;
                console.log("Objeto planoConteudo:", planoConteudo);

                let htmlPlano = `<h3>${planoConteudo.mensagem_inicial || 'Seu Plano de Estudos Personalizado!'}</h3>`;
                htmlPlano += `<p><strong>Concurso Foco:</strong> ${planoConteudo.concurso_foco || 'Não informado pela IA'}</p>`;
                
                // Verifica a chave 'visao_geral_periodos'
                if (planoConteudo.visao_geral_periodos && Array.isArray(planoConteudo.visao_geral_periodos)) {
                    console.log("Processando visao_geral_periodos:", planoConteudo.visao_geral_periodos);
                    
                    planoConteudo.visao_geral_periodos.forEach((periodoItem, indicePeriodo) => {
                        htmlPlano += `<div class="periodo-plano" style="margin-top: 20px; padding:15px; border: 1px dashed #007bff; border-radius: 5px;">`;
                        htmlPlano += `<h4>${periodoItem.periodo_descricao || `Período ${indicePeriodo + 1}`}: ${periodoItem.foco_principal_periodo || 'Foco do período não especificado'}</h4>`;
                        
                        if(periodoItem.materias_prioritarias_periodo && Array.isArray(periodoItem.materias_prioritarias_periodo) && periodoItem.materias_prioritarias_periodo.length > 0){
                            htmlPlano += `<p><strong>Matérias Prioritárias no Período:</strong> ${periodoItem.materias_prioritarias_periodo.join(", ")}</p>`;
                        }

                        // Verifica se existe o cronograma_semanal_detalhado_do_periodo para este período
                        if (periodoItem.cronograma_semanal_detalhado_do_periodo && Array.isArray(periodoItem.cronograma_semanal_detalhado_do_periodo)) {
                            console.log(`Processando cronograma_semanal_detalhado para ${periodoItem.periodo_descricao}`);
                            periodoItem.cronograma_semanal_detalhado_do_periodo.forEach((semanaItem) => {
                                htmlPlano += `<div class="semana-plano" style="margin-top: 10px; padding-top:10px; border-top: 1px solid #ccc;">`;
                                htmlPlano += `<h5>Semana ${semanaItem.semana_numero_no_periodo || ''}: ${semanaItem.foco_da_semana_especifico || 'Foco da semana não especificado'}</h5>`;
                                
                                if (semanaItem.dias_de_estudo && Array.isArray(semanaItem.dias_de_estudo)) {
                                    htmlPlano += "<ul style='margin-left: 15px;'>"; // Lista para os dias da semana
                                    semanaItem.dias_de_estudo.forEach(diaItem => {
                                        htmlPlano += `<li style="margin-bottom: 10px;"><strong>${diaItem.dia_da_semana || 'Dia não especificado'}:</strong>`;
                                        if (diaItem.atividades && Array.isArray(diaItem.atividades)) {
                                            htmlPlano += "<ul style='list-style-type: circle; margin-left: 20px;'>"; // Lista interna para as atividades do dia
                                            diaItem.atividades.forEach(atividade => {
                                                htmlPlano += `<li>${atividade.materia || ''}${atividade.topico_sugerido ? ' (' + atividade.topico_sugerido + ')' : ''} - ${atividade.tipo_de_estudo || ''} (${atividade.duracao_sugerida_minutos || '?'} min)</li>`;
                                            });
                                            htmlPlano += "</ul>";
                                        } else {
                                            htmlPlano += " Nenhuma atividade detalhada para este dia.";
                                        }
                                        htmlPlano += `</li>`;
                                    });
                                    htmlPlano += "</ul>"; // Fecha lista dos dias da semana
                                } else {
                                    htmlPlano += "<p>Nenhum dia de estudo detalhado para esta semana.</p>";
                                }
                                htmlPlano += `</div>`; // Fecha div.semana-plano
                            });
                        } else {
                             // Não mostra nada se não houver cronograma detalhado para este período (ex: meses futuros)
                             console.log(`Sem cronograma semanal detalhado para ${periodoItem.periodo_descricao}`);
                        }
                        htmlPlano += `</div>`; // Fecha div.periodo-plano
                    });
                } else {
                     htmlPlano += "<p>Nenhuma estrutura de visão geral de períodos retornada pela IA.</p>";
                     console.log("Estrutura 'visao_geral_periodos' não encontrada ou não é um array:", planoConteudo.visao_geral_periodos);
                }
                areaPlanoEstudos.innerHTML = htmlPlano;
                console.log("innerHTML de areaPlanoEstudos foi atualizado.");

                // CHAMA A FUNÇÃO PARA SALVAR O PLANO APÓS EXIBI-LO
                if (auth.currentUser) {
                    salvarPlanoNoFirestore(auth.currentUser.uid, dadosDoPlano);
                } else {
                    console.warn("Usuário não está logado, plano não será salvo no Firestore.");
                    // Poderia alertar o usuário aqui também, mas o onAuthStateChanged deve cuidar do acesso
                }
            
            } else if (dadosDoPlano && dadosDoPlano.erro_processamento) { 
                console.log("Entrou no else if para exibir erro_processamento");
                areaPlanoEstudos.innerHTML = `
                    <p style="color: red;">Erro ao processar a resposta da IA:</p>
                    <p><strong>Mensagem:</strong> ${dadosDoPlano.erro_processamento}</p>
                    <p><strong>Detalhe do erro JSON:</strong> ${dadosDoPlano.detalhe_erro_json}</p>
                    <p><strong>Resposta Bruta da IA (para depuração):</strong></p>
                    <pre style="white-space: pre-wrap; word-wrap: break-word; background-color: #f0f0f0; padding: 10px; border: 1px solid #ccc;">${JSON.stringify(dadosDoPlano.resposta_bruta_ia, null, 2)}</pre>
                `;
            } else if (dadosDoPlano && dadosDoPlano.erro_geral) { 
                 console.log("Entrou no else if para exibir erro_geral");
                 areaPlanoEstudos.innerHTML = `<p style="color: red;">${dadosDoPlano.erro_geral}</p>`;
            } else {
                console.log("Entrou no else final: Resposta da IA não reconhecida.");
                areaPlanoEstudos.innerHTML = "<p>Resposta da IA não reconhecida ou estrutura inesperada.</p>";
                console.log("Estrutura inesperada recebida do backend (no else final):", dadosDoPlano);
            }

        } catch (error) {
            console.error("Erro GERAL ao chamar a API ou processar o plano:", error);
            areaPlanoEstudos.innerHTML = `<p>Ocorreu um erro GRAVE ao gerar seu plano: ${error.message}</p>`;
        }
    });
}