// Dashboard JavaScript (Versão Limpa e Segura)
document.addEventListener('DOMContentLoaded', function() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    // Funcionalidade de abrir/fechar a sidebar
    if (sidebarToggle && sidebar && sidebarOverlay) {
        const toggleSidebar = () => {
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('show');
            document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
        };
        sidebarToggle.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', toggleSidebar);
    } 

    // Fecha a sidebar em mobile ao clicar em um item de navegação
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item'); 
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            if (this.getAttribute('href') === '#') { 
                e.preventDefault(); 
                const navText = this.querySelector('span') ? this.querySelector('span').textContent.trim() : 'Item';
                alert(`Funcionalidade "${navText}" a ser implementada.`);
            }
            if (window.innerWidth <= 768 && sidebar?.classList.contains('open')) {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('show');
                document.body.style.overflow = '';
            }
        });
    });

    // Garante que a sidebar feche se a janela for redimensionada para desktop
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768 && sidebar?.classList.contains('open')) {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('show');
            document.body.style.overflow = '';
        }
    });
    
    // Handlers para "Meu Perfil" e "Sair" foram COMPLETAMENTE REMOVIDOS daqui.
    
    console.log('dashboard.js (do Lovable) inicializado e limpo.');
});