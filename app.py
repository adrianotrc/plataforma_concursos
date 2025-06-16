# app.py - Versão com texto puro no e-mail para melhorar entregabilidade

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
from firebase_admin import credentials, firestore
import resend

load_dotenv()

try:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"ERRO: Falha ao inicializar o Firebase Admin SDK. Verifique o arquivo 'serviceAccountKey.json'. Erro: {e}")
    db = None

app = Flask(__name__)
frontend_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")
CORS(app, resources={r"/*": {"origins": frontend_url}}, supports_credentials=True)

openai_api_key = os.getenv("OPENAI_API_KEY")
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
resend.api_key = os.getenv("RESEND_API_KEY")

# Verificação das chaves
if not openai_api_key:
    print("AVISO: A variável de ambiente OPENAI_API_KEY não foi encontrada.")
if not stripe.api_key:
    print("AVISO: A variável de ambiente STRIPE_SECRET_KEY não foi encontrada.")
if not resend.api_key:
    print("AVISO: A variável de ambiente RESEND_API_KEY não foi encontrada.")

client = OpenAI(api_key=openai_api_key)

def enviar_email(para_email, nome_usuario, assunto, conteudo_html, conteudo_texto):
    if not resend.api_key:
        print("ERRO DE E-MAIL: RESEND_API_KEY não configurada. E-mail não enviado.")
        return False
    
    email_remetente = "Equipe IAprovas <contato@iaprovas.com.br>" 

    params = {
        "from": email_remetente,
        "to": [para_email],
        "subject": assunto,
        "html": conteudo_html,
        "text": conteudo_texto, # Adicionando a versão em texto puro
    }
    
    try:
        email_sent = resend.Emails.send(params)
        print(f"E-mail enviado para {para_email} via Resend. Response: {email_sent}")
        return True
    except Exception as e:
        print(f"ERRO ao enviar e-mail para {para_email} via Resend: {e}")
        return False

@app.route("/enviar-email-boas-vindas", methods=['POST'])
def enviar_email_boas_vindas():
    # Teste de depuração: Apenas registra a chamada e retorna sucesso.
    # Nenhuma chamada externa para o Resend é feita aqui.
    print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    print("!!! SUCESSO: A ROTA /enviar-email-boas-vindas FOI ATINGIDA NA RENDER !!!")
    print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    sys.stdout.flush() # Força a escrita do log imediatamente

    return jsonify({"mensagem": "Teste de rota bem-sucedido."}), 200


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
            temperature=0.5
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

        price_ids = {
            'mensal': 'price_1RZd9fRNnbn9WEbDscWoz0Rl',
            'anual': 'price_1RZdACRNnbn9WEbD7HCP4AW9',
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

        if plan == 'trial':
            print("Plano de teste detectado. Adicionando 7 dias de trial à chamada.")
            session_params['subscription_data'] = {'trial_period_days': 7}

        print("Enviando os seguintes parâmetros para a Stripe:", session_params)
        
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
        
        if user_id:
            print(f"Atualizando plano para 'premium' para o usuário: {user_id}")
            try:
                if db is not None:
                    user_ref = db.collection('users').document(user_id)
                    user_ref.update({
                        'plano': 'premium'
                    })
                    print("Usuário atualizado com sucesso no Firestore!")
                else:
                    print("ERRO: Conexão com Firestore não está disponível.")
            except Exception as e:
                print(f"!!! Erro ao atualizar usuário no Firestore: {e} !!!")
        else:
            print("!!! Alerta: Webhook recebido sem client_reference_id (userId) !!!")

    return 'Success', 200


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))