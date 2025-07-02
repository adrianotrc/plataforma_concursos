// verificar-email.js - Versão CORRIGIDA

import { auth } from './firebase-config.js';
import { FRONTEND_URL } from './config.js'; // Importa a URL dinâmica
import { sendEmailVerification, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const actionCodeSettings = {
    url: `${FRONTEND_URL}/acao.html`, // Usa a URL dinâmica do config.js
    handleCodeInApp: true
};

document.addEventListener('DOMContentLoaded', () => {
    const btnReenviar = document.getElementById('btn-reenviar-email');
    const emailPlaceholder = document.getElementById('user-email-placeholder');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (!user.emailVerified) {
                emailPlaceholder.textContent = user.email;
            } else {
                window.location.href = 'login.html'; 
            }
        } else {
            emailPlaceholder.textContent = 'seu e-mail';
            btnReenviar.disabled = true;
        }
    });

    btnReenviar.addEventListener('click', async () => {
        // CORREÇÃO: Usamos o usuário da sessão ATIVA, que pode não ser o 'currentUser'
        const user = auth.currentUser;
        if (user) {
            btnReenviar.disabled = true;
            btnReenviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            try {
                await sendEmailVerification(user, actionCodeSettings);
                alert('Um novo e-mail de verificação foi enviado com sucesso!');
            } catch (error) {
                console.error("Erro ao reenviar e-mail:", error);
                alert('Falha ao reenviar o e-mail. Por favor, tente novamente mais tarde.');
            } finally {
                btnReenviar.disabled = false;
                btnReenviar.textContent = 'Reenviar E-mail de Confirmação';
            }
        } else {
            // Se não houver usuário na sessão, o que pode acontecer, guia-o para o login.
            alert("Sua sessão expirou. Por favor, vá para a página de login para continuar.");
            window.location.href = 'login.html';
        }
    });
});