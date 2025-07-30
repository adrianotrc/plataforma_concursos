// firebase-config.js - Versão final para produção

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Suas credenciais de configuração do Firebase.
// É seguro manter estas informações no código do frontend.
// A segurança é garantida pelas Regras do Firestore.
const firebaseConfig = {
    apiKey: "AIzaSyDu-bfPtdZPCfci3NN1knVZYAzG7Twztrg",
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

// Configurações específicas para desenvolvimento
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Configurações para ambiente de desenvolvimento
    auth.useDeviceLanguage();
    // Desabilita verificações de domínio para desenvolvimento
    auth.settings.appVerificationDisabledForTesting = true;
    
    // Configurações adicionais para desenvolvimento local
    console.log('Firebase configurado para desenvolvimento local');
}

// Exporta as instâncias para que outros arquivos possam usá-las
export { auth, db };