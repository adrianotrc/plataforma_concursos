# scripts/enrich_questions.py

import os
import json
from openai import OpenAI
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import time

load_dotenv()

# --- Configurações ---
try:
    if not firebase_admin._apps:
        cred = credentials.Certificate("serviceAccountKey.json")
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Firebase inicializado.")
except Exception as e:
    print(f"ERRO Firebase: {e}")
    db = None

try:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    print("Cliente OpenAI inicializado.")
except Exception as e:
    print(f"ERRO OpenAI: {e}")
    client = None

def get_embedding(text, model="text-embedding-3-small"):
   text = text.replace("\n", " ")
   try:
       response = client.embeddings.create(input=[text], model=model)
       return response.data[0].embedding
   except Exception as e:
       print(f"ERRO ao gerar embedding: {e}")
       return None

def enrich_and_save_question(raw_question):
    if not db or not client: return

    question_id = str(hash(raw_question.get("texto_enunciado")))
    doc_ref = db.collection('banco_questoes').document(question_id)

    # Verifica se a questão já existe para não reprocessar
    if doc_ref.get().exists:
        print(f"Questão já existe no banco. ID: {question_id}. Pulando.")
        return

    print(f"Processando nova questão da banca: {raw_question.get('banca', 'N/A')}")

    prompt = f"""
    Você é um especialista em análise de questões de concursos. Sua tarefa é analisar a questão abaixo e retornar um objeto JSON.
    ### Questão Crua:
    {json.dumps(raw_question, indent=2, ensure_ascii=False)}
    ### Suas Tarefas:
    1. Classifique o Tipo: "multipla_escolha" ou "certo_errado".
    2. Identifique a Matéria: (ex: 'Direito Constitucional').
    3. Identifique o Tópico: (ex: 'Direitos e Garantias Fundamentais').
    4. Gere uma Explicação Completa e Didática.
    ### Formato de Saída Obrigatório (JSON):
    Retorne um objeto JSON com as chaves: "tipo_questao", "materia", "topico", "explicacao".
    """
    system_message = "Você analisa questões de concurso e retorna dados estruturados em JSON."

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system_message}, {"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        enriched_data = json.loads(response.choices[0].message.content)

        enunciado = raw_question.get("texto_enunciado")
        embedding_vector = get_embedding(enunciado)
        if not embedding_vector:
            print(f"Falha ao gerar vetor para a questão. Pulando.")
            return

        final_question = {
            "enunciado": enunciado, "opcoes": raw_question.get("alternativas", []),
            "resposta_correta": raw_question.get("resposta_correta"), "banca": raw_question.get("banca"),
            "concurso_origem": raw_question.get("concurso"), "ano": raw_question.get("ano"),
            "tipo_questao": enriched_data.get("tipo_questao"), "materia": enriched_data.get("materia"),
            "topico": enriched_data.get("topico"), "explicacao": enriched_data.get("explicacao"),
            "embedding": embedding_vector, "avaliacoes": {"positivas": 0, "negativas": 0},
            "status_revisao": "aprovado", "criadoEm": firestore.SERVER_TIMESTAMP
        }

        doc_ref.set(final_question)
        print(f"SUCESSO: Questão salva no Firestore com ID: {doc_ref.id}")

    except Exception as e:
        print(f"ERRO no processamento da questão: {e}")

if __name__ == "__main__":
    try:
        with open('questoes_para_importar.json', 'r', encoding='utf-8') as f:
            questions_to_import = json.load(f)

        print(f"Encontradas {len(questions_to_import)} questões para importar.")

        for i, question in enumerate(questions_to_import):
            enrich_and_save_question(question)
            # Pausa para não sobrecarregar a API da OpenAI
            if i < len(questions_to_import) - 1:
                time.sleep(1) # Pausa de 1 segundo entre as chamadas

        print("\nImportação concluída.")

    except FileNotFoundError:
        print("ERRO: Arquivo 'questoes_para_importar.json' não encontrado. Crie o arquivo com as questões que deseja importar.")
    except json.JSONDecodeError:
        print("ERRO: O arquivo 'questoes_para_importar.json' contém um erro de formatação JSON.")