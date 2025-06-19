// perfil-page.js - Versão COMPLETA E CORRIGIDA com listener de evento

import { auth, db } from './firebase-config.js';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { state } from './main-app.js';
import { criarSessaoPortal } from './api.js';

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

// --- FUNÇÃO DE INICIALIZAÇÃO DA PÁGINA ---
// Esta função agora é chamada pelo evento 'userDataReady'
function inicializarPaginaPerfil() {
    const inputNome = document.getElementById('perfil-nome');
    const inputEmail = document.getElementById('perfil-email');
    const inputTelefone = document.getElementById('perfil-telefone');
    const inputEndereco = document.getElementById('perfil-endereco');
    const spanPlanoAtual = document.getElementById('plano-atual-nome');
    const btnGerenciarAssinatura = document.getElementById('btn-gerenciar-assinatura');

    if (!state.user || !state.userData) {
        console.error("Dados de usuário não encontrados ao inicializar a página de perfil.");
        return;
    }

    // Preenche os dados
    inputEmail.value = state.user.email;
    inputNome.value = state.userData.nome || '';
    inputTelefone.value = state.userData.telefone || '';
    inputEndereco.value = state.userData.endereco || '';
    
    const plano = state.userData.plano || 'Nenhum';
    spanPlanoAtual.textContent = plano.charAt(0).toUpperCase() + plano.slice(1);

    // Lógica do botão de assinatura
    if (btnGerenciarAssinatura) {
        if (plano === 'trial') {
            btnGerenciarAssinatura.innerHTML = '<i class="fas fa-star"></i> Fazer Upgrade de Plano';
        }

        btnGerenciarAssinatura.addEventListener('click', async () => {
            const planoAtual = state.userData.plano;
            const stripeCustomerId = state.userData.stripeCustomerId;

            if (planoAtual === 'trial') {
                window.location.href = 'index.html#planos';
                return;
            }
            
            if (stripeCustomerId) {
                btnGerenciarAssinatura.disabled = true;
                btnGerenciarAssinatura.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Abrindo portal...';
                try {
                    const response = await criarSessaoPortal(state.user.uid);
                    if (response.url) {
                        window.location.href = response.url;
                    } else {
                        throw new Error(response.error?.message || 'URL do portal não recebida.');
                    }
                } catch (error) {
                    showToast(`Erro ao abrir o portal: ${error.message}`, 'error');
                    btnGerenciarAssinatura.disabled = false;
                    btnGerenciarAssinatura.innerHTML = '<i class="fas fa-cog"></i> Gerenciar Assinatura';
                }
            } else {
                 showToast('Não foi possível encontrar sua assinatura. Contate o suporte.', 'error');
            }
        });
    }
}

// --- LISTENERS DE EVENTOS DOS FORMULÁRIOS E CONFIGURAÇÕES (Lógica original mantida) ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Ouve o evento do main-app.js
    document.addEventListener('userDataReady', inicializarPaginaPerfil);

    const formPerfil = document.getElementById('form-perfil-pessoal');
    const formSenha = document.getElementById('form-alterar-senha');
    const toggleModoEscuro = document.getElementById('modo-escuro-toggle');
    const reauthModal = document.getElementById('reauth-modal');
    const reauthForm = document.getElementById('reauth-form');
    const reauthCancelBtn = document.getElementById('reauth-cancel');
    const reauthPasswordInput = document.getElementById('reauth-password');

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
                endereco: document.getElementById('perfil-endereco').value,
            }, { merge: true });
            const userNameElement = document.getElementById('user-name');
            if (userNameElement) {
                userNameElement.textContent = document.getElementById('perfil-nome').value || state.user.email;
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

    // Modo Escuro
    const aplicarPreferenciaModoEscuro = () => {
        const modoEscuroSalvo = localStorage.getItem('modoEscuro');
        if (modoEscuroSalvo === 'true') {
            if (toggleModoEscuro) toggleModoEscuro.checked = true;
            document.body.classList.add('dark-mode');
        }
    };
    aplicarPreferenciaModoEscuro();

    toggleModoEscuro?.addEventListener('change', async (e) => {
        const ativado = e.target.checked;
        document.body.classList.toggle('dark-mode', ativado);
        localStorage.setItem('modoEscuro', ativado);
        if (state.user) {
            const userDocRef = doc(db, 'users', state.user.uid);
            await setDoc(userDocRef, { preferencias: { modoEscuro: ativado } }, { merge: true });
        }
    });
});