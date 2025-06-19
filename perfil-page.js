// perfil-page.js - Versão FINAL E CORRIGIDA, com UI e funcionalidade de exclusão

import { auth, db } from './firebase-config.js';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { state } from './main-app.js';
import { criarSessaoPortal, deletarContaUsuario } from './api.js';

// --- LÓGICA DE FEEDBACK (TOAST) ---
function showToast(message, type = 'success', duration = 4000) {
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

// --- FUNÇÃO QUE PREENCHE OS DADOS QUANDO ESTIVEREM PRONTOS ---
function preencherDadosDoPerfil() {
    if (!state.user || !state.userData) return;

    document.getElementById('perfil-email').value = state.user.email;
    document.getElementById('perfil-nome').value = state.userData.nome || '';
    
    const plano = state.userData.plano || 'Nenhum';
    document.getElementById('plano-atual-nome').textContent = plano.charAt(0).toUpperCase() + plano.slice(1);

    const btnGerenciar = document.getElementById('btn-gerenciar-assinatura');
    if (plano === 'trial') {
        btnGerenciar.innerHTML = '<i class="fas fa-star"></i> Fazer Upgrade de Plano';
    }
}

// --- FUNÇÃO QUE CONFIGURA OS BOTÕES E AÇÕES DA PÁGINA ---
function configurarAcoesDaPagina() {
    // Ações dos formulários
    const formPerfil = document.getElementById('form-perfil-pessoal');
    const formSenha = document.getElementById('form-alterar-senha');
    const reauthModal = document.getElementById('reauth-modal');
    const reauthForm = document.getElementById('reauth-form');
    const reauthCancelBtn = document.getElementById('reauth-cancel');
    const reauthPasswordInput = document.getElementById('reauth-password');
    
    // Ações de assinatura
    const btnGerenciarAssinatura = document.getElementById('btn-gerenciar-assinatura');

    // Ações de exclusão
    const btnIniciarExclusao = document.getElementById('btn-iniciar-exclusao');
    const deleteModal = document.getElementById('delete-confirm-modal');
    const deleteCancelBtn = document.getElementById('delete-cancel-btn');
    const deleteConfirmInput = document.getElementById('delete-confirm-input');
    const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

    // Listener do formulário de perfil
    formPerfil?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = formPerfil.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        try {
            const userDocRef = doc(db, 'users', state.user.uid);
            await setDoc(userDocRef, {
                nome: document.getElementById('perfil-nome').value,
                telefone: document.getElementById('perfil-telefone').value,
            }, { merge: true });
            document.getElementById('user-name').textContent = document.getElementById('perfil-nome').value;
            showToast('Perfil atualizado com sucesso!');
        } catch (error) {
            showToast('Falha ao atualizar o perfil.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Salvar Informações';
        }
    });

    // Listener do formulário de senha
    formSenha?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (document.getElementById('nova-senha').value !== document.getElementById('confirma-nova-senha').value) {
            return showToast('As senhas não coincidem!', 'error');
        }
        reauthModal.style.display = 'flex';
        reauthPasswordInput.focus();
    });

    reauthForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const senhaAtual = reauthPasswordInput.value;
        const novaSenha = document.getElementById('nova-senha').value;
        const btnReauth = reauthForm.querySelector('button[type="submit"]');
        if (!senhaAtual) return showToast('Por favor, digite sua senha atual.', 'error');
        
        btnReauth.disabled = true;
        btnReauth.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            const credential = EmailAuthProvider.credential(state.user.email, senhaAtual);
            await reauthenticateWithCredential(state.user, credential);
            await updatePassword(state.user, novaSenha);
            showToast('Senha alterada com sucesso!', 'success');
            reauthModal.style.display = 'none';
            formSenha.reset();
            reauthForm.reset();
        } catch (error) {
            showToast('A senha atual está incorreta.', 'error');
        } finally {
            btnReauth.disabled = false;
            btnReauth.textContent = 'Confirmar';
        }
    });
    
    reauthCancelBtn?.addEventListener('click', () => { reauthModal.style.display = 'none'; });

    // Listener do botão de gerenciar assinatura
    btnGerenciarAssinatura?.addEventListener('click', async () => {
        if (!state.userData) return;
        const { plano, stripeCustomerId } = state.userData;

        if (plano === 'trial') {
            window.location.href = 'index.html#planos';
            return;
        }

        if (stripeCustomerId) {
            btnGerenciarAssinatura.disabled = true;
            btnGerenciarAssinatura.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Abrindo portal...';
            try {
                const response = await criarSessaoPortal(state.user.uid);
                if (response.url) window.location.href = response.url;
                else throw new Error(response.error?.message || 'URL do portal não recebida.');
            } catch (error) {
                showToast(`Erro ao abrir o portal: ${error.message}`, 'error');
                btnGerenciarAssinatura.disabled = false;
                btnGerenciarAssinatura.innerHTML = '<i class="fas fa-cog"></i> Gerenciar Assinatura';
            }
        } else {
            showToast('ID de assinatura não encontrado. Contate o suporte.', 'error');
        }
    });

    // Listeners da funcionalidade de exclusão
    btnIniciarExclusao?.addEventListener('click', () => {
        deleteModal.style.display = 'flex';
    });

    deleteCancelBtn?.addEventListener('click', () => {
        deleteModal.style.display = 'none';
        deleteConfirmInput.value = '';
        deleteConfirmBtn.disabled = true;
    });

    deleteConfirmInput?.addEventListener('input', () => {
        deleteConfirmBtn.disabled = deleteConfirmInput.value.toLowerCase() !== 'excluir';
    });

    deleteConfirmBtn?.addEventListener('click', async () => {
        deleteConfirmBtn.disabled = true;
        deleteConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...';
        try {
            const response = await deletarContaUsuario(state.user.uid);
            if (response.success) {
                showToast('Conta excluída. Você será desconectado.', 'success', 5000);
                setTimeout(() => {
                    signOut(auth).finally(() => { window.location.href = 'index.html'; });
                }, 4000);
            } else {
                throw new Error(response.error?.message || 'Erro desconhecido');
            }
        } catch (error) {
            showToast(`Falha ao excluir a conta: ${error.message}`, 'error');
            deleteConfirmBtn.disabled = false;
            deleteConfirmBtn.textContent = 'Eu entendo, excluir minha conta';
        }
    });
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    // Ouve o evento do main-app.js para preencher os dados
    document.addEventListener('userDataReady', preencherDadosDoPerfil);
    
    // Configura todas as ações e botões da página imediatamente
    configurarAcoesDaPagina();
});