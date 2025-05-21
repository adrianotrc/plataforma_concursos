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