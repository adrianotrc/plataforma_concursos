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

// Elementos da Assinatura
const spanPlanoAtual = document.getElementById('plano-atual-nome');
const linkGerenciarAssinatura = document.getElementById('link-gerenciar-assinatura');

// Modal de Reautenticação
const reauthModal = document.getElementById('reauth-modal');
const reauthForm = document.getElementById('reauth-form');
const reauthCancelBtn = document.getElementById('reauth-cancel');
const reauthPasswordInput = document.getElementById('reauth-password');

// --- LÓGICA DE FEEDBACK (TOAST) ---
function showToast(message, type = 'success', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `feedback-toast ${type}`;
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
    if (!state.user || !state.userData) return;
    
    inputEmail.value = state.user.email;
    
    const dados = state.userData;
    inputNome.value = dados.nome || '';
    inputTelefone.value = dados.telefone || '';
    inputEndereco.value = dados.endereco || '';

    // Lógica da Assinatura
    if (spanPlanoAtual && linkGerenciarAssinatura) {
        const plano = dados.plano || 'Nenhum';
        spanPlanoAtual.textContent = plano.charAt(0).toUpperCase() + plano.slice(1);

        // ATENÇÃO: Substitua pela URL real do seu portal de cliente Stripe
        const stripeCustomerPortalUrl = 'https://billing.stripe.com/p/login/SEU_LOGIN_ID'; 
        linkGerenciarAssinatura.href = stripeCustomerPortalUrl;
        linkGerenciarAssinatura.target = '_blank'; // Abrir em nova aba
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
        // Atualiza o nome no header
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = inputNome.value || state.user.email;
        }
        showToast('Perfil atualizado com sucesso!');
    } catch (error) {
        showToast('Falha ao atualizar o perfil.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar Informações';
    }
});


formSenha?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) return;

    const novaSenha = document.getElementById('nova-senha').value;
    if (novaSenha !== document.getElementById('confirma-nova-senha').value) {
        return showToast('A nova senha e a confirmação não coincidem!', 'error');
    }

    // Abre o modal para o usuário digitar a senha atual
    reauthModal.style.display = 'flex';
    reauthPasswordInput.focus();
});

reauthForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const senhaAtual = reauthPasswordInput.value;
    const novaSenha = document.getElementById('nova-senha').value;
    const btnReauth = reauthForm.querySelector('button[type="submit"]');

    if (!senhaAtual) {
        showToast('Por favor, digite sua senha atual.', 'error');
        return;
    }

    btnReauth.disabled = true;
    btnReauth.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const credential = EmailAuthProvider.credential(state.user.email, senhaAtual);
        await reauthenticateWithCredential(state.user, credential);
        
        // Se a reautenticação for bem-sucedida, atualiza a senha
        await updatePassword(state.user, novaSenha);
        
        showToast('Senha alterada com sucesso!', 'success');
        reauthModal.style.display = 'none';
        formSenha.reset();
        reauthForm.reset();

    } catch (error) {
        console.error("Erro ao alterar senha:", error);
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            showToast('A senha atual está incorreta. Tente novamente.', 'error');
        } else {
            showToast('Ocorreu um erro. Tente novamente mais tarde.', 'error');
        }
    } finally {
        btnReauth.disabled = false;
        btnReauth.textContent = 'Confirmar';
    }
});

reauthCancelBtn?.addEventListener('click', () => {
    reauthModal.style.display = 'none';
    reauthForm.reset();
});

// --- LÓGICA DAS CONFIGURAÇÕES ---

// Modo Escuro
toggleModoEscuro?.addEventListener('change', async (e) => {
    const ativado = e.target.checked;
    document.body.classList.toggle('dark-mode', ativado);
    localStorage.setItem('modoEscuro', ativado); // Salva no navegador

    if (state.user) {
        const userDocRef = doc(db, 'users', state.user.uid);
        await setDoc(userDocRef, {
            preferencias: { modoEscuro: ativado }
        }, { merge: true });
    }
});

function aplicarPreferenciaModoEscuro() {
    const modoEscuroSalvo = localStorage.getItem('modoEscuro');
    if (modoEscuroSalvo === 'true') {
        if(toggleModoEscuro) toggleModoEscuro.checked = true;
        document.body.classList.add('dark-mode');
    }
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    aplicarPreferenciaModoEscuro();
    
    // Aguarda o main-app.js carregar os dados do usuário
    const checkUserLoaded = setInterval(() => {
        if (state.user && state.userData) {
            clearInterval(checkUserLoaded);
            carregarDadosPerfil();
        }
    }, 100);
});