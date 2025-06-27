#!/usr/bin/env bash
# exit on error
set -o errexit

# Garante que as ferramentas de instalação estejam atualizadas
pip install --upgrade pip setuptools wheel

# Instala as dependências listadas no requirements.txt
pip install -r requirements.txt