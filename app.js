// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
// Adicione esta linha para o serviço de Autenticação:
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";
// Futuramente, se usarmos o Firestore:
// import { getFirestore } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js"; 
// import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-analytics.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

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
// const analytics = getAnalytics(app);

const auth = getAuth(app);
// const db = getFirestore(app); 

console.log("Firebase App inicializado");
console.log("Firebase Auth inicializado");

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
    const currentPage = window.location.pathname.split('/').pop(); 

    if (user) {
        console.log("Usuário está logado:", user);
        if (currentPage === 'index.html' || currentPage === 'cadastro.html' || currentPage === '' || !currentPage) { // Adicionado !currentPage para cobrir a raiz
            window.location.href = 'home.html';
        }
    } else {
        console.log("Usuário está deslogado.");
        if (currentPage === 'home.html') {
            window.location.href = 'index.html';
        }
    }
});

// --- LÓGICA PARA GERAR PLANO DE ESTUDOS (home.html) ---
const formPlanoEstudos = document.getElementById('form-plano-estudos');
const areaPlanoEstudos = document.getElementById('area-plano-estudos');

if (formPlanoEstudos && areaPlanoEstudos) {
    formPlanoEstudos.addEventListener('submit', async (evento) => {
        evento.preventDefault(); 

        console.log("Formulário 'Gerar Plano de Estudos' enviado.");
        areaPlanoEstudos.innerHTML = "<p>Gerando seu plano, aguarde...</p>";

        // Coleta de dados do formulário
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

        if (diasSelecionados.length === 0) {
            alert("Por favor, selecione pelo menos um dia da semana para estudar.");
            areaPlanoEstudos.innerHTML = "<p>Por favor, selecione os dias da semana.</p>";
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

            if (!resposta.ok) {
                const erroTexto = await resposta.text(); 
                throw new Error(`Erro do servidor: ${resposta.status} - ${erroTexto}`);
            }

            const dadosDoPlano = await resposta.json(); 
            console.log("Plano recebido do backend (estrutura da IA):", dadosDoPlano);

            // Lógica corrigida para exibir o plano da IA
            if (dadosDoPlano && dadosDoPlano.plano_de_estudos) {
                const planoConteudo = dadosDoPlano.plano_de_estudos;

                let htmlPlano = `<h3>${planoConteudo.mensagem_inicial || 'Seu Plano de Estudos Personalizado!'}</h3>`;
                htmlPlano += `<p><strong>Concurso Foco:</strong> ${planoConteudo.concurso_foco || 'Não informado pela IA'}</p>`;
                
                if (planoConteudo.estrutura_geral_meses && Array.isArray(planoConteudo.estrutura_geral_meses)) {
                    planoConteudo.estrutura_geral_meses.forEach((mesItem, indiceMes) => {
                        htmlPlano += `<div class="mes-plano" style="margin-top: 15px; padding-top:10px; border-top: 1px solid #ccc;">`;
                        htmlPlano += `<h4>Mês ${indiceMes + 1}: ${mesItem.foco_principal_mes || 'Foco do mês não especificado'}</h4>`;
                        
                        if (mesItem.cronograma_semanal_tipo && Array.isArray(mesItem.cronograma_semanal_tipo)) {
                            htmlPlano += "<p><strong>Exemplo de Cronograma Semanal para este Mês:</strong></p><ul>";
                            mesItem.cronograma_semanal_tipo.forEach(diaItem => {
                                htmlPlano += `<li><strong>${diaItem.dia_da_semana || 'Dia não especificado'}:</strong> ${diaItem.atividades || 'Atividades não especificadas'}</li>`;
                            });
                            htmlPlano += "</ul>";
                        } else {
                            htmlPlano += "<p>Nenhum cronograma semanal detalhado para este mês.</p>";
                        }
                        htmlPlano += `</div>`; 
                    });
                } else {
                     htmlPlano += "<p>Nenhuma estrutura de plano mensal retornada pela IA.</p>";
                }
                areaPlanoEstudos.innerHTML = htmlPlano;
            
            } else if (dadosDoPlano && dadosDoPlano.erro_processamento) { 
                areaPlanoEstudos.innerHTML = `
                    <p style="color: red;">Erro ao processar a resposta da IA:</p>
                    <p><strong>Mensagem:</strong> ${dadosDoPlano.erro_processamento}</p>
                    <p><strong>Detalhe do erro JSON:</strong> ${dadosDoPlano.detalhe_erro_json}</p>
                    <p><strong>Resposta Bruta da IA (para depuração):</strong></p>
                    <pre style="white-space: pre-wrap; word-wrap: break-word; background-color: #f0f0f0; padding: 10px; border: 1px solid #ccc;">${dadosDoPlano.resposta_bruta_ia}</pre>
                `;
            } else if (dadosDoPlano && dadosDoPlano.erro_geral) { 
                 areaPlanoEstudos.innerHTML = `<p style="color: red;">${dadosDoPlano.erro_geral}</p>`;
            } else {
                areaPlanoEstudos.innerHTML = "<p>Resposta da IA não reconhecida ou estrutura inesperada.</p>";
                console.log("Estrutura inesperada recebida do backend:", dadosDoPlano);
            }

        } catch (error) {
            console.error("Erro ao chamar a API para gerar plano:", error);
            areaPlanoEstudos.innerHTML = `<p>Ocorreu um erro ao gerar seu plano: ${error.message}</p>`;
        }
    });
}