// auth.js - Módulo de Autenticação

// Importa as funções do Firebase e a configuração
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
        e.preventDefault(); // Impede o recarregamento da página

        const email = document.getElementById('login-email').value;
        const senha = document.getElementById('login-senha').value;
        const btnLogin = document.getElementById('btn-login');
        const errorMessage = document.getElementById('error-message');

        // Validação básica
        if (!email || !senha) {
            errorMessage.textContent = 'Por favor, preencha todos os campos.';
            errorMessage.style.display = 'block';
            return;
        }

        // Desabilita o botão para evitar múltiplos cliques
        btnLogin.disabled = true;
        btnLogin.textContent = 'Entrando...';
        errorMessage.style.display = 'none';

        try {
            await signInWithEmailAndPassword(auth, email, senha);
            // O onAuthStateChanged vai redirecionar
            window.location.href = 'home.html';
        } catch (error) {
            errorMessage.textContent = 'Falha na autenticação. Verifique seu e-mail e senha.';
            errorMessage.style.display = 'block';
        } finally {
            // Reabilita o botão
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

        if (senha !== confirmaSenha) {
            alert("As senhas não coincidem!");
            return;
        }

        btnCadastro.disabled = true;
        btnCadastro.textContent = 'Criando conta...';

        try {
            await createUserWithEmailAndPassword(auth, email, senha);
            // O onAuthStateChanged abaixo cuidará do resto
            window.location.href = 'home.html'; // Redireciona para o dashboard após o sucesso
        } catch (error) {
            alert(`Erro ao criar conta: ${error.message}`);
        } finally {
            btnCadastro.disabled = false;
            btnCadastro.textContent = 'Criar Conta';
        }
    });
}


// --- VERIFICAÇÃO DE ESTADO DE AUTENTICAÇÃO ---
// Monitora se o usuário está logado ou não
onAuthStateChanged(auth, (user) => {
    const paginasProtegidas = ['home.html', 'cronograma.html', 'exercicios.html', 'dicas-estrategicas.html', 'meu-perfil.html'];
    const paginaAtual = window.location.pathname.split('/').pop();

    if (user) {
        // Se o usuário está logado e tentando acessar login/cadastro, redireciona para o dashboard
        if (paginaAtual === 'login.html' || paginaAtual === 'cadastro.html') {
            window.location.href = 'home.html';
        }
    } else {
        // Se o usuário NÃO está logado e tenta acessar uma página protegida, redireciona para o login
        if (paginasProtegidas.includes(paginaAtual)) {
            window.location.href = 'login.html';
        }
    }
});

// --- LÓGICA DE LOGOUT ---
// Esta função será chamada por outras partes do app
export async function fazerLogout() {
    try {
        await signOut(auth);
        console.log('Usuário deslogado com sucesso.');
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
        alert('Não foi possível sair. Tente novamente.');
    }
}