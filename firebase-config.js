// firebase-config.js - Versão para Produção

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Em um ambiente de produção real, estas variáveis seriam injetadas pelo servidor.
// Como estamos em um deploy estático, vamos criar um objeto de configuração
// a partir de variáveis que *poderiam* ser injetadas, mas que definiremos aqui
// para o deploy na Render.
const firebaseConfig = {
    apiKey:             "AIzaSyDu-bfPtdZPCfci3NN1knVZYAzG7Twztrg", // Substitua pelo seu valor real
    authDomain:         "plataforma-concursos-ai.firebaseapp.com", // Substitua pelo seu valor real
    projectId:          "plataforma-concursos-ai", // Substitua pelo seu valor real
    storageBucket:      "plataforma-concursos-ai.appspot.com", // Substitua pelo seu valor real
    messagingSenderId:  "620928521514", // Substitua pelo seu valor real
    appId:              "1:620928521514:web:4bf7e6addab3485055ba53" // Substitua pelo seu valor real
};

// Inicializa os serviços do Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Exporta as instâncias para que outros arquivos possam usá-las
export { auth, db };