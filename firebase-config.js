// firebase-config.js

// Importa as funções necessárias do SDK do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Suas credenciais de configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDu-bfPtdZPCfci3NN1knVZYAzG7Twztrg", // Mantenha sua chave aqui
    authDomain: "plataforma-concursos-ai.firebaseapp.com",
    projectId: "plataforma-concursos-ai",
    storageBucket: "plataforma-concursos-ai.appspot.com",
    messagingSenderId: "620928521514",
    appId: "1:620928521514:web:4bf7e6addab3485055ba53"
};

// Inicializa os serviços do Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Exporta as instâncias para que outros arquivos possam usá-las
export { auth, db };