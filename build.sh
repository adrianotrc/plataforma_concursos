#!/usr/bin/env bash
# exit on error
set -o errexit

# Atualiza o pip para garantir compatibilidade
pip install --upgrade pip

# Instala todas as dependências do projeto
pip install -r requirements.txt

# Executa o collectstatic do Django, uma boa prática para apps web,
# embora não seja estritamente necessário para o Flask, não causa mal.
# Se houver um manage.py, ele tentará rodar, senão, apenas continuará.
# python manage.py collectstatic --no-input