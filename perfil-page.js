// perfil-page.js - Versão final com todas as funcionalidades

import { auth, db } from './firebase-config.js';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { state } from './main-app.js';

// --- ELEMENTOS DO DOM ---
const formPerfil = document.getElementById('form-perfil-pessoal');
const formSenha = document.getElementById('form-alterar-senha');
const inputNome = document.getElementById('perfil-nome');
const inputEmail = document.getElementById('perfil-email');
const inputTelefone = document.getElementById('perfil-telefone');
const inputEndereco = document.getElementById('perfil-endereco');
const toggleModoEscuro = document.getElementById('modo-escuro-toggle');
// Modal de Reautenticação
const reauthModal = document.getElementById('reauth-modal');
const reauthForm = document.getElementById('reauth-form');
const reauthCancelBtn = document.getElementById('reauth-cancel');

// --- LÓGICA DE FEEDBACK (TOAST) ---
function showToast(message, type = 'success', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `feedback-toast ${type}`; // Adiciona a classe de tipo
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => document.body.removeChild(toast), 500);
    }, duration);
}



// --- LÓGICA DE CARREGAMENTO DE DADOS ---
async function carregarDadosPerfil() {
    if (!state.user) return;
    inputEmail.value = state.user.email;
    const userDocRef = doc(db, 'users', state.user.uid);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
        const dados = docSnap.data();
        inputNome.value = dados.nome || '';
        inputTelefone.value = dados.telefone || '';
        inputEndereco.value = dados.endereco || '';
    }
}


// --- LÓGICA DOS FORMULÁRIOS ---

formPerfil?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = formPerfil.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    try {
        const userDocRef = doc(db, 'users', state.user.uid);
        await setDoc(userDocRef, {
            nome: inputNome.value,
            telefone: inputTelefone.value,
            endereco: inputEndereco.value,
        }, { merge: true });
        showToast('Perfil atualizado com sucesso!');
    } catch (error) {
        showToast('Falha ao atualizar o perfil.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar Informações';
    }
});

// Alterar a senha com fluxo de reautenticação
formSenha?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) return;

    const senhaAtual = document.getElementById('senha-atual').value;
    const novaSenha = document.getElementById('nova-senha').value;
    if (novaSenha !== document.getElementById('confirma-nova-senha').value) {
        return showToast('A nova senha e a confirmação não coincidem!', 'error');
    }
    if (!senhaAtual) {
        return showToast('Por favor, digite sua senha atual para continuar.', 'error');
    }

    const btn = formSenha.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

    try {
        const credential = EmailAuthProvider.credential(state.user.email, senhaAtual);
        await reauthenticateWithCredential(state.user, credential);
        await updatePassword(state.user, novaSenha);
        showToast('Senha alterada com sucesso!', 'success');
        formSenha.reset();
    } catch (error) {
        console.error("Erro ao alterar senha:", error);
        // **CORREÇÃO PRINCIPAL**: Verifica pelo código de erro correto
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            showToast('A senha atual está incorreta. Tente novamente.', 'error');
        } else {
            showToast('Ocorreu um erro. Tente novamente mais tarde.', 'error');
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-key"></i> Alterar Senha';
    }
});

// Lógica do Modal de Reautenticação
reauthForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const senhaAtual = document.getElementById('reauth-password').value;
    const novaSenha = document.getElementById('nova-senha').value;
    const credential = EmailAuthProvider.credential(state.user.email, senhaAtual);

    try {
        // Tenta reautenticar
        await reauthenticateWithCredential(state.user, credential);
        // Se deu certo, tenta atualizar a senha de novo
        await updatePassword(state.user, novaSenha);
        showToast('Senha alterada com sucesso!');
        reauthModal.classList.remove('show');
        formSenha.reset();
        reauthForm.reset();
    } catch (error) {
        alert('Senha atual incorreta. Tente novamente.');
        console.error("Erro na reautenticação:", error);
    }
});
reauthCancelBtn?.addEventListener('click', () => reauthModal.classList.remove('show'));


// --- LÓGICA DAS CONFIGURAÇÕES ---

// Modo Escuro
toggleModoEscuro?.addEventListener('change', async (e) => {
    const ativado = e.target.checked;
    document.body.classList.toggle('dark-mode', ativado);
    localStorage.setItem('modoEscuro', ativado); // Salva no navegador

    // Salva a preferência no perfil do usuário no Firestore
    if (state.user) {
        const userDocRef = doc(db, 'users', state.user.uid);
        await setDoc(userDocRef, {
            preferencias: { modoEscuro: ativado }
        }, { merge: true });
    }
});

// Lógica para aplicar o modo escuro ao carregar a página
function aplicarPreferenciaModoEscuro() {
    const modoEscuroSalvo = localStorage.getItem('modoEscuro');
    if (modoEscuroSalvo === 'true') {
        toggleModoEscuro.checked = true;
        document.body.classList.add('dark-mode');
    }
}


// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    aplicarPreferenciaModoEscuro(); // Aplica o tema salvo antes de tudo
    // Aguarda o main-app.js carregar os dados do usuário
    setTimeout(() => {
        if (state.user) {
            carregarDadosPerfil();
        }
    }, 300);
});