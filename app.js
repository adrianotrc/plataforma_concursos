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