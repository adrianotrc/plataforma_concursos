// verificar-email.js - Versão FINAL com URL dinâmica

import { auth } from './firebase-config.js';
import { FRONTEND_URL } from './config.js'; // Importa a URL dinâmica
import { sendEmailVerification, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const actionCodeSettings = {
    url: `${FRONTEND_URL}/home.html`, // Usa a URL dinâmica
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
        const user = auth.currentUser;
        if (user) {
            btnReenviar.disabled = true;
            btnReenviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            try {
                await sendEmailVerification(user, actionCodeSettings);
                alert('E-mail de verificação reenviado com sucesso!');
            } catch (error) {
                console.error("Erro ao reenviar e-mail de verificação:", error);
                alert('Falha ao reenviar o e-mail. Tente novamente mais tarde.');
            } finally {
                 btnReenviar.disabled = false;
                 btnReenviar.textContent = 'Reenviar E-mail de Confirmação';
            }
        }
    });
});