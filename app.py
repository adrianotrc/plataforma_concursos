# app.py

import os
import json
from datetime import datetime, timezone
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
CORS(app, origins=["http://127.0.0.1:5500", "http://localhost:5500", "https://iaprovas.com.br", "https://www.iaprovas.com.br"], supports_credentials=True)

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
    'trial': {'cronogramas': 5, 'exercicios': 5, 'discursivas': 5, 'dicas': 5},
    'basico': {'cronogramas': 10, 'exercicios': 10, 'discursivas': 10, 'dicas': 10},
    'intermediario': {'cronogramas': 15, 'exercicios': 15, 'discursivas': 15, 'dicas': 15},
    'premium': {'cronogramas': 20, 'exercicios': 20, 'discursivas': 20, 'dicas': 20},
    'anual': {'cronogramas': 20, 'exercicios': 20, 'discursivas': 20, 'dicas': 20}
}

def check_usage_and_update(user_id, feature):
    try:
        today_str = datetime.utcnow().strftime('%Y-%m-%d')
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
            timeout=120.0
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"ERRO na chamada da API OpenAI: {e}")
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
        
        # --- PROMPT FINAL REFORÇADO ---
        prompt = (
            "Você é um coach especialista em criar planos de estudo para concursos, baseando-se na metodologia do 'Guia Definitivo de Aprovação'. "
            "Sua tarefa é criar um plano de estudos em formato JSON, com base nos dados do aluno e nas regras estritas abaixo.\n\n"
            f"DADOS DO ALUNO:\n{json.dumps(dados_usuario, indent=2)}\n\n"
            "REGRAS DE ESTRUTURA JSON (OBRIGATÓRIO):\n"
            # As regras de estrutura permanecem as mesmas
            "1. A resposta DEVE ser um único objeto JSON.\n"
            "2. A chave principal deve ser 'plano_de_estudos'.\n"
            "3. O objeto 'plano_de_estudos' DEVE conter as chaves: 'concurso_foco', 'resumo_estrategico', e 'cronograma_semanal_detalhado'.\n"
            "4. 'cronograma_semanal_detalhado' DEVE ser uma LISTA de objetos, um para cada semana do plano.\n"
            "5. Cada objeto de semana DEVE ter 'semana_numero' e uma lista chamada 'dias_de_estudo'.\n"
            "6. Cada objeto em 'dias_de_estudo' DEVE ter 'dia_semana' e uma lista chamada 'atividades'.\n"
            "7. Cada objeto em 'atividades' DEVE ter as chaves 'materia', 'topico_sugerido', 'tipo_de_estudo', e 'duracao_minutos'.\n\n"
            "REGRAS DE CONTEÚDO E LÓGICA (CRÍTICO SEGUIR TODAS):\n"
            "1. **VARIEDADE DE MÉTODOS (REGRA MAIS IMPORTANTE):** O plano DEVE ser pedagogicamente rico. É OBRIGATÓRIO que você use uma mistura inteligente dos seguintes métodos de estudo: 'Estudo de Teoria', 'Resolução de Exercícios', 'Revisão Ativa', 'Criação de Mapa Mental' e 'Leitura de Lei Seca'. Um plano que usa apenas um ou dois métodos é considerado uma falha. Aplique o método mais adequado para cada matéria e momento do estudo.\n"
            "2. **DIAS E TEMPO DE ESTUDO:** Gere atividades para TODOS os dias da semana informados em `dados_usuario['disponibilidade_semanal_minutos']`. O campo 'dia_semana' na sua resposta deve ser EXATAMENTE igual à chave recebida. Use 100% do tempo de cada dia de forma flexível.\n"
            f"3. **MATÉRIAS:** O plano DEVE incluir TODAS as matérias listadas pelo aluno.\n"
            f"4. **DURAÇÃO DO PLANO:** O plano deve ter EXATAMENTE {numero_de_semanas} semanas.\n"
            "5. **RESUMO ESTRATÉGICO:** Crie um 'resumo_estrategico' curto, explicando a lógica de progressão aplicada no plano."
        )
        system_message = "Você é um assistente que gera planos de estudo em formato JSON, seguindo rigorosamente a estrutura e a lógica pedagógica de progressão de estudos solicitada."
        
        resultado_ia = call_openai_api(prompt, system_message)

        if 'plano_de_estudos' not in resultado_ia or 'cronograma_semanal_detalhado' not in resultado_ia['plano_de_estudos']:
            raise ValueError("A resposta da IA não continha a estrutura de cronograma esperada.")

        plano_final = resultado_ia['plano_de_estudos']
        plano_final['status'] = 'completed'

        job_ref.update(plano_final)
        print(f"BACKGROUND JOB CONCLUÍDO: {job_id}")

    except Exception as e:
        print(f"!!! ERRO NO BACKGROUND JOB {job_id}: {e} !!!")
        traceback.print_exc()
        job_ref.update({
            'status': 'failed', 
            'error': str(e)
        })

def processar_refinamento_em_background(user_id, job_id, original_plan, feedback_text):
    """Função de background para refinar um plano existente com base no feedback."""
    print(f"BACKGROUND JOB (REFINAMENTO) INICIADO: {job_id} para usuário {user_id}")
    job_ref = db.collection('users').document(user_id).collection('plans').document(job_id)

    try:
        # Remove campos que não devem ser enviados de volta para a IA
        original_plan.pop('status', None)
        original_plan.pop('jobId', None)
        original_plan.pop('criadoEm', None)

        prompt = (
            "Você é um coach especialista em otimizar planos de estudo para concursos. Sua tarefa é ajustar um plano de estudos JSON existente com base no feedback de um aluno.\n\n"
            f"### PLANO ORIGINAL (JSON):\n{json.dumps(original_plan, indent=2)}\n\n"
            f"### PEDIDO DE AJUSTE DO ALUNO:\n'{feedback_text}'\n\n"
            "### REGRAS CRÍTICAS (SEGUIR EXATAMENTE):\n"
            "1. **SE o aluno pedir mudanças de tempo de estudo (ex: '2 horas aos domingos', '45 minutos nas terças'):**\n"
            "   - REESCREVA COMPLETAMENTE o plano com os novos tempos\n"
            "   - Cada atividade deve ter 25 minutos de duração\n"
            "   - 2 horas = 4 atividades de 25 min (100 min total)\n"
            "   - 45 minutos = 2 atividades de 25 min (50 min total)\n"
            "   - Redistribua TODAS as matérias do plano original nos novos dias\n"
            "   - NÃO duplique matérias no mesmo dia\n"
            "   - NÃO mantenha atividades em dias que o aluno não mencionou\n\n"
            "2. **SE o aluno pedir outras mudanças (método, matéria específica):**\n"
            "   - Modifique apenas as atividades mencionadas\n"
            "   - Mantenha o resto do plano igual\n\n"
            "3. **ATUALIZE O RESUMO:** Adicione uma linha no final do 'resumo_estrategico' começando com 'Ajuste realizado:'\n\n"
            "### EXEMPLO CONCRETO:\n"
            "Se o aluno pedir '2 horas aos domingos e 45 minutos nas terças':\n"
            "- Domingo: 4 atividades de 25 min cada (100 min total)\n"
            "- Terça: 2 atividades de 25 min cada (50 min total)\n"
            "- Remova atividades de outros dias\n"
            "- Redistribua todas as matérias originais nesses dois dias\n\n"
            "### FORMATO DE SAÍDA:\n"
            "Retorne um único objeto JSON com a chave 'plano_de_estudos' contendo o plano atualizado."
        )
        system_message = "Você é um assistente especializado em ajustar planos de estudo. Quando o usuário pedir mudanças de tempo, reescreva completamente o plano. Quando pedir mudanças específicas, modifique apenas o necessário. Sempre retorne JSON válido."

        resultado_ia = call_openai_api(prompt, system_message)

        if 'plano_de_estudos' not in resultado_ia:
            raise ValueError("A resposta da IA não continha a estrutura de plano esperada.")

        plano_refinado = resultado_ia['plano_de_estudos']
        plano_refinado['status'] = 'completed' # Marca como completo novamente
        plano_refinado['criadoEm'] = firestore.SERVER_TIMESTAMP # Atualiza o timestamp

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
    thread = threading.Thread(target=processar_refinamento_em_background, args=(user_id, job_id, original_plan, feedback_text))
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
    dados = request.get_json()
    email_destinatario = dados.get("email")
    nome_destinatario = dados.get("nome", "estudante")

    if not email_destinatario:
        return jsonify({"erro": "E-mail do destinatário não fornecido."}), 400

    # CORREÇÃO: Define a variável lendo do ambiente
    frontend_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")

    assunto = "Bem-vindo(a) ao IAprovas! Sua jornada para a aprovação começa agora."
    
    conteudo_html = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h1 style="color: #1d4ed8;">Olá, {nome_destinatario}!</h1>
        <p>Seja muito bem-vindo(a) à plataforma <strong>IAprovas</strong>!</p>
        <p>Estamos muito felizes em ter você conosco. Nossa inteligência artificial está pronta para criar um plano de estudos personalizado e te ajudar a alcançar a tão sonhada aprovação.</p>
        <p>Seus próximos passos recomendados:</p>
        <ol>
            <li>Acesse a área de <a href="{frontend_url}/cronograma.html" style="color: #1d4ed8;">Cronograma</a> para gerar seu primeiro plano de estudos.</li>
            <li>Explore a seção de <a href="{frontend_url}/exercicios.html" style="color: #1d4ed8;">Exercícios</a> para testar seus conhecimentos.</li>
            <li>Visite a página de <a href="{frontend_url}/dicas-estrategicas.html" style="color: #1d4ed8;">Dicas Estratégicas</a> para otimizar sua preparação.</li>
        </ol>
        <p>Se tiver qualquer dúvida, basta responder a este e-mail.</p>
        <p>Bons estudos!</p>
        <p><strong>Equipe IAprovas</strong></p>
    </div>
    """

    conteudo_texto = f"""
    Olá, {nome_destinatario}!
    Seja muito bem-vindo(a) à plataforma IAprovas!
    Estamos muito felizes em ter você conosco.
    Seus próximos passos recomendados:
    1. Cronograma: {frontend_url}/cronograma.html
    2. Exercícios: {frontend_url}/exercicios.html
    3. Dicas Estratégicas: {frontend_url}/dicas-estrategicas.html
    Bons estudos!
    Equipe IAprovas
    """
    
    sucesso = enviar_email(email_destinatario, nome_destinatario, assunto, conteudo_html, conteudo_texto)

    if sucesso:
        return jsonify({"mensagem": "Solicitação de e-mail de boas-vindas processada."}), 200
    else:
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

        if data.get('status') != 'processing':
            return jsonify({"status": "completed", "plano": data})
        else:
            return jsonify({"status": "processing"})

    except Exception as e:
        print(f"Erro ao verificar status do job {job_id}: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# --- LÓGICA DE GERAÇÃO DE EXERCÍCIOS COM RAG ---
def find_similar_questions(materia, topico, tipo_questao, limit=3):
    """
    Busca no Firestore por questões semanticamente similares usando embeddings vetoriais.
    """
    try:
        # Cria um texto de busca combinando os inputs do usuário
        search_text = f"{materia}: {topico}"
        query_embedding = get_embedding(search_text)

        if not query_embedding:
            raise ValueError("Não foi possível gerar o embedding para a busca.")

        # Converte para um array numpy para cálculos
        query_vector = np.array(query_embedding)

        # Busca candidatas no Firestore (filtrando por matéria para otimizar)
        docs = db.collection('banco_questoes').where('materia', '==', materia).stream()

        similar_questions = []
        for doc in docs:
            question_data = doc.to_dict()
            if 'embedding' in question_data and question_data.get('embedding'):
                question_vector = np.array(question_data['embedding'])
                
                # Calcula a similaridade de cosseno (um valor entre -1 e 1, onde 1 é mais similar)
                similarity = np.dot(question_vector, query_vector) / (np.linalg.norm(question_vector) * np.linalg.norm(query_vector))
                
                similar_questions.append((similarity, question_data))

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

        ### VERIFICAÇÃO FINAL (OBRIGATÓRIO)
        Antes de gerar a resposta, revise seu próprio trabalho para garantir que 100% das questões de múltipla escolha geradas possuem exatamente 5 alternativas.
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

        # ATUALIZE AQUI com os IDs que você copiou da Stripe
        price_ids = {
            'basico': 'price_1RbNwKI6qNljWf7uteg6oRkd', # COLE AQUI O ID DO PLANO BÁSICO
            'intermediario': 'price_1RbNwKI6qNljWf7usjgSzXQ3', # COLE AQUI O ID DO PLANO INTERMEDIÁRIO
            'premium': 'price_1RbNwKI6qNljWf7u9ubuSbsI', # COLE AQUI O ID DO PLANO PREMIUM MENSAL
            'anual': 'price_1RbNwKI6qNljWf7uWXU6dGod', # COLE AQUI O ID DO PLANO PREMIUM ANUAL
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

                    # Envia e-mail de confirmação de assinatura
                    assunto = "Sua assinatura IAprovas foi confirmada!"
                    conteudo_html = f"<p>Olá, {user_nome},</p><p>Sua assinatura do plano Premium foi ativada com sucesso! Explore todo o potencial da plataforma.</p>"
                    conteudo_texto = "Sua assinatura do plano Premium foi ativada com sucesso!"
                    enviar_email(user_email, user_nome, assunto, conteudo_html, conteudo_texto)

            except Exception as e:
                print(f"Erro no webhook checkout.session.completed: {e}")
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

                # Envia e-mail de cancelamento
                assunto = "Sua assinatura IAprovas foi cancelada"
                conteudo_html = f"<p>Olá, {user_nome},</p><p>Confirmamos o cancelamento da sua assinatura. Você terá acesso às funcionalidades premium até o final do seu ciclo de faturamento atual.</p>"
                conteudo_texto = "Sua assinatura IAprovas foi cancelada."
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
@cross_origin(supports_credentials=True) # Adicionado para consistência
def delete_user_account():
    data = request.get_json()
    user_id = data.get('userId')
    if not user_id: return jsonify(error={'message': 'ID do usuário não fornecido.'}), 400

    try:
        # Passo 1: Obter dados do usuário ANTES de deletar
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        if not user_doc.exists:
            # Se não existe no Firestore, apenas tenta deletar do Auth
            firebase_auth.delete_user(user_id)
            return jsonify(success=True, message="Conta de autenticação excluída.")

        user_data = user_doc.to_dict()
        user_email = user_data.get('email')
        user_nome = user_data.get('nome', 'Ex-usuário')

        # Passo 2: Deletar do Firestore e Auth
        user_ref.delete()
        firebase_auth.delete_user(user_id)

        # Passo 3: Enviar e-mail de confirmação de exclusão
        if user_email:
            assunto = "Sua conta na IAprovas foi excluída"
            conteudo_html = f"<p>Olá, {user_nome},</p><p>Confirmamos que sua conta e todos os seus dados na plataforma IAprovas foram permanentemente excluídos, conforme sua solicitação.</p><p>Agradecemos pelo tempo que esteve conosco.</p>"
            conteudo_texto = "Sua conta na IAprovas foi excluída com sucesso."
            enviar_email(user_email, user_nome, assunto, conteudo_html, conteudo_texto)

        return jsonify(success=True, message="Conta e dados excluídos com sucesso.")

    except firebase_auth.UserNotFoundError:
        return jsonify(error={'message': 'Usuário não encontrado na autenticação.'}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify(error={'message': 'Ocorreu um erro interno ao excluir a conta.'}), 500

@app.route("/get-usage-limits/<user_id>", methods=['GET'])
@cross_origin(supports_credentials=True)
def get_usage_limits(user_id):
    try:
        today_str = datetime.utcnow().strftime('%Y-%m-%d')
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

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), debug=True)
