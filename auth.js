// auth.js - Versão focada apenas em Autenticação

import { auth } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// --- PÁGINA DE LOGIN ---
const formLogin = document.getElementById('form-login');
if (formLogin) {
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
            window.location.href = 'home.html';
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

        // Limpa erros anteriores
        errorMessageDiv.style.display = 'none';
        errorMessageDiv.textContent = '';

        if (senha !== confirmaSenha) {
            errorMessageDiv.textContent = 'As senhas não coincidem.';
            errorMessageDiv.style.display = 'block';
            return;
        }

        btnCadastro.disabled = true;
        btnCadastro.textContent = 'Criando conta...';

        try {
            await createUserWithEmailAndPassword(auth, email, senha);
            // O onAuthStateChanged cuidará da criação do documento e do redirecionamento.
            window.location.href = 'home.html';
        } catch (error) {
            // "Traduz" o erro do Firebase para uma mensagem amigável
            if (error.code === 'auth/email-already-in-use') {
                errorMessageDiv.textContent = 'Este endereço de e-mail já está cadastrado.';
            } else if (error.code === 'auth/weak-password') {
                errorMessageDiv.textContent = 'A senha é muito fraca. Use pelo menos 6 caracteres.';
            } else {
                errorMessageDiv.textContent = 'Ocorreu um erro ao criar a conta. Tente novamente.';
            }
            errorMessageDiv.style.display = 'block';
            
            btnCadastro.disabled = false;
            btnCadastro.textContent = 'Criar Conta';
        }
    });
}

// --- VERIFICAÇÃO DE ESTADO DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    const paginasProtegidas = ['home.html', 'cronograma.html', 'exercicios.html', 'dicas-estrategicas.html', 'meu-perfil.html'];
    const paginaAtual = window.location.pathname.split('/').pop();

    if (user) {
        if (paginaAtual === 'login.html' || paginaAtual === 'cadastro.html') {
            window.location.href = 'home.html';
        }
    } else {
        if (paginasProtegidas.includes(paginaAtual)) {
            window.location.href = 'login.html';
        }
    }
});

// --- LÓGICA DE LOGOUT ---
export async function fazerLogout() {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
    }
}