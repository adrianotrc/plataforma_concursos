// contratacao.js - Versão final com os novos planos e chamada de API correta

import { STRIPE_PUBLISHABLE_KEY } from './stripe-config.js';
import { auth } from './firebase-config.js';
// Importa nossa função de API centralizada
import { criarSessaoCheckout } from './api.js'; 

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa a Stripe com a chave pública
    const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    const btnPagar = document.getElementById('btn-pagar');
    const tituloPlanoEl = document.getElementById('titulo-plano');
    const resumoPlanoEl = document.getElementById('resumo-plano');

    // Pega o plano da URL (ex: ?plano=basico)
    const urlParams = new URLSearchParams(window.location.search);
    const planoSelecionado = urlParams.get('plano');

    // **CORREÇÃO**: Lista de planos ATUALIZADA
    const planosInfo = {
        'basico': { nome: 'Plano Básico', valor: 'R$ 29,90/mês' },
        'intermediario': { nome: 'Plano Intermediário', valor: 'R$ 39,90/mês' },
        'premium': { nome: 'Plano Premium', valor: 'R$ 69,90/mês' },
        'anual': { nome: 'Plano Premium Anual', valor: 'R$ 699,90/ano' }
    };

    const infoPlano = planosInfo[planoSelecionado];

    // Atualiza a interface com as informações do plano correto
    if (infoPlano) {
        tituloPlanoEl.textContent = `Finalizar Assinatura: ${infoPlano.nome}`;
        resumoPlanoEl.innerHTML = `<p><strong>Plano:</strong> ${infoPlano.nome}</p><p><strong>Valor:</strong> ${infoPlano.valor}</p>`;
    } else {
        tituloPlanoEl.textContent = 'Plano Inválido';
        resumoPlanoEl.innerHTML = `<p>Por favor, selecione um plano válido na página inicial.</p>`;
        btnPagar.disabled = true;
    }

    // Evento de clique no botão de pagar
    btnPagar.addEventListener('click', async () => {
        btnPagar.disabled = true;
        btnPagar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguarde...';
    
        const user = auth.currentUser;
    
        if (!user) {
            alert("Você precisa estar logado para fazer uma assinatura. Por favor, faça o login e tente novamente.");
            window.location.href = 'login.html';
            return;
        }
    
        try {
            // **CORREÇÃO**: Usa nossa função de API centralizada
            const session = await criarSessaoCheckout(planoSelecionado, user.uid);
            
            if (session && session.id) {
                // Redireciona o cliente para a página de checkout da Stripe
                await stripe.redirectToCheckout({ sessionId: session.id });
            } else {
                alert(`Não foi possível iniciar o checkout. Tente novamente.`);
                btnPagar.disabled = false;
                btnPagar.innerHTML = '<i class="fas fa-lock"></i> Ir para o Pagamento';
            }
        } catch (error) {
            console.error('Erro ao criar sessão de checkout:', error);
            alert('Ocorreu um erro de comunicação. Verifique o console para mais detalhes.');
            btnPagar.disabled = false;
            btnPagar.innerHTML = '<i class="fas fa-lock"></i> Ir para o Pagamento';
        }
    });
});