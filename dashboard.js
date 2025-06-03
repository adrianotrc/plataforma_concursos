// Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (sidebarToggle && sidebar && sidebarOverlay) {
        function toggleSidebar() {
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('show');
            document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
        }
        sidebarToggle.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', toggleSidebar);
    } else {
        // Não loga erro se não for a página do dashboard principal, pois sidebarToggle pode não existir.
        if (window.location.pathname.includes('home.html') || window.location.pathname.includes('cronograma.html')) {
             console.warn("Elementos da sidebar (sidebarToggle, sidebar, ou sidebarOverlay) não encontrados, mas esperado nestas páginas.");
        }
    }

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            if (this.getAttribute('href') === '#') { // Só previne se for link placeholder
                e.preventDefault();
            }
            if (window.innerWidth <= 768 && sidebar && sidebarOverlay && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('show');
                document.body.style.overflow = '';
            }
        });
    });

    window.addEventListener('resize', function() {
        if (window.innerWidth > 768 && sidebar && sidebarOverlay) {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('show');
            document.body.style.overflow = '';
        }
    });

    const featureCards = document.querySelectorAll('.features-grid .feature-card'); // Mais específico
    featureCards.forEach(card => {
        const button = card.querySelector('.btn-primary');
        if (button) {
            button.addEventListener('click', function(event) {
                if (this.tagName === 'A' && this.getAttribute('href') === '#') {
                    event.preventDefault();
                    const featureTitleElement = card.querySelector('h3');
                    if (featureTitleElement) {
                        const featureTitle = featureTitleElement.textContent;
                        alert(`Funcionalidade "${featureTitle}" a ser implementada.`);
                    }
                } else if (this.tagName === 'A' && this.getAttribute('href') && this.getAttribute('href') !== '#') {
                    // Deixa a navegação normal acontecer para links válidos como cronograma.html
                }
            });
        }
    });

    // Simulate real-time updates for stats (Mantido, mas pode ser removido/adaptado)
    function updateStats() {
        const statNumbers = document.querySelectorAll('.stats-grid .stat-number'); // Mais específico
        statNumbers.forEach(stat => {
            const currentText = stat.textContent || "";
            const currentValue = parseInt(currentText.replace('%', ''));
            const isPercentage = currentText.includes('%');
            if (isNaN(currentValue)) return; // Pula se não for número

            if (Math.random() > 0.85) { // Reduzida a frequência de atualização
                let newValue;
                if (isPercentage) {
                    newValue = Math.max(1, Math.min(100, currentValue + (Math.random() > 0.5 ? 1 : -1)));
                    stat.textContent = newValue + '%';
                } else {
                    newValue = Math.max(1, currentValue + (Math.random() > 0.5 ? Math.floor(Math.random()*5) : -Math.floor(Math.random()*2)));
                    stat.textContent = newValue.toString();
                }
                stat.style.transform = 'scale(1.05)';
                setTimeout(() => {
                    stat.style.transform = 'scale(1)';
                }, 200);
            }
        });
    }
    if (document.querySelectorAll('.stats-grid .stat-number').length > 0) {
        // setInterval(updateStats, 10000); // Atualiza com menos frequência
    }

    // Add smooth transitions to cards (Melhor fazer via CSS)
    // const cards = document.querySelectorAll('.stat-card, .feature-card, .activity-card');
    // cards.forEach(card => {
    //     card.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
    // });

    // Add hover effects programmatically (Melhor fazer via CSS :hover)
    // const hoverCards = document.querySelectorAll('.feature-card');
    // hoverCards.forEach(card => { /* ... */ });

    // Profile handler
    const profileBtn = document.querySelector('.header-right a.btn:first-child');
    if (profileBtn) {
        profileBtn.addEventListener('click', function(event) {
            if (this.tagName === 'A' && this.getAttribute('href') === '#') {
                event.preventDefault();
            }
            alert('Funcionalidade "Meu Perfil" a ser implementada.');
        });
    }

    // Listener de Logout do Lovable (COMENTADO/REMOVIDO para não conflitar com app.js)
    /*
    const logoutBtn = document.querySelector('.header-right button#botao-logout'); // Seletor para o botão com ID
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(event) {
            event.preventDefault(); // Previne comportamento padrão se fosse um link
            if (confirm('Tem certeza que deseja sair? (Este é do dashboard.js)')) {
                alert('Fazendo logout... (Este é do dashboard.js)');
                // window.location.href = 'index.html'; // A navegação real será feita pelo app.js
            }
        });
    }
    */
    
    // Loading states para botões .btn-primary, exceto o de gerar plano
    const actionButtons = document.querySelectorAll('.btn-primary');
    actionButtons.forEach(button => {
        if (button.id !== 'botao-gerar-plano' && button.id !== 'botao-mostrar-form-novo-plano') { 
            button.addEventListener('click', function() {
                // ... (lógica de loading como antes, mas talvez simplificar ou remover se não for essencial agora)
            });
        }
    });

    console.log('Dashboard.js (do Lovable) inicializado.');
});