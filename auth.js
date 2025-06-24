// auth.js - Versão com redirect explícito e garantido após cadastro

import { auth, db } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { enviarEmailBoasVindas } from './api.js';

// --- PÁGINA DE LOGIN ---
const formLogin = document.getElementById('form-login');
if (formLogin) {
    // Passa a "memória" do redirect para o link de cadastro.
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo');
    if (returnTo) {
        const linkCadastro = document.querySelector('a[href="cadastro.html"]');
        if (linkCadastro) {
            linkCadastro.href = `cadastro.html?returnTo=${encodeURIComponent(returnTo)}`;
        }
    }

    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const senha = document.getElementById('login-senha').value;
        const btnLogin = document.getElementById('btn-login');
        const errorMessage = document.getElementById('error-message');

        btnLogin.disabled = true;
        btnLogin.textContent = 'Entrando...';
        errorMessage.style.display = 'none';

        try {
            await signInWithEmailAndPassword(auth, email, senha);

            // Lógica de redirect inteligente para o LOGIN
            const postLoginParams = new URLSearchParams(window.location.search);
            const postLoginReturnTo = postLoginParams.get('returnTo');

            if (postLoginReturnTo) {
                window.location.href = postLoginReturnTo;
            } else {
                window.location.href = 'home.html';
            }

        } catch (error) {
            errorMessage.textContent = 'Falha na autenticação. Verifique seu e-mail e senha.';
            errorMessage.style.display = 'block';
            btnLogin.disabled = false;
            btnLogin.textContent = 'Entrar';
        }
    });
}

// --- PÁGINA DE CADASTRO ---
const formCadastro = document.getElementById('form-cadastro');
if (formCadastro) {
    formCadastro.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('cadastro-nome').value;
        const email = document.getElementById('cadastro-email').value;
        const senha = document.getElementById('cadastro-senha').value;
        const confirmaSenha = document.getElementById('cadastro-confirma-senha').value;
        const btnCadastro = formCadastro.querySelector('button[type="submit"]');
        const errorMessageDiv = document.getElementById('error-message-cadastro');

        errorMessageDiv.style.display = 'none';

        if (senha !== confirmaSenha) {
            errorMessageDiv.textContent = 'As senhas não coincidem.';
            errorMessageDiv.style.display = 'block';
            return;
        }

        btnCadastro.disabled = true;
        btnCadastro.textContent = 'Criando conta...';

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
            const user = userCredential.user;

            if (user) {
                // Cria o perfil do usuário no Firestore
                const userDocRef = doc(db, "users", user.uid);
                const dataExpiracao = new Date();
                dataExpiracao.setDate(dataExpiracao.getDate() + 7);
                const novoUserData = {
                    email: user.email,
                    nome: nome,
                    plano: "trial",
                    criadoEm: serverTimestamp(),
                    trialFim: Timestamp.fromDate(dataExpiracao)
                };
                await setDoc(userDocRef, novoUserData);

                // *** CORREÇÃO APLICADA AQUI ***
                // O `await` foi removido da linha abaixo.
                // Isso faz com que o e-mail seja enviado em segundo plano,
                // sem travar a navegação do usuário.
                enviarEmailBoasVindas(email, nome);
            }

            // Redirecionamento explícito e garantido
            const params = new URLSearchParams(window.location.search);
            const returnTo = params.get('returnTo');

            if (returnTo) {
                window.location.href = returnTo;
            } else {
                window.location.href = 'home.html';
            }

        } catch (error) {
            errorMessageDiv.textContent = 'Ocorreu um erro. Este e-mail pode já estar em uso.';
            errorMessageDiv.style.display = 'block';
            console.error("Erro detalhado no cadastro:", error);
            btnCadastro.disabled = false;
            btnCadastro.textContent = 'Criar Conta';
        }
    });
}


// --- VIGIA GERAL DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    const paginasProtegidas = ['home.html', 'cronograma.html', 'exercicios.html', 'dicas-estrategicas.html', 'meu-perfil.html', 'discursivas.html'];
    const paginaAtual = window.location.pathname.split('/').pop();

    if (!user && paginasProtegidas.includes(paginaAtual)) {
        // Guarda a página que o usuário tentou acessar para redirecioná-lo após o login
        const returnUrl = `login.html?returnTo=${encodeURIComponent(paginaAtual)}`;
        window.location.href = returnUrl;
    }
});

// --- LÓGICA DE LOGIN COM O GOOGLE ---
const btnGoogleLogin = document.getElementById('btn-google-login');

if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            // Verifica se o usuário já existe no nosso banco de dados (Firestore)
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);

            // Se o usuário NÃO existe, é o primeiro login dele, então criamos o perfil
            if (!userDocSnap.exists()) {
                console.log("Novo usuário via Google. Criando perfil...");
                const dataExpiracao = new Date();
                dataExpiracao.setDate(dataExpiracao.getDate() + 7); // Período de trial

                const novoUserData = {
                    email: user.email,
                    nome: user.displayName, // Pegamos o nome direto do Google
                    plano: "trial",
                    criadoEm: serverTimestamp(),
                    trialFim: Timestamp.fromDate(dataExpiracao)
                };
                await setDoc(userDocRef, novoUserData);

                // Envia o e-mail de boas-vindas para o novo usuário
                enviarEmailBoasVindas(user.email, user.displayName);
            }

            // Redireciona para o dashboard
            window.location.href = 'home.html';

        } catch (error) {
            console.error("Erro no login com Google: ", error);
            const errorMessage = document.getElementById('error-message') || document.getElementById('error-message-cadastro');
            if (errorMessage) {
                errorMessage.textContent = 'Falha no login com o Google. Tente novamente.';
                errorMessage.style.display = 'block';
            }
        }
    });
}