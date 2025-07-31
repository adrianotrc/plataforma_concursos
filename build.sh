#!/usr/bin/env bash
# exit on error
set -o errexit

echo "🚀 Iniciando build..."

# Atualiza o pip para garantir compatibilidade
echo "📦 Atualizando pip..."
pip install --upgrade pip

# Instala dependências com cache otimizado
echo "📦 Instalando dependências..."
pip install --no-cache-dir -r requirements.txt

echo "✅ Build concluído com sucesso!"