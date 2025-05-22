// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
// Adicione esta linha para o serviço de Autenticação:
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js"; // <<< CORRIGIDO!
// Futuramente, se usarmos o Firestore:
// import { getFirestore } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js"; // Também corrigido para o futuro
// import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-analytics.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = { // ... suas chaves ...
  apiKey: "AIzaSyDu-bfPtdZPCfci3NN1knVZYAzG7Twztrg",
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

// Obtenha referências para os serviços do Firebase que vamos usar
const auth = getAuth(app);
// const db = getFirestore(app); // Descomente quando formos usar o Firestore

console.log("Firebase App inicializado");
console.log("Firebase Auth inicializado");

// --- LÓGICA PARA A PÁGINA DE CADASTRO (cadastro.html) ---
const formCadastro = document.getElementById('form-cadastro');

if (formCadastro) {
    formCadastro.addEventListener('submit', (evento) => {
        evento.preventDefault(); // Impede o envio tradicional do formulário

        const nome = document.getElementById('cadastro-nome').value; // Opcional
        const email = document.getElementById('cadastro-email').value;
        const senha = document.getElementById('cadastro-senha').value;
        const confirmaSenha = document.getElementById('cadastro-confirma-senha').value;

        // Validação básica
        if (senha !== confirmaSenha) {
            alert("As senhas não coincidem!");
            return; // Interrompe a execução se as senhas forem diferentes
        }

        if (email && senha) {
            createUserWithEmailAndPassword(auth, email, senha)
                .then((userCredential) => {
                    // Cadastro bem-sucedido
                    const user = userCredential.user;
                    console.log("Usuário cadastrado:", user);
                    alert("Cadastro realizado com sucesso! Você será redirecionado para o login.");
                    // Opcional: Salvar nome do usuário no Firestore aqui (faremos depois)
                    
                    // Redireciona para a página de login (ou home, se preferir)
                    window.location.href = 'index.html'; 
                })
                .catch((error) => {
                    // Tratar erros de cadastro
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
        evento.preventDefault(); // Impede o envio tradicional

        const email = document.getElementById('login-email').value;
        const senha = document.getElementById('login-senha').value;

        if (email && senha) {
            signInWithEmailAndPassword(auth, email, senha)
                .then((userCredential) => {
                    // Login bem-sucedido
                    const user = userCredential.user;
                    console.log("Usuário logado:", user);
                    alert("Login realizado com sucesso!");
                    
                    // Redireciona para a página home
                    window.location.href = 'home.html';
                })
                .catch((error) => {
                    // Tratar erros de login
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
            // Logout bem-sucedido
            console.log("Usuário deslogado");
            alert("Você foi desconectado.");
            window.location.href = 'index.html'; // Redireciona para a página de login
        }).catch((error) => {
            // Um erro ocorreu durante o logout
            console.error("Erro ao fazer logout:", error);
            alert("Erro ao desconectar: " + error.message);
        });
    });
}

// --- OBSERVADOR DE ESTADO DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    const currentPage = window.location.pathname.split('/').pop(); // Pega o nome do arquivo da URL atual

    if (user) {
        // Usuário está logado
        console.log("Usuário está logado:", user);
        // Se o usuário está logado e está na página de login ou cadastro, redireciona para home
        if (currentPage === 'index.html' || currentPage === 'cadastro.html' || currentPage === '') {
            window.location.href = 'home.html';
        }
    } else {
        // Usuário está deslogado
        console.log("Usuário está deslogado.");
        // Se o usuário não está logado e está tentando acessar a home.html, redireciona para login
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
        evento.preventDefault(); // Impede o envio padrão do formulário

        console.log("Formulário 'Gerar Plano de Estudos' enviado.");
        areaPlanoEstudos.innerHTML = "<p>Gerando seu plano, aguarde...</p>";

        // Coletar dados do formulário
        const concursoObjetivo = document.getElementById('concurso-objetivo').value;
        const faseConcurso = document.getElementById('fase-concurso').value;
        const materiasEdital = document.getElementById('materias-edital').value;
        const horasEstudoSemanais = document.getElementById('horas-estudo-semanais').value;

        // Coletar os dias da semana selecionados
        const diasSelecionados = [];
        document.querySelectorAll('#dias-semana-estudo input[name="dia_semana"]:checked').forEach((checkbox) => {
            diasSelecionados.push(checkbox.value);
        });

        const dataProva = document.getElementById('data-prova').value;
        const dificuldadesMaterias = document.getElementById('dificuldades-materias').value;
        const outrasConsideracoes = document.getElementById('outras-consideracoes').value;

        // Validar se pelo menos um dia da semana foi selecionado (opcional, mas bom)
        if (diasSelecionados.length === 0) {
            alert("Por favor, selecione pelo menos um dia da semana para estudar.");
            areaPlanoEstudos.innerHTML = "<p>Por favor, selecione os dias da semana.</p>";
            return; // Interrompe se nenhum dia foi selecionado
        }

        const dadosParaPlano = {
            usuarioId: auth.currentUser ? auth.currentUser.uid : null,
            concurso: concursoObjetivo,
            fase: faseConcurso,
            materias: materiasEdital,
            horas_semanais: horasEstudoSemanais,
            dias_estudo: diasSelecionados, // Novo campo
            data_prova: dataProva || null, 
            dificuldades: dificuldadesMaterias || null,
            outras_obs: outrasConsideracoes || null
        };

        console.log("Enviando para o backend:", dadosParaPlano);

        try {
            // Fazendo a requisição POST para o nosso backend Flask
            const resposta = await fetch('http://127.0.0.1:5000/gerar-plano-estudos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(dadosParaPlano), // Converte o objeto JS para uma string JSON
            });

            if (!resposta.ok) {
                // Se a resposta do servidor não for OK (ex: erro 400, 500)
                const erroTexto = await resposta.text(); // Tenta pegar mais detalhes do erro
                throw new Error(`Erro do servidor: ${resposta.status} - ${erroTexto}`);
            }

            const dadosDoPlano = await resposta.json(); // Converte a resposta JSON do backend para um objeto JS
            console.log("Plano recebido do backend:", dadosDoPlano);

            // Montar HTML para exibir o plano (ainda usando a resposta simulada do backend,
            // mas incluindo alguns dados enviados pelo usuário para confirmação visual)
            let htmlPlano = `<h3>${dadosDoPlano.mensagem}</h3>`;
            htmlPlano += `<p><strong>Concurso Objetivo Solicitado:</strong> ${dadosDoPlano.concurso_desejado || 'Não informado'}</p>`;
            htmlPlano += `<p><strong>Matérias Recebidas:</strong> ${dadosDoPlano.materias_recebidas || 'Não informadas'}</p>`;
            htmlPlano += `<p><strong>Tempo Informado:</strong> ${dadosDoPlano.tempo_recebido || 'Não informado'}</p>`;

            htmlPlano += "<h4>Cronograma Sugerido (Simulação do Backend):</h4>";
            if (dadosDoPlano.cronograma && Array.isArray(dadosDoPlano.cronograma)) {
                htmlPlano += "<ul>";
                dadosDoPlano.cronograma.forEach(item => {
                    htmlPlano += `<li><strong>${item.dia}:</strong> ${item.foco}</li>`;
                });
                htmlPlano += "</ul>";
            } else {
                 htmlPlano += "<p>Nenhum cronograma detalhado retornado pelo backend.</p>";
            }
            areaPlanoEstudos.innerHTML = htmlPlano;

        } catch (error) {
            console.error("Erro ao chamar a API para gerar plano:", error);
            areaPlanoEstudos.innerHTML = `<p>Ocorreu um erro ao gerar seu plano: ${error.message}</p>`;
        }
    });
}
