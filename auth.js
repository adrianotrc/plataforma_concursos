// auth.js - Versão com redirect explícito e garantido após cadastro

import { auth } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
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
            
            if (userCredential.user) {
                await enviarEmailBoasVindas(email, nome);
            }
            
            // **AQUI A CORREÇÃO**: Redirecionamento explícito e garantido
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
    const paginasProtegidas = ['home.html', 'cronograma.html', 'exercicios.html', 'dicas-estrategicas.html', 'meu-perfil.html'];
    const paginaAtual = window.location.pathname.split('/').pop();

    if (!user && paginasProtegidas.includes(paginaAtual)) {
        // Se o usuário não está logado e tenta acessar uma página protegida, manda para o login.
        window.location.href = 'login.html';
    }
});