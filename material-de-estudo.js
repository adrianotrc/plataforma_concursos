// Arquivo: material-de-estudo.js
const videosDoGuia = [
    { titulo: 'Módulo Introdutório', videoId: '4' },
    { titulo: 'Módulo 1: Eu quero realmente estudar?', videoId: '5' },
    { titulo: 'Módulo 2: O método CMT', videoId: '6' },
    { titulo: 'Módulo 3: Área de Foco', videoId: '7' },
    { titulo: 'Módulo 4: Conheça as regras (Edital)', videoId: '8' },
    { titulo: 'Módulo 5: Organize seu horário', videoId: '9' },
    { titulo: 'Módulo 6: Elabore seu plano!', videoId: '10' },
    { titulo: 'Módulo 7: Estratégias e materiais', videoId: '11' },
    { titulo: 'Módulo 8: Antecipe as dificuldades', videoId: '12' },
    { titulo: 'Módulo 9: Conheça as bancas!', videoId: '13' },
    { titulo: 'Módulo 10: Semana da prova!', videoId: '14' },
    { titulo: 'Módulo 11: Aprenda com seus erros', videoId: '15' },
    { titulo: 'Módulo 12: Últimas dicas', videoId: '16' }
];

document.addEventListener('DOMContentLoaded', () => {
    const playlistContainer = document.getElementById('video-playlist');
    const playerContainer = document.getElementById('video-player');
    const playerPlaceholder = document.getElementById('video-player-placeholder');

    if (!playlistContainer) return;
    playlistContainer.innerHTML = videosDoGuia.map(video => `
        <li class="video-playlist-item" data-video-id="${video.videoId}">
            <i class="fab fa-youtube"></i>
            <span>${video.titulo}</span>
        </li>
    `).join('');
    playlistContainer.addEventListener('click', (e) => {
        const itemClicado = e.target.closest('.video-playlist-item');
        if (!itemClicado) return;
    
        const videoId = itemClicado.dataset.videoId;
    
        document.querySelectorAll('.video-playlist-item').forEach(el => el.classList.remove('active'));
        itemClicado.classList.add('active');
    
        playerPlaceholder.style.display = 'none';
        playerContainer.style.display = 'block';
    
        // CORREÇÃO: Usando a URL de 'embed' oficial e correta do YouTube
        playerContainer.innerHTML = `
            <iframe 
                src="https://www.youtube.com/watch?v=VIDEO_ID_21{videoId}?autoplay=1&rel=0" 
                title="YouTube video player" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowfullscreen>
            </iframe>`;
    });
});