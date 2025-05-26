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

        duracao_plano_meses = 3 # Exemplo, podemos tornar isso um input do usuário no futuro
        instrucao_duracao = f"Crie um plano de estudos com duração aproximada de {duracao_plano_meses} meses. "
        if dados_usuario.get('data_prova'):
            instrucao_duracao = f"Crie um plano de estudos que se estenda até a data da prova: {dados_usuario.get('data_prova')}. "


        prompt_completo = (
                "Você é um mentor especialista em preparação para concursos públicos no Brasil, altamente qualificado e que se baseia nos princípios e metodologias do 'Guia Definitivo de Aprovação em Concursos Públicos' de Adriano Torres e Felipe Silva. "
                "Sua tarefa é criar um plano de estudos de médio a longo prazo, prático e detalhado, estritamente em formato JSON, para o perfil de usuário fornecido. O plano deve focar nas MATÉRIAS listadas pelo usuário. "
                f"{instrucao_duracao}" # Adiciona a instrução de duração
                "O objeto JSON principal deve ter uma chave 'plano_de_estudos'. "
                "Dentro de 'plano_de_estudos', inclua: "
                "1. 'mensagem_inicial': Uma string com uma saudação motivadora e breve introdução ao plano, mencionando o concurso foco do usuário e a duração do plano. "
                "2. 'concurso_foco': Uma string com o nome do concurso informado pelo usuário. "
                "3. 'estrutura_geral_meses': Uma lista (array) de objetos, onde cada objeto representa um MÊS do plano. Cada objeto de mês deve ter: "
                "    a. 'mes': String (ex: 'Mês 1', 'Mês 2'). "
                "    b. 'foco_principal_mes': String descrevendo o foco geral para aquele mês (ex: 'Construção de base teórica nas matérias principais', 'Intensificação de exercícios e primeiras revisões', 'Revisões gerais e simulados'). "
                "    c. 'cronograma_semanal_tipo': Uma lista (array) de objetos para uma SEMANA TIPO daquele mês. Cada objeto nesta lista representa um dia de estudo (usando os DIAS DE ESTUDO FORNECIDOS PELO USUÁRIO) e deve ter as chaves: "
                "        i. 'dia_da_semana': String (ex: 'Segunda-feira'). "
                "        ii. 'atividades': String descrevendo as MATÉRIAS INFORMADAS PELO USUÁRIO a serem estudadas naquele dia, o TIPO DE ESTUDO (Teoria, Leitura de PDF, Resolução de Exercícios Específicos, Revisão Programada de Resumo/Mapa Mental, Simulados Curtos), e uma SUGESTÃO DE DURAÇÃO para cada atividade, distribuindo as horas semanais do usuário pelos seus dias de estudo. "
                "Instruções Adicionais para o Plano: "
                "- Baseie as 'atividades' estritamente nas MATÉRIAS INFORMADAS PELO USUÁRIO. Não adivinhe subtópicos, mas sugira o TIPO de estudo para cada matéria. "
                "- Adapte a progressão do 'foco_principal_mes' e o tipo de 'atividades' à FASE DE PREPARAÇÃO informada (Pré-edital geral foca em base, Pré-edital específico aprofunda e revisa, Pós-edital intensifica exercícios e revisões finais). "
                "- Considere as DIFICULDADES/FACILIDADES mencionadas para sugerir maior ou menor ênfase ou diferentes tipos de estudo para certas matérias. "
                "- Utilize os princípios de periodização, ciclo PDCA (Plan-Do-Check-Act) conceitualmente na estrutura do plano, e a importância de revisões constantes, conforme o 'Guia Definitivo de Aprovação em Concursos Públicos'. "
                "A resposta deve ser APENAS o JSON puro e válido, sem nenhum texto ou comentário adicional fora da estrutura JSON.\n\n"
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
            temperature=0.5 # Um pouco mais determinístico, mas ainda permitindo alguma variação útil
        )

        plano_gerado_texto = resposta_openai.choices[0].message.content
        print("\n--- RESPOSTA BRUTA DA IA ---")
        print(plano_gerado_texto)
        print("----------------------------\n")

        # Tentativa de limpar e converter a resposta da IA
        resposta_limpa = plano_gerado_texto.strip()
        if resposta_limpa.startswith("```json"):
            resposta_limpa = resposta_limpa[len("```json"):] # Remove ```json
            if resposta_limpa.endswith("```"):
                resposta_limpa = resposta_limpa[:-len("```")] # Remove ``` do final
        elif resposta_limpa.startswith("```"): # Caso seja apenas ```
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