// acao.js
import { auth } from './firebase-config.js';
import { applyActionCode, checkActionCode } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    const messageEl = document.getElementById('action-message');
    const detailsEl = document.getElementById('action-details');
    const errorEl = document.getElementById('action-error');

    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const actionCode = params.get('oobCode');

    if (mode === 'verifyEmail' && actionCode) {
        try {
            // Verifica a validade do código antes de usá-lo
            await checkActionCode(auth, actionCode);
            // Aplica o código, verificando o e-mail do usuário
            await applyActionCode(auth, actionCode);

            messageEl.textContent = 'E-mail verificado com sucesso!';
            detailsEl.textContent = 'Você será redirecionado para o seu dashboard em instantes.';
            
            // Redireciona para o dashboard após um breve momento
            setTimeout(() => {
                window.location.href = '/home.html';
            }, 3000);

        } catch (error) {
            console.error("Erro ao verificar e-mail:", error);
            messageEl.textContent = 'Falha na Verificação';
            detailsEl.textContent = 'O link de verificação é inválido, pode ter expirado ou já foi utilizado.';
            errorEl.textContent = 'Por favor, tente fazer o login ou solicite um novo e-mail de verificação na página de login.';
        }
    } else {
        messageEl.textContent = 'Ação não reconhecida.';
        detailsEl.textContent = 'Redirecionando para a página de login.';
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 3000);
    }
});