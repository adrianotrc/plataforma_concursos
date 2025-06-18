// auth.js - Versão DEFINITIVA com redirect inteligente para login e cadastro

import { auth } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { enviarEmailBoasVindas} from './api.js';

// --- LÓGICA GERAL DE AUTENTICAÇÃO E REDIRECIONAMENTO ---
onAuthStateChanged(auth, (user) => {
    const paginasProtegidas = ['home.html', 'cronograma.html', 'exercicios.html', 'dicas-estrategicas.html', 'meu-perfil.html'];
    const paginaAtual = window.location.pathname.split('/').pop();

    if (user) {
        // Se o usuário está logado...
        const isOnAuthPage = paginaAtual === 'login.html' || paginaAtual === 'cadastro.html';
        
        if (isOnAuthPage) {
            // ...e está na página de login/cadastro, verifique se ele veio de um fluxo de compra.
            const params = new URLSearchParams(window.location.search);
            const returnTo = params.get('returnTo');

            // **ESSA É A REGRA DE DEFESA PRINCIPAL**
            // Só redireciona para o dashboard se NÃO houver um `returnTo`.
            if (!returnTo) {
                window.location.href = 'home.html';
            }
        }
    } else {
        // Se o usuário não está logado, protege as páginas internas.
        if (paginasProtegidas.includes(paginaAtual)) {
            window.location.href = 'login.html';
        }
    }
});


// --- PÁGINA DE LOGIN ---
const formLogin = document.getElementById('form-login');
if (formLogin) {
    // Passa a "memória" do redirect para o link de cadastro, caso o usuário clique nele.
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo');
    if (returnTo) {
        const linkCadastro = document.querySelector('.login-footer a[href="cadastro.html"]');
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
            // O listener onAuthStateChanged cuidará do redirecionamento.
            // A lógica de redirect aqui não é mais necessária, pois a de cima é mais centralizada.
            
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
            // O listener onAuthStateChanged também cuidará do redirecionamento aqui.
            
        } catch (error) {
            errorMessageDiv.textContent = 'Ocorreu um erro. Este e-mail pode já estar em uso.';
            errorMessageDiv.style.display = 'block';
            console.error("Erro detalhado no cadastro:", error);
            btnCadastro.disabled = false;
            btnCadastro.textContent = 'Criar Conta';
        }
    });
}