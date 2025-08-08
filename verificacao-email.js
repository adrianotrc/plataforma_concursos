// verificacao-email.js - Gerenciamento da verificação de e-mail

import { auth, db } from './firebase-config.js';
import { 
    sendEmailVerification, 
    onAuthStateChanged,
    applyActionCode,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// Inicia um cooldown visual e funcional no botão de reenvio; persiste em localStorage
function startCooldown(seconds) {
    let remaining = seconds;
    btnReenviarEmail.disabled = true;
    const baseLabel = '<i class="fas fa-paper-plane"></i> Reenviar e-mail de confirmação';
    const tick = () => {
        btnReenviarEmail.innerHTML = `${baseLabel} · aguarde ${remaining}s`;
        remaining -= 1;
        if (remaining < 0) {
            btnReenviarEmail.disabled = false;
            btnReenviarEmail.innerHTML = baseLabel;
            clearInterval(intervalId);
            try { localStorage.removeItem('lastVerificationEmailSentAt'); } catch (_) {}
        }
    };
    tick();
    const intervalId = setInterval(tick, 1000);
}

function restoreCooldownIfNeeded() {
    try {
        const last = Number(localStorage.getItem('lastVerificationEmailSentAt'));
        if (Number.isFinite(last)) {
            const elapsed = Math.floor((Date.now() - last) / 1000);
            const remaining = 60 - elapsed;
            if (remaining > 0) startCooldown(remaining);
        }
    } catch (_) {}
}

// Verifica se o e-mail foi confirmado
async function verificarStatusEmail() {
    try {
        btnVerificarEmail.disabled = true;
        btnVerificarEmail.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        
        // Enforce reload da sessão para refletir o estado mais recente do Auth
        if (auth.currentUser) {
            await auth.currentUser.reload();
        }
        
        // Debug: mostra informações do usuário
        console.log('Verificação de status - Usuário atual:', {
            email: auth.currentUser?.email,
            emailVerified: auth.currentUser?.emailVerified,
            uid: auth.currentUser?.uid
        });
        
        // Usa apenas o sinal do Firebase. Firestore não é fonte de verdade.
        if (auth.currentUser && auth.currentUser.emailVerified) {
            console.log('E-mail verificado! Redirecionando...');
            
            const userDocRef = doc(db, "users", auth.currentUser.uid);
            // Atualiza o status no Firestore
            await setDoc(userDocRef, { 
                emailVerificado: true,
                verificadoEm: serverTimestamp()
            }, { merge: true });
            
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
            // Após confirmar, redirecionaremos para a tela de login com flag de sucesso
            const allowedOrigins = ['localhost', '127.0.0.1', 'iaprovas.com.br', 'www.iaprovas.com.br'];
            const originHost = window.location.hostname;
            const continueUrl = allowedOrigins.includes(originHost)
                ? `${window.location.origin}/login.html?verified=true`
                : `${window.location.protocol}//iaprovas.com.br/login.html?verified=true`;
            const actionCodeSettings = { url: continueUrl };
            await sendEmailVerification(auth.currentUser, actionCodeSettings);
            showMessage('✅ E-mail reenviado! Verifique sua caixa de entrada e a pasta de spam.', 'success');
            startCooldown(60);
            try { localStorage.setItem('lastVerificationEmailSentAt', String(Date.now())); } catch (_) {}
        } else {
            showMessage('❌ Usuário não encontrado. Faça login novamente.', 'error');
        }
    } catch (error) {
        console.error('Erro ao reenviar e-mail:', error);
        
        // Tratamento específico para rate limiting
        if (error.code === 'auth/too-many-requests') {
            showMessage('❌ Muitas tentativas. Aguarde alguns minutos antes de tentar reenviar novamente.', 'error');
            startCooldown(120);
        } else if (error.code === 'auth/invalid-continue-uri' || error.code === 'auth/unauthorized-continue-uri') {
            showMessage('❌ URL de redirecionamento não autorizada no Firebase. Verifique as configurações de domínios autorizados.', 'error');
        } else {
            showMessage('Erro ao reenviar e-mail. Tente novamente.', 'error');
        }
    } finally {
        if (!btnReenviarEmail.disabled) {
            btnReenviarEmail.disabled = false;
            btnReenviarEmail.innerHTML = '<i class="fas fa-paper-plane"></i> Reenviar e-mail de confirmação';
        }
    }
}

// Inicialização da página
function initializePage() {
    const email = getEmailFromParams();
    
    if (email && userEmailElement) {
        userEmailElement.textContent = email;
    }

    // Removido: botão abrir e-mail (não faz sentido no fluxo)
    
    // Event listeners
    if (btnVerificarEmail) {
        btnVerificarEmail.addEventListener('click', verificarStatusEmail);
    }
    
    if (btnReenviarEmail) {
        btnReenviarEmail.addEventListener('click', reenviarEmailVerificacao);
    }
    
    // Restaura cooldown se houver
    restoreCooldownIfNeeded();

    // Trata o oobCode (verifyEmail) mesmo sem estar logado
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');
    if (mode === 'verifyEmail' && oobCode) {
        (async () => {
            try {
                await applyActionCode(auth, oobCode);
                showMessage('✅ E-mail confirmado! Agora você pode fazer login.', 'success');
                // Tenta sincronizar Firestore se usuário estiver logado
                if (auth.currentUser?.uid) {
                    try {
                        const userDocRef = doc(db, "users", auth.currentUser.uid);
                        await setDoc(userDocRef, { emailVerificado: true, verificadoEm: serverTimestamp() }, { merge: true });
                    } catch (_) {}
                }
            } catch (err) {
                console.error('Erro ao aplicar código de verificação:', err);
                showMessage('❌ Link de verificação inválido ou expirado. Solicite outro e-mail.', 'error');
            }
        })();
    }

    // Observa sessão para caso o usuário esteja logado e já verificado
    onAuthStateChanged(auth, async (user) => {
        if (!user) return; // não redireciona; permite uso sem login
        await user.reload();
        const updatedUser = auth.currentUser;
        if (updatedUser.emailVerified) {
            try {
                const userDocRef = doc(db, "users", updatedUser.uid);
                await setDoc(userDocRef, { emailVerificado: true, verificadoEm: serverTimestamp() }, { merge: true });
            } catch (_) {}
            showMessage('✅ E-mail confirmado! Agora você pode fazer login.', 'success');
        }
    });
}

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initializePage); 