// contratacao.js - Versão com modal de decisão

import { STRIPE_PUBLISHABLE_KEY } from './stripe-config.js';
import { auth } from './firebase-config.js';
import { criarSessaoCheckout } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
    const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    const btnPagar = document.getElementById('btn-pagar');
    const tituloPlanoEl = document.getElementById('titulo-plano');
    const resumoPlanoEl = document.getElementById('resumo-plano');
    
    // Elementos do novo Modal
    const authModal = document.getElementById('auth-decision-modal');
    const btnGoToLogin = document.getElementById('btn-go-to-login');
    const btnGoToSignup = document.getElementById('btn-go-to-signup');

    const urlParams = new URLSearchParams(window.location.search);
    const planoSelecionado = urlParams.get('plano');

    const planosInfo = {
        'basico': { nome: 'Plano Básico', valor: 'R$ 29,90/mês' },
        'intermediario': { nome: 'Plano Intermediário', valor: 'R$ 39,90/mês' },
        'premium': { nome: 'Plano Premium', valor: 'R$ 69,90/mês' },
        'anual': { nome: 'Plano Premium Anual', valor: 'R$ 699,90/ano' }
    };

    const infoPlano = planosInfo[planoSelecionado];

    if (infoPlano) {
        tituloPlanoEl.textContent = `Finalizar Assinatura: ${infoPlano.nome}`;
        resumoPlanoEl.innerHTML = `<p><strong>Plano:</strong> ${infoPlano.nome}</p><p><strong>Valor:</strong> ${infoPlano.valor}</p>`;
    } else {
        tituloPlanoEl.textContent = 'Plano Inválido';
        resumoPlanoEl.innerHTML = `<p>Por favor, selecione um plano válido na página inicial.</p>`;
        btnPagar.disabled = true;
    }

    // Função para construir a URL de retorno
    const getReturnUrl = () => `?returnTo=${encodeURIComponent(window.location.href)}`;

    // Eventos dos botões do modal
    btnGoToLogin.addEventListener('click', () => {
        window.location.href = `login.html${getReturnUrl()}`;
    });

    btnGoToSignup.addEventListener('click', () => {
        window.location.href = `cadastro.html${getReturnUrl()}`;
    });

    btnPagar.addEventListener('click', async () => {
        const user = auth.currentUser;
    
        if (!user) {
            // **AQUI A MUDANÇA**: Mostra o modal em vez de redirecionar direto
            authModal.classList.add('show');
            return;
        }

        // Salva o plano no sessionStorage para a página de sucesso
        sessionStorage.setItem('plano_contratado', planoSelecionado);

        btnPagar.disabled = true;
        btnPagar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguarde...';
    
        try {
            const session = await criarSessaoCheckout(planoSelecionado, user.uid);
            
            if (session && session.id) {
                await stripe.redirectToCheckout({ sessionId: session.id });
            } else {
                alert(`Não foi possível iniciar o checkout. Tente novamente.`);
                btnPagar.disabled = false;
                btnPagar.innerHTML = '<i class="fas fa-lock"></i> Finalizar Pagamento Seguro';
            }
        } catch (error) {
            console.error('Erro ao criar sessão de checkout:', error);
            alert('Ocorreu um erro de comunicação.');
            btnPagar.disabled = false;
            btnPagar.innerHTML = '<i class="fas fa-lock"></i> Finalizar Pagamento Seguro';
        }
    });
});