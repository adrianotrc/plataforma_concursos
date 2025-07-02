// auth.js - Versão Definitiva

import { auth, db } from './firebase-config.js';
import { FRONTEND_URL } from './config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    sendEmailVerification,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const actionCodeSettings = {
    url: `${FRONTEND_URL}/acao.html`, // CORREÇÃO: Aponta para a página de ação.
    handleCodeInApp: true
};

// --- PÁGINA DE LOGIN ---
const formLogin = document.getElementById('form-login');
if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
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
            const user = userCredential.user;

            await user.reload();

            if (!user.emailVerified) {
                errorMessage.textContent = 'Sua conta ainda não foi verificada. Por favor, verifique o link enviado ao seu e-mail.';
                errorMessage.style.display = 'block';
                btnLogin.disabled = false;
                btnLogin.textContent = 'Entrar';
                await signOut(auth);
                return;
            }
            
            const postLoginParams = new URLSearchParams(window.location.search);
            const postLoginReturnTo = postLoginParams.get('returnTo');
            window.location.href = postLoginReturnTo || 'home.html';

        } catch (error) {
            errorMessage.textContent = 'Falha na autenticação. Verifique seu e-mail e senha.';
            errorMessage.style.display = 'block';
            btnLogin.disabled = false;
            btnLogin.textContent = 'Entrar';
        }
    });
}

// --- PÁGINA DE CADASTRO ---
const formCadastro = document.getElementById('form-cadastro');
if (formCadastro) {
    formCadastro.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('cadastro-nome').value;
        const email = document.getElementById('cadastro-email').value;
        const senha = document.getElementById('cadastro-senha').value;
        const confirmaSenha = document.getElementById('cadastro-confirma-senha').value;
        const btnCadastro = formCadastro.querySelector('button[type="submit"]');
        const errorMessageDiv = document.getElementById('error-message-cadastro');

        errorMessageDiv.style.display = 'none';

        if (senha !== confirmaSenha) {
            errorMessageDiv.textContent = 'As senhas não coincidem.';
            errorMessageDiv.style.display = 'block';
            return;
        }
        btnCadastro.disabled = true;
        btnCadastro.textContent = 'Criando conta...';

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
            const user = userCredential.user;

            if (user) {
                await sendEmailVerification(user, actionCodeSettings);

                const userDocRef = doc(db, "users", user.uid);
                const dataExpiracao = new Date();
                dataExpiracao.setDate(dataExpiracao.getDate() + 7);
                await setDoc(userDocRef, {
                    email: user.email,
                    nome: nome,
                    plano: "trial",
                    criadoEm: serverTimestamp(),
                    trialFim: Timestamp.fromDate(dataExpiracao),
                    boasVindasEnviado: false
                });
            }
            
            window.location.href = 'verificar-email.html';

        } catch (error) {
            errorMessageDiv.textContent = 'Ocorreu um erro. Este e-mail pode já estar em uso.';
            errorMessageDiv.style.display = 'block';
            btnCadastro.disabled = false;
            btnCadastro.textContent = 'Criar Conta';
        }
    });
}

// --- LÓGICA DE LOGIN COM O GOOGLE ---
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
                    email: user.email,
                    nome: user.displayName,
                    plano: "trial",
                    criadoEm: serverTimestamp(),
                    trialFim: Timestamp.fromDate(dataExpiracao),
                    boasVindasEnviado: true 
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