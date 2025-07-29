// confirmation-modal.js - Sistema de confirmação customizado para excluir

// Modal personalizado que funciona corretamente
class SimpleConfirmModal {
    constructor() {
        this.isShowing = false;
    }

    show(options = {}) {
        const {
            title = 'Confirmar Ação',
            message = 'Tem certeza que deseja realizar esta ação?',
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            icon = 'fas fa-question-circle'
        } = options;

        if (this.isShowing) {
            return Promise.resolve(false);
        }

        this.isShowing = true;

        return new Promise((resolve) => {
            // Remove qualquer modal existente com nosso ID específico
            const existingModal = document.getElementById('simple-confirm-modal');
            if (existingModal) {
                existingModal.remove();
            }

            // Cria o modal com ID único para não conflitar com o processing-ui
            const modalOverlay = document.createElement('div');
            modalOverlay.id = 'simple-confirm-modal';
            modalOverlay.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background-color: rgba(0, 0, 0, 0.5) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 99999999 !important;
                backdrop-filter: blur(4px) !important;
            `;

            const modalContent = document.createElement('div');
            modalContent.style.cssText = `
                background: white !important;
                border-radius: 12px !important;
                padding: 32px !important;
                max-width: 500px !important;
                width: 90% !important;
                text-align: center !important;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1) !important;
                animation: modalSlideIn 0.3s ease-out !important;
            `;

            modalContent.innerHTML = `
                <div style="font-size: 48px; color: #3b82f6; margin-bottom: 16px;">
                    <i class="${icon}"></i>
                </div>
                <h3 style="font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 12px;">
                    ${title}
                </h3>
                <p style="font-size: 16px; color: #6b7280; line-height: 1.6; margin-bottom: 24px;">
                    ${message}
                </p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="modal-cancel" class="btn btn-outline" style="min-width: 120px; justify-content: center;">
                        ${cancelText}
                    </button>
                    <button id="modal-confirm" class="btn btn-primary" style="min-width: 120px; justify-content: center;">
                        ${confirmText}
                    </button>
                </div>
            `;

            modalOverlay.appendChild(modalContent);
            
            // Adiciona diretamente ao body (fora de qualquer container)
            document.body.appendChild(modalOverlay);

            const confirmBtn = modalContent.querySelector('#modal-confirm');
            const cancelBtn = modalContent.querySelector('#modal-cancel');

            const handleConfirm = () => {
                this.hide();
                resolve(true);
            };

            const handleCancel = () => {
                this.hide();
                resolve(false);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);

            // Fecha ao clicar fora
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    handleCancel();
                }
            });

            // Fecha com ESC
            const handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    handleCancel();
                }
            };
            document.addEventListener('keydown', handleKeydown);

            // Remove listener quando modal for fechado
            modalOverlay.addEventListener('removed', () => {
                document.removeEventListener('keydown', handleKeydown);
            });

            // Foca no botão confirmar
            setTimeout(() => confirmBtn.focus(), 100);
        });
    }

    hide() {
        this.isShowing = false;
        const modal = document.getElementById('simple-confirm-modal');
        if (modal) {
            modal.style.opacity = '0';
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                    modal.dispatchEvent(new Event('removed'));
                }
            }, 200);
        }
    }
}

// Instância global apenas do modal que funciona
window.simpleModal = new SimpleConfirmModal();

// Função principal - usa apenas nosso modal simples que não conflita
window.confirmCustom = async (options) => {
    return await window.simpleModal.show(options);
}; 