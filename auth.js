// auth.js - Versão Definitiva
import { auth, db } from './firebase-config.js';
import { FRONTEND_URL } from './config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const actionCodeSettings = { url: `${FRONTEND_URL}/acao.html`, handleCodeInApp: true };

if (document.getElementById('form-login')) {
    document.getElementById('form-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const senha = document.getElementById('login-senha').value;
        const btnLogin = document.getElementById('btn-login');
        const errorMessage = document.getElementById('error-message');
        btnLogin.disabled = true;
        btnLogin.textContent = 'Verificando...';
        errorMessage.style.display = 'none';
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, senha);
            if (!userCredential.user.emailVerified) {
                await signOut(auth);
                throw new Error('E-mail não verificado.');
            }
            window.location.href = new URLSearchParams(window.location.search).get('returnTo') || 'home.html';
        } catch (error) {
            errorMessage.textContent = error.message === 'E-mail não verificado.' ? 'Sua conta ainda não foi verificada. Por favor, verifique o link enviado ao seu e-mail.' : 'Falha na autenticação. Verifique seu e-mail e senha.';
            errorMessage.style.display = 'block';
            btnLogin.disabled = false;
            btnLogin.textContent = 'Entrar';
        }
    });
}

if (document.getElementById('form-cadastro')) {
    document.getElementById('form-cadastro').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('cadastro-nome').value;
        const email = document.getElementById('cadastro-email').value;
        const senha = document.getElementById('cadastro-senha').value;
        const confirmaSenha = document.getElementById('cadastro-confirma-senha').value;
        const btnCadastro = document.querySelector('#form-cadastro button[type="submit"]');
        const errorMessageDiv = document.getElementById('error-message-cadastro');
        if (senha !== confirmaSenha) {
            errorMessageDiv.textContent = 'As senhas não coincidem.';
            errorMessageDiv.style.display = 'block';
            return;
        }
        btnCadastro.disabled = true;
        btnCadastro.textContent = 'Criando conta...';
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
            await sendEmailVerification(userCredential.user, actionCodeSettings);
            const dataExpiracao = new Date();
            dataExpiracao.setDate(dataExpiracao.getDate() + 7);
            await setDoc(doc(db, "users", userCredential.user.uid), {
                email, nome, plano: "trial", criadoEm: serverTimestamp(),
                trialFim: Timestamp.fromDate(dataExpiracao), boasVindasEnviado: false
            });
            window.location.href = 'verificar-email.html';
        } catch (error) {
            errorMessageDiv.textContent = 'Ocorreu um erro. Este e-mail pode já estar em uso.';
            errorMessageDiv.style.display = 'block';
            btnCadastro.disabled = false;
            btnCadastro.textContent = 'Criar Conta';
        }
    });
}
// ... (O código do login com o Google permanece o mesmo)
const btnGoogleLogin = document.getElementById('btn-google-login');
if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (!userDocSnap.exists()) {
                const dataExpiracao = new Date();
                dataExpiracao.setDate(dataExpiracao.getDate() + 7);
                await setDoc(userDocRef, {
                    email: user.email, nome: user.displayName, plano: "trial", criadoEm: serverTimestamp(),
                    trialFim: Timestamp.fromDate(dataExpiracao), boasVindasEnviado: true
                });
            }
            window.location.href = 'home.html';
        } catch (error) {
            const errorMessage = document.getElementById('error-message') || document.getElementById('error-message-cadastro');
            if (errorMessage) {
                errorMessage.textContent = 'Falha no login com o Google. Tente novamente.';
                errorMessage.style.display = 'block';
            }
        }
    });
}