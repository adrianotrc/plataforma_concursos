import os
import json 
import random # Adicionado para selecionar dicas aleatoriamente
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI 
import datetime

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

app = Flask(__name__)
CORS(app) 

# Configura o cliente da API da OpenAI a partir da variável de ambiente
openai_api_key = os.getenv("OPENAI_API_KEY")
client = None 
if not openai_api_key:
    print("ALERTA CRÍTICO: A variável de ambiente OPENAI_API_KEY não foi definida no arquivo .env. A funcionalidade de IA não funcionará.")
else:
    try:
        client = OpenAI(api_key=openai_api_key)
        print("Cliente OpenAI inicializado com sucesso usando a chave da API.")
    except Exception as e:
        print(f"Erro ao inicializar o cliente OpenAI: {e}")


@app.route("/")
def ola_mundo():
    return "Olá, Mundo! Meu backend Flask está funcionando e pronto para IA!"

@app.route("/gerar-plano-estudos", methods=['POST'])
def gerar_plano():
    # ... (Seu código da função gerar_plano como estava na última versão, sem alterações aqui)
    if not client: 
        return jsonify({"erro": "Cliente OpenAI não está inicializado. Verifique a configuração da chave de API no backend."}), 500
    dados_usuario = request.json
    print("===============================================")
    print("DADOS DO USUÁRIO (PLANO) RECEBIDOS PELO BACKEND:")
    if dados_usuario:
        for chave, valor in dados_usuario.items():
            print(f"  {chave}: {valor}")
    else:
        print("  Nenhum dado JSON recebido no corpo da requisição.")
        return jsonify({"erro": "Nenhum dado recebido do usuário."}), 400
    print("===============================================")
    try:
        prompt_usuario_info_list = []
        for key, value in dados_usuario.items():
            if value: 
                if key == "dias_estudo" and isinstance(value, list):
                    prompt_usuario_info_list.append(f"Dias da Semana para Estudo: {', '.join(value)}")
                else:
                    campo_formatado = key.replace("_", " ").capitalize()
                    prompt_usuario_info_list.append(f"{campo_formatado}: {value}")
        prompt_usuario_info = ". ".join(prompt_usuario_info_list) + "."
        data_prova_usuario_str = dados_usuario.get('data_prova')
        fase_concurso_usuario = dados_usuario.get('fase')
        instrucao_duracao_e_detalhamento = ""
        detalhamento_sugerido = "Detalhe o cronograma semana a semana para todo o período solicitado. "
        if data_prova_usuario_str:
            try:
                data_hoje = datetime.date.today()
                data_prova = datetime.datetime.strptime(data_prova_usuario_str, "%Y-%m-%d").date()
                diferenca_dias = (data_prova - data_hoje).days
                numero_semanas_total = diferenca_dias // 7
                if numero_semanas_total > 0:
                    instrucao_duracao_e_detalhamento = (
                        f"O plano de estudos deve cobrir o período total de aproximadamente {numero_semanas_total} semanas, desde agora até a data da prova em {data_prova_usuario_str}. "
                        "Para este período, forneça um FOCO GERAL para cada GRUPO DE 4 SEMANAS (ou para cada mês, se preferir). "
                        "Adicionalmente, forneça um CRONOGRAMA SEMANAL DETALHADO (dia a dia, com matérias, tópicos sugeridos, tipo de estudo e duração em minutos para cada atividade) apenas para as PRIMEIRAS 4 SEMANAS do plano. "
                        "Para os períodos subsequentes (após as primeiras 4 semanas), indique apenas o foco principal e as matérias a serem priorizadas em cada bloco de 4 semanas ou mês. "
                    )
                else:
                    instrucao_duracao_e_detalhamento = "A data da prova informada já passou ou é muito próxima. Gere um plano intensivo para 1 semana. "
            except ValueError:
                instrucao_duracao_e_detalhamento = "A data da prova fornecida não está em um formato válido (AAAA-MM-DD). Gere um plano para 12 semanas. "
        elif fase_concurso_usuario == 'pos_edital_publicado': 
            instrucao_duracao_e_detalhamento = "Este é um cenário pós-edital, então crie um plano de estudos intensivo e detalhado para as próximas 6 a 8 semanas, com detalhamento semana a semana. "
        else: 
            instrucao_duracao_e_detalhamento = "Crie um plano de estudos detalhado para as próximas 12 semanas (aproximadamente 3 meses), com detalhamento semana a semana. "
        prompt_completo = (
            "Você é um mentor especialista em preparação para concursos públicos no Brasil, altamente qualificado e que se baseia nos princípios e metodologias do 'Guia Definitivo de Aprovação em Concursos Públicos' de Adriano Torres e Felipe Silva. "
            "Sua tarefa é criar um plano de estudos prático e detalhado, estritamente em formato JSON, para o perfil de usuário fornecido. O plano deve focar exclusivamente nas MATÉRIAS listadas pelo usuário. "
            f"{instrucao_duracao_e_detalhamento}" 
            f"{detalhamento_sugerido}" 
            "O objeto JSON principal deve ter uma chave 'plano_de_estudos'. "
            "Dentro de 'plano_de_estudos', inclua: "
            "1. 'mensagem_inicial': Uma string com uma saudação motivadora e breve introdução ao plano. "
            "2. 'concurso_foco': Uma string com o nome do concurso informado pelo usuário. "
            "3. 'visao_geral_periodos': Uma LISTA de objetos (períodos/meses/blocos de semanas). Cada período deve ter: "
            "    a. 'periodo_descricao': String. "
            "    b. 'foco_principal_periodo': String. "
            "    c. 'materias_prioritarias_periodo': Lista de strings. "
            "    d. 'cronograma_semanal_detalhado_do_periodo': (OPCIONAL, APENAS SE SOLICITADO NO DETALHAMENTO PARA AS PRIMEIRAS SEMANAS) Uma LISTA de objetos (semanas). Cada semana deve ter: "
            "        i. 'semana_numero_no_periodo': Number. "
            "        ii. 'foco_da_semana_especifico': String. "
            "        iii. 'dias_de_estudo': Uma LISTA de objetos (dias). Cada dia deve ter 'dia_da_semana' (String) e 'atividades' (LISTA de objetos, cada um com 'materia', 'topico_sugerido', 'tipo_de_estudo', 'duracao_sugerida_minutos'). "
            "Instruções Adicionais Cruciais para o Plano: "
            "- As 'atividades' devem usar estritamente as MATÉRIAS INFORMADAS PELO USUÁRIO. "
            "- Adapte a intensidade, o 'tipo_de_estudo', e os focos à FASE DE PREPARAÇÃO informada. "
            "- Para MATÉRIAS de MAIOR DIFICULDADE, sugira 'tipo_de_estudo' que reforce a base e aloque tempo proporcionalmente maior. "
            "- Incorpore as OUTRAS OBSERVAÇÕES do usuário. "
            "- Utilize os princípios de organização, ciclo de estudos, revisões periódicas, motivação e disciplina do 'Guia Definitivo de Aprovação em Concursos Públicos'. "
            "A resposta deve ser APENAS o JSON puro e válido, sem nenhum texto ou comentário fora da estrutura JSON solicitada.\n\n"
            f"Informações do usuário para gerar o plano: {prompt_usuario_info}"
        )
        print("\n--- PROMPT (PLANO) ENVIADO PARA A IA ---")
        print(prompt_completo)
        print("---------------------------------------\n")
        resposta_openai = client.chat.completions.create(
            model="gpt-4o-mini", 
            messages=[
                {"role": "system", "content": "Você é um assistente especialista em gerar planos de estudo para concursos públicos brasileiros, formatados estritamente em JSON, seguindo metodologias de estudo eficazes e as informações fornecidas pelo usuário."},
                {"role": "user", "content": prompt_completo}
            ],
            temperature=0.5 
        )
        plano_gerado_texto = resposta_openai.choices[0].message.content
        print("\n--- RESPOSTA BRUTA DA IA (PLANO) ---")
        print(plano_gerado_texto)
        print("-----------------------------------\n")
        resposta_limpa = plano_gerado_texto.strip()
        if resposta_limpa.startswith("```json"):
            resposta_limpa = resposta_limpa[len("```json"):] 
            if resposta_limpa.endswith("```"):
                resposta_limpa = resposta_limpa[:-len("```")] 
        elif resposta_limpa.startswith("```"): 
            resposta_limpa = resposta_limpa[len("```"):]
            if resposta_limpa.endswith("```"):
                resposta_limpa = resposta_limpa[:-len("```")]
        dados_plano_ia = json.loads(resposta_limpa.strip())
        return jsonify(dados_plano_ia)
    except json.JSONDecodeError as e:
        return jsonify({
            "erro_processamento": "A IA gerou uma resposta para o plano, mas houve um problema ao processar o formato JSON.",
            "resposta_bruta_ia": plano_gerado_texto,
            "detalhe_erro_json": str(e)
        }), 500
    except Exception as e:
        return jsonify({"erro_geral": f"Ocorreu um erro ao interagir com a IA para o plano: {str(e)}"}), 500

# --- ENDPOINT PARA DICA DO DIA (MODIFICADO) ---
@app.route("/gerar-dica-do-dia", methods=['POST'])
def gerar_dica_do_dia():
    if not client:
        return jsonify({"erro": "Cliente OpenAI não está inicializado."}), 500

    dados_req = request.json
    uid_usuario = dados_req.get("usuarioId") 
    # No futuro, podemos usar uid_usuario para buscar contexto e personalizar mais.

    prompt_dica = (
        "Você é um mentor de concursos experiente, autor do 'Guia Definitivo de Aprovação em Concursos Públicos'. "
        "Forneça uma LISTA de 3 dicas estratégicas distintas, curtas (1-2 frases cada), práticas e motivadoras para um estudante de concursos públicos no Brasil. "
        "As dicas devem ser diretamente aplicáveis e baseadas nos princípios de estudo eficaz, organização, ou bem-estar discutidos no seu guia. "
        "Retorne as dicas em formato JSON com uma chave principal 'dicas_geradas', que deve ser uma lista (array) de strings, onde cada string é uma dica. "
        "Exemplo de formato: {\"dicas_geradas\": [\"Dica 1...\", \"Dica 2...\", \"Dica 3...\"]}. Não adicione nenhum outro texto ou explicação fora do JSON."
    )

    print("\n--- PROMPT (DICA DO DIA) ENVIADO PARA A IA ---")
    print(prompt_dica)
    print("----------------------------------------------\n")

    try:
        resposta_openai_dica = client.chat.completions.create(
            model="gpt-4o-mini", 
            messages=[
                {"role": "system", "content": "Você é um assistente que fornece listas de 3 dicas de estudo para concursos em formato JSON, baseadas em um guia específico."},
                {"role": "user", "content": prompt_dica}
            ],
            temperature=0.8 # Aumentei um pouco a temperatura para tentar mais variedade nas 3 dicas
        )
        
        dica_texto_lista = resposta_openai_dica.choices[0].message.content
        print("\n--- RESPOSTA BRUTA DA IA (LISTA DE DICAS DO DIA) ---")
        print(dica_texto_lista)
        print("-----------------------------------------------------\n")

        resposta_limpa_dica_lista = dica_texto_lista.strip()
        if resposta_limpa_dica_lista.startswith("```json"):
            resposta_limpa_dica_lista = resposta_limpa_dica_lista[len("```json"):]
            if resposta_limpa_dica_lista.endswith("```"):
                resposta_limpa_dica_lista = resposta_limpa_dica_lista[:-len("```")]
        elif resposta_limpa_dica_lista.startswith("```"):
            resposta_limpa_dica_lista = resposta_limpa_dica_lista[len("```"):]
            if resposta_limpa_dica_lista.endswith("```"):
                resposta_limpa_dica_lista = resposta_limpa_dica_lista[:-len("```")]
        
        dados_dica_ia_objeto = json.loads(resposta_limpa_dica_lista.strip())

        if dados_dica_ia_objeto and "dicas_geradas" in dados_dica_ia_objeto and isinstance(dados_dica_ia_objeto["dicas_geradas"], list) and len(dados_dica_ia_objeto["dicas_geradas"]) > 0:
            dica_selecionada = random.choice(dados_dica_ia_objeto["dicas_geradas"])
            return jsonify({"dica_estrategica": dica_selecionada}) # Envia apenas uma dica selecionada
        else:
            print("A IA não retornou a lista 'dicas_geradas' no formato esperado.")
            return jsonify({"dica_estrategica": "Não foi possível gerar uma dica variada no momento. Tente novamente."})


    except json.JSONDecodeError as e_dica:
        print(f"Erro ao decodificar JSON da IA (dica do dia): {e_dica}")
        print(f"Texto recebido da IA que causou o erro: {dica_texto_lista}")
        return jsonify({
            "erro_processamento": "A IA gerou uma dica, mas houve um problema ao processar o formato JSON.",
            "resposta_bruta_ia": dica_texto_lista
        }), 500
    except Exception as e_dica_geral:
        print(f"Erro ao chamar a API da OpenAI ou outro erro (dica do dia): {e_dica_geral}")
        import traceback
        traceback.print_exc()
        return jsonify({"erro_geral": f"Ocorreu um erro ao interagir com a IA para a dica do dia: {str(e_dica_geral)}"}), 500


# --- ENDPOINT PARA DICAS POR CATEGORIA (Mantido como antes) ---
@app.route("/gerar-dicas-por-categoria", methods=['POST'])
def gerar_dicas_por_categoria():
    if not client:
        return jsonify({"erro": "Cliente OpenAI não está inicializado."}), 500

    dados_req = request.json
    categoria = dados_req.get("categoria") 

    if not categoria:
        return jsonify({"erro": "Categoria não fornecida."}), 400

    print(f"\nLOG FLASK: Recebida solicitação de dicas para a categoria: {categoria}")

    mapa_categorias = {
        "gestao_de_tempo": "Gestão de Tempo e Organização dos Estudos",
        "memorizacao": "Técnicas de Memorização e Fixação de Conteúdo",
        "resolucao_de_questoes": "Estratégias para Resolução de Questões de Prova",
        "bem_estar": "Bem-estar e Saúde Mental durante a Preparação"
    }
    nome_categoria_para_prompt = mapa_categorias.get(categoria, categoria.replace("_", " ").capitalize())

    prompt_dicas_categoria = (
        "Você é um mentor de concursos experiente, autor do 'Guia Definitivo de Aprovação em Concursos Públicos'. "
        f"Forneça uma lista de 3 a 5 dicas estratégicas distintas, curtas, práticas e motivadoras sobre o tema '{nome_categoria_para_prompt}' para um estudante de concursos públicos no Brasil. "
        "As dicas devem ser diretamente aplicáveis e baseadas nos princípios de estudo eficaz discutidos no seu guia. "
        "Retorne as dicas em formato JSON com uma chave principal 'dicas_categoria'. Dentro dela, coloque uma chave 'categoria_dica' com o nome da categoria solicitada e uma chave 'dicas' que seja uma lista (array) de strings, onde cada string é uma dica. "
        "Exemplo de formato: {\"dicas_categoria\": {\"categoria_dica\": \"Gestão de Tempo\", \"dicas\": [\"Dica 1...\", \"Dica 2...\"]}}. "
        "Não adicione nenhum outro texto ou explicação fora do JSON."
    )

    print("\n--- PROMPT (DICAS CATEGORIA) ENVIADO PARA A IA ---")
    print(prompt_dicas_categoria)
    print("---------------------------------------------------\n")

    try:
        resposta_openai = client.chat.completions.create(
            model="gpt-4o-mini", 
            messages=[
                {"role": "system", "content": "Você é um assistente que fornece listas de dicas de estudo para concursos em formato JSON, baseadas em um guia e categoria específicos."},
                {"role": "user", "content": prompt_dicas_categoria}
            ],
            temperature=0.7 # Mantido em 0.7 para dicas de categoria, pode ajustar
        )
        
        dicas_texto = resposta_openai.choices[0].message.content
        print("\n--- RESPOSTA BRUTA DA IA (DICAS CATEGORIA) ---")
        print(dicas_texto)
        print("----------------------------------------------\n")

        resposta_limpa_dicas = dicas_texto.strip()
        if resposta_limpa_dicas.startswith("```json"):
            resposta_limpa_dicas = resposta_limpa_dicas[len("```json"):]
            if resposta_limpa_dicas.endswith("```"):
                resposta_limpa_dicas = resposta_limpa_dicas[:-len("```")]
        elif resposta_limpa_dicas.startswith("```"):
            resposta_limpa_dicas = resposta_limpa_dicas[len("```"):]
            if resposta_limpa_dicas.endswith("```"):
                resposta_limpa_dicas = resposta_limpa_dicas[:-len("```")]
        
        dados_dicas_ia = json.loads(resposta_limpa_dicas.strip())
        return jsonify(dados_dicas_ia)

    except json.JSONDecodeError as e_dica_cat:
        print(f"Erro ao decodificar JSON da IA (dicas categoria): {e_dica_cat}")
        print(f"Texto recebido da IA que causou o erro: {dicas_texto}")
        return jsonify({
            "erro_processamento": "A IA gerou dicas para a categoria, mas houve um problema ao processar o formato JSON.",
            "resposta_bruta_ia": dicas_texto
        }), 500
    except Exception as e_dica_cat_geral:
        print(f"Erro ao chamar a API da OpenAI ou outro erro (dicas categoria): {e_dica_cat_geral}")
        import traceback
        traceback.print_exc()
        return jsonify({"erro_geral": f"Ocorreu um erro ao interagir com a IA para as dicas da categoria: {str(e_dica_cat_geral)}"}), 500


if __name__ == "__main__":
    if not client:
        print("Saindo: Cliente OpenAI não pôde ser inicializado. Verifique a variável de ambiente OPENAI_API_KEY.")
    else:
        app.run(debug=True)