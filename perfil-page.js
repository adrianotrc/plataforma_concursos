// perfil-page.js - Versão COMPLETA E CORRIGIDA

import { auth, db } from './firebase-config.js';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { state } from './main-app.js';
import { criarSessaoPortal, deletarContaUsuario } from './api.js';

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

// --- FUNÇÃO ÚNICA DE INICIALIZAÇÃO DA PÁGINA ---
// Esta função é o coração da página e só roda quando os dados do usuário estão prontos.
function inicializarPaginaCompleta() {
    // 1. VERIFICA SE OS DADOS ESSENCIAIS EXISTEM
    if (!state.user || !state.userData) {
        console.error("ERRO GRAVE: Tentando inicializar a página de perfil sem dados de usuário.");
        showToast("Não foi possível carregar seus dados. Tente recarregar a página.", "error");
        return;
    }

    // 2. MAPEIA TODOS OS ELEMENTOS INTERATIVOS
    const formPerfil = document.getElementById('form-perfil-pessoal');
    const formSenha = document.getElementById('form-alterar-senha');
    const btnGerenciarAssinatura = document.getElementById('btn-gerenciar-assinatura');
    const toggleModoEscuro = document.getElementById('modo-escuro-toggle');

    // Modais e seus componentes
    const reauthModal = document.getElementById('reauth-modal');
    const reauthForm = document.getElementById('reauth-form');
    const reauthCancelBtn = document.getElementById('reauth-cancel');
    const reauthPasswordInput = document.getElementById('reauth-password');
    
    const btnIniciarExclusao = document.getElementById('btn-iniciar-exclusao');
    const deleteModal = document.getElementById('delete-confirm-modal');
    const deleteCancelBtn = document.getElementById('delete-cancel-btn');
    const deleteConfirmInput = document.getElementById('delete-confirm-input');
    const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
    
    // 3. PREENCHE OS DADOS VISUAIS
    document.getElementById('perfil-email').value = state.user.email;
    document.getElementById('perfil-nome').value = state.userData.nome || '';
    document.getElementById('perfil-telefone').value = state.userData.telefone || '';
    
    const plano = state.userData.plano || 'Nenhum';
    document.getElementById('plano-atual-nome').textContent = plano.charAt(0).toUpperCase() + plano.slice(1);

    if (plano === 'trial') {
        btnGerenciarAssinatura.innerHTML = '<i class="fas fa-star"></i> Fazer Upgrade de Plano';
    }

    // 4. CONFIGURA TODOS OS EVENTOS (LISTENERS)

    // Formulário de Perfil
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
            document.getElementById('user-name').textContent = document.getElementById('perfil-nome').value || state.user.email;
            showToast('Perfil atualizado com sucesso!');
        } catch (error) {
            showToast('Falha ao atualizar o perfil.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Salvar Informações';
        }
    });

    // Formulário de Senha
    formSenha?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (document.getElementById('nova-senha').value !== document.getElementById('confirma-nova-senha').value) {
            return showToast('As senhas não coincidem!', 'error');
        }
        reauthModal.style.display = 'flex';
        reauthPasswordInput.focus();
    });

    // Modal de Reautenticação de Senha
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

    // Botão de Gerenciar Assinatura
    btnGerenciarAssinatura?.addEventListener('click', async () => {
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
                else throw new Error('URL do portal não recebida.');
            } catch (error) {
                showToast(`Erro ao abrir o portal: ${error.message}`, 'error');
                btnGerenciarAssinatura.disabled = false;
                btnGerenciarAssinatura.innerHTML = '<i class="fas fa-cog"></i> Gerenciar Assinatura';
            }
        } else {
            showToast('ID de assinatura não encontrado. Contate o suporte.', 'error');
        }
    });

    // Botão de Excluir Conta
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
            await deletarContaUsuario(state.user.uid);
            showToast('Conta excluída com sucesso. Você será desconectado.', 'success', 5000);
            setTimeout(() => {
                signOut(auth).finally(() => { window.location.href = 'index.html'; });
            }, 4000);
        } catch (error) {
            showToast(`Falha ao excluir a conta: ${error.message}`, 'error');
            deleteConfirmBtn.disabled = false;
            deleteConfirmBtn.textContent = 'Eu entendo, excluir minha conta';
        }
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
}

// --- PONTO DE ENTRADA ---
// Ouve o evento do main-app.js e só então executa a inicialização completa da página.
document.addEventListener('userDataReady', inicializarPaginaCompleta);