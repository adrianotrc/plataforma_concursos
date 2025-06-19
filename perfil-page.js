// perfil-page.js - Versão FINAL E CORRIGIDA

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

// --- FUNÇÃO PRINCIPAL QUE RODA APÓS OS DADOS DO USUÁRIO ESTAREM PRONTOS ---
function inicializarPaginaPerfil() {
    if (!state.user || !state.userData) {
        console.error("Dados do usuário não disponíveis para inicializar a página de perfil.");
        return;
    }

    // Elementos do DOM
    const inputNome = document.getElementById('perfil-nome');
    const inputEmail = document.getElementById('perfil-email');
    const spanPlanoAtual = document.getElementById('plano-atual-nome');
    const btnGerenciarAssinatura = document.getElementById('btn-gerenciar-assinatura');
    const btnIniciarExclusao = document.getElementById('btn-iniciar-exclusao');

    // Preenche informações
    inputEmail.value = state.user.email;
    inputNome.value = state.userData.nome || '';
    const plano = state.userData.plano || 'Nenhum';
    spanPlanoAtual.textContent = plano.charAt(0).toUpperCase() + plano.slice(1);

    // Configura o botão de gerenciar assinatura
    if (btnGerenciarAssinatura) {
        if (plano === 'trial') {
            btnGerenciarAssinatura.innerHTML = '<i class="fas fa-star"></i> Fazer Upgrade de Plano';
        }
        btnGerenciarAssinatura.addEventListener('click', handleGerenciarAssinatura);
    }
    
    // Configura o botão de iniciar exclusão
    if(btnIniciarExclusao) {
        btnIniciarExclusao.addEventListener('click', handleIniciarExclusao);
    }
}

// --- FUNÇÕES DE LÓGICA (HANDLERS) ---
async function handleGerenciarAssinatura() {
    const planoAtual = state.userData.plano;
    const stripeCustomerId = state.userData.stripeCustomerId;
    const btn = document.getElementById('btn-gerenciar-assinatura');

    if (planoAtual === 'trial') {
        window.location.href = 'index.html#planos';
        return;
    }
    
    if (stripeCustomerId) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Abrindo portal...';
        try {
            const response = await criarSessaoPortal(state.user.uid);
            if (response.url) {
                window.location.href = response.url;
            } else { throw new Error(response.error?.message || 'URL do portal não recebida.'); }
        } catch (error) {
            showToast(`Erro ao abrir o portal: ${error.message}`, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-cog"></i> Gerenciar Assinatura';
        }
    } else {
        showToast('Não foi possível encontrar sua assinatura. Contate o suporte.', 'error');
    }
}

function handleIniciarExclusao() {
    const deleteModal = document.getElementById('delete-confirm-modal');
    deleteModal.style.display = 'flex';
}

// --- INICIALIZAÇÃO E EVENT LISTENERS GERAIS ---
document.addEventListener('DOMContentLoaded', () => {
    // Ouve o evento do main-app.js para iniciar a página
    document.addEventListener('userDataReady', inicializarPaginaPerfil);

    // Lógica dos formulários que pode ser configurada imediatamente
    const formPerfil = document.getElementById('form-perfil-pessoal');
    const formSenha = document.getElementById('form-alterar-senha');
    const reauthModal = document.getElementById('reauth-modal');
    const reauthForm = document.getElementById('reauth-form');
    const reauthCancelBtn = document.getElementById('reauth-cancel');
    const reauthPasswordInput = document.getElementById('reauth-password');
    const deleteModal = document.getElementById('delete-confirm-modal');
    const deleteCancelBtn = document.getElementById('delete-cancel-btn');
    const deleteConfirmInput = document.getElementById('delete-confirm-input');
    const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

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
            state.userData.nome = document.getElementById('perfil-nome').value;
            document.getElementById('user-name').textContent = state.userData.nome;
            showToast('Perfil atualizado com sucesso!');
        } catch (error) {
            showToast('Falha ao atualizar o perfil.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Salvar Informações';
        }
    });

    formSenha?.addEventListener('submit', (e) => {
        e.preventDefault();
        const novaSenha = document.getElementById('nova-senha').value;
        if (novaSenha !== document.getElementById('confirma-nova-senha').value) {
            return showToast('A nova senha e a confirmação não coincidem!', 'error');
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

    reauthCancelBtn?.addEventListener('click', () => {
        reauthModal.style.display = 'none';
        reauthForm.reset();
    });

    // Lógica do Modal de Exclusão
    deleteCancelBtn?.addEventListener('click', () => {
        deleteModal.style.display = 'none';
        deleteConfirmInput.value = '';
        deleteConfirmBtn.disabled = true;
    });

    deleteConfirmInput?.addEventListener('input', () => {
        deleteConfirmBtn.disabled = deleteConfirmInput.value.toLowerCase() !== 'excluir';
    });

    deleteConfirmBtn?.addEventListener('click', async () => {
        if (!state.user) return showToast('Usuário não encontrado.', 'error');

        deleteConfirmBtn.disabled = true;
        deleteConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...';

        try {
            const response = await deletarContaUsuario(state.user.uid);
            if (response.success) {
                showToast('Sua conta foi excluída com sucesso. Você será desconectado.', 'success', 5000);
                setTimeout(() => {
                    signOut(auth).catch(console.error).finally(() => {
                        window.location.href = 'index.html'; // Leva para a página inicial
                    });
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
});