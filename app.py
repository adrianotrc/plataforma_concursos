# app.py - Versão com a rota /gerar-exercicios implementada

import os
import json
from datetime import datetime, timedelta
import math
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI

load_dotenv()
app = Flask(__name__)
CORS(app) # Esta linha aplica as permissões de CORS para todas as rotas

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("ERRO CRÍTICO: A variável de ambiente OPENAI_API_KEY não foi encontrada.")
    
client = OpenAI(api_key=api_key)

def call_openai_api(prompt_content, system_message):
    if not api_key:
        raise ValueError("A chave da API da OpenAI não está configurada no servidor.")
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt_content}
            ],
            response_format={"type": "json_object"},
            temperature=0.7 # Um pouco mais de criatividade para variar as questões
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"ERRO na chamada da API OpenAI: {e}")
        raise

@app.route("/")
def ola_mundo():
    return "Backend ConcursoIA Funcionando"

@app.route("/gerar-plano-estudos", methods=['POST'])
def gerar_plano():
    dados_usuario = request.json
    
    numero_de_semanas = 4
    data_inicio_str = dados_usuario.get('data_inicio')
    data_termino_str = dados_usuario.get('data_termino')

    if data_inicio_str and data_termino_str:
        try:
            data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d')
            data_termino = datetime.strptime(data_termino_str, '%Y-%m-%d')
            if data_termino > data_inicio:
                diferenca_dias = (data_termino - data_inicio).days
                numero_de_semanas = math.ceil((diferenca_dias + 1) / 7)
        except ValueError:
            numero_de_semanas = 4

    try:
        # **PROMPT DEFINITIVO COM REGRAS DE TEMPO EXPLÍCITAS**
        prompt = (
            f"Você é um especialista em preparação para concursos, baseando-se na metodologia do 'Guia Definitivo de Aprovação em Concursos'. "
            f"Crie um plano de estudos detalhado em JSON para um aluno com as seguintes características: {json.dumps(dados_usuario, indent=2)}.\n\n"
            f"REGRAS ESTRATÉGICAS OBRIGATÓRIAS E INEGOCIÁVEIS:\n"
            f"1. **DURAÇÃO TOTAL:** O plano DEVE conter EXATAMENTE {numero_de_semanas} semanas, todas detalhadas.\n\n"
            f"2. **RESPEITO AO TEMPO DIÁRIO (REGRA MAIS IMPORTANTE):** A SOMA TOTAL dos 'duracao_minutos' de TODAS as 'atividades' em um determinado 'dia_semana' NÃO PODE, EM HIPÓTESE ALGUMA, EXCEDER o valor especificado em 'disponibilidade_semanal_minutos' para aquele dia. Se um dia tem 120 minutos disponíveis, o total de atividades para esse dia deve ser 120 minutos.\n\n"
            f"3. **DURAÇÃO DA SESSÃO DE ESTUDO:** CADA 'atividade' individual gerada DEVE ter um 'duracao_minutos' EXATAMENTE igual ao valor de 'duracao_sessao_minutos' ({dados_usuario.get('duracao_sessao_minutos')} min). A única exceção é a última atividade de um dia, que pode ser mais curta para se ajustar ao total de minutos diário.\n\n"
            f"4. **VARIAÇÃO OBRIGATÓRIA DE TÉCNICAS:** É OBRIGATÓRIO variar o 'tipo_de_estudo'. Use termos como 'Estudo de Teoria (PDF/Livro)', 'Resolução de Exercícios', 'Revisão Ativa (Flashcards/Mapas)', 'Simulado Cronometrado'. A aplicação das técnicas deve seguir uma lógica de aprendizado (Teoria -> Exercícios -> Revisão).\n\n"
            f"5. **RETA FINAL E FASE DE PREPARAÇÃO:** Continue aplicando as regras de intensificar exercícios na fase pós-edital e de criar uma semana de revisão final se houver data de término.\n\n"
            f"ESTRUTURA DE RESPOSTA JSON (SEGUIR RIGOROSAMENTE):\n"
            f"O JSON deve conter um objeto 'plano_de_estudos' com as chaves: 'concurso_foco', 'resumo_estrategico', 'mensagem_inicial', e 'cronograma_semanal_detalhado'.\n"
            f"Cada 'semana' deve ter 'semana_numero' (int) e 'dias_de_estudo' (LISTA).\n"
            f"Cada 'dia' deve ter 'dia_semana' (string) e 'atividades' (LISTA).\n"
            f"Cada 'atividade' deve ter 'horario_sugerido', 'duracao_minutos' (int), 'materia', 'topico_sugerido', e 'tipo_de_estudo'."
        )
        system_message = "Você é um assistente especialista que cria planos de estudo JSON detalhados e estratégicos para concurseiros, seguindo rigorosamente a metodologia e a estrutura de saída solicitadas."
        
        dados = call_openai_api(prompt, system_message)
        return jsonify(dados)
    except Exception as e:
        return jsonify({"erro_geral": str(e)}), 500

@app.route("/gerar-exercicios", methods=['POST'])
def gerar_exercicios():
    dados_req = request.json
    try:
        quantidade = dados_req.get('quantidade', 5)
        materia = dados_req.get('materia', 'Conhecimentos Gerais')
        topico = dados_req.get('topico', 'Qualquer')
        banca = dados_req.get('banca', '') # Pode ser vazio

        prompt = (
            f"Crie EXATAMENTE {quantidade} questões de múltipla escolha (A, B, C, D, E) sobre a matéria '{materia}' e o tópico '{topico}'. "
            f"Se uma banca for especificada ('{banca}'), imite o estilo de questões dessa banca. Se não, crie questões de estilo geral.\n\n"
            f"REGRAS DE FORMATAÇÃO (SEGUIR RIGOROSAMENTE):\n"
            f"1. A resposta DEVE ser um objeto JSON com uma única chave: 'exercicios', que é uma LISTA de objetos.\n"
            f"2. Cada objeto na lista 'exercicios' DEVE conter as seguintes chaves:\n"
            f"   - 'enunciado': O texto da pergunta.\n"
            f"   - 'opcoes': Uma LISTA de 5 objetos, cada um com as chaves 'letra' (string, ex: 'A') e 'texto' (string).\n"
            f"   - 'resposta_correta': APENAS a letra da opção correta (string, ex: 'C').\n"
            f"   - 'explicacao': Uma explicação detalhada e clara sobre o porquê da resposta correta estar certa e as outras erradas."
        )
        system_message = "Você é um especialista em criar questões para concursos públicos, formatando a saída estritamente em JSON conforme as regras solicitadas."
        
        dados = call_openai_api(prompt, system_message)
        return jsonify(dados)
    except Exception as e:
        return jsonify({"erro_geral": str(e)}), 500


@app.route("/gerar-dica-categoria", methods=['POST'])
def gerar_dica_categoria():
    # ... (código da geração de dicas, sem alterações)
    return jsonify({"message": "Esta rota está funcionando"})

if __name__ == "__main__":
    app.run(debug=True)