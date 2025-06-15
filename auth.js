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
        const email = document.getElementById('cadastro-email').value;
        const senha = document.getElementById('cadastro-senha').value;
        const confirmaSenha = document.getElementById('cadastro-confirma-senha').value;
        const btnCadastro = formCadastro.querySelector('button[type="submit"]');

        if (senha !== confirmaSenha) {
            alert("As senhas não coincidem!");
            return;
        }
        btnCadastro.disabled = true;
        btnCadastro.textContent = 'Criando conta...';
        try {
            await createUserWithEmailAndPassword(auth, email, senha);
            // Após criar a conta, apenas redireciona. O main-app.js cuidará do resto.
            window.location.href = 'home.html';
        } catch (error) {
            alert(`Erro ao criar conta: ${error.message}`);
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