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

// Modal moderno baseado no processing-ui.js
class ModernConfirmationModal {
    constructor() {
        this.modal = null;
        this.resolve = null;
        this.reject = null;
    }

    show(options = {}) {
        const {
            title = 'Confirmar Ação',
            message = 'Tem certeza que deseja realizar esta ação?',
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            confirmClass = 'btn-primary',
            cancelClass = 'btn-outline',
            icon = 'fas fa-question-circle'
        } = options;

        console.log('Modal moderno sendo criado com opções:', options);

        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;

            // Remove modal existente se houver
            this.hide();

            // Cria o modal usando a estrutura do processing-ui
            this.modal = document.createElement('div');
            this.modal.className = 'confirmation-modal';
            this.modal.innerHTML = `
                <div class="confirmation-content">
                    <div class="confirmation-icon">
                        <i class="${icon}"></i>
                    </div>
                    <h3 class="confirmation-title">${title}</h3>
                    <p class="confirmation-message">${message}</p>
                    <div class="confirmation-actions">
                        <button class="btn ${cancelClass}" id="btn-cancel-confirmation">${cancelText}</button>
                        <button class="btn ${confirmClass}" id="btn-confirm-action">${confirmText}</button>
                    </div>
                </div>
            `;

            // Adiciona ao DOM
            document.body.appendChild(this.modal);

            // Event listeners
            const confirmBtn = this.modal.querySelector('#btn-confirm-action');
            const cancelBtn = this.modal.querySelector('#btn-cancel-confirmation');

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

            // Mostra o modal com animação
            setTimeout(() => {
                this.modal.classList.add('show');
                confirmBtn.focus();
            }, 10);

            console.log('Modal moderno adicionado ao DOM');
        });
    }

    hide() {
        if (this.modal) {
            this.modal.classList.remove('show');
            setTimeout(() => {
                if (this.modal && this.modal.parentNode) {
                    this.modal.parentNode.removeChild(this.modal);
                    this.modal.dispatchEvent(new Event('removed'));
                }
                this.modal = null;
            }, 300);
        }
    }
}

// Instância global
window.modernConfirmationModal = new ModernConfirmationModal();

// Função helper para facilitar o uso
window.confirmCustom = async (options) => {
    console.log('confirmCustom chamado com:', options);
    
    if (!window.modernConfirmationModal) {
        window.modernConfirmationModal = new ModernConfirmationModal();
    }
    
    try {
        return await window.modernConfirmationModal.show(options);
    } catch (error) {
        console.error('Erro no modal moderno, usando confirm nativo:', error);
        const message = options.message || 'Tem certeza que deseja realizar esta ação?';
        return confirm(message);
    }
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