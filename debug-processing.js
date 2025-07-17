// debug-processing.js - Arquivo de debug para verificar carregamento

console.log('=== DEBUG PROCESSING UI ===');
console.log('Verificando se processingUI está disponível...');

// Verifica se o processingUI está disponível
if (typeof window.processingUI !== 'undefined') {
    console.log('✅ processingUI está disponível:', window.processingUI);
    console.log('Métodos disponíveis:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.processingUI)));
} else {
    console.log('❌ processingUI NÃO está disponível');
    console.log('window.processingUI:', window.processingUI);
}

// Verifica se a classe ProcessingUI está disponível
if (typeof ProcessingUI !== 'undefined') {
    console.log('✅ ProcessingUI class está disponível');
} else {
    console.log('❌ ProcessingUI class NÃO está disponível');
}

// Lista todos os scripts carregados
console.log('Scripts carregados:');
Array.from(document.scripts).forEach((script, index) => {
    console.log(`${index + 1}. ${script.src || 'inline script'}`);
});

// Verifica se há erros no console
window.addEventListener('error', (event) => {
    console.error('❌ Erro detectado:', event.error);
    console.error('Arquivo:', event.filename);
    console.error('Linha:', event.lineno);
    console.error('Coluna:', event.colno);
});

console.log('=== FIM DEBUG ==='); 