// confirmation-modal.js - Sistema de confirmação customizado

class ConfirmationModal {
    constructor() {
        this.modal = null;
        this.resolve = null;
        this.reject = null;
        this.isShowing = false;
    }

    show(options = {}) {
        const {
            title = 'Confirmar Ação',
            message = 'Tem certeza que deseja realizar esta ação?',
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            confirmClass = 'btn-danger',
            cancelClass = 'btn-outline',
            icon = 'fas fa-question-circle'
        } = options;

        console.log('Modal sendo criado com opções:', options);

        return new Promise((resolve, reject) => {
            // Se já há um modal ativo, não cria outro
            if (this.modal && document.body.contains(this.modal)) {
                console.log('Modal já existe, removendo anterior');
                this.hide();
            }

            this.resolve = resolve;
            this.reject = reject;

            // Remove todos os modais existentes
            const existingModals = document.querySelectorAll('.confirmation-modal-overlay');
            existingModals.forEach(modal => modal.remove());

            // Cria o modal
            this.modal = document.createElement('div');
            this.modal.className = 'confirmation-modal-overlay';
            this.modal.style.display = 'flex';
            this.modal.innerHTML = `
                <div class="confirmation-modal">
                    <div class="confirmation-modal-header">
                        <i class="${icon}"></i>
                        <h3>${title}</h3>
                    </div>
                    <div class="confirmation-modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="confirmation-modal-actions">
                        <button class="btn ${cancelClass} btn-cancel">${cancelText}</button>
                        <button class="btn ${confirmClass} btn-confirm">${confirmText}</button>
                    </div>
                </div>
            `;

            // Adiciona ao DOM
            document.body.appendChild(this.modal);
            this.isShowing = true;
            console.log('Modal adicionado ao DOM');
            
            // Força o foco e garante que está visível
            setTimeout(() => {
                if (this.modal && document.body.contains(this.modal)) {
                    this.modal.style.display = 'flex';
                    this.modal.style.visibility = 'visible';
                    this.modal.style.opacity = '1';
                    console.log('Modal forçado a aparecer');
                }
            }, 10);

            // Event listeners
            const confirmBtn = this.modal.querySelector('.btn-confirm');
            const cancelBtn = this.modal.querySelector('.btn-cancel');

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

            // Fecha ao clicar fora do modal
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
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

            // Remove event listener quando modal for fechado
            this.modal.addEventListener('removed', () => {
                document.removeEventListener('keydown', handleKeydown);
            });

            // Foca no botão de confirmar
            setTimeout(() => confirmBtn.focus(), 100);
        });
    }

    hide() {
        if (this.modal) {
            this.isShowing = false;
            this.modal.classList.add('fade-out');
            setTimeout(() => {
                if (this.modal && this.modal.parentNode) {
                    this.modal.parentNode.removeChild(this.modal);
                    this.modal.dispatchEvent(new Event('removed'));
                }
                this.modal = null;
            }, 200);
        }
    }
}

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
        console.log('Criando modal simples e funcional');

        return new Promise((resolve) => {
            // Remove qualquer modal existente
            const existingModal = document.getElementById('simple-confirm-modal');
            if (existingModal) {
                existingModal.remove();
            }

            // Cria o modal
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
                    <button id="modal-cancel" class="btn btn-outline" style="min-width: 120px;">
                        ${cancelText}
                    </button>
                    <button id="modal-confirm" class="btn btn-primary" style="min-width: 120px;">
                        ${confirmText}
                    </button>
                </div>
            `;

            modalOverlay.appendChild(modalContent);
            
            // Adiciona diretamente ao body (fora de qualquer container)
            document.body.appendChild(modalOverlay);
            console.log('Modal adicionado diretamente ao body');

            const confirmBtn = modalContent.querySelector('#modal-confirm');
            const cancelBtn = modalContent.querySelector('#modal-cancel');

            const handleConfirm = () => {
                console.log('Modal confirmado');
                this.hide();
                resolve(true);
            };

            const handleCancel = () => {
                console.log('Modal cancelado');
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

// Instância global
window.simpleModal = new SimpleConfirmModal();

// Função principal
window.confirmCustom = async (options) => {
    console.log('confirmCustom chamado com:', options);
    return await window.simpleModal.show(options);
};

// Garante que o modal esteja disponível quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    if (!window.confirmationModal) {
        window.confirmationModal = new ConfirmationModal();
    }
    if (!window.confirmCustom) {
        window.confirmCustom = (options) => {
            return window.confirmationModal.show(options);
        };
    }
    console.log('Modal de confirmação carregado com sucesso');
});

// Fallback para garantir que funcione mesmo se carregado antes do DOM
if (document.readyState === 'loading') {
    // DOM ainda não carregou
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.confirmationModal) {
            window.confirmationModal = new ConfirmationModal();
        }
        if (!window.confirmCustom) {
            window.confirmCustom = (options) => {
                return window.confirmationModal.show(options);
            };
        }
        console.log('Modal de confirmação carregado (fallback)');
    });
} else {
    // DOM já carregou
    if (!window.confirmationModal) {
        window.confirmationModal = new ConfirmationModal();
    }
    if (!window.confirmCustom) {
        window.confirmCustom = (options) => {
            return window.confirmationModal.show(options);
        };
    }
    console.log('Modal de confirmação carregado (imediato)');
} 