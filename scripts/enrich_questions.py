# scripts/enrich_questions.py

import os
import json
from openai import OpenAI
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import numpy as np # Importa a biblioteca NumPy

# Carrega as variáveis de ambiente (chaves da API)
load_dotenv()

# --- Configuração dos Serviços ---
try:
    if not firebase_admin._apps:
        cred = credentials.Certificate("serviceAccountKey.json") 
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Firebase inicializado com sucesso.")
except Exception as e:
    print(f"ERRO: Falha ao inicializar o Firebase: {e}")
    db = None

try:
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise ValueError("A chave da API da OpenAI não foi encontrada no arquivo .env")
    client = OpenAI(api_key=openai_api_key)
    print("Cliente OpenAI inicializado com sucesso.")
except Exception as e:
    print(f"ERRO: Falha ao inicializar o OpenAI: {e}")
    client = None

# --- FUNÇÃO PARA GERAR VETORES (EMBEDDINGS) ---
def get_embedding(text, model="text-embedding-3-small"):
   """Gera o vetor de embedding para um determinado texto."""
   text = text.replace("\n", " ")
   try:
       response = client.embeddings.create(input=[text], model=model)
       return response.data[0].embedding
   except Exception as e:
       print(f"ERRO ao gerar embedding: {e}")
       return None

# --- Função Principal de Enriquecimento (Atualizada) ---

def enrich_and_save_question(raw_question):
    """
    Pega uma questão 'crua', usa a IA para enriquecê-la, gera o vetor e salva no Firestore.
    """
    if not db or not client:
        print("ERRO: Serviços de Firebase ou OpenAI não estão disponíveis.")
        return

    print(f"\nProcessando questão sobre: {raw_question.get('banca', 'N/A')}")

    # 1. Cria o prompt para a IA (mesmo prompt de antes)
    prompt = f"""
    Você é um especialista em análise de questões de concursos. Sua tarefa é analisar a questão abaixo e enriquecê-la, retornando um objeto JSON.
    ### Questão Crua:
    {json.dumps(raw_question, indent=2, ensure_ascii=False)}
    ### Suas Tarefas:
    1.  **Classifique o Tipo:** Identifique se a questão é do tipo "multipla_escolha" ou "certo_errado".
    2.  **Identifique a Matéria:** Determine a matéria principal (ex: 'Direito Constitucional').
    3.  **Identifique o Tópico:** Determine o tópico específico dentro da matéria (ex: 'Direitos e Garantias Fundamentais').
    4.  **Gere uma Explicação Completa:** Crie uma explicação clara e didática.
    ### Formato de Saída Obrigatório (JSON):
    Retorne um único objeto JSON com as seguintes chaves: "tipo_questao", "materia", "topico", "explicacao".
    """
    system_message = "Você é um assistente que analisa questões de concurso e retorna dados estruturados em formato JSON."

    # 2. Chama a API da OpenAI para enriquecer os dados
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system_message}, {"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        enriched_data = json.loads(response.choices[0].message.content)
        print("Dados de enriquecimento recebidos da IA.")
    except Exception as e:
        print(f"ERRO ao chamar a API da OpenAI para enriquecimento: {e}")
        return

    # 3. Gera o vetor de embedding para o enunciado
    enunciado = raw_question.get("texto_enunciado")
    embedding_vector = get_embedding(enunciado)
    if not embedding_vector:
        print(f"Falha ao gerar o vetor para a questão. A questão não será salva.")
        return
    print("Vetor (embedding) gerado com sucesso.")

    # 4. Combina todos os dados para o formato final
    final_question = {
        "enunciado": enunciado,
        "opcoes": raw_question.get("alternativas", []),
        "resposta_correta": raw_question.get("resposta_correta"),
        "banca": raw_question.get("banca"),
        "concurso_origem": raw_question.get("concurso"),
        "ano": raw_question.get("ano"),
        "tipo_questao": enriched_data.get("tipo_questao"),
        "materia": enriched_data.get("materia"),
        "topico": enriched_data.get("topico"),
        "explicacao": enriched_data.get("explicacao"),
        "embedding": embedding_vector, # <<< NOVO CAMPO SALVO
        "avaliacoes": {"positivas": 0, "negativas": 0},
        "status_revisao": "aprovado"
    }

    # 5. Salva no Firestore
    try:
        # Para evitar duplicatas, vamos criar um ID baseado no enunciado
        # Isso é uma simplificação. Uma abordagem mais robusta usaria um hash do conteúdo.
        question_id = str(hash(enunciado))
        doc_ref = db.collection('banco_questoes').document(question_id)
        doc_ref.set(final_question)
        print(f"SUCESSO: Questão enriquecida e salva no Firestore com ID: {doc_ref.id}")
    except Exception as e:
        print(f"ERRO ao salvar no Firestore: {e}")


# --- Bloco Principal para Execução do Script ---
if __name__ == "__main__":
    sample_questions = [
        {
          "texto_enunciado": "Julgue o item a seguir, a respeito de direitos e garantias fundamentais. A prática do racismo, crime inafiançável e imprescritível, é punível com reclusão.",
          "resposta_correta": "Certo",
          "banca": "Cebraspe",
          "concurso": "Polícia Federal - Agente",
          "ano": 2021
        },
        {
          "texto_enunciado": "A respeito dos princípios fundamentais da República Federativa do Brasil, assinale a afirmativa correta.",
          "alternativas": [
            { "letra": "A", "texto": "Todo poder emana do povo, que o exerce por meio de representantes eleitos ou diretamente, nos termos da Constituição Federal." },
            { "letra": "B", "texto": "A República Federativa do Brasil rege-se nas suas relações internacionais pelo princípio da não intervenção e da prevalência dos direitos humanos." },
            { "letra": "C", "texto": "Um dos fundamentos da República Federativa do Brasil é a garantia do desenvolvimento nacional." },
            { "letra": "D", "texto": "Constitui um dos objetivos da República Federativa do Brasil a construção de uma sociedade livre, justa e solidária." }
          ],
          "resposta_correta": "A",
          "banca": "FGV",
          "concurso": "TJ-DFT - Analista",
          "ano": 2022
        }
    ]

    for question in sample_questions:
        enrich_and_save_question(question)