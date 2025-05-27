import os
import json # Para processar a resposta da IA se ela vier como string JSON
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI # Importação para a nova versão da biblioteca

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configura o cliente da API da OpenAI a partir da variável de ambiente
openai_api_key = os.getenv("OPENAI_API_KEY")
client = None # Inicializa client como None
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
    if not client: # Verifica se o cliente OpenAI foi inicializado
        return jsonify({"erro": "Cliente OpenAI não está inicializado. Verifique a configuração da chave de API no backend."}), 500

    dados_usuario = request.json

    print("===============================================")
    print("DADOS DO USUÁRIO RECEBIDOS PELO BACKEND:")
    if dados_usuario:
        for chave, valor in dados_usuario.items():
            print(f"  {chave}: {valor}")
    else:
        print("  Nenhum dado JSON recebido no corpo da requisição.")
        return jsonify({"erro": "Nenhum dado recebido do usuário."}), 400 # Retorna erro 400 (Bad Request)
    print("===============================================")

    try:
        # Construção do prompt para a IA
        prompt_usuario_info_list = []
        for key, value in dados_usuario.items():
            if value: # Adiciona apenas se o valor não for vazio ou nulo
                if key == "dias_estudo" and isinstance(value, list):
                    prompt_usuario_info_list.append(f"Dias da Semana para Estudo: {', '.join(value)}")
                else:
                    # Formata um pouco melhor o nome do campo para o prompt
                    campo_formatado = key.replace("_", " ").capitalize()
                    prompt_usuario_info_list.append(f"{campo_formatado}: {value}")

        prompt_usuario_info = ". ".join(prompt_usuario_info_list) + "."
        
        import datetime # Precisaremos para calcular a diferença de datas

        data_prova_usuario_str = dados_usuario.get('data_prova')
        fase_concurso_usuario = dados_usuario.get('fase')
            
        instrucao_duracao_e_detalhamento = ""

        if data_prova_usuario_str:
            try:
                # Calcula o número de semanas até a data da prova
                data_hoje = datetime.date.today()
                # Ajuste para o formato de data que o input type="date" retorna (YYYY-MM-DD)
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
                    instrucao_duracao_e_detalhamento = "A data da prova informada já passou ou é muito próxima. Por favor, forneça uma data futura ou selecione uma fase pré-edital. Por enquanto, gere um plano intensivo para 1 semana. "
            except ValueError:
                instrucao_duracao_e_detalhamento = "A data da prova fornecida não está em um formato válido (AAAA-MM-DD). Por favor, corrija. Por enquanto, gere um plano para 12 semanas. "
            
        elif fase_concurso_usuario == 'pos_edital_publicado': 
            instrucao_duracao_e_detalhamento = "Este é um cenário pós-edital, então crie um plano de estudos intensivo e detalhado para as próximas 6 a 8 semanas, com detalhamento semana a semana. "
        else: # Pré-edital ou estudo de base sem data
            instrucao_duracao_e_detalhamento = "Crie um plano de estudos detalhado para as próximas 12 semanas (aproximadamente 3 meses), com detalhamento semana a semana. "

        prompt_completo = (
            "Você é um mentor especialista em preparação para concursos públicos no Brasil, altamente qualificado e que se baseia nos princípios e metodologias do 'Guia Definitivo de Aprovação em Concursos Públicos' de Adriano Torres e Felipe Silva. "
            "Sua tarefa é criar um plano de estudos prático e detalhado, estritamente em formato JSON, para o perfil de usuário fornecido. O plano deve focar exclusivamente nas MATÉRIAS listadas pelo usuário. "
            f"{instrucao_duracao_e_detalhamento}" # Instrução de duração e detalhamento APRIMORADA
            "O objeto JSON principal deve ter uma chave 'plano_de_estudos'. "
            "Dentro de 'plano_de_estudos', inclua: "
            "1. 'mensagem_inicial': Uma string com uma saudação motivadora e breve introdução ao plano, mencionando o concurso foco do usuário e a duração ou objetivo do plano. "
            "2. 'concurso_foco': Uma string com o nome do concurso informado pelo usuário. "
            "3. 'visao_geral_periodos': Uma LISTA (array) de objetos, onde cada objeto representa um período maior do plano (ex: um bloco de 4 semanas, ou um mês). Cada objeto de período deve ter: "
            "    a. 'periodo_descricao': String (ex: 'Mês 1', 'Semanas 1-4', 'Bloco Inicial'). "
            "    b. 'foco_principal_periodo': String descrevendo o foco geral para aquele período. "
            "    c. 'materias_prioritarias_periodo': String ou Lista de strings com as matérias a serem priorizadas no período. "
            "    d. 'cronograma_semanal_detalhado_do_periodo': (OPCIONAL, APENAS SE SOLICITADO NO DETALHAMENTO) Uma lista (array) de objetos, onde cada objeto representa uma SEMANA. Cada objeto de semana deve ter: "
            "        i. 'semana_numero_no_periodo': Number (ex: 1, 2, 3, 4 para o detalhamento das primeiras semanas). "
            "        ii. 'foco_da_semana_especifico': String (um breve foco ou meta para aquela semana específica). "
            "        iii. 'dias_de_estudo': Uma lista (array) de objetos (UTILIZE APENAS OS DIAS DE ESTUDO FORNECIDOS PELO USUÁRIO). Cada objeto de dia deve ter as chaves: "
            "            - 'dia_da_semana': String (ex: 'Segunda-feira'). "
            "            - 'atividades': Uma LISTA de objetos (sessões de estudo). Cada sessão deve ter: 'materia' (String), 'topico_sugerido' (String), 'tipo_de_estudo' (String), 'duracao_sugerida_minutos' (Number). "
            "Instruções Adicionais Cruciais para o Plano: "
            "- As 'atividades' devem usar estritamente as MATÉRIAS INFORMADAS PELO USUÁRIO. "
            "- Adapte a intensidade, o 'tipo_de_estudo', e os focos à FASE DE PREPARAÇÃO informada. "
            "- Para MATÉRIAS de MAIOR DIFICULDADE, sugira 'tipo_de_estudo' que reforce a base e aloque tempo proporcionalmente maior. "
            "- Incorpore as OUTRAS OBSERVAÇÕES do usuário. "
            "- Utilize os princípios de organização, ciclo de estudos, revisões periódicas, motivação e disciplina do 'Guia Definitivo de Aprovação em Concursos Públicos'. "
            "A resposta deve ser APENAS o JSON puro e válido, sem nenhum texto ou comentário fora da estrutura JSON solicitada.\n\n"
            f"Informações do usuário para gerar o plano: {prompt_usuario_info}"
        )

        print("\n--- PROMPT ENVIADO PARA A IA ---")
        print(prompt_completo)
        print("--------------------------------\n")

        # Chamada à API da OpenAI
        resposta_openai = client.chat.completions.create(
            model="gpt-4o-mini", # Modelo especificado
            messages=[
                {"role": "system", "content": "Você é um assistente especialista em gerar planos de estudo para concursos públicos brasileiros, formatados estritamente em JSON, seguindo metodologias de estudo eficazes e as informações fornecidas pelo usuário."},
                {"role": "user", "content": prompt_completo}
            ],
            # response_format={"type": "json_object"} # Habilitar se o modelo suportar bem e para maior robustez
            temperature=0.5 
        )

        plano_gerado_texto = resposta_openai.choices[0].message.content
        print("\n--- RESPOSTA BRUTA DA IA ---")
        print(plano_gerado_texto)
        print("----------------------------\n")

        # Tentativa de limpar e converter a resposta da IA
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
        print(f"Erro ao decodificar JSON da IA: {e}")
        print(f"Texto recebido da IA que causou o erro (limpo): {resposta_limpa}")
        print(f"Texto original da IA: {plano_gerado_texto}")
        return jsonify({
            "erro_processamento": "A IA gerou uma resposta, mas houve um problema ao processar o formato JSON.",
            "resposta_bruta_ia": plano_gerado_texto,
            "detalhe_erro_json": str(e)
        }), 500
    except Exception as e:
        print(f"Erro ao chamar a API da OpenAI ou outro erro: {e}")
        import traceback
        traceback.print_exc() 
        return jsonify({"erro_geral": f"Ocorreu um erro ao interagir com a IA: {str(e)}"}), 500

if __name__ == "__main__":
    if not client:
        print("Saindo: Cliente OpenAI não pôde ser inicializado. Verifique a variável de ambiente OPENAI_API_KEY.")
    else:
        app.run(debug=True)