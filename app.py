# app.py - Versão com correção definitiva para a geração de cronogramas

import os
import json
from datetime import datetime, timedelta
import math
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI
import stripe
import traceback
import firebase_admin
from firebase_admin import credentials, firestore, auth as firebase_auth
import threading

load_dotenv()

# --- Configuração do Firebase ---
try:
    if not firebase_admin._apps:
        cred = credentials.Certificate("serviceAccountKey.json")
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"ERRO: Falha ao inicializar o Firebase Admin SDK: {e}")
    db = None

app = Flask(__name__)

# --- Configuração de CORS ---
allowed_origins = [
    "http://127.0.0.1:5500", "http://localhost:5500",
    "https://iaprovas.com.br", "https://www.iaprovas.com.br"
]
CORS(app, resources={r"/*": {"origins": allowed_origins}}, supports_credentials=True)

# --- Configuração das APIs ---
openai_api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=openai_api_key)

# --- Função de Trabalho em Segundo Plano ---
def processar_plano_em_background(user_id, job_id, dados_usuario):
    print(f"BACKGROUND JOB INICIADO: {job_id} para usuário {user_id}")
    job_ref = db.collection('users').document(user_id).collection('plans').document(job_id)
    
    try:
        # Lógica para calcular o número de semanas (sem alterações)
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

        # --- PROMPT FINAL COM LÓGICA PEDAGÓGICA ---
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
            "1. **DIAS E TEMPO DE ESTUDO:** Gere atividades para TODOS os dias da semana informados, usando 100% do tempo disponível para cada dia. A alocação de tempo deve ser flexível, usando a duração de sessão preferencial e criando uma sessão final com o tempo restante.\n"
            "2. **LÓGICA DE PROGRESSÃO DE ESTUDO (REGRA MAIS IMPORTANTE):**\n"
            "   a. Você DEVE aplicar um ciclo de aprendizado. Para cada tópico, a primeira vez que ele aparecer no plano, o 'tipo_de_estudo' DEVE ser 'Estudo de Teoria'.\n"
            "   b. Em uma sessão FUTURA (em outro dia) para o MESMO tópico, o 'tipo_de_estudo' DEVE ser 'Resolução de Exercícios'.\n"
            "   c. Periodicamente, e principalmente nas semanas finais, você DEVE incluir sessões de 'Revisão Ativa' para os tópicos que já foram estudados com teoria e exercícios.\n"
            "   d. GARANTA que o plano contenha uma mistura equilibrada e inteligente dos três tipos de estudo ('Estudo de Teoria', 'Resolução de Exercícios', 'Revisão Ativa') ao longo das semanas. NÃO gere um plano contendo apenas um tipo de estudo.\n"
            f"3. **MATÉRIAS:** O plano DEVE incluir TODAS as matérias listadas pelo aluno.\n"
            f"4. **DURAÇÃO DO PLANO:** O plano deve ter EXATAMENTE {numero_de_semanas} semanas.\n"
            "5. **RESUMO ESTRATÉGICO:** Crie um 'resumo_estrategico' curto, explicando a lógica de progressão aplicada no plano (teoria -> exercícios -> revisão)."
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

# SUBSTITUA a rota /gerar-plano-estudos por esta:
@app.route("/gerar-plano-estudos", methods=['POST'])
def gerar_plano_iniciar_job():
    dados_usuario = request.json
    user_id = dados_usuario.get("userId")

    if not user_id:
        return jsonify({"erro_geral": "ID do usuário não fornecido."}), 400

    # Cria um novo documento na subcoleção 'plans' para este job
    job_ref = db.collection('users').document(user_id).collection('plans').document()
    job_id = job_ref.id

    # Salva um "placeholder" no Firestore com o status inicial 'processing'
    placeholder_data = {
        'status': 'processing',
        'criadoEm': firestore.SERVER_TIMESTAMP,
        'concurso_foco': dados_usuario.get('concurso_objetivo', 'Plano de Estudos'),
        'data_inicio': dados_usuario.get('data_inicio'),
        'data_termino': dados_usuario.get('data_termino'),
        'jobId': job_id
    }
    job_ref.set(placeholder_data)

    # Inicia a tarefa pesada (chamar a OpenAI) em uma thread separada
    thread = threading.Thread(target=processar_plano_em_background, args=(user_id, job_id, dados_usuario))
    thread.start()

    # Retorna uma resposta imediata para o frontend
    return jsonify({"status": "processing", "jobId": job_id}), 202


# --- FUNÇÃO DE ENVIO DE E-MAIL ---
def enviar_email(para_email, nome_usuario, assunto, conteudo_html, conteudo_texto):
    if not resend.api_key:
        print("ERRO: Chave RESEND_API_KEY não configurada no ambiente.")
        return False
    
    email_remetente = "Equipe IAprovas <contato@iaprovas.com.br>" 
    params = {
        "from": email_remetente,
        "to": [para_email],
        "subject": assunto,
        "html": conteudo_html,
        "text": conteudo_texto,
    }
    
    try:
        resend.Emails.send(params)
        print(f"E-mail enviado com sucesso para {para_email}")
        return True
    except Exception as e:
        print(f"ERRO CRÍTICO ao enviar e-mail pelo Resend: {e}")
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

    assunto = "Bem-vindo(a) ao IAprovas! Sua jornada para a aprovação começa agora."
    
    # Template em HTML completo e restaurado
    conteudo_html = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h1 style="color: #1d4ed8;">Olá, {nome_destinatario}!</h1>
        <p>Seja muito bem-vindo(a) à plataforma <strong>IAprovas</strong>!</p>
        <p>Estamos muito felizes em ter você conosco. Nossa inteligência artificial, baseada em uma metodologia de sucesso, está pronta para criar um plano de estudos personalizado e te ajudar a alcançar a tão sonhada aprovação.</p>
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

    # Versão em texto puro completa e restaurada
    conteudo_texto = f"""
    Olá, {nome_destinatario}!
    
    Seja muito bem-vindo(a) à plataforma IAprovas!
    
    Estamos muito felizes em ter você conosco. Nossa inteligência artificial, baseada em uma metodologia de sucesso, está pronta para criar um plano de estudos personalizado e te ajudar a alcançar a tão sonhada aprovação.
    
    Seus próximos passos recomendados:
    1. Acesse a área de Cronograma para gerar seu primeiro plano de estudos: {frontend_url}/cronograma.html
    2. Explore a seção de Exercícios para testar seus conhecimentos: {frontend_url}/exercicios.html
    3. Visite a página de Dicas Estratégicas para otimizar sua preparação: {frontend_url}/dicas-estrategicas.html
    
    Se tiver qualquer dúvida, basta responder a este e-mail.
    
    Bons estudos!
    Equipe IAprovas
    """
    
    sucesso = enviar_email(email_destinatario, nome_destinatario, assunto, conteudo_html, conteudo_texto)

    if sucesso:
        return jsonify({"mensagem": "Solicitação de e-mail de boas-vindas processada."}), 200
    else:
        return jsonify({"erro": "Falha interna ao tentar enviar o e-mail."}), 500


def call_openai_api(prompt_content, system_message):
    if not openai_api_key:
        raise ValueError("A chave da API da OpenAI não está configurada no servidor.")
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt_content}
            ],
            response_format={"type": "json_object"},
            temperature=0.5,
            timeout=120.0 # Aumenta o timeout da chamada específica
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"ERRO na chamada da API OpenAI: {e}")
        raise

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
    dados_req = request.json
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
def gerar_dica_personalizada():
    dados_desempenho = request.json.get("desempenho", [])
    
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
    
@app.route("/gerar-enunciado-discursiva", methods=['POST'])
def gerar_enunciado_discursiva():
    dados_req = request.json
    try:
        prompt = (
            f"Você é um especialista em criar questões para concursos. Com base nos seguintes critérios: {json.dumps(dados_req)}, "
            f"crie um único e excelente enunciado para uma questão discursiva. O enunciado deve ser claro, objetivo e simular perfeitamente uma questão real da banca especificada (se houver).\n\n"
            f"FORMATO OBRIGATÓRIO: Objeto JSON com uma única chave: 'enunciado_gerado', que é uma string contendo o enunciado."
        )
        system_message = "Você gera enunciados de questões discursivas para concursos, formatando a saída em JSON."
        dados = call_openai_api(prompt, system_message)
        return jsonify(dados)
    except Exception as e:
        return jsonify({"erro_geral": str(e)}), 500


@app.route("/corrigir-discursiva", methods=['POST'])
def corrigir_discursiva():
    dados_req = request.json
    try:
        prompt = (
            f"Você é um examinador de concurso rigoroso e justo, especialista em analisar questões discursivas. Analise a seguinte resposta de um aluno.\n"
            f"### Enunciado da Questão:\n{dados_req.get('enunciado')}\n\n"
            f"### Resposta do Aluno:\n{dados_req.get('resposta')}\n\n"
            f"### Foco da Correção Solicitado pelo Aluno:\n{dados_req.get('foco_correcao', 'Avaliação geral')}\n\n"
            f"REGRAS DA CORREÇÃO:\n"
            f"1. Atribua uma nota de 0.0 a 10.0, com uma casa decimal.\n"
            f"2. Forneça um 'comentario_geral' sobre o desempenho, destacando a impressão geral do texto.\n"
            f"3. Crie uma análise detalhada por critérios, dentro de uma lista chamada 'analise_por_criterio'.\n"
            f"4. Para cada critério na lista, inclua as chaves 'criterio' (ex: 'Desenvolvimento do Tema'), 'nota_criterio' (a nota para aquele critério específico), e 'comentario' (o feedback detalhado para o critério).\n"
            f"5. Os critérios a serem analisados OBRIGATORIAMENTE são: 'Apresentação e Estrutura Textual', 'Desenvolvimento do Tema e Argumentação', e 'Domínio da Modalidade Escrita (Gramática)''.\n"
            f"6. Use tags HTML `<strong>` para destacar termos ou frases importantes nos seus comentários.\n\n"
            f"ESTRUTURA DE RESPOSTA JSON (SEGUIR RIGOROSAMENTE):\n"
            f"O JSON deve conter as chaves: 'nota_atribuida' (float), 'comentario_geral' (string), e 'analise_por_criterio' (LISTA de objetos, onde cada objeto tem 'criterio', 'nota_criterio' e 'comentario')."
        )
        system_message = "Você é um examinador de concursos que fornece correções estruturadas por critérios, formatando a saída estritamente em JSON."
        
        dados = call_openai_api(prompt, system_message)
        return jsonify(dados)
    except Exception as e:
        return jsonify({"erro_geral": str(e)}), 500
    
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
        print("Sessão de checkout completada:", session['id'])
        
        user_id = session.get('client_reference_id')
        stripe_customer_id = session.get('customer') # Pega o ID do cliente Stripe
        
        if user_id and stripe_customer_id:
            print(f"Atualizando plano para o usuário: {user_id} com Stripe Customer ID: {stripe_customer_id}")
            try:
                if db is not None:
                    user_ref = db.collection('users').document(user_id)
                    # ATUALIZAÇÃO: Salva tanto o plano quanto o ID do cliente
                    user_ref.update({
                        'plano': 'premium', # ou o plano específico
                        'stripeCustomerId': stripe_customer_id
                    })
                    print("Usuário atualizado com sucesso no Firestore!")
                else:
                    print("ERRO: Conexão com Firestore não está disponível.")
            except Exception as e:
                print(f"!!! Erro ao atualizar usuário no Firestore: {e} !!!")
        else:
            print("!!! Alerta: Webhook recebido sem client_reference_id ou customer_id !!!")

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
def delete_user_account():
    data = request.get_json()
    user_id = data.get('userId')

    if not user_id:
        return jsonify(error={'message': 'ID do usuário não fornecido.'}), 400

    print(f"--- Recebida solicitação para excluir conta do usuário: {user_id} ---")

    try:
        # Passo 1: Excluir o usuário do Firebase Authentication
        firebase_auth.delete_user(user_id)
        print(f"Usuário {user_id} excluído com sucesso do Firebase Authentication.")

        # Passo 2: Excluir o documento do usuário no Firestore
        if db:
            user_ref = db.collection('users').document(user_id)
            user_ref.delete()
            print(f"Documento do usuário {user_id} excluído com sucesso do Firestore.")
        
        # Opcional: Futuramente, poderíamos adicionar a exclusão de subcoleções aqui.

        return jsonify(success=True, message="Conta excluída com sucesso.")

    except firebase_auth.UserNotFoundError:
        print(f"Erro: Usuário {user_id} não encontrado no Firebase Authentication.")
        return jsonify(error={'message': 'Usuário não encontrado.'}), 404
    except Exception as e:
        print(f"!!! Erro crítico ao excluir a conta {user_id}: {e} !!!")
        traceback.print_exc()
        return jsonify(error={'message': 'Ocorreu um erro interno ao tentar excluir a conta.'}), 500

if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))