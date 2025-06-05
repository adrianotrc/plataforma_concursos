import os
import json 
import random 
import datetime 
# import re # Não precisamos mais de 're' para esta abordagem
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI 

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

app = Flask(__name__)
CORS(app) 

# Configura o cliente da API da OpenAI
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
    return "Olá, Mundo! Backend Flask pronto para IA!"

@app.route("/gerar-plano-estudos", methods=['POST'])
def gerar_plano():
    if not client: 
        return jsonify({"erro": "Cliente OpenAI não inicializado."}), 500

    dados_usuario = request.json
    
    print("===============================================")
    print("DADOS DO USUÁRIO (PLANO GRANULAR) RECEBIDOS:")
    if dados_usuario:
        for chave, valor in dados_usuario.items():
            print(f"  {chave}: {valor}")
    else:
        print("  Nenhum dado JSON recebido.")
        return jsonify({"erro": "Nenhum dado recebido."}), 400
    print("===============================================")

    try:
        # 1. Construir informações base do usuário para o prompt
        prompt_usuario_info_list = []
        # Chaves que agora vêm de forma estruturada ou são tratadas de forma especial
        chaves_excluir_da_base = ['horarios_estudo_dias', 'duracao_bloco_estudo_minutos', 'usuarioId'] 
        
        for key, value in dados_usuario.items():
            if value and key not in chaves_excluir_da_base: 
                campo_formatado = key.replace("_", " ").capitalize()
                prompt_usuario_info_list.append(f"{campo_formatado}: {value}")
        prompt_usuario_info_base = ". ".join(prompt_usuario_info_list) + "." if prompt_usuario_info_list else ""

        # 2. Usar os dados granulares de horário e duração de bloco DIRETAMENTE
        horarios_estudo_dias = dados_usuario.get('horarios_estudo_dias', []) 
        duracao_bloco_input_usuario = dados_usuario.get('duracao_bloco_estudo_minutos', 60)

        instrucao_horarios_e_blocos = "INSTRUÇÃO DE HORÁRIO ESTRITA E OBRIGATÓRIA A SER SEGUIDA PELA IA:\n"
        if horarios_estudo_dias:
            dias_com_horas_formatados = []
            for item_horario in horarios_estudo_dias:
                dia_semana = item_horario.get('dia','Indefinido').capitalize()
                horas_dia = item_horario.get('horas', 0)
                minutos_totais_dia = int(horas_dia * 60)
                
                if minutos_totais_dia > 0 and duracao_bloco_input_usuario > 0:
                    numero_blocos = minutos_totais_dia // duracao_bloco_input_usuario
                    if numero_blocos > 0:
                        dias_com_horas_formatados.append(
                            f"Para {dia_semana}: O usuário pode estudar por {horas_dia} horas. Você DEVE criar {numero_blocos} sessão(ões) de estudo para este dia, cada uma com {duracao_bloco_input_usuario} minutos."
                        )
                    else: # Horas do dia < duração do bloco
                         dias_com_horas_formatados.append(
                            f"Para {dia_semana}: O usuário tem {horas_dia} horas (ou {minutos_totais_dia} minutos) de estudo, que é menos que a duração de um bloco de {duracao_bloco_input_usuario} minutos. Crie UMA sessão de estudo com a duração total de {minutos_totais_dia} minutos para este dia."
                        )
            if dias_com_horas_formatados:
                 instrucao_horarios_e_blocos += "\n".join(dias_com_horas_formatados)
                 instrucao_horarios_e_blocos += f"\nA duração de cada sessão de estudo individual ('atividade') deve ser de {duracao_bloco_input_usuario} minutos (a menos que ajustado para dias com tempo total menor que um bloco). Distribua as matérias informadas por estas sessões e dias."
            else:
                instrucao_horarios_e_blocos = "O usuário não especificou dias/horas de estudo válidos. Crie um plano genérico para 3 dias na semana, 2 horas por dia, com sessões de 60 minutos por matéria."

        else: # Fallback se horarios_estudo_dias estiver vazio
            instrucao_horarios_e_blocos = f"O usuário não especificou dias/horas de estudo. Crie um plano genérico para 3 dias na semana, 2 horas por dia, com sessões de {duracao_bloco_input_usuario} minutos por matéria."
        
        # 3. Lógica para instrucao_duracao_e_detalhamento (como antes)
        data_prova_usuario_str = dados_usuario.get('data_prova')
        fase_concurso_usuario = dados_usuario.get('fase')
        instrucao_duracao_e_detalhamento = ""
        detalhamento_sugerido = "Detalhe o cronograma semana a semana para todo o período solicitado. "
        # ... (resto da lógica de instrucao_duracao_e_detalhamento como na Versão 7, que já estava boa)
        if data_prova_usuario_str:
            try:
                data_hoje = datetime.date.today()
                data_prova = datetime.datetime.strptime(data_prova_usuario_str, "%Y-%m-%d").date()
                diferenca_dias = (data_prova - data_hoje).days
                numero_semanas_total = diferenca_dias // 7 if diferenca_dias > 0 else 0
                if numero_semanas_total > 0:
                    instrucao_duracao_e_detalhamento = (
                        f"O plano de estudos deve cobrir o período total de aproximadamente {numero_semanas_total} semanas, desde agora até a data da prova em {data_prova_usuario_str}. "
                        "Para este período, forneça um FOCO GERAL para cada GRUPO DE 4 SEMANAS (ou para cada mês). "
                        "Adicionalmente, forneça um CRONOGRAMA SEMANAL DETALHADO (dia a dia, conforme os horários informados pelo usuário) apenas para as PRIMEIRAS 4 SEMANAS do plano. "
                        "Para os períodos subsequentes (após as primeiras 4 semanas), indique apenas o foco principal e as matérias a serem priorizadas em cada bloco de 4 semanas ou mês. "
                    )
                else:
                    instrucao_duracao_e_detalhamento = "A data da prova informada já passou ou é hoje. Gere um plano de estudos intensivo e focado para os próximos 7 dias, assumindo uma revisão final de emergência. "
                    detalhamento_sugerido = "Detalhe o cronograma dia a dia para esta semana intensiva. "
            except ValueError:
                instrucao_duracao_e_detalhamento = "A data da prova fornecida não está em um formato válido. Gere um plano de estudos detalhado para as próximas 12 semanas. "
        elif fase_concurso_usuario == 'pos_edital_publicado': 
            instrucao_duracao_e_detalhamento = "Este é um cenário pós-edital. Crie um plano de estudos intensivo e detalhado para as próximas 6 a 8 semanas. "
        else: 
            instrucao_duracao_e_detalhamento = "Crie um plano de estudos detalhado para as próximas 12 semanas (aproximadamente 3 meses). "


        # 4. Construção do prompt_completo FINAL
        prompt_completo = (
            "Você é um mentor especialista em preparação para concursos públicos no Brasil, altamente qualificado e que se baseia nos princípios e metodologias do 'Guia Definitivo de Aprovação em Concursos Públicos' de Adriano Torres e Felipe Silva. "
            "Sua tarefa é criar um plano de estudos prático e altamente detalhado, estritamente em formato JSON, para o perfil de usuário fornecido. "
            f"O plano deve focar exclusivamente nas MATÉRIAS listadas pelo usuário em 'Matérias'.\n"
            f"{instrucao_duracao_e_detalhamento}\n"
            # f"{detalhamento_sugerido}\n" # Já está incluído na instrucao_duracao_e_detalhamento
            f"{instrucao_horarios_e_blocos}\n" 
            "O objeto JSON principal deve ter uma chave 'plano_de_estudos'. "
            "Dentro de 'plano_de_estudos', inclua: "
            "1. 'mensagem_inicial': String. "
            "2. 'concurso_foco': String. "
            "3. 'visao_geral_periodos': Uma LISTA de objetos (períodos). Cada período deve ter: "
            "    a. 'periodo_descricao': String. "
            "    b. 'foco_principal_periodo': String. "
            "    c. 'materias_prioritarias_periodo': Lista de strings. "
            "    d. 'cronograma_semanal_detalhado_do_periodo': (OPCIONAL) Uma LISTA de objetos (semanas). Cada semana: "
            "        i. 'semana_numero_no_periodo': Number. "
            "        ii. 'foco_da_semana_especifico': String. "
            "        iii. 'dias_de_estudo': Uma LISTA de objetos (APENAS OS DIAS COM HORAS ESPECIFICADAS PELO USUÁRIO). Cada dia: 'dia_da_semana' (String) e 'atividades' (LISTA de objetos). "
            "            Cada 'atividade': 'materia' (String), 'topico_sugerido' (String), 'tipo_de_estudo' (String), e 'duracao_sugerida_minutos' (Number, IGUAL à duração de bloco definida pelo usuário). "
            "Instruções Adicionais Cruciais: "
            "- SIGA RIGOROSAMENTE a 'INSTRUÇÃO DE HORÁRIO ESTRITA E OBRIGATÓRIA' para número de sessões e duração por sessão. "
            "- Baseie as 'atividades' nas MATÉRIAS INFORMADAS PELO USUÁRIO. "
            "- Adapte à FASE DE PREPARAÇÃO. "
            "- Para MATÉRIAS DIFÍCEIS, reforce a base. "
            "- Incorpore 'Outras Observações do Usuário' (se houver e não forem sobre a estrutura de horários já tratada). "
            "- Use os princípios do 'Guia Definitivo de Aprovação em Concursos Públicos'. "
            "- JSON VÁLIDO. APENAS JSON.\n\n"
            f"Informações gerais do usuário (para contexto de matérias, concurso, fase, dificuldades, outras obs): {prompt_usuario_info_base}"
        )
        
        # ... (resto da chamada à OpenAI e processamento da resposta como estava antes, com temperature=0.3 ou 0.4) ...
        print("\n--- PROMPT (PLANO DETALHADO V8) ENVIADO PARA A IA ---")
        print(prompt_completo)
        print("---------------------------------------------------\n")

        resposta_openai = client.chat.completions.create(
            model="gpt-4o-mini", 
            messages=[
                {"role": "system", "content": "Você é um assistente especialista em gerar planos de estudo JSON para concursos, seguindo rigorosamente as especificações de horário diário e duração de bloco fornecidas pelo usuário."},
                {"role": "user", "content": prompt_completo}
            ],
            temperature=0.3 # Manter baixo para tentar forçar aderência
        )
        
        plano_gerado_texto = resposta_openai.choices[0].message.content
        print("\n--- RESPOSTA BRUTA DA IA (PLANO DETALHADO V8) ---")
        print(plano_gerado_texto)
        print("-----------------------------------------------\n")

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
        texto_bruto_para_erro = globals().get('plano_gerado_texto', 'Texto bruto não disponível.')
        print(f"Erro ao decodificar JSON da IA: {e}\nTexto recebido: {texto_bruto_para_erro}")
        return jsonify({
            "erro_processamento": "A IA gerou uma resposta para o plano, mas houve um problema ao processar o formato JSON.",
            "resposta_bruta_ia": texto_bruto_para_erro, "detalhe_erro_json": str(e)
        }), 500
    except Exception as e:
        print(f"Erro ao chamar a API da OpenAI ou outro erro: {e}")
        import traceback; traceback.print_exc() 
        return jsonify({"erro_geral": f"Ocorreu um erro ao interagir com a IA para o plano: {str(e)}"}), 500

# --- ENDPOINT PARA DICA DO DIA ---
# (Mantido como estava na última versão funcional)
@app.route("/gerar-dica-do-dia", methods=['POST'])
def gerar_dica_do_dia():
    # ... (código completo como antes) ...
    if not client: return jsonify({"erro": "Cliente OpenAI não inicializado."}), 500
    prompt_dica = (
        "Você é um mentor de concursos experiente, autor do 'Guia Definitivo de Aprovação em Concursos Públicos'. "
        "Forneça uma LISTA de 3 dicas estratégicas distintas, curtas (1-2 frases cada), práticas e motivadoras para um estudante de concursos públicos no Brasil. "
        "As dicas devem ser diretamente aplicáveis e baseadas nos princípios de estudo eficaz, organização, ou bem-estar discutidos no seu guia. "
        "Retorne as dicas em formato JSON com uma chave principal 'dicas_geradas', que deve ser uma lista (array) de strings, onde cada string é uma dica. "
        "Exemplo de formato: {\"dicas_geradas\": [\"Dica 1...\", \"Dica 2...\", \"Dica 3...\"]}. Não adicione nenhum outro texto ou explicação fora do JSON."
    )
    try:
        resposta_openai_dica = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "system", "content": "Você fornece listas de 3 dicas de estudo para concursos em JSON."}, {"role": "user", "content": prompt_dica}], temperature=0.85)
        dica_texto_lista = resposta_openai_dica.choices[0].message.content
        rl = dica_texto_lista.strip(); start_token, end_token = "```json", "```"; 
        if rl.startswith(start_token): rl = rl[len(start_token):]; 
        if rl.endswith(end_token): rl = rl[:-len(end_token)];
        elif rl.startswith("```") and rl.endswith("```"): rl = rl[len("```"):-len("```")]
        dados_dica_ia_objeto = json.loads(rl.strip())
        if dados_dica_ia_objeto and "dicas_geradas" in dados_dica_ia_objeto and isinstance(dados_dica_ia_objeto["dicas_geradas"], list) and len(dados_dica_ia_objeto["dicas_geradas"]) > 0:
            dica_selecionada = random.choice(dados_dica_ia_objeto["dicas_geradas"])
            return jsonify({"dica_estrategica": dica_selecionada})
        else: return jsonify({"dica_estrategica": "Não foi possível gerar uma dica variada no momento."})
    except Exception as e_dica: print(f"Erro na API de dica do dia: {e_dica}"); return jsonify({"erro_geral": f"Erro ao gerar dica: {str(e_dica)}"}), 500

# --- ENDPOINT PARA DICAS POR CATEGORIA ---
# (Mantido como estava na última versão funcional)
@app.route("/gerar-dicas-por-categoria", methods=['POST'])
def gerar_dicas_por_categoria():
    # ... (código completo como antes) ...
    if not client: return jsonify({"erro": "Cliente OpenAI não está inicializado."}), 500
    dados_req = request.json; categoria = dados_req.get("categoria")
    if not categoria: return jsonify({"erro": "Categoria não fornecida."}), 400
    mapa_categorias = {"gestao_de_tempo": "Gestão de Tempo e Organização", "memorizacao": "Técnicas de Memorização", "resolucao_de_questoes": "Estratégias para Questões", "bem_estar": "Bem-estar e Saúde Mental"}
    nome_cat_prompt = mapa_categorias.get(categoria, categoria.replace("_", " ").capitalize())
    prompt_dicas_cat = (
        f"Você é um mentor de concursos autor do 'Guia Definitivo de Aprovação'. Forneça uma lista de 3 a 5 dicas curtas e práticas sobre '{nome_cat_prompt}'. "
        "Retorne em JSON: {\"dicas_categoria\": {\"categoria_dica\": \"Nome da Categoria\", \"dicas\": [\"Dica 1...\", \"Dica 2...\"]}}. APENAS JSON."
    )
    try:
        resp_openai = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "system", "content": "Você fornece listas de dicas de estudo por categoria em JSON."}, {"role": "user", "content": prompt_dicas_cat}], temperature=0.7)
        dicas_txt = resp_openai.choices[0].message.content
        rl_dicas = dicas_txt.strip(); start_token, end_token = "```json", "```";
        if rl_dicas.startswith(start_token): rl_dicas = rl_dicas[len(start_token):]; 
        if rl_dicas.endswith(end_token): rl_dicas = rl_dicas[:-len(end_token)];
        elif rl_dicas.startswith("```") and rl_dicas.endswith("```"): rl_dicas = rl_dicas[len("```"):-len("```")]
        dados_dicas_ia = json.loads(rl_dicas.strip())
        return jsonify(dados_dicas_ia)
    except Exception as e_dica_cat: print(f"Erro na API de dicas por categoria: {e_dica_cat}"); return jsonify({"erro_geral": f"Erro ao gerar dicas da categoria: {str(e_dica_cat)}"}), 500


if __name__ == "__main__":
    if not client:
        print("Saindo: Cliente OpenAI não pôde ser inicializado. Verifique a variável de ambiente OPENAI_API_KEY.")
    else:
        app.run(debug=True)