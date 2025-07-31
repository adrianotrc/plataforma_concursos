# app.py

import os
import json
from datetime import datetime, timezone, timedelta
import math
import traceback
import threading
import firebase_admin
from firebase_admin import credentials, firestore, auth as firebase_auth
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS, cross_origin
from openai import OpenAI
import stripe
import resend
import numpy as np


load_dotenv()

# --- Configurações Iniciais ---
app = Flask(__name__)
CORS(app, origins=["http://127.0.0.1:5500", "http://127.0.0.1:5501", "http://localhost:5500", "http://localhost:5501", "https://iaprovas.com.br", "https://www.iaprovas.com.br"], supports_credentials=True)

# --- Inicialização dos Serviços ---
try:
    if not firebase_admin._apps:
        cred = credentials.Certificate("serviceAccountKey.json")
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"ERRO CRÍTICO: Falha ao inicializar Firebase: {e}")
    db = None

try:
    openai_api_key = os.getenv("OPENAI_API_KEY")
    client = OpenAI(api_key=openai_api_key)
except Exception as e:
    print(f"ERRO CRÍTICO: Falha ao inicializar OpenAI: {e}")
    client = None

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
resend.api_key = os.getenv("RESEND_API_KEY")

# --- Lógica de Gerenciamento de Limites de Uso ---
PLAN_LIMITS = {
    'trial': {'cronogramas': 5, 'exercicios': 5, 'discursivas': 5, 'correcoes_discursivas': 5, 'dicas': 5},
    'basico': {'cronogramas': 10, 'exercicios': 10, 'discursivas': 10, 'correcoes_discursivas': 10, 'dicas': 10},
    'intermediario': {'cronogramas': 15, 'exercicios': 15, 'discursivas': 15, 'correcoes_discursivas': 15, 'dicas': 15},
    'premium': {'cronogramas': 20, 'exercicios': 20, 'discursivas': 20, 'correcoes_discursivas': 20, 'dicas': 20},
    'anual': {'cronogramas': 20, 'exercicios': 20, 'discursivas': 20, 'correcoes_discursivas': 20, 'dicas': 20, 'flashcards': 30}
}

# Adiciona limite para flashcards nos demais planos
for plano in ['trial', 'basico', 'intermediario', 'premium']:
    PLAN_LIMITS[plano]['flashcards'] = 10 if plano == 'trial' else 30

def check_usage_and_update(user_id, feature):
    try:
        # Usa horário de Brasília (UTC-3) para reset à meia-noite
        brasilia_tz = timezone(timedelta(hours=-3))
        today_str = datetime.now(brasilia_tz).strftime('%Y-%m-%d')
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        if not user_doc.exists: return False, "Usuário não encontrado."
        user_plan = user_doc.to_dict().get('plano', 'trial')
        usage_ref = user_ref.collection('usage').document('total_trial' if user_plan == 'trial' else today_str)
        usage_doc = usage_ref.get()
        limit = PLAN_LIMITS.get(user_plan, {}).get(feature, 0)
        current_usage = usage_doc.to_dict().get(feature, 0) if usage_doc.exists else 0
        if current_usage >= limit:
            return False, f"Limite de {limit} usos para '{feature}' atingido."
        usage_ref.set({feature: firestore.Increment(1)}, merge=True)
        return True, "Uso permitido."
    except Exception as e:
        return False, "Erro ao verificar limites de uso."

# --- Funções de API ---
def call_openai_api(prompt_content, system_message, model="gpt-4o-mini"):
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt_content}
            ],
            response_format={"type": "json_object"},
            temperature=0.5,
            timeout=180.0  # Aumentado para 3 minutos
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"ERRO na chamada da API OpenAI: {e}")
        # Log mais detalhado para debugging
        if hasattr(e, 'response'):
            print(f"Status code: {e.response.status_code}")
            print(f"Response: {e.response.text}")
        raise

def get_embedding(text, model="text-embedding-3-small"):
   """Gera o vetor de embedding para um determinado texto."""
   text = text.replace("\n", " ")
   try:
       response = client.embeddings.create(input=[text], model=model)
       return response.data[0].embedding
   except Exception as e:
       print(f"ERRO ao gerar embedding para a busca: {e}")
       return None

# --- Função de Trabalho em Segundo Plano ---
def processar_plano_em_background(user_id, job_id, dados_usuario):
    print(f"BACKGROUND JOB INICIADO: {job_id} para usuário {user_id}")
    job_ref = db.collection('users').document(user_id).collection('plans').document(job_id)
    
    try:
        # Lógica de cálculo de semanas (sem alterações)
        numero_de_semanas = 4
        # ... (o resto da lógica de data permanece o mesmo) ...
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
        
        # Processa técnicas preferidas para inclusão no prompt
        tecnicas_preferidas_str = ""
        if dados_usuario.get('tecnicas_preferidas') and len(dados_usuario['tecnicas_preferidas']) > 0:
            tecnicas_list = ", ".join(dados_usuario['tecnicas_preferidas'])
            tecnicas_preferidas_str = f"\n6. **TÉCNICAS PREFERIDAS:** O aluno indicou preferência pelas seguintes técnicas: {tecnicas_list}. PRIORIZE essas técnicas sempre que possível, mas mantenha a variedade pedagógica necessária."
            # Debug temporário - remover depois
            print(f"DEBUG: Técnicas preferidas recebidas: {dados_usuario['tecnicas_preferidas']}")
        else:
            print("DEBUG: Nenhuma técnica preferida foi selecionada ou enviada.")
        
        # --- PROMPT FINAL REFORÇADO ---
        prompt = (
            "Você é um coach especialista em criar planos de estudo para concursos, baseando-se na metodologia do 'Guia Definitivo de Aprovação'. "
            "Sua tarefa é criar um plano de estudos em formato JSON, com base nos dados do aluno e nas regras estritas abaixo.\n\n"
            f"DADOS DO ALUNO:\n{json.dumps(dados_usuario, indent=2)}\n\n"
            "REGRAS DE ESTRUTURA JSON (OBRIGATÓRIO):\n"
            "1. A resposta DEVE ser um único objeto JSON.\n"
            "2. A chave principal deve ser 'plano_de_estudos'.\n"
            "3. O objeto 'plano_de_estudos' DEVE conter as chaves: 'concurso_foco', 'resumo_estrategico', e 'cronograma_semanal_detalhado'.\n"
            "4. 'cronograma_semanal_detalhado' DEVE ser uma LISTA de objetos, um para cada semana do plano.\n"
            "5. Cada objeto de semana DEVE ter 'semana_numero' e uma lista chamada 'dias_de_estudo'.\n"
            "6. Cada objeto em 'dias_de_estudo' DEVE ter 'dia_semana' e uma lista chamada 'atividades'.\n"
            "7. Cada objeto em 'atividades' DEVE ter as chaves 'materia', 'topico_sugerido', 'tipo_de_estudo', e 'duracao_minutos'.\n\n"
            "REGRAS DE CONTEÚDO E LÓGICA (CRÍTICO SEGUIR TODAS):\n"
            "1. **VARIEDADE DE MÉTODOS (REGRA MAIS IMPORTANTE):** O plano DEVE ser pedagogicamente rico. É OBRIGATÓRIO que você use uma mistura inteligente dos seguintes métodos de estudo: 'Estudo de Teoria', 'Resolução de Exercícios', 'Revisão com Autoexplicação', 'Criação de Mapa Mental' e 'Leitura de Lei Seca'. Um plano que usa apenas um ou dois métodos é considerado uma falha. Aplique o método mais adequado para cada matéria e momento do estudo.\n"
            "2. **DISTRIBUIÇÃO DE TEMPO (REGRA CRÍTICA):** Para cada dia da semana, você DEVE distribuir EXATAMENTE o tempo total informado em `disponibilidade_semanal_minutos`. Por exemplo: se o aluno informou 130 minutos para domingo, você DEVE criar atividades que somem EXATAMENTE 130 minutos. Cada atividade deve ter a duração especificada em `duracao_sessao_minutos` (ex: 30 min), e a última atividade pode ter duração menor para completar o tempo total. NUNCA ultrapasse o tempo total do dia.\n"
            "3. **DIAS E TEMPO DE ESTUDO:** Gere atividades para TODOS os dias da semana informados em `dados_usuario['disponibilidade_semanal_minutos']`. O campo 'dia_semana' na sua resposta deve ser EXATAMENTE igual à chave recebida. Use 100% do tempo de cada dia, mas NUNCA ultrapasse.\n"
            f"4. **MATÉRIAS:** O plano DEVE incluir TODAS as matérias listadas pelo aluno.\n"
            f"5. **DURAÇÃO DO PLANO:** O plano deve ter EXATAMENTE {numero_de_semanas} semanas.\n"
            "6. **RESUMO ESTRATÉGICO:** Crie um 'resumo_estrategico' curto, explicando a lógica de progressão aplicada no plano.\n"
            "7. **NÃO REPETIÇÃO DE MATÉRIAS:** NUNCA repita a mesma matéria no mesmo dia. Cada atividade em um dia deve ser de uma matéria diferente."
            f"{tecnicas_preferidas_str}"
        )
        system_message = "Você é um assistente que gera planos de estudo em formato JSON, seguindo rigorosamente a estrutura e a lógica pedagógica de progressão de estudos solicitada."
        
        resultado_ia = call_openai_api(prompt, system_message)

        if 'plano_de_estudos' not in resultado_ia or 'cronograma_semanal_detalhado' not in resultado_ia['plano_de_estudos']:
            raise ValueError("A resposta da IA não continha a estrutura de cronograma esperada.")

        plano_final = resultado_ia['plano_de_estudos']
        plano_final['status'] = 'completed'
        
        # Adiciona os dados originais do usuário que são necessários para as métricas
        plano_final['fase_concurso'] = dados_usuario.get('fase_concurso')
        plano_final['disponibilidade_semanal_minutos'] = dados_usuario.get('disponibilidade_semanal_minutos')
        plano_final['duracao_sessao_minutos'] = dados_usuario.get('duracao_sessao_minutos', 25)

        job_ref.update(plano_final)
        print(f"BACKGROUND JOB CONCLUÍDO: {job_id}")

    except Exception as e:
        print(f"!!! ERRO NO BACKGROUND JOB {job_id}: {e} !!!")
        traceback.print_exc()
        job_ref.update({
            'status': 'failed', 
            'error': str(e)
        })

def processar_refinamento_em_background(user_id, job_id, original_plan, feedback_text, tipo_refinamento):
    """Função de background para refinar um plano existente com base no feedback."""
    print(f"BACKGROUND JOB (REFINAMENTO) INICIADO: {job_id} para usuário {user_id}")
    job_ref = db.collection('users').document(user_id).collection('plans').document(job_id)

    try:
        # Verifica se o job ainda existe e não foi cancelado
        job_doc = job_ref.get()
        if not job_doc.exists:
            print(f"Job {job_id} não existe mais. Abortando refinamento.")
            return
        
        current_status = job_doc.to_dict().get('status')
        if current_status != 'processing_refinement':
            print(f"Job {job_id} não está mais em refinamento (status: {current_status}). Abortando.")
            return

        # Remove campos que não devem ser enviados de volta para a IA
        original_plan.pop('status', None)
        original_plan.pop('jobId', None)
        original_plan.pop('criadoEm', None)

        # Processa técnicas preferidas para o prompt de refinamento
        tecnicas_refinamento_str = ""
        if original_plan.get('tecnicas_preferidas') and len(original_plan['tecnicas_preferidas']) > 0:
            tecnicas_list = ", ".join(original_plan['tecnicas_preferidas'])
            tecnicas_refinamento_str = f"\n\n### TÉCNICAS PREFERIDAS DO ALUNO:\nO aluno indicou preferência por: {tecnicas_list}. Mantenha essas preferências nos ajustes sempre que possível."
        
        # Determina o tipo de refinamento baseado na seleção do usuário
        tipo_instrucao = ""
        if tipo_refinamento == "tempo-total":
            tipo_instrucao = "\n### TIPO DE AJUSTE: ALTERAÇÃO DE TEMPO TOTAL DOS DIAS\nO usuário selecionou 'Alterar tempo total dos dias'. INTERPRETE o pedido como uma solicitação para modificar o tempo total disponível para cada dia de estudo. Ajuste `disponibilidade_semanal_minutos` conforme solicitado."
        elif tipo_refinamento == "duracao-sessoes":
            tipo_instrucao = "\n### TIPO DE AJUSTE: ALTERAÇÃO DE DURAÇÃO DAS SESSÕES\nO usuário selecionou 'Alterar duração das sessões'. INTERPRETE o pedido como uma solicitação para modificar apenas `duracao_sessao_minutos`. IMPORTANTE: Mantenha o tempo total dos dias inalterado. Se o tempo total do dia for 25 min e você mudar para ciclos de 10 min, crie 2 atividades de 10 min + 1 de 5 min = 25 min total. NUNCA ultrapasse o tempo total original. CRÍTICO: Redistribua DIFERENTES matérias para cada atividade, NÃO multiplique a mesma matéria. Use matérias diferentes do plano original para cada sessão."
            tipo_instrucao += "\n\n### ALGORITMO OBRIGATÓRIO PARA MUDANÇA DE DURAÇÃO DE SESSÕES:\n1. Identifique todas as matérias do plano original (ex: Direito Constitucional, Português, Matemática, etc.)\n2. Para cada dia, pegue as matérias que estavam programadas para aquele dia\n3. Redistribua essas matérias em sessões menores usando a nova duração\n4. Se faltarem matérias, pegue outras do plano original que não estavam naquele dia\n5. NUNCA repita a mesma matéria no mesmo dia\n6. NUNCA ultrapasse o tempo total original do dia"
        elif tipo_refinamento == "mover-dias":
            tipo_instrucao = "\n### TIPO DE AJUSTE: MOVER ATIVIDADES ENTRE DIAS\nO usuário selecionou 'Mover atividades entre dias'. INTERPRETE o pedido como uma solicitação para transferir atividades de um dia para outro, mantendo duração e métodos."
        else:
            tipo_instrucao = "\n### TIPO DE AJUSTE: OUTROS\nO usuário selecionou 'Outros ajustes'. INTERPRETE o pedido conforme descrito no texto."
        
        prompt = f'''Você é um coach especialista em otimizar planos de estudo para concursos. Sua tarefa é ajustar um plano de estudos em formato JSON existente, seguindo fielmente o pedido do aluno.
        
        ### REGRA FUNDAMENTAL SOBRE REDISTRIBUIÇÃO DE MATÉRIAS:
        Quando você precisar criar múltiplas atividades em um dia (ex: mudar duração de sessões), SEMPRE use matérias diferentes do plano original. NUNCA multiplique a mesma matéria várias vezes. Exemplo: se o plano original tem Direito Constitucional, Português, Matemática e você precisa criar 3 atividades, use uma matéria diferente para cada atividade.
        
        ### PLANO ORIGINAL (JSON):
        {json.dumps(original_plan, indent=2)}
        
        {tipo_instrucao}
        
        ### PEDIDO DE AJUSTE DO ALUNO:
        """
        {feedback_text}
        """{tecnicas_refinamento_str}

### REGRAS CRÍTICAS (OBRIGATÓRIO CUMPRIR TODAS):
1. **DISTRIBUIÇÃO DE TEMPO (REGRA CRÍTICA):** Para cada dia da semana, você DEVE distribuir EXATAMENTE o tempo total informado em `disponibilidade_semanal_minutos`. Por exemplo: se o aluno informou 130 minutos para domingo, você DEVE criar atividades que somem EXATAMENTE 130 minutos. Cada atividade deve ter a duração especificada em `duracao_sessao_minutos` (ex: 30 min), e a última atividade pode ter duração menor para completar o tempo total. NUNCA ultrapasse o tempo total do dia.

2. SE o aluno pedir MUDANÇA DE TEMPO (ex.: "2 horas aos domingos", "45 minutos nas terças", "limitar todos os dias a 25 minutos"):
   • Reescreva completamente o cronograma aplicando os novos tempos.
   • Se o pedido for para "limitar" ou "reduzir" o tempo total dos dias, ajuste `disponibilidade_semanal_minutos` para o novo valor.
   • Se o pedido for para mudar a duração das sessões, ajuste `duracao_sessao_minutos` para o novo valor.
   • Cada atividade deve ter a duração especificada em `duracao_sessao_minutos`.
   • Redistribua TODAS as matérias originais nos dias com tempo disponível.
   • RESPEITE EXATAMENTE o tempo total informado para cada dia.
   • Se o tempo total for reduzido, mantenha as matérias mais importantes e remova as menos prioritárias.

3. SE o aluno pedir MUDANÇA DE DURAÇÃO DE SESSÕES (ex.: "mudar ciclos para 10 minutos"):
   • Apenas ajuste `duracao_sessao_minutos` para o novo valor.
   • MANTENHA o tempo total dos dias inalterado.
   • Redistribua as atividades para usar a nova duração de sessão.
   • Exemplo: se dia tem 25 min total e você muda para ciclos de 10 min, crie 2 atividades de 10 min + 1 de 5 min = 25 min total.
   • NUNCA ultrapasse o tempo total original do dia.
   • CRÍTICO: Use DIFERENTES matérias do plano original para cada atividade. NÃO multiplique a mesma matéria várias vezes.

4. SE o aluno pedir MUDANÇA DE DIA (ex.: "mover tudo de segunda para terça"):
   • Copie todas as atividades do(s) dia(s) de origem e cole no(s) novo(s) dia(s).
   • Preserve duração, método e ordem relativa.
   • Deixe vazio o dia que ficou sem atividades.

5. SE o aluno pedir outra alteração (mudar método, matéria específica, etc.):
   • Modifique APENAS as atividades mencionadas.
   • Mantenha todo o resto exatamente igual.

6. NÃO crie matérias nem atividades extras.
7. NÃO altere dias ou tempos não solicitados.
8. Atualize 'resumo_estrategico' adicionando ao final uma linha iniciada por "Ajuste realizado:" explicando a mudança.
9. SEMPRE considere as técnicas preferidas do aluno ao fazer ajustes nos métodos de estudo.
10. NÃO REPITA a mesma matéria no mesmo dia. Cada atividade em um dia deve ser de uma matéria diferente.

Lista oficial de nomes de dias (use exatamente estes): Domingo, Segunda-feira, Terça-feira, Quarta-feira, Quinta-feira, Sexta-feira, Sábado.

### EXEMPLOS DE INTERPRETAÇÃO:
1. Pedido: "Quero estudar Português às quartas em vez de terças"
   → Copie TODAS as atividades de Terça-feira para Quarta-feira, mantenha horários e métodos, deixe Terça-feira vazia.

2. Pedido: "Limitar todos os dias a 25 minutos"
   → Reduza `disponibilidade_semanal_minutos` de cada dia para 25 minutos, ajuste `duracao_sessao_minutos` para 25, mantenha apenas 1 atividade por dia.

3. Pedido: "Mudar ciclos para 10 minutos"
   → Apenas ajuste `duracao_sessao_minutos` para 10, mantenha o tempo total dos dias. Ex: se dia tem 25 min total, crie 2 atividades de 10 min + 1 de 5 min = 25 min total. Use matérias diferentes para cada atividade (ex: Direito Constitucional, Português, Matemática).

4. Pedido: "Reduzir domingo para 60 minutos"
   → Ajuste apenas `disponibilidade_semanal_minutos` do domingo para 60, redistribua as atividades.

### EXEMPLO ESPECÍFICO DE REDISTRIBUIÇÃO:
Plano original: Domingo tem 30 min total, 1 atividade de Direito Constitucional (30 min)
Pedido: "Mudar ciclos para 10 minutos"
Resultado CORRETO: 
- Direito Constitucional (10 min)
- Português (10 min) 
- Matemática (10 min)
= 30 min total, 3 matérias diferentes

### FORMATO DE SAÍDA
Retorne UM ÚNICO objeto JSON com a chave 'plano_de_estudos'. Nenhum texto fora do JSON.
'''
        system_message = "Você é um assistente especializado em ajustar planos de estudo. INTERPRETE CORRETAMENTE os pedidos: 'limitar tempo' = reduzir tempo total dos dias; 'mudar ciclos' = alterar duração das sessões; 'mudar dias' = mover atividades entre dias. Quando o usuário pedir mudanças de tempo, reescreva completamente o plano. Quando pedir mudanças específicas, modifique apenas o necessário. Sempre retorne JSON válido."

        resultado_ia = call_openai_api(prompt, system_message)

        if 'plano_de_estudos' not in resultado_ia:
            raise ValueError("A resposta da IA não continha a estrutura de plano esperada.")

        plano_refinado = resultado_ia['plano_de_estudos']
        plano_refinado['status'] = 'completed' # Marca como completo novamente
        plano_refinado['criadoEm'] = firestore.SERVER_TIMESTAMP # Atualiza o timestamp
        
        # Preserva os dados originais do usuário que são necessários para as métricas
        plano_refinado['fase_concurso'] = original_plan.get('fase_concurso')
        plano_refinado['disponibilidade_semanal_minutos'] = original_plan.get('disponibilidade_semanal_minutos')
        plano_refinado['duracao_sessao_minutos'] = original_plan.get('duracao_sessao_minutos', 25)
        plano_refinado['tecnicas_preferidas'] = original_plan.get('tecnicas_preferidas', [])

        job_ref.update(plano_refinado)
        print(f"BACKGROUND JOB (REFINAMENTO) CONCLUÍDO: {job_id}")

    except Exception as e:
        print(f"!!! ERRO NO BACKGROUND JOB DE REFINAMENTO {job_id}: {e} !!!")
        traceback.print_exc()
        job_ref.update({'status': 'failed', 'error': str(e)})

@app.route("/refinar-plano-estudos-async", methods=['POST'])
@cross_origin(supports_credentials=True)
def refinar_plano_estudos_async():
    """Rota que inicia o refinamento de um plano de estudos em segundo plano."""
    dados_req = request.json
    user_id = dados_req.get("userId")
    job_id = dados_req.get("jobId")
    original_plan = dados_req.get("originalPlan")
    feedback_text = dados_req.get("feedbackText")
    tipo_refinamento = dados_req.get("tipoRefinamento", "outros")

    if not all([user_id, job_id, original_plan, feedback_text]):
        return jsonify({"erro": "Dados insuficientes para refinar o plano."}), 400

    # Verifica o limite de uso da funcionalidade 'cronogramas'
    is_allowed, message = check_usage_and_update(user_id, 'cronogramas')
    if not is_allowed:
        return jsonify({"error": "limit_exceeded", "message": message}), 429

    job_ref = db.collection('users').document(user_id).collection('plans').document(job_id)

    # Atualiza o status do plano para indicar que está sendo refinado
    job_ref.update({'status': 'processing_refinement'})

    # Inicia a thread para o trabalho pesado
    thread = threading.Thread(target=processar_refinamento_em_background, args=(user_id, job_id, original_plan, feedback_text, tipo_refinamento))
    thread.start()

    return jsonify({"status": "processing_refinement", "jobId": job_id}), 202

@app.route("/gerar-plano-estudos", methods=['POST'])
@cross_origin(supports_credentials=True)
def gerar_plano_iniciar_job():
    dados_usuario = request.json
    user_id = dados_usuario.get("userId")

    # --- INÍCIO DA VERIFICAÇÃO DE LIMITE ---
    is_allowed, message = check_usage_and_update(user_id, 'cronogramas')
    if not is_allowed:
        return jsonify({"error": "limit_exceeded", "message": message}), 429
    # --- FIM DA VERIFICAÇÃO DE LIMITE ---

    if not user_id:
        return jsonify({"erro_geral": "ID do usuário não fornecido."}), 400

    # --- INÍCIO DA NOVA SEÇÃO DE CORREÇÃO ---
    # Pré-processa os dados para a IA, garantindo que os dias da semana estão corretos.
    if 'disponibilidade_semanal_minutos' in dados_usuario:
        disponibilidade = dados_usuario['disponibilidade_semanal_minutos']
        # Mapeia o nome recebido do frontend para o nome completo que a IA entende melhor
        mapa_dias = {
            "Segunda": "Segunda-feira",
            "Terca": "Terça-feira",
            "Quarta": "Quarta-feira",
            "Quinta": "Quinta-feira",
            "Sexta": "Sexta-feira",
            "Sabado": "Sábado",
            "Domingo": "Domingo"
        }
        # Cria um novo dicionário corrigido
        disponibilidade_corrigida = {mapa_dias.get(k, k): v for k, v in disponibilidade.items()}
        dados_usuario['disponibilidade_semanal_minutos'] = disponibilidade_corrigida
    # --- FIM DA NOVA SEÇÃO DE CORREÇÃO ---

    job_ref = db.collection('users').document(user_id).collection('plans').document()
    job_id = job_ref.id

    placeholder_data = {
        'status': 'processing',
        'criadoEm': firestore.SERVER_TIMESTAMP,
        'concurso_foco': dados_usuario.get('concurso_objetivo', 'Plano de Estudos'),
        'data_inicio': dados_usuario.get('data_inicio'),
        'data_termino': dados_usuario.get('data_termino'),
        'jobId': job_id
    }
    job_ref.set(placeholder_data)

    thread = threading.Thread(target=processar_plano_em_background, args=(user_id, job_id, dados_usuario))
    thread.start()

    return jsonify({"status": "processing", "jobId": job_id}), 202


# --- FUNÇÃO DE ENVIO DE E-MAIL ---
def enviar_email(para_email, nome_usuario, assunto, conteudo_html, conteudo_texto):
    if not resend.api_key:
        print("LOG DE ERRO: A chave da API do Resend (RESEND_API_KEY) não foi encontrada no ambiente.")
        return False
    
    email_remetente = "Equipe IAprovas <contato@iaprovas.com.br>" 
    params = {
        "from": email_remetente,
        "to": [para_email],
        "subject": assunto,
        "html": conteudo_html,
        "text": conteudo_texto,
    }
    
    print(f"LOG INFO: Preparando para enviar e-mail para '{para_email}' com o assunto '{assunto}'.")

    try:
        response = resend.Emails.send(params)
        # Verifica se a resposta da API contém um ID, indicando sucesso
        if response.get("id"):
            print(f"LOG SUCESSO: Resend aceitou o e-mail para '{para_email}'. ID da tarefa: {response.get('id')}")
            return True
        else:
            # Caso a API responda 200 OK mas sem um ID (cenário inesperado)
            print(f"LOG ERRO: Resposta do Resend para '{para_email}' não continha um ID de sucesso. Resposta: {response}")
            return False
            
    except Exception as e:
        # Imprime a mensagem de erro exata que a biblioteca do Resend está nos dando
        print(f"LOG ERRO CRÍTICO: A chamada para a API do Resend falhou para o e-mail '{para_email}'.")
        print(f"MENSAGEM DE ERRO EXATA: {e}")
        traceback.print_exc()
        return False
    
# --- ROTAS DA APLICAÇÃO ---

@app.route("/enviar-email-boas-vindas", methods=['POST'])
def enviar_email_boas_vindas():
    print("--- ROTA /enviar-email-boas-vindas INICIADA ---")
    dados = request.get_json()
    email_destinatario = dados.get("email")
    nome_destinatario = dados.get("nome", "estudante")
    
    print(f"Recebido pedido para enviar e-mail para: {email_destinatario}")

    if not email_destinatario:
        print("ERRO: E-mail não fornecido no pedido.")
        return jsonify({"erro": "E-mail do destinatário não fornecido."}), 400

    frontend_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")
    assunto = "Bem-vindo(a) ao IAprovas! Ação necessária para ativar sua conta."
    
    conteudo_html = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h1 style="color: #1d4ed8;">Olá, {nome_destinatario}!</h1>
        <p>Seja muito bem-vindo(a) à plataforma <strong>IAprovas</strong>! Sua conta foi criada com sucesso.</p>
        <p style="padding: 12px; background-color: #fffbeb; border-left: 4px solid #f59e0b;">
            <strong>Ação importante:</strong> Para ativar sua conta e conseguir fazer login, você receberá um segundo e-mail com um link de confirmação. Por favor, encontre-o na sua caixa de entrada (verifique também a pasta de spam) e clique no link para validar seu endereço de e-mail.
        </p>
        <p>Após confirmar seu e-mail, você terá acesso total ao seu período de teste e poderá:</p>
        <ul>
            <li>Gerar seu primeiro plano de estudos na área de <a href="{frontend_url}/cronograma.html" style="color: #1d4ed8;">Cronograma</a>.</li>
            <li>Praticar com questões na seção de <a href="{frontend_url}/exercicios.html" style="color: #1d4ed8;">Exercícios</a>.</li>
            <li>Receber conselhos na página de <a href="{frontend_url}/dicas-estrategicas.html" style="color: #1d4ed8;">Dicas Estratégicas</a>.</li>
        </ul>
        <p>Se tiver qualquer dúvida, basta responder a este e-mail.</p>
        <p>Bons estudos!</p>
        <p><strong>Equipe IAprovas</strong></p>
    </div>
    """

    conteudo_texto = f"""
    Olá, {nome_destinatario}!

    Seja muito bem-vindo(a) à plataforma IAprovas! Sua conta foi criada com sucesso.

    AÇÃO IMPORTANTE: Para ativar sua conta e conseguir fazer login, você receberá um segundo e-mail com um link de confirmação. Por favor, encontre-o e clique no link para validar seu endereço de e-mail.

    Após a confirmação, explore a plataforma!

    Bons estudos!
    Equipe IAprovas
    """
    
    print("Tentando chamar a função interna 'enviar_email'...")
    sucesso = enviar_email(email_destinatario, nome_destinatario, assunto, conteudo_html, conteudo_texto)

    if sucesso:
        print(f"Sucesso no envio para {email_destinatario}. Retornando status 200.")
        return jsonify({"mensagem": "Solicitação de e-mail de boas-vindas processada."}), 200
    else:
        print(f"FALHA no envio para {email_destinatario}. Retornando status 500.")
        return jsonify({"erro": "Falha interna ao tentar enviar o e-mail."}), 500
    
@app.route("/enviar-email-alteracao-senha", methods=['POST'])
@cross_origin(supports_credentials=True)
def enviar_email_alteracao_senha():
    dados = request.get_json()
    email_destinatario = dados.get("email")
    nome_destinatario = dados.get("nome", "estudante")
    if not email_destinatario:
        return jsonify({"erro": "E-mail não fornecido."}), 400

    assunto = "Sua senha na IAprovas foi alterada"
    conteudo_html = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h1 style="color: #1d4ed8;">Olá, {nome_destinatario}!</h1>
        <p>Este é um e-mail para confirmar que a sua senha de acesso à plataforma <strong>IAprovas</strong> foi alterada com sucesso.</p>
        <p>Se você realizou esta alteração, pode ignorar este e-mail.</p>
        <p>Se você <strong>não</strong> reconhece esta atividade, por favor, redefina sua senha imediatamente e entre em contato com nosso suporte.</p>
        <p>Atenciosamente,<br><strong>Equipe IAprovas</strong></p>
    </div>
    """
    conteudo_texto = f"Olá, {nome_destinatario}! Sua senha na IAprovas foi alterada. Se você não reconhece esta atividade, por favor, redefina sua senha e contate o suporte."

    sucesso = enviar_email(email_destinatario, nome_destinatario, assunto, conteudo_html, conteudo_texto)
    if sucesso:
        return jsonify({"mensagem": "E-mail de alteração de senha enviado."}), 200
    else:
        return jsonify({"erro": "Falha ao enviar e-mail."}), 500

@app.route("/enviar-email-alteracao-dados", methods=['POST'])
@cross_origin(supports_credentials=True)
def enviar_email_alteracao_dados():
    dados = request.get_json()
    email_destinatario = dados.get("email")
    nome_destinatario = dados.get("nome", "estudante")
    if not email_destinatario:
        return jsonify({"erro": "E-mail não fornecido."}), 400

    assunto = "Seus dados pessoais foram atualizados na IAprovas"
    conteudo_html = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h1 style="color: #1d4ed8;">Olá, {nome_destinatario}!</h1>
        <p>Confirmamos que suas informações pessoais foram atualizadas em seu perfil na <strong>IAprovas</strong>.</p>
        <p>Se você realizou esta alteração, está tudo certo. Caso não reconheça esta atividade, por favor, entre em contato com o suporte.</p>
        <p>Atenciosamente,<br><strong>Equipe IAprovas</strong></p>
    </div>
    """
    conteudo_texto = f"Olá, {nome_destinatario}! Seus dados pessoais foram atualizados na IAprovas. Se você não reconhece esta atividade, contate o suporte."

    sucesso = enviar_email(email_destinatario, nome_destinatario, assunto, conteudo_html, conteudo_texto)
    if sucesso:
        return jsonify({"mensagem": "E-mail de alteração de dados enviado."}), 200
    else:
        return jsonify({"erro": "Falha ao enviar e-mail."}), 500


@app.route("/")
def ola_mundo():
    return "Backend ConcursoIA Funcionando"


@app.route("/verificar-plano/<user_id>/<job_id>", methods=['GET'])
def verificar_plano_status(user_id, job_id):
    try:
        doc_ref = db.collection('users').document(user_id).collection('plans').document(job_id)
        doc = doc_ref.get()

        if not doc.exists:
            return jsonify({"status": "not_found"}), 404

        data = doc.to_dict()
        status = data.get('status')

        # Verifica se o plano está em processamento (incluindo refinamento)
        if status in ['processing', 'processing_refinement']:
            return jsonify({"status": "processing"})
        elif status == 'failed':
            return jsonify({"status": "failed", "error": data.get('error', 'Erro desconhecido')})
        else:
            return jsonify({"status": "completed", "plano": data})

    except Exception as e:
        print(f"Erro ao verificar status do job {job_id}: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# --- LÓGICA DE GERAÇÃO DE EXERCÍCIOS COM RAG ---
def find_similar_questions(materia, topico, tipo_questao, limit=3):
    """
    Busca no Firestore por questões semanticamente similares usando embeddings vetoriais.
    """
    try:
        print(f"DEBUG: Buscando questões para matéria={materia}, tópico={topico}, tipo_questao={tipo_questao}")

        # Cria um texto de busca combinando os inputs do usuário
        search_text = f"{materia}: {topico}"
        query_embedding = get_embedding(search_text)

        if not query_embedding:
            raise ValueError("Não foi possível gerar o embedding para a busca.")

        # Converte para um array numpy para cálculos
        query_vector = np.array(query_embedding)

        # Busca candidatas no Firestore (filtrando por matéria para otimizar)
        docs = db.collection('banco_questoes').where('materia', '==', materia).stream()
        docs_list = list(docs)
        print(f"DEBUG: Total de questões encontradas no Firestore para a matéria '{materia}': {len(docs_list)}")

        similar_questions = []
        for doc in docs_list:
            question_data = doc.to_dict()
            if 'embedding' in question_data and question_data.get('embedding'):
                question_vector = np.array(question_data['embedding'])
                # Calcula a similaridade de cosseno (um valor entre -1 e 1, onde 1 é mais similar)
                similarity = np.dot(question_vector, query_vector) / (np.linalg.norm(question_vector) * np.linalg.norm(query_vector))
                similar_questions.append((similarity, question_data))
            else:
                print(f"DEBUG: Questão sem embedding ou embedding vazio. ID: {doc.id}")

        # Ordena as questões pela similaridade, da maior para a menor
        similar_questions.sort(key=lambda x: x[0], reverse=True)

        # Pega as 'limit' questões mais similares
        top_questions = [question for similarity, question in similar_questions[:limit]]

        print(f"Busca vetorial encontrou {len(top_questions)} exemplos relevantes.")
        return top_questions

    except Exception as e:
        print(f"ERRO na busca vetorial: {e}. Usando fallback para busca simples.")
        # Fallback para a busca simples caso a busca vetorial falhe
        query_fallback = db.collection('banco_questoes').where('materia', '==', materia).where('tipo_questao', '==', tipo_questao).limit(limit)
        docs_fallback = query_fallback.stream()
        return [doc.to_dict() for doc in docs_fallback]

def processar_exercicios_em_background(user_id, job_id, dados_req):
    print(f"BACKGROUND JOB (EXERCÍCIOS RAG) INICIADO: {job_id}")
    job_ref = db.collection('users').document(user_id).collection('sessoesExercicios').document(job_id)
    
    try:
        materia = dados_req.get('materia')
        topico = dados_req.get('topico')
        quantidade = dados_req.get('quantidade', 5)
        banca = dados_req.get('banca', 'geral')
        tipo_questao = dados_req.get('tipo_questao', 'multipla_escolha')

        exemplos_questoes = find_similar_questions(materia, topico, tipo_questao)
        
        exemplos_simplificados = []
        for ex in exemplos_questoes:
            ex_copy = ex.copy()
            ex_copy.pop('avaliacoes', None); ex_copy.pop('status_revisao', None); ex_copy.pop('criadoEm', None)
            exemplos_simplificados.append(ex_copy)

        exemplos_json_str = json.dumps(exemplos_simplificados, indent=2, ensure_ascii=False)

        # --- PROMPT REFORÇADO E À PROVA DE FALHAS ---
        
        regras_de_formato_json = ""
        if tipo_questao == 'multipla_escolha':
            regras_de_formato_json = """
        - **Estrutura do Objeto de Questão:** Cada objeto deve conter as chaves: "enunciado", "opcoes", "resposta_correta", "explicacao", e "tipo_questao".
        - **Chave "tipo_questao":** O valor DEVE ser "multipla_escolha".
        - **Chave "opcoes":** O valor DEVE ser uma lista contendo EXATAMENTE 5 (cinco) objetos. Cada objeto deve ter as chaves "letra" (A, B, C, D, E) e "texto".
        """
        else: # Certo ou Errado
            regras_de_formato_json = """
        - **Estrutura do Objeto de Questão:** Cada objeto deve conter as chaves: "enunciado", "opcoes", "resposta_correta", "explicacao", e "tipo_questao".
        - **Chave "tipo_questao":** O valor DEVE ser "certo_errado".
        - **Chave "opcoes":** O valor DEVE ser uma lista VAZIA [].
        - **Chave "resposta_correta":** O valor DEVE ser a string "Certo" ou "Errado".
        """

        prompt = f"""
        Você é um assistente especialista em criar questões de concurso, extremamente rigoroso com formatos.

        ### TAREFA PRINCIPAL E INFLEXÍVEL
        Crie {quantidade} questões sobre a matéria '{materia}' e tópico '{topico}'. O formato de TODAS as questões DEVE ser, sem exceção, '{tipo_questao}'.
        Para questões de múltipla escolha, CRIE OBRIGATORIAMENTE 5 ALTERNATIVAS (A, B, C, D, E).

        ### EXEMPLOS DE REFERÊNCIA (APENAS PARA ESTILO, NÃO COPIE)
        {exemplos_json_str if exemplos_questoes else "Nenhum exemplo encontrado, use seu conhecimento geral."}

        ### REGRAS DE SAÍDA (SEGUIR RIGOROSAMENTE)
        Sua resposta final DEVE ser um único objeto JSON, contendo apenas uma chave principal chamada "exercicios", que é uma lista de objetos.

        #### ESTRUTURA DETALHADA PARA CADA OBJETO NA LISTA "exercicios":
        {regras_de_formato_json}

        ### RESTRIÇÃO CRÍTICA
        NÃO repita nenhuma das questões dos exemplos de referência. Crie questões inéditas, mesmo que sejam sobre o mesmo tema. NÃO copie enunciados, alternativas ou explicações dos exemplos.

        ### VERIFICAÇÃO FINAL (OBRIGATÓRIO)
        Antes de gerar a resposta, revise seu próprio trabalho para garantir que 100% das questões de múltipla escolha geradas possuem exatamente 5 alternativas e que nenhuma questão é igual ou muito parecida com as dos exemplos de referência.
        """
        
        system_message = "Você é um assistente que gera conteúdo JSON e segue regras de formatação com precisão absoluta."
        
        dados_ia = call_openai_api(prompt, system_message)
        
        exercicios_finais = []
        for exercicio_gerado in dados_ia.get('exercicios', []):
            if exercicio_gerado.get('tipo_questao') != tipo_questao:
                print(f"AVISO: IA gerou um tipo de questão incorreto ({exercicio_gerado.get('tipo_questao')}). Ignorando esta questão.")
                continue

            # Validação extra para o número de alternativas
            if tipo_questao == 'multipla_escolha' and len(exercicio_gerado.get('opcoes', [])) != 5:
                print(f"AVISO: IA gerou um número incorreto de alternativas ({len(exercicio_gerado.get('opcoes', []))}). Ignorando esta questão.")
                continue

            agora = datetime.now(timezone.utc)
            exercicio_para_banco = {**exercicio_gerado}
            exercicio_para_banco.update({
                'banca': banca, 'materia': materia, 'topico': topico, 'criadoEm': agora,
                'avaliacoes': {'positivas': 0, 'negativas': 0}
            })
            
            doc_ref = db.collection('banco_questoes').document()
            doc_ref.set(exercicio_para_banco)
            
            exercicio_para_usuario = {**exercicio_gerado, 'id': doc_ref.id, 'criadoEm': agora.isoformat()}
            exercicios_finais.append(exercicio_para_usuario)
            
        update_data = {
            'status': 'completed',
            'exercicios': exercicios_finais,
            'resumo': {
                'materia': materia, 'topico': topico, 'total': len(exercicios_finais),
                'criadoEm': firestore.SERVER_TIMESTAMP
            }
        }
        job_ref.update(update_data)
        print(f"BACKGROUND JOB (EXERCÍCIOS RAG) CONCLUÍDO: {job_id}")

    except Exception as e:
        print(f"!!! ERRO NO BACKGROUND JOB DE EXERCÍCIOS {job_id}: {e} !!!")
        traceback.print_exc()
        job_ref.update({'status': 'failed', 'error': str(e)})

@app.route("/avaliar-questao", methods=['POST'])
@cross_origin(supports_credentials=True)
def avaliar_questao():
    """ Rota para receber o feedback (like/dislike) de uma questão. """
    dados = request.get_json()
    question_id = dados.get('questionId')
    evaluation = dados.get('evaluation') # 'positiva' or 'negativa'

    if not all([question_id, evaluation]):
        return jsonify({"error": "Dados insuficientes"}), 400

    try:
        question_ref = db.collection('banco_questoes').document(question_id)
        
        if evaluation == 'positiva':
            question_ref.update({'avaliacoes.positivas': firestore.Increment(1)})
        elif evaluation == 'negativa':
            question_ref.update({'avaliacoes.negativas': firestore.Increment(1)})
        
        return jsonify({"success": True, "message": "Avaliação registrada."}), 200
    except Exception as e:
        print(f"Erro ao registrar avaliação para a questão {question_id}: {e}")
        return jsonify({"error": "Erro interno ao salvar avaliação"}), 500   

# --- INÍCIO DO NOVO CÓDIGO PARA EXERCÍCIOS ASSÍNCRONOS ---

@app.route("/gerar-exercicios-async", methods=['POST'])
@cross_origin(supports_credentials=True)
def gerar_exercicios_async():
    dados_req = request.json
    user_id = dados_req.get("userId")
    if not user_id: return jsonify({"erro": "ID do usuário não fornecido."}), 400
    
    # Validação da quantidade de questões
    quantidade = dados_req.get("quantidade", 0)
    if not isinstance(quantidade, int) or quantidade < 1 or quantidade > 20:
        return jsonify({"error": "invalid_quantity", "message": "A quantidade deve ser um número entre 1 e 20."}), 400
    
    is_allowed, message = check_usage_and_update(user_id, 'exercicios')
    if not is_allowed: return jsonify({"error": "limit_exceeded", "message": message}), 429
    job_ref = db.collection('users').document(user_id).collection('sessoesExercicios').document()
    job_id = job_ref.id
    placeholder_data = {
        'status': 'processing', 'criadoEm': firestore.SERVER_TIMESTAMP, 'jobId': job_id,
        'resumo': { 'materia': dados_req.get('materia'), 'topico': dados_req.get('topico'),
                    'total': dados_req.get('quantidade'), 'criadoEm': firestore.SERVER_TIMESTAMP }
    }
    job_ref.set(placeholder_data)
    thread = threading.Thread(target=processar_exercicios_em_background, args=(user_id, job_id, dados_req))
    thread.start()
    return jsonify({"status": "processing", "jobId": job_id}), 202


@app.route("/gerar-dica-categoria", methods=['POST'])
@cross_origin(supports_credentials=True) # Adicione o cross_origin para consistência
def gerar_dica_categoria():
    dados_req = request.json
    user_id = dados_req.get("userId") # Pega o ID do usuário da requisição

    # --- VERIFICAÇÃO DE LIMITE ---
    is_allowed, message = check_usage_and_update(user_id, 'dicas')
    if not is_allowed:
        return jsonify({"error": "limit_exceeded", "message": message}), 429
    # --- FIM DA VERIFICAÇÃO ---
    
    categoria = dados_req.get("categoria", "geral")
    
    contexto_guia = {
        "gestao_de_tempo": "Módulo 5 (Organize seu horário) e Módulo 6 (Elabore seu plano)",
        "metodos_de_estudo": "Módulo 7 (Estratégias e materiais) e Módulo 9 (Conheça as bancas)",
        "motivacao": "Módulo 1 (Eu quero realmente estudar?), Módulo 8 (Antecipe as dificuldades) e Módulo 11 (Aprenda com erros e acertos)",
        "redacao": "Módulo 7, seção 7.12 (Elaboração de redação)"
    }
    
    contexto_especifico = contexto_guia.get(categoria, "tópicos gerais de estudo para concursos")

    try:
        prompt = (
            f"Você é um especialista em preparação para concursos. Baseando-se nos conceitos do 'Guia Definitivo de Aprovação em Concursos', especificamente do contexto de '{contexto_especifico}', "
            f"gere 3 dicas práticas e acionáveis para um concurseiro sobre o tema '{categoria.replace('_', ' ')}'. As dicas devem ser curtas, diretas e úteis.\n\n"
            f"FORMATO OBRIGATÓRIO: Objeto JSON com uma única chave: 'dicas_geradas', que é uma LISTA contendo exatamente 3 strings."
        )
        system_message = "Você é um assistente especialista que gera dicas de estudo para concursos, baseadas em uma metodologia específica e formatando a saída estritamente em JSON."
        
        dados = call_openai_api(prompt, system_message)
        return jsonify(dados)
    except Exception as e:
        return jsonify({"erro_geral": str(e)}), 500

@app.route("/gerar-dica-personalizada", methods=['POST'])
@cross_origin(supports_credentials=True)
def gerar_dica_personalizada():
    dados_req = request.json
    user_id = dados_req.get("userId")

    # CORREÇÃO: Verifica o user_id ANTES de chamar o limite
    if not user_id:
        return jsonify({"error": "bad_request", "message": "O ID do usuário não foi fornecido na requisição."}), 400

    # --- VERIFICAÇÃO DE LIMITE ---
    is_allowed, message = check_usage_and_update(user_id, 'dicas')
    if not is_allowed:
        # A mensagem de erro agora vem da função de limite e o status está correto
        return jsonify({"error": "limit_exceeded", "message": message}), 429
    # --- FIM DA VERIFICAÇÃO ---

    dados_desempenho = dados_req.get("desempenho", [])
    
    if not dados_desempenho:
        return jsonify({"dicas_geradas": ["Não há dados de desempenho suficientes para gerar uma dica personalizada. Continue praticando!"]})

    try:
        prompt = (
            f"Você é um coach especialista em concursos. Um aluno apresentou o seguinte histórico de desempenho recente (matéria: % de acerto): {json.dumps(dados_desempenho)}. "
            f"Com base nesses dados e na metodologia do 'Guia Definitivo de Aprovação em Concursos', siga as seguintes regras ESTRITAS:\n\n"
            f"1. **IDENTIFIQUE O PONTO FRACO:** Analise os dados e identifique a matéria com a MENOR taxa de acerto.\n"
            f"2. **APLIQUE A REGRA DE DESEMPENHO:** Com base na taxa de acerto da matéria mais fraca, gere UMA ÚNICA dica acionável seguindo a lógica abaixo:\n"
            f"   - **SE a taxa de acerto for MENOR QUE 60%:** A recomendação DEVE focar em estudo de base. Sugira ações como: 'rever a teoria principal do tópico', 'assistir a videoaulas sobre o assunto', 'criar um novo mapa mental ou resumo do zero'.\n"
            f"   - **SE a taxa de acerto estiver ENTRE 60% e 80%:** A recomendação DEVE focar em revisão e reforço. Sugira ações como: 'revisar seus resumos e mapas mentais existentes', 'refazer os exercícios que errou sobre este tópico', 'fazer uma bateria de 10 a 15 novas questões'.\n"
            f"   - **SE a taxa de acerto for MAIOR QUE 80%:** A recomendação DEVE ser de manutenção e foco em outros pontos. Sugira ações como: 'manter a matéria com exercícios de baixa frequência (1 ou 2 vezes na semana)' e 'usar o tempo extra para focar em sua segunda matéria mais fraca'.\n"
            f"3. **NÃO INVENTE DETALHES:** A dica deve ser focada na ESTRATÉGIA DE ESTUDO. NÃO invente números de módulo, quantidade de exercícios ou nomes de bancas. Apenas sugira o TIPO de ação a ser tomada.\n\n"
            f"Exemplo de Saída (para acerto < 60%): 'Seu desempenho em Direito Administrativo está mais baixo. Recomendo um reforço na base: dedique um tempo para rever a teoria principal de 'Licitações' e tente criar um novo mapa mental para organizar os conceitos.'\n\n"
            f"FORMATO OBRIGATÓRIO: Objeto JSON com a chave 'dicas_geradas', que é uma LISTA contendo UMA ÚNICA string com a dica personalizada."
        )
        system_message = "Você é um coach de concursos que gera dicas personalizadas e acionáveis baseadas em dados de desempenho e regras de negócio específicas, formatando a saída estritamente em JSON."
        
        dados = call_openai_api(prompt, system_message)
        return jsonify(dados)
    except Exception as e:
        return jsonify({"erro_geral": str(e)}), 500
    
# --- INÍCIO DO NOVO CÓDIGO PARA DISCURSIVAS ASSÍNCRONAS ---

def processar_enunciado_em_background(user_id, job_id, dados_req):
    """Função de background para gerar o enunciado da discursiva."""
    print(f"BACKGROUND JOB (ENUNCIADO) INICIADO: {job_id} para usuário {user_id}")
    job_ref = db.collection('users').document(user_id).collection('discursivasCorrigidas').document(job_id)
    try:
        prompt = (
            f"Você é um especialista em criar questões para concursos. Com base nos seguintes critérios: {json.dumps(dados_req)}, "
            f"crie um único e excelente enunciado para uma questão discursiva. O enunciado deve ser claro, objetivo e simular perfeitamente uma questão real da banca especificada (se houver).\n\n"
            f"FORMATO OBRIGATÓRIO: Objeto JSON com uma única chave: 'enunciado', que é uma string contendo o enunciado."
        )
        system_message = "Você gera enunciados de questões discursivas para concursos, formatando a saída em JSON."
        dados = call_openai_api(prompt, system_message)

        update_data = {
            'status': 'enunciado_pronto',
            'enunciado': dados.get('enunciado'),
            'criterios': dados_req # Salva os critérios para uso futuro
        }
        job_ref.update(update_data)
        print(f"BACKGROUND JOB (ENUNCIADO) CONCLUÍDO: {job_id}")
    except Exception as e:
        print(f"!!! ERRO NO BACKGROUND JOB DE ENUNCIADO {job_id}: {e} !!!")
        traceback.print_exc()
        job_ref.update({'status': 'failed', 'error': str(e)})

@app.route("/gerar-enunciado-discursiva-async", methods=['POST'])
@cross_origin(supports_credentials=True)
def gerar_enunciado_discursiva_async():
    """Rota que inicia a geração do enunciado em segundo plano."""
    dados_req = request.json
    user_id = dados_req.get("userId")

    # --- INÍCIO DA VERIFICAÇÃO DE LIMITE ---
    is_allowed, message = check_usage_and_update(user_id, 'discursivas')
    if not is_allowed:
        return jsonify({"error": "limit_exceeded", "message": message}), 429
    # --- FIM DA VERIFICAÇÃO DE LIMITE ---


    if not user_id: return jsonify({"erro": "ID do usuário não fornecido."}), 400

    job_ref = db.collection('users').document(user_id).collection('discursivasCorrigidas').document()
    job_id = job_ref.id

    placeholder_data = {
        'status': 'processing_enunciado',
        'criadoEm': firestore.SERVER_TIMESTAMP,
        'jobId': job_id
    }
    job_ref.set(placeholder_data)

    thread = threading.Thread(target=processar_enunciado_em_background, args=(user_id, job_id, dados_req))
    thread.start()
    return jsonify({"status": "processing_enunciado", "jobId": job_id}), 202

def processar_correcao_em_background(user_id, job_id, dados_correcao):
    """Função de background para corrigir a discursiva com mais rigor e clareza."""
    print(f"BACKGROUND JOB (CORREÇÃO) INICIADO: {job_id} para usuário {user_id}")
    job_ref = db.collection('users').document(user_id).collection('discursivasCorrigidas').document(job_id)
    try:
        # --- PROMPT DE CORREÇÃO FINAL E DETALHADO ---
        prompt = (
            "Você é um examinador de concurso extremamente rigoroso e justo. Sua tarefa é analisar a resposta de um aluno, fornecendo um feedback crítico e construtivo.\n\n"
            f"### Enunciado da Questão:\n{dados_correcao.get('enunciado')}\n\n"
            f"### Resposta do Aluno:\n{dados_correcao.get('resposta')}\n\n"
            f"### Foco da Correção Solicitado:\n{dados_correcao.get('foco_correcao', 'Avaliação geral')}\n\n"
            "REGRAS DA CORREÇÃO (SEGUIR COM MÁXIMO RIGOR):\n"
            "1. **Nota Realista:** Atribua uma nota de 0.0 a 10.0 para a redação como um todo.\n"
            "2. **Nota por Critério:** Para cada um dos 3 critérios abaixo, atribua uma nota individual de 0.0 a 10.0. A nota final deve ser a média dessas três notas.\n"
            "3. **Feedback Detalhado:** Para cada critério, escreva um comentário. Comece com os pontos fortes. Depois, para os pontos fracos, **obrigatoriamente inicie uma nova linha** com a frase 'Pontos a melhorar:' e liste-os.\n"
            "4. **Critérios de Análise:**\n"
            "   - **Apresentação e Estrutura Textual:** Avalie clareza, coesão e organização.\n"
            "   - **Desenvolvimento do Tema e Argumentação:** Verifique se a resposta aborda o enunciado e se a argumentação é bem fundamentada.\n"
            "   - **Domínio da Modalidade Escrita (Gramática):** Aponte erros de gramática, ortografia e pontuação.\n"
            "5. **Uso de Destaques:** Use a tag `<strong>` para destacar termos importantes no seu feedback.\n\n"
            "ESTRUTURA DE RESPOSTA JSON (SEGUIR RIGOROSAMENTE):\n"
            "O JSON deve conter 'nota_atribuida' (float), 'comentario_geral' (string), e 'analise_por_criterio' (LISTA de objetos, onde cada objeto DEVE ter 'criterio', 'nota_criterio' e 'comentario')."
        )
        system_message = "Você é um examinador de concursos que fornece correções rigorosas e detalhadas, formatando a saída estritamente em JSON."
        dados = call_openai_api(prompt, system_message)
        
        update_data = {
            'status': 'correcao_pronta',
            'correcao': dados
        }
        job_ref.update(update_data)
        print(f"BACKGROUND JOB (CORREÇÃO) CONCLUÍDO: {job_id}")
    except Exception as e:
        print(f"!!! ERRO NO BACKGROUND JOB DE CORREÇÃO {job_id}: {e} !!!")
        traceback.print_exc()
        job_ref.update({'status': 'failed', 'error': str(e)})

@app.route("/corrigir-discursiva-async", methods=['POST'])
@cross_origin(supports_credentials=True)
def corrigir_discursiva_async():
    """Rota que inicia a correção da discursiva em segundo plano."""
    dados_req = request.json
    user_id = dados_req.get("userId")
    job_id = dados_req.get("jobId") # Recebe o ID do job existente

    # --- INÍCIO DA VERIFICAÇÃO DE LIMITE ---
    is_allowed, message = check_usage_and_update(user_id, 'correcoes_discursivas')
    if not is_allowed:
        return jsonify({"error": "limit_exceeded", "message": message}), 429
    # --- FIM DA VERIFICAÇÃO DE LIMITE ---


    if not all([user_id, job_id]): return jsonify({"erro": "Dados insuficientes."}), 400

    job_ref = db.collection('users').document(user_id).collection('discursivasCorrigidas').document(job_id)
    # Atualiza a resposta do usuário e o status para 'processing_correcao'
    job_ref.update({
        'status': 'processing_correcao',
        'resposta': dados_req.get('resposta')
    })

    thread = threading.Thread(target=processar_correcao_em_background, args=(user_id, job_id, dados_req))
    thread.start()
    return jsonify({"status": "processing_correcao", "jobId": job_id}), 202

# --- FIM DO NOVO CÓDIGO ---
    
@app.route("/create-checkout-session", methods=['POST'])
def create_checkout_session():
    print("\n--- Requisição recebida em /create-checkout-session ---")
    try:
        data = request.get_json()
        plan = data.get('plan')
        userId = data.get('userId')
        print(f"Plano recebido: {plan}, ID do Usuário: {userId}")

        # IDs dos produtos de produção no Stripe
        price_ids = {
            'basico': 'price_1RbNwKI6qNljWf7uteg6oRkd',
            'intermediario': 'price_1RbNwKI6qNljWf7usjgSzXQ3',
            'premium': 'price_1RbNwKI6qNljWf7u9ubuSbsI',
            'anual': 'price_1RbNwKI6qNljWf7uWXU6dGod',
        }

        price_id = price_ids.get(plan)
        if not price_id:
            return jsonify(error={'message': 'Plano inválido.'}), 400
        
        if not userId:
            return jsonify(error={'message': 'ID do usuário não fornecido.'}), 400

        YOUR_DOMAIN = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")

        session_params = {
            'payment_method_types': ['card'],
            'line_items': [{'price': price_id, 'quantity': 1}],
            'mode': 'subscription',
            'success_url': YOUR_DOMAIN + '/sucesso.html',
            'cancel_url': YOUR_DOMAIN + '/cancelado.html',
            'client_reference_id': userId
        }
        
        checkout_session = stripe.checkout.Session.create(**session_params)

        print(f"Sessão de checkout criada com sucesso! ID: {checkout_session.id}")
        return jsonify({'id': checkout_session.id})

    except Exception as e:
        print(f"\n!!! OCORREU UM ERRO DENTRO DA ROTA /create-checkout-session !!!\n{traceback.format_exc()}")
        return jsonify(error={"message": "Ocorreu um erro interno no servidor."}), 500
    
@app.route("/test-cors", methods=['POST'])
def test_cors_route():
    print("A rota /test-cors foi chamada com sucesso!")
    return jsonify(message="Teste de CORS bem-sucedido!")

@app.route('/stripe-webhook', methods=['POST'])
def stripe_webhook():
    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')
    endpoint_secret = os.getenv('STRIPE_WEBHOOK_SECRET')
    event = None

    print("\n--- Webhook da Stripe recebido! ---")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
    except ValueError as e:
        print("Erro de payload inválido no webhook:", e)
        return 'Invalid payload', 400
    except stripe.error.SignatureVerificationError as e:
        print("Erro de verificação de assinatura no webhook:", e)
        return 'Invalid signature', 400

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        user_id = session.get('client_reference_id')
        stripe_customer_id = session.get('customer')

        if user_id and stripe_customer_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    user_email = user_data.get('email')
                    user_nome = user_data.get('nome', 'estudante')

                    # Atualiza plano no Firestore
                    user_ref.update({
                        'plano': 'premium', # Simplificando para 'premium' em qualquer assinatura
                        'stripeCustomerId': stripe_customer_id
                    })

                    # Envia e-mail de confirmação de assinatura PROFISSIONAL
                    assunto = "🎉 Assinatura Confirmada - Bem-vindo ao IAprovas Premium!"
                    
                    # Template HTML profissional para confirmação de pagamento
                    frontend_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")
                    portal_url = f"{frontend_url}/criar-portal-stripe"
                    
                    conteudo_html = f"""
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
                        <!-- Header com gradiente -->
                        <div style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
                            <div style="background: white; width: 60px; height: 60px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                                <span style="font-size: 24px;">📚</span>
                            </div>
                            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">IAprovas</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">Sua aprovação com IA</p>
                        </div>
                        
                        <!-- Conteúdo principal -->
                        <div style="padding: 40px 24px; background: white;">
                            <!-- Ícone de sucesso -->
                            <div style="text-align: center; margin-bottom: 32px;">
                                <div style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%); width: 80px; height: 80px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                                    <span style="color: white; font-size: 32px;">✓</span>
                                </div>
                                <h2 style="color: #1f2937; margin: 0; font-size: 28px; font-weight: bold;">Pagamento Confirmado!</h2>
                                <p style="color: #6b7280; margin: 8px 0 0 0; font-size: 18px;">Sua jornada para a aprovação começou agora</p>
                            </div>
                            
                            <!-- Informações da assinatura -->
                            <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;">
                                <h3 style="color: #1f2937; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">📋 Detalhes da sua Assinatura</h3>
                                <div style="display: grid; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                                        <span style="color: #6b7280; font-weight: 500;">Plano</span>
                                        <span style="color: #1f2937; font-weight: bold;">Premium</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                                        <span style="color: #6b7280; font-weight: 500;">Status</span>
                                        <span style="color: #1d4ed8; font-weight: bold;">✅ Ativo</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
                                        <span style="color: #6b7280; font-weight: 500;">Cobrança</span>
                                        <span style="color: #1f2937; font-weight: bold;">Mensal Automática</span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Próximos passos -->
                            <div style="margin: 32px 0;">
                                <h3 style="color: #1f2937; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">🚀 Seus Próximos Passos</h3>
                                <div style="display: grid; gap: 16px;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="background: #1d4ed8; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0;">1</div>
                                        <div>
                                            <strong style="color: #1f2937;">Acesse seu Dashboard</strong>
                                            <br><span style="color: #6b7280; font-size: 14px;">Comece explorando sua área personalizada</span>
                                        </div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="background: #1d4ed8; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0;">2</div>
                                        <div>
                                            <strong style="color: #1f2937;">Crie seu Primeiro Cronograma</strong>
                                            <br><span style="color: #6b7280; font-size: 14px;">Gere um plano de estudos personalizado com IA</span>
                                        </div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="background: #1d4ed8; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0;">3</div>
                                        <div>
                                            <strong style="color: #1f2937;">Pratique com Exercícios IA</strong>
                                            <br><span style="color: #6b7280; font-size: 14px;">Treine com questões adaptadas ao seu nível</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Botão principal -->
                            <div style="text-align: center; margin: 32px 0;">
                                <a href="{frontend_url}/home.html" style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%); color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(29, 78, 216, 0.3);">
                                    🚀 Acessar Meu Dashboard
                                </a>
                            </div>
                            
                            <!-- Links rápidos -->
                            <div style="background: #fffbeb; border: 1px solid #fed7aa; border-radius: 12px; padding: 20px; margin: 24px 0;">
                                <h4 style="color: #92400e; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">🔗 Links Úteis</h4>
                                <div style="display: grid; gap: 8px;">
                                    <a href="{frontend_url}/cronograma.html" style="color: #92400e; text-decoration: none; font-size: 14px;">📊 Criar Cronograma de Estudos</a>
                                    <a href="{frontend_url}/exercicios.html" style="color: #92400e; text-decoration: none; font-size: 14px;">💡 Resolver Exercícios com IA</a>
                                    <a href="{frontend_url}/discursivas.html" style="color: #92400e; text-decoration: none; font-size: 14px;">✍️ Treinar Redações</a>
                                    <a href="{frontend_url}/meu-perfil.html" style="color: #92400e; text-decoration: none; font-size: 14px;">👤 Gerenciar Meu Perfil</a>
                                </div>
                            </div>
                            
                            <!-- Gerenciamento da assinatura -->
                            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin: 24px 0;">
                                <h4 style="color: #1d4ed8; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">⚙️ Gerenciar Assinatura</h4>
                                <p style="color: #1e40af; margin: 0 0 12px 0; font-size: 14px; line-height: 1.5;">Você pode cancelar a qualquer momento através do seu perfil, sem taxas ou burocracias.</p>
                                <a href="mailto:contato@iaprovas.com.br?subject=Gerenciar Assinatura" style="color: #1d4ed8; text-decoration: none; font-size: 14px; font-weight: 500;">📧 Entrar em contato para suporte</a>
                            </div>
                            
                            <!-- Satisfação -->
                            <div style="text-align: center; margin: 32px 0; padding: 20px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px;">
                                <h4 style="color: #1d4ed8; margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">😊 Satisfação Garantida</h4>
                                <p style="color: #1d4ed8; margin: 0; font-size: 14px;">Cancele a qualquer momento pelo seu perfil, sem complicações.</p>
                            </div>
                        </div>
                        
                        <!-- Footer -->
                        <div style="background: #f8fafc; padding: 24px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #e2e8f0;">
                            <p style="color: #6b7280; margin: 0 0 16px 0; font-size: 14px;">
                                IAprovas - Sua aprovação com Inteligência Artificial<br>
                                Se precisar de ajuda: <a href="mailto:contato@iaprovas.com.br" style="color: #1d4ed8;">contato@iaprovas.com.br</a>
                            </p>
                        </div>
                    </div>
                    """
                    
                    conteudo_texto = f"""
                    🎉 ASSINATURA CONFIRMADA - IAprovas Premium

                    Olá, {user_nome}!

                    Sua assinatura do IAprovas Premium foi ativada com sucesso!

                    PRÓXIMOS PASSOS:
                    1. Acesse seu dashboard: {frontend_url}/home.html
                    2. Crie seu primeiro cronograma de estudos
                    3. Pratique com exercícios gerados por IA
                    4. Treine redações com correção automática

                    DETALHES DA ASSINATURA:
                    - Plano: Premium
                    - Status: Ativo ✅
                    - Cobrança: Mensal automática
                    - Cancelamento: A qualquer momento pelo perfil

                    LINKS ÚTEIS:
                    - Dashboard: {frontend_url}/home.html
                    - Cronograma: {frontend_url}/cronograma.html
                    - Exercícios: {frontend_url}/exercicios.html
                    - Perfil: {frontend_url}/meu-perfil.html

                    SUPORTE:
                    Para gerenciar sua assinatura ou tirar dúvidas:
                    📧 contato@iaprovas.com.br

                    Bons estudos!
                    Equipe IAprovas
                    """
                    
                    enviar_email(user_email, user_nome, assunto, conteudo_html, conteudo_texto)

            except Exception as e:
                print(f"Erro no webhook checkout.session.completed: {e}")
    elif event['type'] == 'invoice.payment_failed':
        # FALHA DE PAGAMENTO - Primeira tentativa
        invoice = event['data']['object']
        stripe_customer_id = invoice.get('customer')
        attempt_count = invoice.get('attempt_count', 1)

        try:
            users_ref = db.collection('users')
            query = users_ref.where('stripeCustomerId', '==', stripe_customer_id).limit(1)
            docs = query.stream()

            for doc in docs:
                user_data = doc.to_dict()
                user_email = user_data.get('email')
                user_nome = user_data.get('nome', 'estudante')
                frontend_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")

                # EMAIL ESPECÍFICO para falha de pagamento
                assunto = "💳 Problema no pagamento da sua assinatura IAprovas"
                
                conteudo_html = f"""
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
                    <!-- Header laranja para aviso -->
                    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
                        <div style="background: white; width: 60px; height: 60px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                            <span style="font-size: 24px;">💳</span>
                        </div>
                        <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">IAprovas</h1>
                        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">Problema no pagamento</p>
                    </div>
                    
                    <div style="padding: 40px 24px; background: white;">
                        <div style="text-align: center; margin-bottom: 32px;">
                            <h2 style="color: #1f2937; margin: 0; font-size: 24px; font-weight: bold;">Não conseguimos processar seu pagamento</h2>
                            <p style="color: #6b7280; margin: 16px 0 0 0; font-size: 16px;">Olá, {user_nome}</p>
                        </div>
                        
                        <!-- Problema identificado -->
                        <div style="background: #fffbeb; border: 1px solid #fed7aa; border-radius: 12px; padding: 20px; margin: 24px 0;">
                            <h3 style="color: #92400e; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">⚠️ O que aconteceu?</h3>
                            <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.5;">
                                Tentamos processar o pagamento da sua assinatura, mas houve um problema:
                            </p>
                            <ul style="color: #92400e; margin: 12px 0 0 0; font-size: 14px; line-height: 1.5;">
                                <li>Cartão pode estar vencido ou com dados incorretos</li>
                                <li>Limite do cartão pode ter sido excedido</li>
                                <li>Banco pode ter bloqueado a transação</li>
                                <li>Problema temporário no processamento</li>
                            </ul>
                        </div>

                        <!-- Status atual -->
                        <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px; margin: 24px 0;">
                            <h3 style="color: #0369a1; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">🔄 Status da sua conta</h3>
                            <p style="color: #0369a1; margin: 0; font-size: 14px; line-height: 1.5;">
                                <strong>Seu acesso ainda está ativo!</strong> Tentaremos novamente nos próximos dias.
                            </p>
                        </div>
                        
                        <!-- Ação necessária -->
                        <div style="text-align: center; margin: 32px 0;">
                            <a href="{frontend_url}/meu-perfil.html" style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%); color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(29, 78, 216, 0.3);">
                                💳 Atualizar Forma de Pagamento
                            </a>
                        </div>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 24px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #e2e8f0;">
                        <p style="color: #6b7280; margin: 0; font-size: 14px;">
                            IAprovas - <a href="mailto:contato@iaprovas.com.br" style="color: #1d4ed8;">contato@iaprovas.com.br</a>
                        </p>
                    </div>
                </div>
                """
                
                conteudo_texto = f"""
                💳 PROBLEMA NO PAGAMENTO - IAprovas

                Olá, {user_nome}!

                Não conseguimos processar o pagamento da sua assinatura.

                POSSÍVEIS MOTIVOS:
                - Cartão vencido ou dados incorretos
                - Limite do cartão excedido  
                - Banco bloqueou a transação
                - Problema temporário no processamento

                SUA CONTA:
                - Status: AINDA ATIVA
                - Tentaremos novamente automaticamente
                - Atualize seus dados para evitar problemas

                AÇÃO NECESSÁRIA:
                1. Acesse: {frontend_url}/meu-perfil.html
                2. Atualize forma de pagamento
                3. Verifique dados do cartão

                Equipe IAprovas
                """
                
                enviar_email(user_email, user_nome, assunto, conteudo_html, conteudo_texto)
                break
        except Exception as e:
            print(f"Erro no webhook invoice.payment_failed: {e}")

    elif event['type'] == 'customer.subscription.deleted':
        subscription = event['data']['object']
        stripe_customer_id = subscription.get('customer')

        try:
            # Encontra o usuário pelo stripeCustomerId
            users_ref = db.collection('users')
            query = users_ref.where('stripeCustomerId', '==', stripe_customer_id).limit(1)
            docs = query.stream()

            for doc in docs:
                user_data = doc.to_dict()
                user_email = user_data.get('email')
                user_nome = user_data.get('nome', 'estudante')

                # ✅ DESATIVA A CONTA (CRÍTICO)
                doc.reference.update({
                    'plano': 'trial',  # Reverte para trial
                    'assinaturaCancelada': True,
                    'dataCancelamento': firestore.SERVER_TIMESTAMP
                })

                # EMAIL ESPECÍFICO para cancelamento definitivo
                frontend_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")
                assunto = "😔 Sua assinatura IAprovas foi cancelada"
                
                conteudo_html = f"""
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
                        <div style="background: white; width: 60px; height: 60px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                            <span style="font-size: 24px;">⚠️</span>
                        </div>
                        <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">IAprovas</h1>
                        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">Assinatura cancelada</p>
                    </div>
                    
                    <!-- Conteúdo -->
                    <div style="padding: 40px 24px; background: white;">
                        <div style="text-align: center; margin-bottom: 32px;">
                            <h2 style="color: #1f2937; margin: 0; font-size: 24px; font-weight: bold;">Assinatura Cancelada</h2>
                            <p style="color: #6b7280; margin: 16px 0 0 0; font-size: 16px;">Olá, {user_nome}</p>
                        </div>
                        
                        <!-- Motivos possíveis -->
                        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin: 24px 0;">
                                                         <h3 style="color: #dc2626; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">📋 O que aconteceu?</h3>
                             <p style="color: #dc2626; margin: 0; font-size: 14px; line-height: 1.5;">
                                 Sua assinatura foi <strong>cancelada definitivamente</strong>. Isso ocorreu por:
                             </p>
                             <ul style="color: #dc2626; margin: 12px 0 0 0; font-size: 14px; line-height: 1.5;">
                                 <li>Múltiplas tentativas de cobrança falharam</li>
                                 <li>Cancelamento solicitado pelo usuário</li>
                                 <li>Problemas persistentes com forma de pagamento</li>
                                 <li>Solicitação via suporte ao cliente</li>
                             </ul>
                        </div>
                        
                        <!-- Status atual -->
                        <div style="background: #fffbeb; border: 1px solid #fed7aa; border-radius: 12px; padding: 20px; margin: 24px 0;">
                            <h3 style="color: #92400e; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">🔒 Status da sua conta</h3>
                            <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.5;">
                                <strong>Acesso premium removido:</strong> Você retornou ao plano trial com funcionalidades limitadas.
                            </p>
                        </div>
                        
                        <!-- Reativar -->
                        <div style="text-align: center; margin: 32px 0;">
                            <a href="{frontend_url}/index.html#planos" style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%); color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(29, 78, 216, 0.3);">
                                🔄 Reativar Assinatura
                            </a>
                        </div>
                        
                        <!-- Suporte -->
                        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin: 24px 0;">
                            <h4 style="color: #1d4ed8; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">💬 Precisa de ajuda?</h4>
                            <p style="color: #1e40af; margin: 0 0 12px 0; font-size: 14px; line-height: 1.5;">
                                Se o cancelamento foi por engano ou você precisa de assistência:
                            </p>
                            <a href="mailto:contato@iaprovas.com.br?subject=Problema com cancelamento da assinatura" style="color: #1d4ed8; text-decoration: none; font-size: 14px; font-weight: 500;">
                                📧 Entre em contato conosco
                            </a>
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <div style="background: #f8fafc; padding: 24px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #e2e8f0;">
                        <p style="color: #6b7280; margin: 0; font-size: 14px;">
                            IAprovas - Sua aprovação com Inteligência Artificial<br>
                            <a href="mailto:contato@iaprovas.com.br" style="color: #1d4ed8;">contato@iaprovas.com.br</a>
                        </p>
                    </div>
                </div>
                """
                
                conteudo_texto = f"""
                 😔 ASSINATURA CANCELADA - IAprovas
 
                 Olá, {user_nome}!
 
                 Sua assinatura do IAprovas foi cancelada definitivamente.
 
                 O QUE ACONTECEU?
                 Isso ocorreu por:
                 - Múltiplas tentativas de cobrança falharam
                 - Cancelamento solicitado pelo usuário
                 - Problemas persistentes com forma de pagamento
                 - Solicitação via suporte ao cliente

                STATUS DA SUA CONTA:
                - Acesso premium: REMOVIDO
                - Plano atual: Trial (funcionalidades limitadas)
                - Dados salvos: Preservados

                PARA REATIVAR:
                1. Acesse: {frontend_url}/index.html#planos
                2. Escolha seu plano
                3. Complete o pagamento
                4. Acesso será restaurado automaticamente

                PRECISA DE AJUDA?
                Se o cancelamento foi por engano ou há problemas com pagamento:
                📧 contato@iaprovas.com.br

                Equipe IAprovas
                """
                enviar_email(user_email, user_nome, assunto, conteudo_html, conteudo_texto)
                break # Para após encontrar o usuário
        except Exception as e:
            print(f"Erro no webhook customer.subscription.deleted: {e}")

    return 'Success', 200

@app.route('/create-portal-session', methods=['POST'])
def create_portal_session():
    data = request.get_json()
    user_id = data.get('userId')

    if not user_id:
        return jsonify(error={'message': 'ID do usuário não fornecido.'}), 400

    try:
        # Busca o usuário no Firestore para pegar o stripeCustomerId
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return jsonify(error={'message': 'Usuário não encontrado.'}), 404

        stripe_customer_id = user_doc.to_dict().get('stripeCustomerId')
        if not stripe_customer_id:
            return jsonify(error={'message': 'ID de cliente Stripe não encontrado para este usuário.'}), 400
        
        YOUR_DOMAIN = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")

        portal_session = stripe.billing_portal.Session.create(
            customer=stripe_customer_id,
            return_url=YOUR_DOMAIN + '/meu-perfil.html',
        )
        return jsonify({'url': portal_session.url})

    except Exception as e:
        print(f"Erro ao criar sessão do portal: {e}")
        return jsonify(error={'message': 'Falha ao criar sessão do portal.'}), 500


@app.route('/delete-user-account', methods=['POST'])
@cross_origin(supports_credentials=True)
def delete_user_account():
    data = request.get_json()
    user_id = data.get('userId')
    if not user_id:
        return jsonify(error={'message': 'ID do usuário não fornecido.'}), 400

    try:
        # Passo 1: Obter dados do usuário ANTES de deletar
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()

        if not user_doc.exists:
            # Se o usuário não está no Firestore, pode ser um erro ou um estado inconsistente.
            # Mesmo assim, tentaremos deletá-lo da autenticação para garantir a limpeza.
            try:
                firebase_auth.delete_user(user_id)
                print(f"Usuário {user_id} não encontrado no Firestore, mas removido da Autenticação.")
                return jsonify(success=True, message="Conta de autenticação órfã foi excluída.")
            except firebase_auth.UserNotFoundError:
                # Se ele também não está no Auth, então não há nada a fazer.
                return jsonify(error={'message': 'Usuário não encontrado em nenhum sistema.'}), 404

        user_data = user_doc.to_dict()
        user_email = user_data.get('email')
        user_nome = user_data.get('nome', 'Ex-usuário')

        # --- NOVA LÓGICA DE EXCLUSÃO ---
        # Passo 2: Deletar do Firebase Authentication PRIMEIRO. Esta é a etapa mais crítica.
        print(f"Tentando excluir o usuário {user_id} do Firebase Auth...")
        firebase_auth.delete_user(user_id)
        print(f"Usuário {user_id} excluído do Firebase Auth com sucesso.")

        # Passo 3: Se a exclusão do Auth funcionou, deletar do Firestore.
        print(f"Excluindo documento do usuário {user_id} do Firestore...")
        user_ref.delete()
        print("Documento do Firestore excluído com sucesso.")

        # Passo 4: Se TUDO deu certo, enviar o e-mail de confirmação.
        if user_email:
            assunto = "Sua conta na IAprovas foi excluída"
            conteudo_html = f"<p>Olá, {user_nome},</p><p>Confirmamos que sua conta e todos os seus dados na plataforma IAprovas foram permanentemente excluídos, conforme sua solicitação.</p><p>Agradecemos pelo tempo que esteve conosco.</p>"
            conteudo_texto = "Sua conta na IAprovas foi excluída com sucesso."
            enviar_email(user_email, user_nome, assunto, conteudo_html, conteudo_texto)

        return jsonify(success=True, message="Conta e dados excluídos com sucesso.")

    except firebase_auth.UserNotFoundError:
        # Este erro pode acontecer se, por algum motivo, o usuário já foi deletado do Auth
        # mas ainda existe no Firestore. O código tentará limpar o Firestore.
        print(f"AVISO: Usuário {user_id} não foi encontrado na Autenticação, mas o documento do Firestore existe. Limpando o documento.")
        db.collection('users').document(user_id).delete()
        return jsonify(error={'message': 'Usuário não encontrado na autenticação, mas os dados foram limpos.'}), 404
    
    except Exception as e:
        # Se qualquer outra exceção ocorrer (ex: permissão negada para excluir do Auth),
        # ela será capturada aqui, e o e-mail de sucesso NÃO será enviado.
        print(f"ERRO CRÍTICO ao excluir a conta {user_id}:")
        traceback.print_exc()
        return jsonify(error={'message': 'Ocorreu um erro interno ao excluir a conta.'}), 500


@app.route("/get-usage-limits/<user_id>", methods=['GET'])
@cross_origin(supports_credentials=True)
def get_usage_limits(user_id):
    try:
        # Usa horário de Brasília (UTC-3) para reset à meia-noite
        brasilia_tz = timezone(timedelta(hours=-3))
        today_str = datetime.now(brasilia_tz).strftime('%Y-%m-%d')
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()

        if not user_doc.exists:
            return jsonify({"error": "Usuário não encontrado."}), 404

        user_plan = user_doc.to_dict().get('plano', 'trial')
        
        usage_doc_ref = user_ref.collection('usage').document('total_trial' if user_plan == 'trial' else today_str)
        usage_doc = usage_doc_ref.get()

        current_usage = usage_doc.to_dict() if usage_doc.exists else {}
        plan_limits = PLAN_LIMITS.get(user_plan, {})

        return jsonify({
            "usage": current_usage,
            "limits": plan_limits,
            "plan": user_plan # <-- Adicionado para o frontend saber o plano
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- FUNÇÃO DE BACKGROUND PARA GERAR FLASHCARDS ---

def processar_flashcards_em_background(user_id, deck_id, dados_req):
    """Gera flashcards via OpenAI em segundo plano e grava no Firestore."""
    print(f"BACKGROUND (FLASHCARDS) deck {deck_id} para usuário {user_id}")
    deck_ref = db.collection('users').document(user_id).collection('flashcards').document(deck_id)
    try:
        materia = dados_req.get('materia')
        topico = dados_req.get('topico')
        quantidade = int(dados_req.get('quantidade', 10))
        formato = dados_req.get('formato', 'pergunta_resposta')

        prompt = (
            "Você é um professor especialista em criar flashcards para concursos. \n"
            f"Crie {quantidade} flashcards no formato {formato} sobre {materia} – tópico {topico}.\n"
            "Saída obrigatória em JSON com a chave 'flashcards': lista de objetos {frente, verso}.\n"
        )
        system_msg = "Gere flashcards curtos e diretos; retorne somente JSON válido."

        resultado = call_openai_api(prompt, system_msg)
        if 'flashcards' not in resultado or not isinstance(resultado['flashcards'], list):
            raise ValueError("Resposta da IA sem lista de flashcards")

        flashcards = resultado['flashcards']

        batch = db.batch()
        for card in flashcards:
            card_ref = deck_ref.collection('cards').document()
            batch.set(card_ref, {
                'frente': card.get('frente'),
                'verso': card.get('verso'),
                'createdAt': firestore.SERVER_TIMESTAMP,
                # Cartões novos NÃO devem ter nextReview definido
                # nextReview será definido apenas quando o cartão for estudado pela primeira vez
                'interval': 0,
                'ease': 2.5,
                'reps': 0,
                'lapses': 0
            })
        batch.update(deck_ref, {
            'status': 'completed',
            'cardCount': len(flashcards)
        })
        batch.commit()
        print(f"FLASHCARDS GERADOS: deck {deck_id}")
    except Exception as e:
        print(f"!!! ERRO FLASHCARDS deck {deck_id}: {e}")
        traceback.print_exc()
        deck_ref.update({'status': 'failed', 'error': str(e)})

# --- ROTA PARA GERAR FLASHCARDS ---

@app.route('/gerar-flashcards-async', methods=['POST'])
@cross_origin(supports_credentials=True, origins=["https://iaprovas.com.br","https://www.iaprovas.com.br","http://localhost:5500","http://127.0.0.1:5500"])
def gerar_flashcards_async():
    dados_req = request.json
    user_id = dados_req.get('userId')

    is_allowed, message = check_usage_and_update(user_id, 'flashcards')
    if not is_allowed:
        return jsonify({'error': 'limit_exceeded', 'message': message}), 429

    if not user_id:
        return jsonify({'erro': 'ID do usuário não fornecido.'}), 400

    deck_ref = db.collection('users').document(user_id).collection('flashcards').document()
    deck_id = deck_ref.id

    placeholder = {
        'status': 'processing',
        'criadoEm': firestore.SERVER_TIMESTAMP,
        'materia': dados_req.get('materia'),
        'topico': dados_req.get('topico'),
        'geradoPor': 'ia',
        'cardCount': 0,
        'deckId': deck_id
    }
    deck_ref.set(placeholder)

    thr = threading.Thread(target=processar_flashcards_em_background, args=(user_id, deck_id, dados_req))
    thr.start()

    return jsonify({'status': 'processing', 'deckId': deck_id}), 202

# --- UTILIDADE SRS (SM-2) ---

def srs_update(card_doc, quality):
    """Atualiza campos do cartão baseado no SM-2. quality: 0-5"""
    ease = card_doc.get('ease', 2.5)
    interval = card_doc.get('interval', 0)
    reps = card_doc.get('reps', 0)
    lapses = card_doc.get('lapses', 0)

    if quality >= 3:
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 6
        else:
            interval = round(interval * ease)
        ease = max(1.3, ease + 0.1 - (5 - quality) * 0.08)
        reps += 1
    else:
        reps = 0
        interval = 1
        ease = max(1.3, ease - 0.2)
        lapses += 1

    # Usa horário de Brasília para consistência
    brasilia_tz = timezone(timedelta(hours=-3))
    next_review = datetime.now(brasilia_tz) + timedelta(days=interval)
    return {
        'ease': ease,
        'interval': interval,
        'reps': reps,
        'lapses': lapses,
        'nextReview': next_review
    }

# --- ROTA PARA RESPONDER FLASHCARD ---

@app.route('/responder-flashcard', methods=['POST'])
@cross_origin(supports_credentials=True)
def responder_flashcard():
    dados = request.json
    user_id = dados.get('userId')
    deck_id = dados.get('deckId')
    card_id = dados.get('cardId')
    quality = int(dados.get('quality', 0))

    if not all([user_id, deck_id, card_id]):
        return jsonify({'erro': 'Dados insuficientes.'}), 400

    card_ref = db.collection('users').document(user_id).collection('flashcards').document(deck_id).collection('cards').document(card_id)
    card_doc = card_ref.get().to_dict()
    if not card_doc:
        return jsonify({'erro': 'Card não encontrado'}), 404

    updates = srs_update(card_doc, quality)
    updates['ultimaRevisao'] = firestore.SERVER_TIMESTAMP
    card_ref.update(updates)

    # increment stats in deck
    deck_ref = db.collection('users').document(user_id).collection('flashcards').document(deck_id)
    deck_ref.update({f'stats.q{quality}': firestore.Increment(1)})

    return jsonify({'status': 'updated', 'nextReview': updates['nextReview'].isoformat()})

# --- SISTEMA DE ACOMPANHAMENTO DE PROGRESSO ---

@app.route("/registrar-progresso", methods=['POST'])
@cross_origin(supports_credentials=True)
def registrar_progresso():
    """Registra o progresso de uma sessão de estudo."""
    try:
        dados = request.json
        user_id = dados.get('userId')
        plano_id = dados.get('planoId')
        sessao_id = dados.get('sessaoId')
        status = dados.get('status')  # 'completed', 'modified', 'incomplete'
        observacoes = dados.get('observacoes', '')
        tempo_real = dados.get('tempoReal', 0)
        
        if not all([user_id, plano_id, sessao_id, status]):
            return jsonify({"erro": "Dados insuficientes"}), 400
            
        if status not in ['completed', 'modified', 'incomplete']:
            return jsonify({"erro": "Status inválido"}), 400
        
        # Verifica se já existe um registro para esta sessão
        progresso_existente = db.collection('users').document(user_id).collection('progresso').where('sessaoId', '==', sessao_id).where('planoId', '==', plano_id).limit(1).stream()
        
        progresso_data = {
            'userId': user_id,
            'planoId': plano_id,
            'sessaoId': sessao_id,
            'status': status,
            'observacoes': observacoes,
            'tempoReal': tempo_real,
            'dataRegistro': firestore.SERVER_TIMESTAMP
        }
        
        # Se já existe um registro, atualiza ele. Senão, cria um novo
        registros_existentes = list(progresso_existente)
        if registros_existentes:
            # Atualiza o registro existente
            doc_ref = registros_existentes[0].reference
            doc_ref.update(progresso_data)
            progresso_id = doc_ref.id
        else:
            # Cria um novo registro
            progresso_ref = db.collection('users').document(user_id).collection('progresso').document()
            progresso_ref.set(progresso_data)
            progresso_id = progresso_ref.id
        
        return jsonify({"sucesso": True, "progressoId": progresso_id}), 200
        
    except Exception as e:
        print(f"Erro ao registrar progresso: {e}")
        return jsonify({"erro": "Erro interno do servidor"}), 500

@app.route("/obter-progresso/<user_id>/<plano_id>", methods=['GET'])
@cross_origin(supports_credentials=True)
def obter_progresso(user_id, plano_id):
    """Obtém o progresso de um plano específico."""
    try:
        # Busca todos os registros de progresso do plano
        progresso_refs = db.collection('users').document(user_id).collection('progresso').where('planoId', '==', plano_id).stream()
        
        progresso_lista = []
        sessoes_por_id = {}  # Dicionário para armazenar o último status de cada sessão
        
        # Agrupa registros por sessão e pega o mais recente
        for doc in progresso_refs:
            data = doc.to_dict()
            data['id'] = doc.id
            sessao_id = data['sessaoId']
            data_registro = data.get('dataRegistro')
            
            # Se não existe registro para esta sessão ou se é mais recente
            if sessao_id not in sessoes_por_id or (data_registro and sessoes_por_id[sessao_id]['dataRegistro'] < data_registro):
                sessoes_por_id[sessao_id] = data
        
        # Retorna apenas o último status de cada sessão
        progresso_lista = list(sessoes_por_id.values())
        
        return jsonify({"progresso": progresso_lista}), 200
        
    except Exception as e:
        print(f"Erro ao obter progresso: {e}")
        return jsonify({"erro": "Erro interno do servidor"}), 500

@app.route("/calcular-metricas-progresso/<user_id>/<plano_id>", methods=['GET'])
@cross_origin(supports_credentials=True)
def calcular_metricas_progresso(user_id, plano_id):
    """Calcula métricas de progresso para um plano."""
    try:
        # Busca o plano
        plano_ref = db.collection('users').document(user_id).collection('plans').document(plano_id)
        plano_doc = plano_ref.get()
        
        if not plano_doc.exists:
            return jsonify({"erro": "Plano não encontrado"}), 404
            
        plano_data = plano_doc.to_dict()
        
        # Busca o progresso com limite para evitar timeout
        progresso_refs = db.collection('users').document(user_id).collection('progresso').where('planoId', '==', plano_id).limit(1000).stream()
        
        progresso_lista = []
        for doc in progresso_refs:
            data = doc.to_dict()
            data['id'] = doc.id
            progresso_lista.append(data)
        
        # Calcula métricas de forma otimizada
        total_sessoes = 0
        
        # Conta sessões do plano de forma mais eficiente
        if 'cronograma_semanal_detalhado' in plano_data:
            for semana in plano_data['cronograma_semanal_detalhado']:
                for dia in semana.get('dias_de_estudo', []):
                    total_sessoes += len(dia.get('atividades', []))
        
        # Analisa progresso de forma otimizada
        datas_estudo = set()
        sessoes_por_id = {}
        
        # Agrupa registros por sessão e pega o mais recente
        for registro in progresso_lista:
            sessao_id = registro['sessaoId']
            data_registro = registro.get('dataRegistro')
            
            if sessao_id not in sessoes_por_id or (data_registro and sessoes_por_id[sessao_id]['dataRegistro'] < data_registro):
                sessoes_por_id[sessao_id] = registro
        
        # Conta status de forma otimizada
        sessoes_completadas = sum(1 for r in sessoes_por_id.values() if r['status'] == 'completed')
        sessoes_modificadas = sum(1 for r in sessoes_por_id.values() if r['status'] == 'modified')
        sessoes_incompletas = sum(1 for r in sessoes_por_id.values() if r['status'] == 'incomplete')
        
        # Coleta datas de forma otimizada
        for registro in sessoes_por_id.values():
            if 'dataRegistro' in registro:
                data_str = registro['dataRegistro'].strftime('%Y-%m-%d')
                datas_estudo.add(data_str)
        
        # Calcula dias consecutivos de forma otimizada
        dias_consecutivos = 1
        if datas_estudo:
            datas_ordenadas = sorted(list(datas_estudo))
            for i in range(1, len(datas_ordenadas)):
                data_anterior = datetime.strptime(datas_ordenadas[i-1], '%Y-%m-%d')
                data_atual = datetime.strptime(datas_ordenadas[i], '%Y-%m-%d')
                if (data_atual - data_anterior).days == 1:
                    dias_consecutivos += 1
                else:
                    dias_consecutivos = 1
        
        # Calcula porcentagem
        porcentagem = (sessoes_completadas / total_sessoes * 100) if total_sessoes > 0 else 0
        
        metricas = {
            'totalSessoes': total_sessoes,
            'sessoesCompletadas': sessoes_completadas,
            'sessoesModificadas': sessoes_modificadas,
            'sessoesIncompletas': sessoes_incompletas,
            'porcentagemConclusao': round(porcentagem, 1),
            'diasConsecutivos': dias_consecutivos,
            'totalDiasEstudo': len(datas_estudo),
            'progresso': list(sessoes_por_id.values())  # Retorna apenas os últimos status
        }
        
        return jsonify(metricas), 200
        
    except Exception as e:
        print(f"Erro ao calcular métricas: {e}")
        return jsonify({"erro": "Erro interno do servidor"}), 500

# --- ROTAS PARA EXCLUIR E REGENERAR ITENS ---

@app.route("/excluir-item/<user_id>/<collection_name>/<item_id>", methods=['DELETE'])
@cross_origin(supports_credentials=True)
def excluir_item(user_id, collection_name, item_id):
    """Exclui um item específico de uma coleção do usuário"""
    try:
        # Valida a coleção permitida
        colecoes_permitidas = ['plans', 'sessoesExercicios', 'discursivasCorrigidas', 'historicoDicas', 'flashcards']
        if collection_name not in colecoes_permitidas:
            return jsonify({"error": "Coleção não permitida"}), 400
        
        # Exclui o item
        item_ref = db.collection('users').document(user_id).collection(collection_name).document(item_id)
        item_doc = item_ref.get()
        
        if not item_doc.exists:
            return jsonify({"error": "Item não encontrado"}), 404
        
        item_ref.delete()
        
        print(f"Item {item_id} excluído da coleção {collection_name} do usuário {user_id}")
        return jsonify({"success": True, "message": "Item excluído com sucesso"}), 200
        
    except Exception as e:
        print(f"Erro ao excluir item: {e}")
        return jsonify({"error": "Erro interno ao excluir item"}), 500



if __name__ == "__main__":
    import sys
    
    # Verificar se foi passada uma porta como argumento
    port = 5000
    if len(sys.argv) > 1 and sys.argv[1] == '--port':
        if len(sys.argv) > 2:
            port = int(sys.argv[2])
        else:
            print("Erro: --port requer um número de porta")
            sys.exit(1)
    else:
        port = int(os.environ.get("PORT", 5000))
    
    print(f"Iniciando servidor Flask na porta {port}")
    app.run(host='0.0.0.0', port=port, debug=True)
