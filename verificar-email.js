// verificar-email.js - Versão Definitiva

import { auth } from './firebase-config.js';
import { FRONTEND_URL } from './config.js';
import { sendEmailVerification, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const actionCodeSettings = {
    url: `${FRONTEND_URL}/acao.html`, // CORREÇÃO: Aponta para a página de ação
    handleCodeInApp: true
};

document.addEventListener('DOMContentLoaded', () => {
    const btnReenviar = document.getElementById('btn-reenviar-email');
    const emailPlaceholder = document.getElementById('user-email-placeholder');

    // Mostra o e-mail do usuário que acabou de se cadastrar,
    // que fica temporariamente logado até a verificação.
    onAuthStateChanged(auth, (user) => {
        if (user) {
            emailPlaceholder.textContent = user.email;
        } else {
            emailPlaceholder.textContent = 'seu e-mail';
            btnReenviar.disabled = true;
        }
    });

    btnReenviar.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) {
            alert("Sua sessão expirou. Por favor, volte e tente fazer o login para reenviar a verificação.");
            return;
        }

        btnReenviar.disabled = true;
        btnReenviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        try {
            await sendEmailVerification(user, actionCodeSettings);
            alert('Um novo link de verificação foi enviado para seu e-mail!');
        } catch (error) {
            console.error("Erro ao reenviar e-mail:", error);
            alert('Falha ao reenviar o e-mail. Tente novamente em alguns minutos.');
        } finally {
            btnReenviar.disabled = false;
            btnReenviar.textContent = 'Reenviar E-mail de Confirmação';
        }
    });
});