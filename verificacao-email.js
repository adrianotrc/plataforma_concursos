// verificacao-email.js - Gerenciamento da verificação de e-mail

import { auth } from './firebase-config.js';
import { 
    sendEmailVerification, 
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Elementos da página
const userEmailElement = document.getElementById('user-email');
const btnVerificarEmail = document.getElementById('btn-verificar-email');
const btnReenviarEmail = document.getElementById('btn-reenviar-email');
const verificacaoMessage = document.getElementById('verificacao-message');

// Recupera o e-mail da URL ou localStorage
function getEmailFromParams() {
    const params = new URLSearchParams(window.location.search);
    const email = params.get('email');
    if (email) {
        localStorage.setItem('pendingEmailVerification', email);
        return email;
    }
    return localStorage.getItem('pendingEmailVerification');
}

// Exibe mensagem na página
function showMessage(message, type = 'info') {
    verificacaoMessage.textContent = message;
    verificacaoMessage.className = `verificacao-message ${type}`;
    verificacaoMessage.style.display = 'block';
    
    // Auto-hide após 5 segundos para mensagens de sucesso
    if (type === 'success') {
        setTimeout(() => {
            verificacaoMessage.style.display = 'none';
        }, 5000);
    }
}

// Verifica se o e-mail foi confirmado
async function verificarStatusEmail() {
    try {
        btnVerificarEmail.disabled = true;
        btnVerificarEmail.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        
        // Recarrega o usuário para obter o status mais recente
        await auth.currentUser?.reload();
        
        // Debug: mostra informações do usuário
        console.log('Verificação de status - Usuário atual:', {
            email: auth.currentUser?.email,
            emailVerified: auth.currentUser?.emailVerified,
            uid: auth.currentUser?.uid
        });
        
        if (auth.currentUser?.emailVerified) {
            console.log('E-mail verificado! Redirecionando...');
            showMessage('✅ E-mail confirmado com sucesso! Redirecionando para o login...', 'success');
            
            // Limpa o localStorage
            localStorage.removeItem('pendingEmailVerification');
            
            // Redireciona para login com mensagem de sucesso
            setTimeout(() => {
                window.location.href = 'login.html?verified=true';
            }, 2000);
        } else {
            console.log('E-mail ainda não verificado');
            showMessage('❌ E-mail ainda não foi confirmado. Verifique sua caixa de entrada e spam.', 'error');
        }
    } catch (error) {
        console.error('Erro ao verificar status do e-mail:', error);
        showMessage('Erro ao verificar status. Tente novamente.', 'error');
    } finally {
        btnVerificarEmail.disabled = false;
        btnVerificarEmail.innerHTML = '<i class="fas fa-sync-alt"></i> Verificar se foi confirmado';
    }
}

// Reenvia o e-mail de verificação
async function reenviarEmailVerificacao() {
    try {
        btnReenviarEmail.disabled = true;
        btnReenviarEmail.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        
        if (auth.currentUser) {
            await sendEmailVerification(auth.currentUser, {
                url: window.location.origin + '/verificar-email.html'
            });
            showMessage('✅ E-mail de verificação reenviado! Verifique sua caixa de entrada.', 'success');
        } else {
            showMessage('❌ Usuário não encontrado. Faça login novamente.', 'error');
        }
    } catch (error) {
        console.error('Erro ao reenviar e-mail:', error);
        
        // Tratamento específico para rate limiting
        if (error.code === 'auth/too-many-requests') {
            showMessage('❌ Muitas tentativas. Aguarde alguns minutos antes de reenviar.', 'error');
        } else {
            showMessage('Erro ao reenviar e-mail. Tente novamente.', 'error');
        }
    } finally {
        btnReenviarEmail.disabled = false;
        btnReenviarEmail.innerHTML = '<i class="fas fa-paper-plane"></i> Reenviar e-mail de confirmação';
    }
}

// Inicialização da página
function initializePage() {
    const email = getEmailFromParams();
    
    if (email && userEmailElement) {
        userEmailElement.textContent = email;
    }
    
    // Event listeners
    if (btnVerificarEmail) {
        btnVerificarEmail.addEventListener('click', verificarStatusEmail);
    }
    
    if (btnReenviarEmail) {
        btnReenviarEmail.addEventListener('click', reenviarEmailVerificacao);
    }
    
    // Verifica se há usuário logado
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Recarrega o usuário para obter o status mais recente
            await user.reload();
            const updatedUser = auth.currentUser;
            
            // Se o usuário já está verificado, redireciona
            if (updatedUser.emailVerified) {
                showMessage('✅ E-mail já confirmado! Redirecionando...', 'success');
                setTimeout(() => {
                    window.location.href = 'login.html?verified=true';
                }, 2000);
            }
        } else {
            // Se não há usuário logado, redireciona para login
            window.location.href = 'login.html';
        }
    });
}

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initializePage); 