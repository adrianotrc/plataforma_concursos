// processing-ui.js - Sistema de Feedback Visual para Processamento

/**
 * Sistema de Feedback Visual para Processamento
 * Gerencia modais de confirmação, indicadores de processamento e destaque de áreas
 */

class ProcessingUI {
    constructor() {
        this.processingIndicator = null;
        this.confirmationModal = null;
        this.processingStartTime = null;
        this.processingTimer = null;
        // Se algo der errado e o indicador não for fechado por código,
        // este timer de segurança garante que ele seja ocultado após
        // um período máximo configurável (padrão: 2 min).
        this.autoHideTimer = null;
    }

    /**
     * Cria e mostra o modal de confirmação
     * @param {Object} options - Opções do modal
     * @param {string} options.title - Título do modal
     * @param {string} options.message - Mensagem do modal
     * @param {string} options.icon - Ícone (classe FontAwesome)
     * @param {Function} options.onConfirm - Função executada ao confirmar
     * @param {Function} options.onCancel - Função executada ao cancelar
     */
    showConfirmationModal(options) {
        const {
            title = 'Confirmar Ação',
            message = 'Tem certeza que deseja continuar?',
            icon = 'fas fa-question-circle',
            onConfirm = () => {},
            onCancel = () => {}
        } = options;

        // Remove modal existente se houver
        this.removeConfirmationModal();

        // Cria o modal
        this.confirmationModal = document.createElement('div');
        this.confirmationModal.className = 'confirmation-modal';
        this.confirmationModal.innerHTML = `
            <div class="confirmation-content">
                <div class="confirmation-icon">
                    <i class="${icon}"></i>
                </div>
                <h3 class="confirmation-title">${title}</h3>
                <p class="confirmation-message">${message}</p>
                <div class="confirmation-actions">
                    <button class="btn btn-outline" id="btn-cancel-confirmation">Cancelar</button>
                    <button class="btn btn-primary" id="btn-confirm-action">Confirmar</button>
                </div>
            </div>
        `;

        // Adiciona ao DOM
        document.body.appendChild(this.confirmationModal);

        // Event listeners
        const confirmBtn = this.confirmationModal.querySelector('#btn-confirm-action');
        const cancelBtn = this.confirmationModal.querySelector('#btn-cancel-confirmation');

        confirmBtn.addEventListener('click', () => {
            this.hideConfirmationModal();
            onConfirm();
        });

        cancelBtn.addEventListener('click', () => {
            this.hideConfirmationModal();
            onCancel();
        });

        // Mostra o modal com animação
        setTimeout(() => {
            this.confirmationModal.classList.add('show');
        }, 10);

        // Fecha ao clicar fora do modal
        this.confirmationModal.addEventListener('click', (e) => {
            if (e.target === this.confirmationModal) {
                this.hideConfirmationModal();
                onCancel();
            }
        });
    }

    /**
     * Esconde o modal de confirmação
     */
    hideConfirmationModal() {
        if (this.confirmationModal) {
            this.confirmationModal.classList.remove('show');
            setTimeout(() => {
                if (this.confirmationModal && this.confirmationModal.parentNode) {
                    this.confirmationModal.parentNode.removeChild(this.confirmationModal);
                }
                this.confirmationModal = null;
            }, 300);
        }
    }

    /**
     * Remove o modal de confirmação sem animação
     */
    removeConfirmationModal() {
        if (this.confirmationModal && this.confirmationModal.parentNode) {
            this.confirmationModal.parentNode.removeChild(this.confirmationModal);
            this.confirmationModal = null;
        }
    }

    /**
     * Mostra o indicador de processamento
     * @param {Object} options - Opções do indicador
     * @param {string} options.title - Título do processamento
     * @param {string} options.message - Mensagem de processamento
     * @param {string} options.estimatedTime - Tempo estimado
     */
    showProcessingIndicator(options = {}) {
        const {
            title = 'Processando...',
            message = 'Aguarde enquanto nossa IA trabalha para você.',
            estimatedTime = '30-60 segundos'
        } = options;

        // Remove indicador existente se houver
        this.removeProcessingIndicator();

        // Cria o indicador
        this.processingIndicator = document.createElement('div');
        this.processingIndicator.className = 'processing-indicator';
        this.processingIndicator.innerHTML = `
            <div class="processing-content">
                <div class="processing-spinner">
                    <i class="fas fa-cog"></i>
                </div>
                <h3 class="processing-title">${title}</h3>
                <p class="processing-message">${message}</p>
                <div class="processing-progress">
                    <div class="processing-bar"></div>
                </div>
                <p class="processing-time">Tempo estimado: ${estimatedTime}</p>
            </div>
        `;

        // Adiciona ao DOM
        document.body.appendChild(this.processingIndicator);

        // Mostra o indicador
        setTimeout(() => {
            this.processingIndicator.classList.add('show');
        }, 10);

        // Inicia o timer
        this.processingStartTime = Date.now();
        this.updateProcessingTime();

        // --- Fallback de segurança ---
        // Se por alguma razão o fluxo normal não chamar hideProcessingIndicator,
        // este timer fechará o popup após 2 min (120 000 ms).
        if (this.autoHideTimer) clearTimeout(this.autoHideTimer);
        this.autoHideTimer = setTimeout(() => {
            console.warn('[ProcessingUI] Auto-hide acionado após tempo limite.');
            this.hideProcessingIndicator();
        }, 120000);
    }

    /**
     * Esconde o indicador de processamento
     */
    hideProcessingIndicator() {
        if (this.processingIndicator) {
            this.processingIndicator.classList.remove('show');
            setTimeout(() => {
                this.removeProcessingIndicator();
            }, 300);
        }

        // Cancela o timer de auto-hide se ainda estiver ativo
        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = null;
        }
    }

    /**
     * Remove o indicador de processamento sem animação
     */
    removeProcessingIndicator() {
        if (this.processingIndicator && this.processingIndicator.parentNode) {
            this.processingIndicator.parentNode.removeChild(this.processingIndicator);
            this.processingIndicator = null;
        }
        
        // Para o timer
        if (this.processingTimer) {
            clearInterval(this.processingTimer);
            this.processingTimer = null;
        }
    }

    /**
     * Atualiza o tempo de processamento
     */
    updateProcessingTime() {
        if (!this.processingStartTime) return;

        this.processingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.processingStartTime) / 1000);
            const timeElement = this.processingIndicator?.querySelector('.processing-time');
            
            if (timeElement) {
                timeElement.textContent = `Tempo decorrido: ${elapsed}s`;
            }
        }, 1000);
    }

    /**
     * Destaca uma área de resultado durante o processamento
     * @param {string} selector - Seletor CSS da área
     */
    highlightResultArea(selector) {
        const element = document.querySelector(selector);
        if (element) {
            element.classList.add('result-area-highlight');
            
            // Scroll suave para a área
            element.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
    }

    /**
     * Remove o destaque da área de resultado
     * @param {string} selector - Seletor CSS da área
     */
    removeResultAreaHighlight(selector) {
        const element = document.querySelector(selector);
        if (element) {
            element.classList.remove('result-area-highlight');
        }
    }

    /**
     * Função conveniente para iniciar processamento com confirmação
     * @param {Object} options - Opções completas
     */
    startProcessingWithConfirmation(options) {
        const {
            confirmationTitle = 'Confirmar Geração',
            confirmationMessage = 'Esta ação pode demorar alguns segundos. Deseja continuar?',
            confirmationIcon = 'fas fa-magic',
            processingTitle = 'Gerando Conteúdo...',
            processingMessage = 'Nossa IA está trabalhando para criar o melhor conteúdo para você.',
            estimatedTime = '30-60 segundos',
            resultAreaSelector = null,
            onConfirm = () => {},
            onCancel = () => {},
            onComplete = () => {}
        } = options;

        this.showConfirmationModal({
            title: confirmationTitle,
            message: confirmationMessage,
            icon: confirmationIcon,
            onConfirm: async () => {
                try {
                    // Mostra indicador de processamento
                    this.showProcessingIndicator({
                        title: processingTitle,
                        message: processingMessage,
                        estimatedTime: estimatedTime
                    });

                    // Destaca área de resultado se especificada
                    if (resultAreaSelector) {
                        this.highlightResultArea(resultAreaSelector);
                    }

                    // Executa a função de processamento
                    const result = await onConfirm();

                    // Esconde indicador e remove destaque
                    this.hideProcessingIndicator();
                    if (resultAreaSelector) {
                        this.removeResultAreaHighlight(resultAreaSelector);
                    }

                    // Executa callback de conclusão
                    if (onComplete) {
                        onComplete(result);
                    }
                } catch (error) {
                    // Esconde indicador em caso de erro
                    this.hideProcessingIndicator();
                    if (resultAreaSelector) {
                        this.removeResultAreaHighlight(resultAreaSelector);
                    }
                    throw error; // Re-lança o erro para ser tratado pela função chamadora
                }
            },
            onCancel: () => {
                if (onCancel) {
                    onCancel();
                }
            }
        });
    }
}

// Instância global - disponível para todos os scripts
window.processingUI = new ProcessingUI(); 