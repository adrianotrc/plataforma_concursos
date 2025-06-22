// SUBSTITUA O CONTEÚDO INTEIRO DO ARQUIVO material-de-estudo.js

// Lista de vídeos com os IDs reais fornecidos por você.
const videosDoGuia = [
    { titulo: 'Módulo Introdutório', videoId: 'DAerJ4z9c68' },
    { titulo: 'Módulo 1: Eu quero realmente estudar?', videoId: 'PobvK-fnC-A' },
    { titulo: 'Módulo 2: O método CMT', videoId: 'qpxcqFMgkbU' },
    { titulo: 'Módulo 3: Área de Foco', videoId: 'buNZvk765n8' },
    { titulo: 'Módulo 4: Conheça as regras (Edital)', videoId: '1MZ6u6lvbO0' },
    { titulo: 'Módulo 5: Organize seu horário', videoId: 'dDtNjAFnfdM' },
    { titulo: 'Módulo 6: Elabore seu plano!', videoId: 'UN5sZiwpxkI' },
    { titulo: 'Módulo 7: Estratégias e materiais', videoId: 'ORQYZ_Thuys' },
    { titulo: 'Módulo 8: Antecipe as dificuldades', videoId: 'o-qxVts3gbE' },
    { titulo: 'Módulo 9: Conheça as bancas!', videoId: 'dwk_-ajyVRs' },
    { titulo: 'Módulo 10: Semana da prova!', videoId: 'yfqMb6n2jMc' },
    { titulo: 'Módulo 11: Aprenda com seus erros', videoId: 'uz_1i-4USAU' },
    { titulo: 'Módulo 12: Últimas dicas', videoId: 'S2tWNm2WSI' }
];

document.addEventListener('DOMContentLoaded', () => {
    const playlistContainer = document.getElementById('video-playlist');
    const playerContainer = document.getElementById('video-player');
    const playerPlaceholder = document.getElementById('video-player-placeholder');

    if (!playlistContainer || !playerContainer || !playerPlaceholder) return;

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

        if (!videoId) {
            alert('ID do vídeo não encontrado.');
            return;
        }

        document.querySelectorAll('.video-playlist-item').forEach(el => el.classList.remove('active'));
        itemClicado.classList.add('active');

        playerPlaceholder.style.display = 'none';
        playerContainer.style.display = 'block';

        // **CORREÇÃO DEFINITIVA:** Usando a URL de 'embed' oficial e correta do YouTube
        playerContainer.innerHTML = `
            <iframe 
                src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0" 
                title="YouTube video player" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowfullscreen>
            </iframe>
        `;
    });
});