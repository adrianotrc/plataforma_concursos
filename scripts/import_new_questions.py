#!/usr/bin/env python3
"""
Script para importar novas questões ao banco de dados
Procedimento automatizado para adicionar questões
"""

import os
import json
import time
import re
from openai import OpenAI
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

# Carrega variáveis de ambiente
load_dotenv()

# Configuração OpenAI
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Configuração Firebase
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()

def clean_enunciado(enunciado):
    """Remove prefixos como [LÍNGUA PORTUGUESA] do início do enunciado"""
    return re.sub(r"^\[.*?\]\s*", "", enunciado or "")

def get_embedding(text, model="text-embedding-3-small"):
    """Gera embedding para um texto"""
    try:
        response = client.embeddings.create(
            input=text,
            model=model
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"Erro ao gerar embedding: {e}")
        return None

def identify_materia_topico_with_ai(question):
    """Identifica matéria e tópico usando IA"""
    enunciado = question.get('texto_enunciado', '')
    prompt = f"""
    Analise esta questão de concurso e identifique de forma ESPECÍFICA:
    1. MATÉRIA: Deve ser o ramo ESPECÍFICO da matéria. Exemplos corretos:
       - "Direito Constitucional" (NÃO apenas "Direito")
       - "Direito Administrativo" (NÃO apenas "Direito")
       - "Língua Portuguesa" (NÃO apenas "Português")
       - "Matemática Financeira" (NÃO apenas "Matemática")
       - "Economia Monetária" (NÃO apenas "Economia")
    2. TÓPICO: Deve ser o assunto ESPECÍFICO tratado na questão. Exemplos:
       - "Direitos Fundamentais" (para Direito Constitucional)
       - "Modalidades de Licitação" (para Direito Administrativo)
       - "Análise Sintática" (para Língua Portuguesa)
       - "Juros Compostos" (para Matemática Financeira)
    
    QUESTÃO: {enunciado}
    
    Responda APENAS no formato JSON:
    {{
        "materia": "Nome específico da matéria",
        "topico": "Tópico específico tratado"
    }}
    """
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=200
        )
        
        result = response.choices[0].message.content.strip()
        # Tenta extrair JSON da resposta
        if result.startswith('{') and result.endswith('}'):
            data = json.loads(result)
            return data.get('materia', 'Geral'), data.get('topico', 'Geral')
        else:
            return 'Geral', 'Geral'
            
    except Exception as e:
        print(f"Erro na IA: {e}")
        return 'Geral', 'Geral'

def identify_question_type(resposta_correta):
    """Identifica o tipo de questão baseado na resposta correta"""
    resposta = resposta_correta.strip().upper()
    
    if resposta in ["A", "B", "C", "D", "E"]:
        return "multipla_escolha"
    elif resposta in ["CERTO", "ERRADO"]:
        return "certo_errado"
    else:
        return "certo_errado"  # Padrão para questões de concurso

def process_and_import_questions(input_file, output_file=None):
    """
    Processa e importa questões de um arquivo JSON
    """
    print(f"🔄 Processando arquivo: {input_file}")
    
    # Carrega questões
    with open(input_file, 'r', encoding='utf-8') as f:
        questions = json.load(f)
    
    print(f"📊 Total de questões encontradas: {len(questions)}")
    
    processed_questions = []
    
    for i, question in enumerate(questions, 1):
        print(f"🔄 Processando questão {i}/{len(questions)}...")
        
        # Verifica se já tem matéria e tópico
        materia = question.get('materia')
        topico = question.get('topico')
        
        # Se não tem ou é genérico, usa IA
        if not materia or not topico or materia in ["Direito", "Português", "Matemática", "Economia"]:
            print(f"   🤖 Identificando matéria e tópico com IA...")
            materia, topico = identify_materia_topico_with_ai(question)
            print(f"   ✅ Matéria: {materia}, Tópico: {topico}")
        
        # Processa a questão
        processed_question = {
            "texto_enunciado": clean_enunciado(question.get('texto_enunciado', '')),
            "resposta_correta": question.get('resposta_correta', ''),
            "banca": question.get('banca', ''),
            "concurso": question.get('concurso', ''),
            "ano": question.get('ano', ''),
            "materia": materia,
            "topico": topico
        }
        
        processed_questions.append(processed_question)
        
        # Pausa para não sobrecarregar a API
        time.sleep(0.5)
    
    # Salva questões processadas
    if output_file:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(processed_questions, f, ensure_ascii=False, indent=2)
        print(f"💾 Questões processadas salvas em: {output_file}")
    
    return processed_questions

def import_to_firestore(processed_questions, start_id=None):
    """
    Importa questões processadas para o Firestore
    """
    print(f"🚀 Importando {len(processed_questions)} questões para o Firestore...")
    
    # Determina ID inicial
    if start_id is None:
        # Busca o último ID no Firestore
        docs = list(db.collection('banco_questoes').stream())
        if docs:
            last_ids = [int(doc.id.split('_')[1]) for doc in docs if doc.id.startswith('questao_')]
            start_id = max(last_ids) + 1 if last_ids else 1
        else:
            start_id = 1
    
    print(f"📝 Iniciando importação a partir do ID: {start_id}")
    
    success_count = 0
    error_count = 0
    
    for i, question in enumerate(processed_questions):
        question_id = start_id + i
        
        print(f"🔄 Importando questão {question_id}...")
        
        try:
            # Gera embedding
            enunciado = question.get('texto_enunciado', '')
            embedding = get_embedding(enunciado)
            
            if not embedding:
                print(f"   ❌ Erro ao gerar embedding para questão {question_id}")
                error_count += 1
                continue
            
            # Identifica tipo de questão
            tipo_questao = identify_question_type(question.get('resposta_correta', ''))
            
            # Prepara dados para Firestore
            firestore_question = {
                "texto_enunciado": enunciado,
                "opcoes": [],  # Questões de certo/errado não têm alternativas
                "resposta_correta": question.get('resposta_correta'),
                "banca": question.get('banca'),
                "concurso_origem": question.get('concurso'),
                "ano": question.get('ano'),
                "tipo_questao": tipo_questao,
                "materia": question.get('materia'),
                "topico": question.get('topico'),
                "embedding": embedding,
                "avaliacoes": {"positivas": 0, "negativas": 0},
                "status_revisao": "aprovado"
            }
            
            # Salva no Firestore
            doc_id = f"questao_{question_id:04d}"
            db.collection('banco_questoes').document(doc_id).set(firestore_question)
            
            print(f"   ✅ Questão {question_id} importada com sucesso!")
            print(f"      Matéria: {question.get('materia')}")
            print(f"      Tópico: {question.get('topico')}")
            print(f"      Tipo: {tipo_questao}")
            
            success_count += 1
            
            # Pausa para não sobrecarregar
            time.sleep(0.1)
            
        except Exception as e:
            print(f"   ❌ Erro ao importar questão {question_id}: {e}")
            error_count += 1
    
    print(f"\n🎉 Importação concluída!")
    print(f"✅ Sucessos: {success_count}")
    print(f"❌ Erros: {error_count}")
    
    return success_count, error_count

def main():
    """
    Função principal para importar novas questões
    """
    print("🚀 IMPORTADOR DE NOVAS QUESTÕES")
    print("=" * 50)
    
    # Verifica se o arquivo de entrada existe
    input_file = input("📁 Digite o nome do arquivo JSON com as questões: ").strip()
    
    if not os.path.exists(input_file):
        print(f"❌ Arquivo '{input_file}' não encontrado!")
        return
    
    # Pergunta se quer processar com IA
    use_ai = input("🤖 Usar IA para identificar matéria e tópico? (s/n): ").strip().lower() == 's'
    
    if use_ai:
        print("🔄 Processando questões com IA...")
        processed_questions = process_and_import_questions(input_file, "questoes_processadas_novas.json")
    else:
        # Carrega questões sem processamento adicional
        with open(input_file, 'r', encoding='utf-8') as f:
            questions = json.load(f)
        
        processed_questions = []
        for question in questions:
            processed_question = {
                "texto_enunciado": clean_enunciado(question.get('texto_enunciado', '')),
                "resposta_correta": question.get('resposta_correta', ''),
                "banca": question.get('banca', ''),
                "concurso": question.get('concurso', ''),
                "ano": question.get('ano', ''),
                "materia": question.get('materia', 'Geral'),
                "topico": question.get('topico', 'Geral')
            }
            processed_questions.append(processed_question)
    
    # Pergunta se quer importar para Firestore
    import_to_db = input("🔥 Importar para o Firestore? (s/n): ").strip().lower() == 's'
    
    if import_to_db:
        start_id = input("📝 ID inicial para importação (deixe vazio para auto): ").strip()
        start_id = int(start_id) if start_id.isdigit() else None
        
        import_to_firestore(processed_questions, start_id)
    
    print("\n✅ Processo concluído!")

if __name__ == "__main__":
    main() 