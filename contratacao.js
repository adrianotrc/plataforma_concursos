import { STRIPE_PUBLISHABLE_KEY } from './stripe-config.js';
import { auth } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    const btnPagar = document.getElementById('btn-pagar');

    // Pega o plano da URL (ex: ?plano=mensal)
    const urlParams = new URLSearchParams(window.location.search);
    const plano = urlParams.get('plano');

    const planosInfo = {
        mensal: { nome: 'Plano Mensal', valor: 'R$ 49,90/mês' },
        anual: { nome: 'Plano Anual', valor: 'R$ 399,90/ano' }
    };

    const info = planosInfo[plano];
    if (info) {
        document.getElementById('titulo-plano').textContent = `Finalizar Assinatura: ${info.nome}`;
        document.getElementById('resumo-plano').innerHTML = `<p><strong>Plano:</strong> ${info.nome}</p><p><strong>Valor:</strong> ${info.valor}</p>`;
    } else {
        document.getElementById('titulo-plano').textContent = 'Plano Inválido';
        btnPagar.disabled = true;
    }

    btnPagar.addEventListener('click', async () => {
        btnPagar.disabled = true;
        btnPagar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguarde...';
    
        const user = auth.currentUser; // <-- 1. Pega o usuário atualmente logado
    
        if (!user) { // <-- 2. Verifica se alguém está logado
            alert("Você precisa estar logado para fazer uma assinatura. Por favor, faça o login e tente novamente.");
            window.location.href = 'login.html'; // Redireciona para o login
            return; // Interrompe a função aqui
        }
    
        try {
            const response = await fetch('http://127.0.0.1:5000/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // 3. Envia tanto o plano QUANTO o ID do usuário para o backend
                body: JSON.stringify({ plan: plano, userId: user.uid }),
            });
    
            const session = await response.json();
            
            if (response.ok && session.id) {
                // Redireciona o cliente para a página de checkout da Stripe
                await stripe.redirectToCheckout({ sessionId: session.id });
            } else {
                // Mostra uma mensagem de erro mais específica se o servidor a enviar
                const errorInfo = session.error ? session.error.message : 'Tente novamente.';
                alert(`Não foi possível iniciar o checkout: ${errorInfo}`);
                btnPagar.disabled = false;
                btnPagar.innerHTML = '<i class="fas fa-lock"></i> Pagar com Segurança';
            }
        } catch (error) {
            console.error('Erro:', error);
            alert('Ocorreu um erro de comunicação. Verifique o console para mais detalhes.');
            btnPagar.disabled = false;
            btnPagar.innerHTML = '<i class="fas fa-lock"></i> Pagar com Segurança';
        }
    })});