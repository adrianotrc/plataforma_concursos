// Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    // Sidebar toggle functionality
    if (sidebarToggle && sidebar && sidebarOverlay) {
        function toggleSidebar() {
            if (sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('show');
                document.body.style.overflow = '';
            } else {
                sidebar.classList.add('open');
                sidebarOverlay.classList.add('show');
                document.body.style.overflow = 'hidden';
            }
        }
        sidebarToggle.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', toggleSidebar);
    } else {
        const currentPageForSidebarCheck = window.location.pathname.split('/').pop() || "index.html";
        if (['home.html', 'cronograma.html', 'dicas-estrategicas.html', 'meu-perfil.html'].includes(currentPageForSidebarCheck) ) {
             // console.warn("dashboard.js: Elementos da sidebar (sidebarToggle, sidebar, ou sidebarOverlay) não encontrados, mas esperado nestas páginas.");
        }
    }

    // Close sidebar when clicking on nav items (mobile)
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item'); 
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            if (this.getAttribute('href') === '#') { 
                e.preventDefault(); 
                const navText = this.querySelector('span') ? this.querySelector('span').textContent.trim() : 'Item';
                // alert(`Funcionalidade "${navText}" a ser implementada.`); // Pode remover se não quiser o alerta
                console.log("dashboard.js: Link da sidebar (placeholder) '" + navText + "' clicado.");
            }
            if (window.innerWidth <= 768 && sidebar && sidebarOverlay && sidebar.classList.contains('open')) {
                setTimeout(() => { 
                    sidebar.classList.remove('open');
                    sidebarOverlay.classList.remove('show');
                    document.body.style.overflow = '';
                }, 50); 
            }
        });
    });

    // Handle window resize for sidebar
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768 && sidebar && sidebarOverlay) {
            if (sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('show');
                document.body.style.overflow = '';
            }
        }
    });

    // Feature card click handlers (para cards com href="#")
    const featureCards = document.querySelectorAll('.features-grid .feature-card');
    featureCards.forEach(card => {
        const button = card.querySelector('.btn-primary'); 
        const featureTitleElement = card.querySelector('h3');

        if (button && featureTitleElement && button.tagName === 'A' && button.getAttribute('href') === '#') {
            // Apenas para os botões "Acessar" dos cards que são placeholders
            button.addEventListener('click', function(event) {
                event.preventDefault();
                const featureTitle = featureTitleElement.textContent.trim();
                alert(`Funcionalidade "${featureTitle}" a ser implementada.`);
            });
        }
    });
    
    // Profile handler - REMOVIDO DO DASHBOARD.JS (será tratado pelo href e app.js)
    /*
    const profileBtn = document.querySelector('.header-right a.btn:first-child'); 
    if (profileBtn) {
        profileBtn.addEventListener('click', function(event) {
            // alert('Funcionalidade "Meu Perfil" a ser implementada.'); 
        });
    }
    */

    // Listener de Logout do Lovable - REMOVIDO DO DASHBOARD.JS
    // O app.js cuidará do botão com id="botao-logout"

    console.log('dashboard.js (do Lovable) inicializado e ajustado.');
});