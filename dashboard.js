// Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    // Sidebar toggle functionality
    // Verifica se os elementos existem antes de adicionar listeners
    if (sidebarToggle && sidebar && sidebarOverlay) {
        function toggleSidebar() {
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('show');
            document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
        }

        sidebarToggle.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', toggleSidebar);
    } else {
        console.warn("Elementos da sidebar (sidebarToggle, sidebar, ou sidebarOverlay) não encontrados.");
    }


    // Close sidebar when clicking on nav items (mobile)
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            // Não impede a navegação padrão se houver um href válido,
            // mas fecha a sidebar se estiver em mobile.
            if (window.innerWidth <= 768 && sidebar && sidebarOverlay) { // Adicionada verificação de existência
                // Update active state (opcional, pode ser controlado pela navegação real)
                // navItems.forEach(nav => nav.classList.remove('active'));
                // this.classList.add('active'); 
                
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('show');
                document.body.style.overflow = '';
            }
        });
    });

    // Handle window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768 && sidebar && sidebarOverlay) { // Adicionada verificação de existência
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('show');
            document.body.style.overflow = '';
        }
    });

    // Feature card click handlers
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach(card => {
        const button = card.querySelector('.btn-primary');
        if (button) {
            button.addEventListener('click', function(event) { // Adicionado 'event'
                // Se o botão for um link <a> com href="#", previne o comportamento padrão
                if (this.tagName === 'A' && this.getAttribute('href') === '#') {
                    event.preventDefault();
                }
                const featureTitleElement = card.querySelector('h3');
                if (featureTitleElement) {
                    const featureTitle = featureTitleElement.textContent;
                    // alert(`Acessando: ${featureTitle}`); // Mantido para demo, mas pode ser removido
                    console.log(`Botão do feature card '${featureTitle}' clicado.`);
                    // A navegação real para estas funcionalidades será implementada depois.
                }
            });
        }
    });

    // Simulate real-time updates for stats (Pode ser mantido para visualização, ou removido se não desejado)
    function updateStats() {
        const statNumbers = document.querySelectorAll('.stat-number');
        
        statNumbers.forEach(stat => {
            const currentText = stat.textContent || "";
            const currentValue = parseInt(currentText.replace('%', '')); // Remove % para o parseInt
            const isPercentage = currentText.includes('%');
            
            if (Math.random() > 0.7) { 
                let newValue;
                if (isPercentage) {
                    newValue = Math.max(1, Math.min(100, currentValue + (Math.random() > 0.5 ? 1 : -1)));
                    stat.textContent = newValue + '%';
                } else {
                    newValue = Math.max(1, currentValue + (Math.random() > 0.5 ? 1 : 0));
                    stat.textContent = newValue.toString();
                }
                
                stat.style.transform = 'scale(1.05)';
                setTimeout(() => {
                    stat.style.transform = 'scale(1)';
                }, 200);
            }
        });
    }

    // Update stats every 30 seconds (Pode ser mantido ou removido)
    // Se for mantido, é bom verificar se 'statNumbers' não está vazio
    if (document.querySelectorAll('.stat-number').length > 0) {
        setInterval(updateStats, 30000);
    }


    // Add smooth transitions to cards (Pode ser feito via CSS também)
    const cards = document.querySelectorAll('.stat-card, .feature-card, .activity-card');
    cards.forEach(card => {
        card.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
    });

    // Add hover effects programmatically (Pode ser feito via CSS :hover também)
    const hoverCards = document.querySelectorAll('.feature-card');
    hoverCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-4px)';
            this.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
        });
    });

    // Profile handler (mantido para demonstração, mas a navegação real será outra)
    const profileBtn = document.querySelector('.header-right a.btn:first-child'); // Seletor mais específico
    if (profileBtn) {
        profileBtn.addEventListener('click', function(event) {
            // Se o botão for um link <a> com href="#", previne o comportamento padrão
            if (this.tagName === 'A' && this.getAttribute('href') === '#') {
                event.preventDefault();
            }
            alert('Funcionalidade "Meu Perfil" a ser implementada.');
            // window.location.href = '/profile'; // Navegação real
        });
    }

    // MODIFICADO POR CONCURSOIA - INÍCIO: Handler do Logout
    // O event listener para o botão de logout com id="botao-logout"
    // será tratado pelo app.js, que contém a lógica de signOut do Firebase.
    // Portanto, o listener original do dashboard.js para este botão foi removido/comentado.
    /* const logoutBtn = document.querySelector('.header-right .btn:last-child'); // Este seletor pegaria o botão de logout se ele não tivesse ID
    // OU, se o botão de logout no HTML tiver id="botao-logout-lovable" (diferente do nosso)
    // const logoutBtnLovable = document.getElementById('botao-logout-lovable');

    if (logoutBtnLovable) { // Ou if(logoutBtn)
        logoutBtnLovable.addEventListener('click', function(event) {
            if (this.tagName === 'A' && this.getAttribute('href') === '#') {
                event.preventDefault();
            }
            if (confirm('Tem certeza que deseja sair? (Este é do dashboard.js)')) {
                alert('Fazendo logout... (Este é do dashboard.js)');
                // window.location.href = '/login'; // A navegação real será feita pelo app.js após o signOut do Firebase
            }
        });
    }
    */
    // MODIFICADO POR CONCURSOIA - FIM: Handler do Logout


    // Add loading states for buttons (genérico, pode ser útil ou pode conflitar se nosso app.js já fizer)
    // Vamos manter, mas observar se causa problemas com o botão "Gerar Plano de Estudos"
    const actionButtons = document.querySelectorAll('.btn-primary');
    actionButtons.forEach(button => {
        // Evita adicionar listener ao nosso botão de gerar plano se ele tiver o ID específico
        if (button.id !== 'botao-gerar-plano') { 
            button.addEventListener('click', function() {
                const originalText = this.innerHTML;
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
                this.disabled = true;
                
                setTimeout(() => {
                    this.innerHTML = originalText;
                    this.disabled = false;
                }, 1500); // Simula carregamento
            });
        }
    });

    console.log('Dashboard.js (do Lovable) inicializado com sucesso!');
});