// verificar-email.js - Versão Definitiva
import { auth } from './firebase-config.js';
import { FRONTEND_URL } from './config.js';
import { sendEmailVerification, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const actionCodeSettings = { url: `${FRONTEND_URL}/acao.html`, handleCodeInApp: true };

document.addEventListener('DOMContentLoaded', () => {
    const btnReenviar = document.getElementById('btn-reenviar-email');
    const emailPlaceholder = document.getElementById('user-email-placeholder');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (user.emailVerified) {
                window.location.href = 'login.html';
            } else {
                emailPlaceholder.textContent = user.email;
            }
        } else {
            emailPlaceholder.textContent = 'seu e-mail';
            btnReenviar.disabled = true;
        }
    });

    btnReenviar.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) {
            alert("Sua sessão pode ter expirado. Por favor, volte à página de login.");
            return;
        }
        btnReenviar.disabled = true;
        btnReenviar.textContent = 'Enviando...';
        try {
            await sendEmailVerification(user, actionCodeSettings);
            alert('Um novo link de verificação foi enviado para o seu e-mail.');
        } catch (error) {
            alert('Falha ao reenviar o e-mail. Por favor, tente novamente mais tarde.');
        } finally {
            btnReenviar.disabled = false;
            btnReenviar.textContent = 'Reenviar E-mail de Confirmação';
        }
    });
});