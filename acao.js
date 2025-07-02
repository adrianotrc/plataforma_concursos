// acao.js
import { auth } from './firebase-config.js';
import { applyActionCode } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    const messageEl = document.getElementById('action-message');
    const detailsEl = document.getElementById('action-details');
    const errorEl = document.getElementById('action-error');

    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const actionCode = params.get('oobCode');

    if (mode === 'verifyEmail' && actionCode) {
        try {
            await applyActionCode(auth, actionCode);
            messageEl.textContent = 'E-mail verificado com sucesso!';
            detailsEl.textContent = 'Redirecionando para o seu dashboard...';
            setTimeout(() => { window.location.href = '/home.html'; }, 2000);
        } catch (error) {
            messageEl.textContent = 'Falha na Verificação';
            detailsEl.textContent = '';
            errorEl.style.display = 'block';
            errorEl.innerHTML = 'O link de verificação é inválido ou já foi utilizado. Tente fazer o login para reenviar o link.';
        }
    } else {
        window.location.href = '/login.html';
    }
});