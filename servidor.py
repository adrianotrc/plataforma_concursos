import os
import json 
import random 
import datetime
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI 

load_dotenv()
app = Flask(__name__)
CORS(app) 

openai_api_key = os.getenv("OPENAI_API_KEY")
client = None 
if not openai_api_key:
    print("ALERTA CRÍTICO: OPENAI_API_KEY não definida.")
else:
    try:
        client = OpenAI(api_key=openai_api_key)
        print("Cliente OpenAI inicializado com sucesso.")
    except Exception as e:
        print(f"Erro ao inicializar cliente OpenAI: {e}")


@app.route("/")
def ola_mundo():
    return "Backend ConcursoIA Funcionando"

def call_openai_api(prompt_content, system_message, model, temperature):
    """Função auxiliar para chamar a API da OpenAI e retornar o TEXTO da resposta."""
    print("\n--- PROMPT ENVIADO PARA A IA ---"); print(prompt_content); print("--------------------------------\n")
    try:
        resposta_openai = client.chat.completions.create(
            model=model, 
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt_content}
            ],
            temperature=temperature
        )
        texto_resposta = resposta_openai.choices[0].message.content
        print("\n--- RESPOSTA BRUTA DA IA ---"); print(texto_resposta); print("--------------------------\n")
        return texto_resposta
    except Exception as e:
        print(f"Erro inesperado na chamada da API OpenAI: {e}")
        raise

def clean_and_parse_json(raw_text):
    """Limpa a string de resposta da IA e a converte para um objeto JSON."""
    cleaned_text = raw_text.strip()
    if cleaned_text.startswith("```json"):
        cleaned_text = cleaned_text[len("```json"):].strip()
    if cleaned_text.endswith("```"):
        cleaned_text = cleaned_text[:-len("```")].strip()
    return json.loads(cleaned_text)

@app.route("/gerar-plano-estudos", methods=['POST'])
def gerar_plano():
    if not client: return jsonify({"erro": "Cliente OpenAI não inicializado."}), 500
    dados_usuario = request.json
    print("DADOS DO USUÁRIO (PLANO) RECEBIDOS:", dados_usuario)
    try:
        # Lógica de construção do prompt como na última versão (V13), que já estava boa.
        info_usuario_list = [f"{key.replace('_', ' ').capitalize()}: {value}" for key, value in dados_usuario.items() if value and key not in ['horarios_estudo_dias', 'duracao_bloco_estudo_minutos', 'usuarioId']]
        prompt_info_usuario = ". ".join(info_usuario_list) + "." if info_usuario_list else "Nenhuma informação adicional fornecida."
        horarios_estudo_dias = dados_usuario.get('horarios_estudo_dias', [])
        duracao_bloco = dados_usuario.get('duracao_bloco_estudo_minutos', 60)
        data_prova_str = dados_usuario.get('data_prova')
        
        numero_semanas_total = 12
        if data_prova_str:
            try:
                data_prova = datetime.datetime.strptime(data_prova_str, "%Y-%m-%d").date()
                diferenca_dias = (data_prova - datetime.date.today()).days
                if diferenca_dias >= 0: numero_semanas_total = max(1, (diferenca_dias // 7) + (1 if diferenca_dias % 7 > 0 else 0) )
            except (ValueError, TypeError): pass 

        instrucao_duracao_geral = f"O plano deve ter uma duração total de {numero_semanas_total} semanas. Detalhe as primeiras 4 semanas dia a dia, e as restantes de forma resumida."
        if data_prova_str and numero_semanas_total <= 4:
            instrucao_duracao_geral = f"O plano deve durar {numero_semanas_total} semana(s) e ser totalmente detalhado. À medida que a data se aproxima, aumente a frequência de revisões e simulados."
        
        instrucao_horarios = ""
        if horarios_estudo_dias:
            dias_formatados = [f"- {item.get('dia','').capitalize()}: {int(item.get('horas', 0) * 60) // duracao_bloco if duracao_bloco > 0 else 0} sessões de {duracao_bloco} minutos cada." for item in horarios_estudo_dias if item.get('horas', 0) > 0]
            if dias_formatados: instrucao_horarios = "ESTRUTURA DE TEMPO OBRIGATÓRIA:\n" + "\n".join(dias_formatados)
        if not instrucao_horarios: return jsonify({"erro": "Nenhum dia de estudo válido fornecido."}), 400

        prompt_completo = (f"Crie um plano de estudos detalhado em JSON. {prompt_info_usuario}\nREGRAS:\n{instrucao_duracao_geral}\n{instrucao_horarios}\n"
                           "ESTRUTURA JSON OBRIGATÓRIA: O objeto principal é 'plano_de_estudos' com 'mensagem_inicial', 'concurso_foco', e 'visao_geral_periodos' (LISTA de objetos 'período'). "
                           "CADA 'período' DEVE ter 'periodo_descricao', 'foco_principal_periodo', 'materias_prioritarias_periodo', e (se detalhado) 'cronograma_semanal_detalhado_do_periodo' (LISTA de 'semanas'). "
                           "Cada 'semana' tem 'semana_numero_no_periodo', 'foco_da_semana_especifico', e 'dias_de_estudo' (LISTA de objetos 'dia'). "
                           "CADA 'dia' representa UM ÚNICO dia da semana e tem 'dia_da_semana' e 'atividades' (LISTA de sessões). "
                           "CADA 'atividade' DEVE ter as chaves 'materia', 'topico_sugerido', 'tipo_de_estudo' e 'duracao_sugerida_minutos'.\n"
                           "MÉTODOS DE ESTUDO: Varie os métodos e incorpore as 'Outras observações' do usuário de forma equilibrada.\n"
                           "FORMATO: APENAS JSON válido.")

        resposta_texto = call_openai_api(prompt_completo, system_message="Você gera planos de estudo em JSON, seguindo rigorosamente as especificações.", model="gpt-4o-mini", temperature=0.3)
        dados_plano_ia = clean_and_parse_json(resposta_texto)
        return jsonify(dados_plano_ia)
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({ "erro_geral": f"Ocorreu um erro no servidor: {str(e)}" }), 500

@app.route("/gerar-exercicios", methods=['POST'])
def gerar_exercicios():
    if not client: return jsonify({"erro": "Cliente OpenAI não inicializado."}), 500
    dados_req = request.json
    try:
        materia = dados_req.get('materia')
        topico = dados_req.get('topico')
        if not materia or not topico: return jsonify({"erro": "Matéria e tópico são obrigatórios."}), 400
        
        prompt_para_ia = (
            f"Crie {dados_req.get('quantidade', 5)} questões de múltipla escolha (A, B, C, D, E) sobre a matéria '{materia}' e o tópico '{topico}'. "
            f"Se informado, adeque ao estilo da banca '{dados_req.get('banca', '')}' e ao nível do concurso '{dados_req.get('concurso', '')}'.\n"
            "Para cada questão, forneça enunciado, 5 opções, a letra da resposta correta e uma explicação detalhada e precisa.\n"
            "FORMATO OBRIGATÓRIO: Um objeto JSON com a chave 'exercicios' (LISTA de objetos). "
            "Cada objeto na lista deve ter as chaves: 'enunciado' (String), 'opcoes' (LISTA de objetos com 'letra' e 'texto'), 'resposta_correta' (String, apenas a letra), e 'explicacao' (String)."
        )
        # CORREÇÃO: Chamar a API e DEPOIS fazer o parse do JSON
        resposta_texto = call_openai_api(
            prompt_para_ia, 
            system_message="Você é um especialista em criar questões de concursos em JSON.", 
            model="gpt-4o-mini", 
            temperature=0.4
        )
        dados_exercicios = clean_and_parse_json(resposta_texto)
        return jsonify(dados_exercicios)

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({ "erro_geral": f"Ocorreu um erro no servidor ao gerar exercícios: {str(e)}" }), 500

# Endpoints de Dicas
@app.route("/gerar-dica-do-dia", methods=['POST'])
def gerar_dica_do_dia():
    if not client: return jsonify({"erro": "Cliente OpenAI não inicializado."}), 500
    prompt_dica = "Forneça uma LISTA de 3 dicas estratégicas distintas e curtas para um estudante de concursos. Retorne em JSON com a chave 'dicas_geradas' (uma lista de strings)."
    try:
        dados_dica_ia_objeto = call_openai_api(prompt_dica, temperature=0.85)
        dicas_geradas = dados_dica_ia_objeto.get("dicas_geradas")
        if isinstance(dicas_geradas, list) and dicas_geradas:
            return jsonify({"dica_estrategica": random.choice(dicas_geradas)})
        else:
            return jsonify({"dica_estrategica": "Mantenha a consistência nos estudos, ela supera a intensidade."})
    except Exception as e: return jsonify({"erro_geral": f"Erro ao gerar dica: {str(e)}"}), 500

@app.route("/gerar-dicas-por-categoria", methods=['POST'])
def gerar_dicas_por_categoria():
    if not client: return jsonify({"erro": "Cliente OpenAI não inicializado."}), 500
    dados_req = request.json; categoria = dados_req.get("categoria")
    if not categoria: return jsonify({"erro": "Categoria não fornecida."}), 400
    mapa_categorias = {"gestao_de_tempo": "Gestão de Tempo", "memorizacao": "Técnicas de Memorização", "resolucao_de_questoes": "Estratégias para Questões", "bem_estar": "Bem-estar"}
    nome_cat_prompt = mapa_categorias.get(categoria, categoria.replace("_", " ").capitalize())
    prompt_dicas_cat = (f"Forneça uma lista de 3 a 5 dicas curtas sobre '{nome_cat_prompt}'. "
                        "Retorne em JSON: {\"dicas_categoria\": {\"categoria_dica\": \"Nome da Categoria\", \"dicas\": [\"Dica 1...\"]}}.")
    try:
        dados_dicas_ia = call_openai_api(prompt_dicas_cat, temperature=0.7)
        return jsonify(dados_dicas_ia)
    except Exception as e: return jsonify({"erro_geral": f"Erro ao gerar dicas da categoria: {str(e)}"}), 500

if __name__ == "__main__":
    if client: app.run(debug=True)
    else: print("Saindo: Chave OpenAI não definida.")