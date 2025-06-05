import os
import json 
import random 
import datetime
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI 

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

app = Flask(__name__)
CORS(app) 

# Configura o cliente da API da OpenAI a partir da variável de ambiente
openai_api_key = os.getenv("OPENAI_API_KEY")
client = None 
if not openai_api_key:
    print("ALERTA CRÍTICO: OPENAI_API_KEY não definida. IA não funcionará.")
else:
    try:
        client = OpenAI(api_key=openai_api_key)
        print("Cliente OpenAI inicializado com sucesso.")
    except Exception as e:
        print(f"Erro ao inicializar cliente OpenAI: {e}")


@app.route("/")
def ola_mundo():
    return "Backend ConcursoIA Funcionando"

def call_openai_api(prompt_content, system_message="Você é um assistente prestativo.", model="gpt-4o-mini", temperature=0.3):
    """Função auxiliar para chamar a API da OpenAI."""
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
        
        # Limpeza do JSON
        resposta_limpa = texto_resposta.strip()
        if resposta_limpa.startswith("```json"):
            resposta_limpa = resposta_limpa[len("```json"):]
        if resposta_limpa.endswith("```"):
            resposta_limpa = resposta_limpa[:-len("```")]
        elif resposta_limpa.startswith("`"): # Caso raro de apenas um ` no início/fim
             if resposta_limpa.startswith("```"): # Checa novamente se é bloco completo
                pass
             elif resposta_limpa.startswith("`"):
                resposta_limpa = resposta_limpa[1:]
        if resposta_limpa.endswith("`"):
            if resposta_limpa.endswith("```"):
                pass
            elif resposta_limpa.endswith("`"):
                resposta_limpa = resposta_limpa[:-1]
        
        return json.loads(resposta_limpa.strip())
    except json.JSONDecodeError as e:
        print(f"Erro ao decodificar JSON da IA: {e}")
        print(f"Texto recebido da IA que causou o erro: {globals().get('texto_resposta', 'Não disponível')}")
        raise # Re-levanta a exceção para ser tratada no endpoint
    except Exception as e:
        print(f"Erro inesperado na chamada da API OpenAI: {e}")
        raise

@app.route("/gerar-plano-estudos", methods=['POST'])
def gerar_plano():
    if not client: 
        return jsonify({"erro": "Cliente OpenAI não está inicializado."}), 500

    dados_usuario = request.json
    print("DADOS DO USUÁRIO (PLANO) RECEBIDOS:", dados_usuario)

    try:
        # 1. Montar informações base do usuário
        info_usuario_list = [f"{key.replace('_', ' ').capitalize()}: {value}" 
                             for key, value in dados_usuario.items() 
                             if value and key not in ['horarios_estudo_dias', 'duracao_bloco_estudo_minutos', 'usuarioId']]
        prompt_info_usuario = ". ".join(info_usuario_list) + "." if info_usuario_list else "Nenhuma informação adicional fornecida."

        # 2. Montar instrução de tempo e duração do plano
        horarios_estudo_dias = dados_usuario.get('horarios_estudo_dias', [])
        duracao_bloco = dados_usuario.get('duracao_bloco_estudo_minutos', 60)
        data_prova_str = dados_usuario.get('data_prova')
        
        numero_semanas_total = 12 # Padrão
        instrucao_duracao_geral = "O plano deve ter uma duração total de 12 semanas. As 4 primeiras semanas devem ser detalhadas dia a dia, e as 8 seguintes de forma resumida (foco e matérias por período)."
        if data_prova_str:
            try:
                data_prova = datetime.datetime.strptime(data_prova_str, "%Y-%m-%d").date()
                diferenca_dias = (data_prova - datetime.date.today()).days
                if diferenca_dias >= 0: # Se a data for hoje ou no futuro
                    numero_semanas_total = max(1, (diferenca_dias // 7) + (1 if diferenca_dias % 7 > 0 else 0) ) # Arredonda para cima
                    detalhamento_semanas = 4 if numero_semanas_total > 4 else numero_semanas_total
                    instrucao_duracao_geral = (
                        f"O plano de estudos deve cobrir exatamente {numero_semanas_total} semana(s), terminando na semana da prova ({data_prova_str}). "
                        f"Detalhe CADA DIA das primeiras {detalhamento_semanas} semanas. "
                        f"Se {numero_semanas_total} > {detalhamento_semanas}, as semanas restantes ({detalhamento_semanas + 1} a {numero_semanas_total}) devem ser resumidas com foco e matérias prioritárias por período. "
                        "Próximo à data da prova, intensifique revisões e simulados."
                    )
                else: # Data no passado
                    instrucao_duracao_geral = "A data da prova informada já passou. Gere um plano padrão de 12 semanas (4 detalhadas, 8 resumidas)."
            except (ValueError, TypeError):
                pass 

        instrucao_horarios = ""
        if horarios_estudo_dias:
            dias_formatados_prompt = []
            for item in horarios_estudo_dias:
                dia = item.get('dia','').capitalize()
                horas = item.get('horas', 0)
                if dia and horas > 0:
                    minutos_totais = int(horas * 60)
                    blocos = minutos_totais // duracao_bloco if duracao_bloco > 0 else 0
                    if blocos > 0:
                        dias_formatados_prompt.append(f"- {dia}: {horas}h de estudo. Criar {blocos} sessões de {duracao_bloco} minutos cada.")
                    elif minutos_totais > 0: # Menos que 1 bloco, mas ainda tem tempo
                        dias_formatados_prompt.append(f"- {dia}: {horas}h de estudo. Criar 1 sessão de {minutos_totais} minutos.")
            if dias_formatados_prompt:
                instrucao_horarios = "ESTRUTURA DE TEMPO OBRIGATÓRIA PARA CADA SEMANA DETALHADA:\n" + "\n".join(dias_formatados_prompt)
        
        if not instrucao_horarios: # Fallback se nenhum dia válido foi selecionado
            return jsonify({"erro": "Nenhum dia ou hora de estudo válido foi fornecido."}), 400

        # 3. Construção do Prompt Final
        prompt_completo = (
            "Você é um mentor especialista em preparação para concursos. Crie um plano de estudos em formato JSON para o usuário. "
            f"**Informações do Usuário:**\n{prompt_info_usuario}\n\n"
            "**Regras Obrigatórias para o Plano:**\n"
            f"1.  **DURAÇÃO TOTAL DO PLANO:** {instrucao_duracao_geral}\n"
            f"2.  **ESTRUTURA DE ESTUDO DIÁRIO (PARA SEMANAS DETALHADAS):**\n{instrucao_horarios}\n"
            "3.  **CONTEÚDO DAS ATIVIDADES:** Para cada sessão de estudo, você DEVE definir as chaves: 'materia' (String, uma das informadas pelo usuário), 'topico_sugerido' (String, seja específico), e 'tipo_de_estudo' (String, varie entre 'Leitura Teórica', 'Resolução de Questões', 'Revisão Ativa', 'Simulado'). Incorpore 'Criação de Mapa Mental' de forma equilibrada se o usuário mencionou em 'Outras observações'.\n"
            "4.  **FORMATO JSON (SIGA ESTRITAMENTE):**\n"
            "   O objeto principal é 'plano_de_estudos'.\n"
            "   Dentro dele: 'mensagem_inicial', 'concurso_foco', 'visao_geral_periodos' (LISTA de objetos 'período').\n"
            "   CADA objeto 'período' TEM: 'periodo_descricao', 'foco_principal_periodo', 'materias_prioritarias_periodo'.\n"
            "   Se o período for detalhado, ELE TAMBÉM TEM a chave 'cronograma_semanal_detalhado_do_periodo' (LISTA de 'semanas').\n"
            "   Cada 'semana' TEM: 'semana_numero_no_periodo', 'foco_da_semana_especifico', 'dias_de_estudo' (LISTA de objetos 'dia').\n"
            "   CADA objeto 'dia' DEVE representar um único dia da semana que o usuário selecionou e DEVE ter 'dia_da_semana' e 'atividades' (LISTA de sessões).\n"
            "   A chave 'atividades' DEVE conter o número exato de sessões calculado na 'ESTRUTURA DE TEMPO OBRIGATÓRIA', e cada sessão DEVE ter 'duracao_sugerida_minutos' igual à duração do bloco informada.\n"
            "   A resposta deve ser APENAS o JSON puro e válido.\n\n"
            "**Exemplo de um objeto 'dia_de_estudo' DENTRO DE UMA 'semana' (preencha todas as atividades para os dias informados pelo usuário):\n**"
            "```json\n"
            # ... (O exemplo JSON foi removido para não confundir a IA, ela deve seguir as instruções textuais)
            "```\n" # Apenas para fechar o bloco do exemplo, que agora está vazio.
            "Agora, gere o plano completo."
        )
        
        dados_plano_preenchido = call_openai_api(
            prompt_completo, 
            system_message="Você gera planos de estudo JSON seguindo rigorosamente as especificações de tempo, estrutura e conteúdo.",
            temperature=0.2
        )
        return jsonify(dados_plano_preenchido)

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({ "erro_geral": f"Ocorreu um erro geral no servidor: {str(e)}" }), 500

@app.route("/gerar-dica-do-dia", methods=['POST'])
def gerar_dica_do_dia():
    if not client: return jsonify({"erro": "Cliente OpenAI não inicializado."}), 500
    prompt_dica = (
        "Você é um mentor de concursos experiente. Forneça uma LISTA de 3 dicas estratégicas distintas, curtas (1-2 frases cada), práticas e motivadoras para um estudante de concursos. "
        "Retorne em JSON com a chave principal 'dicas_geradas', que deve ser uma lista de strings. "
        "Exemplo: {\"dicas_geradas\": [\"Dica 1...\", \"Dica 2...\", \"Dica 3...\"]}. Não adicione nenhum outro texto ou explicação fora do JSON."
    )
    try:
        dados_dica_ia_objeto = call_openai_api(prompt_dica, system_message="Você fornece listas de 3 dicas de estudo para concursos em JSON.", temperature=0.85)
        
        # CORREÇÃO DO ERRO DE SINTAXE AQUI:
        if dados_dica_ia_objeto and dados_dica_ia_objeto.get("dicas_geradas") and \
           isinstance(dados_dica_ia_objeto["dicas_geradas"], list) and \
           len(dados_dica_ia_objeto["dicas_geradas"]) > 0:
            dica_selecionada = random.choice(dados_dica_ia_objeto["dicas_geradas"])
            return jsonify({"dica_estrategica": dica_selecionada})
        else: 
            print("Resposta inesperada da IA para dica do dia:", dados_dica_ia_objeto)
            return jsonify({"dica_estrategica": "Dica padrão: Mantenha a consistência nos estudos!"})
    except Exception as e_dica: 
        print(f"Erro na API de dica do dia: {e_dica}")
        return jsonify({"erro_geral": f"Erro ao gerar dica: {str(e_dica)}"}), 500

@app.route("/gerar-dicas-por-categoria", methods=['POST'])
def gerar_dicas_por_categoria():
    if not client: return jsonify({"erro": "Cliente OpenAI não inicializado."}), 500
    dados_req = request.json; categoria = dados_req.get("categoria")
    if not categoria: return jsonify({"erro": "Categoria não fornecida."}), 400
    mapa_categorias = {"gestao_de_tempo": "Gestão de Tempo", "memorizacao": "Técnicas de Memorização", "resolucao_de_questoes": "Estratégias para Questões", "bem_estar": "Bem-estar"}
    nome_cat_prompt = mapa_categorias.get(categoria, categoria.replace("_", " ").capitalize())
    prompt_dicas_cat = (
        f"Você é um mentor de concursos. Forneça uma lista de 3 a 5 dicas curtas e práticas sobre '{nome_cat_prompt}'. "
        "Retorne em JSON: {\"dicas_categoria\": {\"categoria_dica\": \"Nome da Categoria\", \"dicas\": [\"Dica 1...\", \"Dica 2...\"]}}. APENAS JSON."
    )
    try:
        dados_dicas_ia = call_openai_api(prompt_dicas_cat, system_message="Você fornece listas de dicas de estudo por categoria em JSON.", temperature=0.7)
        return jsonify(dados_dicas_ia)
    except Exception as e_dica_cat: 
        print(f"Erro na API de dicas por categoria: {e_dica_cat}")
        return jsonify({"erro_geral": f"Erro ao gerar dicas da categoria: {str(e_dica_cat)}"}), 500

if __name__ == "__main__":
    if not client:
        print("Saindo: Chave OpenAI não definida.")
    else:
        app.run(debug=True)