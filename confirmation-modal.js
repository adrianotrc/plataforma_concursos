// confirmation-modal.js - Sistema de confirmação customizado

class ConfirmationModal {
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
            confirmClass = 'btn-danger',
            cancelClass = 'btn-outline',
            icon = 'fas fa-question-circle'
        } = options;

        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;

            // Remove modal existente se houver
            if (this.modal) {
                this.modal.remove();
            }

            // Cria o modal
            this.modal = document.createElement('div');
            this.modal.className = 'confirmation-modal-overlay';
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

// Instância global
window.confirmationModal = new ConfirmationModal();

// Função helper para facilitar o uso
window.confirmCustom = (options) => {
    return window.confirmationModal.show(options);
}; 