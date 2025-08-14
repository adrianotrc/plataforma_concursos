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
from babel.dates import format_date
import traceback
from firebase_admin import credentials, firestore, auth as firebase_auth


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
    'trial': {'cronogramas': 5, 'exercicios': 5, 'discursivas': 5, 'correcoes_discursivas': 5, 'dicas': 5, 'flashcards': 5},
    'basico': {'cronogramas': 10, 'exercicios': 10, 'discursivas': 10, 'correcoes_discursivas': 10, 'dicas': 10, 'flashcards': 10},
    'intermediario': {'cronogramas': 15, 'exercicios': 15, 'discursivas': 15, 'correcoes_discursivas': 15, 'dicas': 15, 'flashcards': 15},
    'premium': {'cronogramas': 20, 'exercicios': 20, 'discursivas': 20, 'correcoes_discursivas': 20, 'dicas': 20, 'flashcards': 20},
    'anual': {'cronogramas': 20, 'exercicios': 20, 'discursivas': 20, 'correcoes_discursivas': 20, 'dicas': 20, 'flashcards': 20}
}


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

# --- FUNÇÕES DE PRÉ-PROCESSAMENTO MATEMÁTICO ---
def preprocessar_estrutura_cronograma(dados_usuario):
    """
    Calcula estrutura matemática perfeita antes de enviar para IA
    """
    disponibilidade = dados_usuario['disponibilidade_semanal_minutos']
    duracao_sessao = dados_usuario['duracao_sessao_minutos']
    
    estrutura_dias = {}
    
    for dia, tempo_total in disponibilidade.items():
        # Calcula quantas sessões completas cabem
        sessoes_completas = tempo_total // duracao_sessao
        resto = tempo_total % duracao_sessao
        
        sessoes = []
        # Adiciona sessões completas
        for i in range(sessoes_completas):
            sessoes.append({
                'posicao': i + 1,
                'duracao': duracao_sessao
            })
        
        # Adiciona sessão de resto se houver
        if resto > 0:
            sessoes.append({
                'posicao': len(sessoes) + 1,
                'duracao': resto
            })
            
        estrutura_dias[dia] = {
            'tempo_total': tempo_total,
            'sessoes_calculadas': sessoes,
            'total_sessoes': len(sessoes)
        }
    
    return estrutura_dias

def extrair_materias_e_topicos(materias):
    """
    Extrai e formata matérias com seus tópicos específicos (OBRIGATÓRIOS) e configuração individual
    """
    materias_formatadas = []
    
    for materia in materias:
        if isinstance(materia, dict):
            nome_materia = materia.get('nome', '')
            topicos_especificos = materia.get('topicos', [])
            permitir_complementares = materia.get('permitir_topicos_complementares', True)
            
            if topicos_especificos and len(topicos_especificos) > 0:
                # Matéria COM tópicos específicos
                orientacao_complementar = "✅ Pode sugerir tópicos complementares" if permitir_complementares else "🚫 Use APENAS os tópicos especificados - PROIBIDO sugerir outros"
                materias_formatadas.append(f"**{nome_materia}**:\n  🎯 TÓPICOS OBRIGATÓRIOS: {', '.join(topicos_especificos)}\n  📋 Tópicos complementares: {orientacao_complementar}")
            else:
                # Matéria SEM tópicos específicos
                if permitir_complementares:
                    materias_formatadas.append(f"**{nome_materia}**: 💡 SEJA ESPECÍFICO E DETALHADO! Use tópicos relevantes e específicos da matéria. EVITE termos genéricos como 'Fundamentos' ou 'Conceitos Básicos'. VARIE os tópicos e métodos em cada sessão.")
                else:
                    # Situação problemática: sem tópicos + proibido sugerir = ERRO!
                    materias_formatadas.append(f"**{nome_materia}**: ⚠️ PROBLEMA: Nenhum tópico especificado mas proibido sugerir outros. Use tópicos mais básicos e fundamentais.")
        elif isinstance(materia, str):
            materias_formatadas.append(f"**{materia}**: 💡 SEJA ESPECÍFICO! Use tópicos relevantes e detalhados da matéria")
    
    return "\n".join(materias_formatadas) if materias_formatadas else "Nenhuma matéria especificada"

def criar_orientacoes_por_fase(fase_concurso):
    """
    Cria orientações específicas baseadas na fase de preparação (FASES ATUAIS DO FORMULÁRIO)
    """
    orientacoes = {
        "base_sem_edital_especifico": """
**FASE EXPLORATÓRIA - Base Sem Edital Específico**
- FOQUE em construir base sólida em todas as matérias fundamentais (70% teoria, 30% exercícios)
- Use mais "Estudo de Teoria" e "Criação de Mapa Mental" para compreender conceitos
- Priorize amplitude sobre profundidade - explore diferentes matérias
- Use "Vídeoaulas" e "Leitura de PDFs" para formar base conceitual
- Introduza exercícios básicos gradualmente para fixação""",
        
        "pre_edital_com_foco": """
**FASE DE PREPARAÇÃO DIRECIONADA - Pré-Edital com Foco**
- EQUILIBRE teoria direcionada e exercícios variados (50% teoria, 50% exercícios)
- Use "Revisão com Autoexplicação" e "Exercícios de Fixação" para consolidar
- Aprofunde conhecimentos específicos do cargo alvo usando edital anterior
- Intensifique exercícios nas matérias de maior peso/dificuldade
- Use "Flashcards" para memorização de pontos-chave""",
        
        "pos_edital_publicado": """
**FASE DE RETA FINAL - Pós-Edital Publicado**
- PRIORIZE exercícios e simulados intensivos (30% teoria, 70% exercícios)
- Use mais "Resolução de Exercícios" e "Simulados" para simular condições reais
- Foque APENAS nos tópicos específicos do edital publicado
- Use "Revisão Focada" para revisar pontos identificados como fracos
- Elimine tópicos não constantes no edital - seja estratégico"""
    }
    
    return orientacoes.get(fase_concurso, """
**ESTRATÉGIA PADRÃO**
- Use uma abordagem equilibrada entre teoria e exercícios
- Adapte conforme seu nível de conhecimento atual
- Priorize consistência sobre intensidade""")

def validar_topicos_obrigatorios(cronograma_gerado, materias_originais):
    """
    Valida se todos os tópicos obrigatórios especificados pelo usuário foram incluídos
    """
    topicos_obrigatorios = {}
    topicos_encontrados = {}
    
    # Extrai tópicos obrigatórios das matérias originais
    for materia in materias_originais:
        if isinstance(materia, dict):
            nome_materia = materia.get('nome', '')
            topicos_especificos = materia.get('topicos', [])
            if topicos_especificos:
                topicos_obrigatorios[nome_materia] = set(topicos_especificos)
                topicos_encontrados[nome_materia] = set()
    
    # Verifica quais tópicos foram incluídos no cronograma
    if 'cronograma_semanal_detalhado' in cronograma_gerado:
        for semana in cronograma_gerado['cronograma_semanal_detalhado']:
            for dia in semana.get('dias_de_estudo', []):
                for atividade in dia.get('atividades', []):
                    materia = atividade.get('materia', '')
                    topico = atividade.get('topico_sugerido', '')
                    
                    if materia in topicos_encontrados:
                        topicos_encontrados[materia].add(topico)
    
    # Verifica quais tópicos estão faltando
    topicos_faltando = {}
    for materia, obrigatorios in topicos_obrigatorios.items():
        encontrados = topicos_encontrados.get(materia, set())
        faltando = obrigatorios - encontrados
        if faltando:
            topicos_faltando[materia] = list(faltando)
    
    return {
        'validacao_aprovada': len(topicos_faltando) == 0,
        'topicos_faltando': topicos_faltando,
        'resumo': f"Validação: {'✅ Aprovada' if len(topicos_faltando) == 0 else '❌ Reprovada'} - {len(topicos_obrigatorios)} matérias com tópicos obrigatórios verificadas"
    }

def analisar_distribuicao_materias(materias, estrutura_dias):
    """
    Analisa se precisaremos repetir matérias e sugere estratégia
    """
    # Extrai nomes das matérias
    nomes_materias = []
    for materia in materias:
        if isinstance(materia, dict):
            nomes_materias.append(materia.get('nome', ''))
        elif isinstance(materia, str):
            nomes_materias.append(materia)
    
    total_materias = len(nomes_materias)
    analise_por_dia = {}
    
    for dia, estrutura in estrutura_dias.items():
        total_sessoes = estrutura['total_sessoes']
        
        if total_sessoes <= total_materias:
            # Matérias suficientes, sem repetição necessária
            estrategia = "sem_repeticao"
            materias_sugeridas = nomes_materias[:total_sessoes]
        else:
            # Precisará repetir matérias
            estrategia = "repeticao_necessaria"
            # Distribui matérias de forma inteligente
            materias_sugeridas = []
            for i in range(total_sessoes):
                materia_index = i % total_materias
                materias_sugeridas.append(nomes_materias[materia_index])
        
        analise_por_dia[dia] = {
            'estrategia': estrategia,
            'materias_sugeridas': materias_sugeridas,
            'total_sessoes': total_sessoes
        }
    
    return analise_por_dia

def criar_prompt_preenchimento(dados_usuario, estrutura_calculada, analise_materias, numero_de_semanas, tecnicas_preferidas_str):
    """
    Prompt focado em preenchimento, não em cálculos
    """
    
    # Processa matérias com tópicos específicos (OBRIGATÓRIOS) - configuração individual por matéria
    materias_detalhadas = extrair_materias_e_topicos(dados_usuario.get('materias', []))
    
    prompt = f"""Você é um especialista em criar cronogramas de estudo baseado na metodologia do 'Guia Definitivo de Aprovação'. 
Sua tarefa é PREENCHER uma estrutura já calculada matematicamente.

### ESTRUTURA PRÉ-CALCULADA PARA CADA DIA:
{json.dumps(estrutura_calculada, indent=2, ensure_ascii=False)}

### ANÁLISE DE DISTRIBUIÇÃO DE MATÉRIAS:
{json.dumps(analise_materias, indent=2, ensure_ascii=False)}

### DADOS COMPLETOS DO ALUNO:
- Concurso: {dados_usuario.get('concurso_objetivo', 'Concurso Público')}
- Fase de preparação: {dados_usuario.get('fase_concurso', 'Não informado')}
- Técnicas preferidas: {dados_usuario.get('tecnicas_preferidas', [])}
- Duração total: {numero_de_semanas} semanas
- Dificuldades específicas: {dados_usuario.get('dificuldades_materias', 'Nenhuma informada')}

### MATÉRIAS E TÓPICOS ESPECÍFICOS:
{materias_detalhadas}

### SUA TAREFA - PREENCHER CADA SESSÃO:
Para cada sessão pré-calculada, você deve atribuir:
1. MATÉRIA (use as sugeridas na análise)
2. TÓPICO específico (OBRIGATÓRIO usar os tópicos listados pelo aluno)
3. MÉTODO de estudo adequado à fase e técnicas preferidas

### REGRAS DE PREENCHIMENTO:
1. ✅ PODE repetir matérias quando necessário (se mais sessões que matérias)
2. ✅ PODE usar tópicos diferentes da mesma matéria
3. ✅ PODE usar métodos diferentes para a mesma matéria
4. ❌ EVITE apenas: mesma matéria + mesmo tópico + mesmo método no mesmo dia
5. 🎯 PRIORIZE variedade pedagógica e progressão natural
6. 📚 DISTRIBUA matérias equilibradamente ao longo das semanas
7. 🚨 **TÓPICOS OBRIGATÓRIOS**: Use TODOS os tópicos específicos listados pelo aluno
8. ⚠️ **REGRAS INDIVIDUAIS**: Cada matéria tem sua própria regra sobre tópicos complementares - respeite rigorosamente
9. 💡 **SEJA ESPECÍFICO**: NUNCA use termos genéricos como "Fundamentos" - sempre use tópicos específicos
10. 🔄 **VARIE SEMPRE**: Para matérias repetidas, use tópicos e métodos diferentes
11. 📅 **FASE DE PREPARAÇÃO**: Adapte a intensidade e métodos conforme a fase do aluno
{tecnicas_preferidas_str}

### ORIENTAÇÕES POR FASE DE PREPARAÇÃO:
{criar_orientacoes_por_fase(dados_usuario.get('fase_concurso', 'Não informado'))}

### MÉTODOS DISPONÍVEIS:
- Estudo de Teoria
- Resolução de Exercícios  
- Revisão com Autoexplicação
- Criação de Mapa Mental
- Leitura de Lei Seca

### INSTRUÇÕES CRÍTICAS PARA CRIATIVIDADE E ESPECIFICIDADE:

**🚨 REGRA FUNDAMENTAL: SEJA ESPECÍFICO, NÃO GENÉRICO**

**❌ NUNCA USE (tópicos genéricos):**
- "Fundamentos de [matéria]"
- "Conceitos Básicos"
- "Noções Gerais" 
- "Introdução à [matéria]"

**✅ SEMPRE USE (tópicos específicos):**
- Para Raciocínio Lógico: "Lógica Proposicional", "Análise Combinatória", "Sequências Lógicas"
- Para Português: "Concordância Verbal", "Regência Nominal", "Crase"
- Para Dir. Constitucional: "Direitos Fundamentais", "Poder Executivo", "Controle de Constitucionalidade"
- Para Dir. Administrativo: "Atos Administrativos", "Licitações", "Agentes Públicos"

**🔄 VARIAÇÃO OBRIGATÓRIA:**
- Se uma matéria aparece múltiplas vezes, use tópicos DIFERENTES
- Se repetir matéria + tópico, use método DIFERENTE
- Exemplo: "Lógica Proposicional" + "Teoria", depois "Análise Combinatória" + "Exercícios"

**📚 MÉTODOS VARIADOS:**
- Estudo de Teoria
- Resolução de Exercícios  
- Exercícios de Fixação
- Revisão com Autoexplicação
- Criação de Mapa Mental
- Leitura de Lei Seca
- Simulados
- Vídeoaulas

**🎯 PARA TÓPICOS OBRIGATÓRIOS:**
Se especificado "Artigo 5º" → "Artigo 5º - Direitos e Deveres Individuais"
Se especificado "Concordância" → "Concordância Verbal e Nominal"

### FORMATO DE SAÍDA - ESTRUTURA EXATA:
{{
  "plano_de_estudos": {{
    "concurso_foco": "{dados_usuario.get('concurso_objetivo', 'Concurso Público')}",
    "resumo_estrategico": "Explicação da lógica aplicada no cronograma, incluindo como foram priorizados os tópicos específicos e adaptações para a fase de preparação",
    "cronograma_semanal_detalhado": [
      {{
        "semana_numero": 1,
        "dias_de_estudo": [
          {{
            "dia_semana": "Domingo",
            "atividades": [
              {{
                "materia": "Nome da Matéria",
                "topico_sugerido": "Use tópicos prioritários listados pelo aluno quando disponíveis", 
                "tipo_de_estudo": "Método adequado à fase e técnicas preferidas",
                "duracao_minutos": [duração exata calculada]
              }}
            ]
          }}
        ]
      }}
    ]
  }}
}}

IMPORTANTE: 
- Use EXATAMENTE as durações calculadas na estrutura pré-calculada
- NÃO FAÇA CÁLCULOS matemáticos
- PREENCHA {numero_de_semanas} semanas completas
- Use TODOS os dias da estrutura calculada
- Retorne APENAS JSON válido"""
    
    return prompt

def validar_cronograma_matematicamente(plano_gerado, dados_originais):
    """
    Verifica se IA respeitou os cálculos matemáticos
    """
    erros = []
    disponibilidade_original = dados_originais['disponibilidade_semanal_minutos']
    
    for semana in plano_gerado.get('cronograma_semanal_detalhado', []):
        for dia_estudo in semana.get('dias_de_estudo', []):
            dia_nome = dia_estudo['dia_semana']
            
            if dia_nome not in disponibilidade_original:
                erros.append(f"Dia '{dia_nome}' não estava na disponibilidade original")
                continue
                
            tempo_esperado = disponibilidade_original[dia_nome]
            tempo_calculado = sum(ativ['duracao_minutos'] for ativ in dia_estudo.get('atividades', []))
            
            if tempo_calculado != tempo_esperado:
                erros.append(f"{dia_nome}: Esperado {tempo_esperado}min, calculado {tempo_calculado}min")
    
    return erros

def auto_corrigir_cronograma(plano_gerado, dados_originais):
    """
    Corrige automaticamente problemas matemáticos simples
    """
    disponibilidade = dados_originais['disponibilidade_semanal_minutos']
    duracao_sessao = dados_originais['duracao_sessao_minutos']
    
    for semana in plano_gerado.get('cronograma_semanal_detalhado', []):
        for dia_estudo in semana.get('dias_de_estudo', []):
            dia_nome = dia_estudo['dia_semana']
            if dia_nome not in disponibilidade:
                continue
                
            tempo_esperado = disponibilidade[dia_nome]
            atividades = dia_estudo.get('atividades', [])
            
            # Recalcula durações se necessário
            tempo_atual = sum(ativ['duracao_minutos'] for ativ in atividades)
            
            if tempo_atual != tempo_esperado:
                print(f"Auto-corrigindo {dia_nome}: {tempo_atual}min → {tempo_esperado}min")
                # Aplica correção automática
                sessoes_completas = tempo_esperado // duracao_sessao
                resto = tempo_esperado % duracao_sessao
                
                # Ajusta atividades existentes
                for i, atividade in enumerate(atividades):
                    if i < sessoes_completas:
                        atividade['duracao_minutos'] = duracao_sessao
                    elif i == sessoes_completas and resto > 0:
                        atividade['duracao_minutos'] = resto
                
                # Remove atividades extras se houver
                expected_activities = sessoes_completas + (1 if resto > 0 else 0)
                dia_estudo['atividades'] = atividades[:expected_activities]
    
    return plano_gerado

def adicionar_sessao_ids(plano_gerado):
    """
    Adiciona sessaoId único para cada atividade (compatibilidade com progresso)
    """
    import uuid
    
    for semana in plano_gerado.get('cronograma_semanal_detalhado', []):
        for dia_estudo in semana.get('dias_de_estudo', []):
            for atividade in dia_estudo.get('atividades', []):
                atividade['sessaoId'] = str(uuid.uuid4())
    
    return plano_gerado

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
            "⚠️ **ATENÇÃO CRÍTICA SOBRE MATÉRIAS E TÓPICOS:** A lista de matérias em `dados_usuario['materias']` contém as matérias e tópicos específicos que o aluno quer estudar. VOCÊ DEVE INCLUIR TODAS AS MATÉRIAS e priorizar os tópicos especificados pelo aluno.\n\n"
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
            f"4. **MATÉRIAS E TÓPICOS:** O plano DEVE incluir TODAS as matérias listadas pelo aluno em `dados_usuario['materias']`. Para cada matéria, priorize os tópicos específicos informados pelo aluno. Se uma matéria tem tópicos definidos, foque nesses tópicos. Se não tem tópicos específicos, use os tópicos mais fundamentais da matéria.\n"
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
        
        # Verifica se todas as matérias foram incluídas
        materias_solicitadas_raw = dados_usuario.get('materias', [])
        materias_solicitadas = set()
        
        # Extrai nomes das matérias da nova estrutura
        for materia_data in materias_solicitadas_raw:
            if isinstance(materia_data, dict):
                materias_solicitadas.add(materia_data.get('nome', ''))
            elif isinstance(materia_data, str):
                materias_solicitadas.add(materia_data)
        
        materias_incluidas = set()
        
        for semana in plano_final.get('cronograma_semanal_detalhado', []):
            for dia in semana.get('dias_de_estudo', []):
                for atividade in dia.get('atividades', []):
                    if atividade.get('materia'):
                        materias_incluidas.add(atividade['materia'])
        
        materias_faltando = materias_solicitadas - materias_incluidas
        if materias_faltando:
            print(f"⚠️ AVISO: Matérias não incluídas no cronograma: {materias_faltando}")
            # Adiciona as matérias faltantes ao resumo estratégico
            if 'resumo_estrategico' in plano_final:
                plano_final['resumo_estrategico'] += f" NOTA: As seguintes matérias foram incluídas em sessões adicionais: {', '.join(materias_faltando)}."
        
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

def processar_plano_em_background_v2(user_id, job_id, dados_usuario):
    """
    Versão melhorada com pré-processamento e validação
    """
    print(f"BACKGROUND JOB V2 INICIADO: {job_id} para usuário {user_id}")
    job_ref = db.collection('users').document(user_id).collection('plans').document(job_id)
    
    try:
        # Lógica de cálculo de semanas (mantida)
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
        
        # Processa técnicas preferidas
        tecnicas_preferidas_str = ""
        if dados_usuario.get('tecnicas_preferidas') and len(dados_usuario['tecnicas_preferidas']) > 0:
            tecnicas_list = ", ".join(dados_usuario['tecnicas_preferidas'])
            tecnicas_preferidas_str = f"\n7. **TÉCNICAS PREFERIDAS:** O aluno indicou preferência por: {tecnicas_list}. PRIORIZE essas técnicas sempre que possível."
        
        # 1. PRÉ-PROCESSAMENTO MATEMÁTICO
        print(f"Iniciando pré-processamento para {len(dados_usuario.get('materias', []))} matérias...")
        estrutura_calculada = preprocessar_estrutura_cronograma(dados_usuario)
        analise_materias = analisar_distribuicao_materias(dados_usuario.get('materias', []), estrutura_calculada)
        
        print(f"Estrutura calculada: {estrutura_calculada}")
        print(f"Análise de matérias: {analise_materias}")
        
        # 2. PROMPT FOCADO EM PREENCHIMENTO
        prompt = criar_prompt_preenchimento(dados_usuario, estrutura_calculada, analise_materias, numero_de_semanas, tecnicas_preferidas_str)
        system_message = "Você preenche estruturas de cronograma pré-calculadas com conteúdo pedagógico inteligente. Retorne apenas JSON válido."
        
        # 3. CHAMADA DA IA
        print("Enviando estrutura pré-calculada para IA...")
        resultado_ia = call_openai_api(prompt, system_message)
        
        if 'plano_de_estudos' not in resultado_ia:
            raise ValueError("A resposta da IA não continha a estrutura de plano esperada.")
        
        plano_gerado = resultado_ia['plano_de_estudos']
        
        # 4. VALIDAÇÃO MATEMÁTICA
        erros = validar_cronograma_matematicamente(plano_gerado, dados_usuario)
        
        # 5. AUTO-CORREÇÃO SE NECESSÁRIO
        if erros:
            print(f"⚠️ Erros detectados: {erros}. Aplicando auto-correção...")
            plano_gerado = auto_corrigir_cronograma(plano_gerado, dados_usuario)
            # Valida novamente após correção
            erros_pos_correcao = validar_cronograma_matematicamente(plano_gerado, dados_usuario)
            if erros_pos_correcao:
                print(f"⚠️ Erros persistem após correção: {erros_pos_correcao}")
            else:
                print("✅ Cronograma corrigido com sucesso!")
        else:
            print("✅ Cronograma gerado corretamente na primeira tentativa!")
        
        # 6. ADICIONA SESSAO IDS PARA COMPATIBILIDADE
        plano_final = adicionar_sessao_ids(plano_gerado)
        
        # 7. VERIFICAÇÃO DE MATÉRIAS (mantida para compatibilidade)
        materias_solicitadas_raw = dados_usuario.get('materias', [])
        materias_solicitadas = set()
        
        for materia_data in materias_solicitadas_raw:
            if isinstance(materia_data, dict):
                materias_solicitadas.add(materia_data.get('nome', ''))
            elif isinstance(materia_data, str):
                materias_solicitadas.add(materia_data)
        
        materias_incluidas = set()
        for semana in plano_final.get('cronograma_semanal_detalhado', []):
            for dia in semana.get('dias_de_estudo', []):
                for atividade in dia.get('atividades', []):
                    if atividade.get('materia'):
                        materias_incluidas.add(atividade['materia'])
        
        materias_faltando = materias_solicitadas - materias_incluidas
        if materias_faltando:
            print(f"⚠️ AVISO: Matérias não incluídas no cronograma: {materias_faltando}")
            if 'resumo_estrategico' in plano_final:
                plano_final['resumo_estrategico'] += f" NOTA: As seguintes matérias precisam ser incluídas em futuras revisões: {', '.join(materias_faltando)}."
        
        # 7.5. VALIDAÇÃO DE TÓPICOS OBRIGATÓRIOS
        validacao_topicos = validar_topicos_obrigatorios(plano_final, materias_solicitadas_raw)
        print(f"📋 {validacao_topicos['resumo']}")
        
        if not validacao_topicos['validacao_aprovada']:
            print(f"❌ TÓPICOS OBRIGATÓRIOS FALTANDO: {validacao_topicos['topicos_faltando']}")
            if 'resumo_estrategico' in plano_final:
                plano_final['resumo_estrategico'] += f" IMPORTANTE: Este cronograma pode precisar de ajustes para incluir todos os tópicos obrigatórios especificados pelo usuário."
        
        # 8. PRESERVA CAMPOS ORIGINAIS (COMPATIBILIDADE TOTAL)
        plano_final['status'] = 'completed'
        plano_final['fase_concurso'] = dados_usuario.get('fase_concurso')
        plano_final['disponibilidade_semanal_minutos'] = dados_usuario.get('disponibilidade_semanal_minutos')
        plano_final['duracao_sessao_minutos'] = dados_usuario.get('duracao_sessao_minutos', 25)
        plano_final['tecnicas_preferidas'] = dados_usuario.get('tecnicas_preferidas', [])
        
        # 9. SALVA RESULTADO
        job_ref.update(plano_final)
        print(f"✅ BACKGROUND JOB V2 CONCLUÍDO: {job_id}")
        
    except Exception as e:
        print(f"!!! ERRO NO BACKGROUND JOB V2 {job_id}: {e} !!!")
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
            tipo_instrucao = "\n### TIPO DE AJUSTE: ALTERAÇÃO DE DURAÇÃO DAS SESSÕES\nO usuário selecionou 'Alterar duração das sessões'. INTERPRETE o pedido como uma solicitação para modificar APENAS `duracao_sessao_minutos`. \n\n🚨 **REGRA CRÍTICA - TEMPO TOTAL INALTERADO**: Você DEVE manter EXATAMENTE o mesmo tempo total de cada dia conforme `disponibilidade_semanal_minutos`. NUNCA altere o tempo total dos dias.\n\n📊 **EXEMPLO OBRIGATÓRIO**: Se o dia tem 120 minutos total e você muda para ciclos de 25 min:\n- Crie 4 atividades de 25 min + 1 de 20 min = 120 min total\n- NUNCA crie 5 atividades de 25 min = 125 min (ERRO!)\n- NUNCA crie 3 atividades de 25 min = 75 min (ERRO!)\n\n🔄 **REDISTRIBUIÇÃO DE MATÉRIAS**: Use DIFERENTES matérias do plano original para cada atividade. NÃO multiplique a mesma matéria várias vezes."
            tipo_instrucao += "\n\n### ALGORITMO OBRIGATÓRIO PARA MUDANÇA DE DURAÇÃO DE SESSÕES:\n1. ✅ MANTENHA o tempo total de cada dia conforme `disponibilidade_semanal_minutos`\n2. ✅ Ajuste APENAS `duracao_sessao_minutos` para o novo valor\n3. ✅ Calcule quantas sessões cabem no tempo total: tempo_total ÷ nova_duracao\n4. ✅ Se sobrar tempo, crie uma sessão menor para completar o total\n5. ✅ Use DIFERENTES matérias do plano original para cada sessão\n6. ✅ NUNCA ultrapasse o tempo total original do dia\n7. ✅ NUNCA repita a mesma matéria no mesmo dia"
        elif tipo_refinamento == "mover-dias":
            tipo_instrucao = "\n### TIPO DE AJUSTE: MOVER ATIVIDADES ENTRE DIAS\nO usuário selecionou 'Mover atividades entre dias'. INTERPRETE o pedido como uma solicitação para transferir atividades de um dia para outro, mantendo duração e métodos."
        else:
            tipo_instrucao = "\n### TIPO DE AJUSTE: OUTROS\nO usuário selecionou 'Outros ajustes'. INTERPRETE o pedido conforme descrito no texto."
        
        prompt = f'''Você é um coach especialista em otimizar planos de estudo para concursos. Sua tarefa é ajustar um plano de estudos em formato JSON existente, seguindo fielmente o pedido do aluno.
        
        ### REGRA FUNDAMENTAL SOBRE REDISTRIBUIÇÃO DE MATÉRIAS:
        Quando você precisar criar múltiplas atividades em um dia (ex: mudar duração de sessões), SEMPRE use matérias diferentes do plano original. NUNCA multiplique a mesma matéria várias vezes. Exemplo: se o plano original tem Direito Constitucional, Português, Matemática e você precisa criar 3 atividades, use uma matéria diferente para cada atividade.
        
        ### INSTRUÇÕES CRÍTICAS PARA ESPECIFICIDADE (OBRIGATÓRIO):
        🚨 **SEJA ESPECÍFICO, NÃO GENÉRICO**: NUNCA use termos como "Fundamentos de [matéria]", "Conceitos Básicos", "Noções Gerais". 
        ✅ **SEMPRE USE**: Tópicos específicos como "Lógica Proposicional", "Concordância Verbal", "Atos Administrativos".
        🔄 **VARIAÇÃO OBRIGATÓRIA**: Se uma matéria aparece múltiplas vezes, use tópicos DIFERENTES. Se repetir matéria + tópico, use método DIFERENTE.
        📚 **MÉTODOS VARIADOS**: Estudo de Teoria, Resolução de Exercícios, Exercícios de Fixação, Revisão com Autoexplicação, Criação de Mapa Mental, Leitura de Lei Seca, Simulados, Vídeoaulas.
        
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

3. SE o aluno pedir MUDANÇA DE DURAÇÃO DE SESSÕES (ex.: "mudar ciclos para 25 minutos"):
   • Apenas ajuste `duracao_sessao_minutos` para o novo valor.
   • 🚨 **CRÍTICO**: MANTENHA EXATAMENTE o tempo total dos dias conforme `disponibilidade_semanal_minutos`.
   • Calcule quantas sessões cabem: tempo_total ÷ nova_duracao.
   • Se sobrar tempo, crie uma sessão menor para completar o total.
   • Exemplo: se dia tem 120 min total e você muda para ciclos de 25 min:
     - Crie 4 atividades de 25 min + 1 de 20 min = 120 min total ✅
     - NUNCA crie 5 atividades de 25 min = 125 min (ERRO!) ❌
     - NUNCA crie 3 atividades de 25 min = 75 min (ERRO!) ❌
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
11. **ESPECIFICIDADE OBRIGATÓRIA**: NUNCA use tópicos genéricos como "Fundamentos", "Conceitos Básicos". SEMPRE use tópicos específicos e relevantes.
12. **VARIAÇÃO DE MÉTODOS**: Use métodos diferentes (Teoria, Exercícios, Revisão, Mapas, Lei Seca) para evitar repetição.

Lista oficial de nomes de dias (use exatamente estes): Domingo, Segunda-feira, Terça-feira, Quarta-feira, Quinta-feira, Sexta-feira, Sábado.

### EXEMPLOS DE INTERPRETAÇÃO:
1. Pedido: "Quero estudar Português às quartas em vez de terças"
   → Copie TODAS as atividades de Terça-feira para Quarta-feira, mantenha horários e métodos, deixe Terça-feira vazia.

2. Pedido: "Limitar todos os dias a 25 minutos"
   → Reduza `disponibilidade_semanal_minutos` de cada dia para 25 minutos, ajuste `duracao_sessao_minutos` para 25, mantenha apenas 1 atividade por dia.

3. Pedido: "Mudar ciclos para 25 minutos"
   → Apenas ajuste `duracao_sessao_minutos` para 25, mantenha o tempo total dos dias. Ex: se dia tem 120 min total, crie 4 atividades de 25 min + 1 de 20 min = 120 min total. Use matérias diferentes para cada atividade (ex: Direito Constitucional, Português, Matemática).

4. Pedido: "Reduzir domingo para 60 minutos"
   → Ajuste apenas `disponibilidade_semanal_minutos` do domingo para 60, redistribua as atividades.

### EXEMPLO ESPECÍFICO DE REDISTRIBUIÇÃO:
Plano original: Domingo tem 120 min total, 1 atividade de Direito Constitucional (120 min)
Pedido: "Mudar ciclos para 25 minutos"
Resultado CORRETO: 
- Direito Constitucional (25 min)
- Português (25 min) 
- Matemática (25 min)
- Raciocínio Lógico (25 min)
- Informática (20 min)
= 120 min total, 5 matérias diferentes (última sessão menor para completar)

### FORMATO DE SAÍDA
Retorne UM ÚNICO objeto JSON com a chave 'plano_de_estudos'. Nenhum texto fora do JSON.
'''
        system_message = "Você é um assistente especializado em ajustar planos de estudo. INTERPRETE CORRETAMENTE os pedidos: 'limitar tempo' = reduzir tempo total dos dias; 'mudar ciclos' = alterar duração das sessões; 'mudar dias' = mover atividades entre dias. Quando o usuário pedir mudanças de tempo, reescreva completamente o plano. Quando pedir mudanças específicas, modifique apenas o necessário. SEMPRE use tópicos específicos (evite 'Fundamentos', 'Conceitos Básicos'). VARIE métodos e tópicos para evitar repetição. Sempre retorne JSON válido."

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

    thread = threading.Thread(target=processar_plano_em_background_v2, args=(user_id, job_id, dados_usuario))
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
            'basico': 'price_1Rw2qDI6qNljWf7uvyv6bAU3',
            'intermediario': 'price_1Rw2qnI6qNljWf7ux393MN2y',
            'premium': 'price_1Rw2rDI6qNljWf7uWnPUO5Nj',
            'anual': 'price_1Rw2rpI6qNljWf7uLqUuOjKb',
        }

        # price_ids = {
        #     'basico': 'price_1RbARyI6qNljWf7uGw17462K',
        #     'intermediario': 'price_1RbAoGI6qNljWf7ukTkebZgt',
        #     'premium': 'price_1RbAoWI6qNljWf7uMd3PI1bh',
        #     'anual': 'price_1RbAokI6qNljWf7uFlJ9UusN',
        # }

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

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        print(f"Erro no webhook: {e}")
        return 'Webhook Error', 400

    # --- LÓGICA DE CADA EVENTO ---

    # EVENTO: COMPRA BEM-SUCEDIDA
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        user_id = session.get('client_reference_id')
        stripe_customer_id = session.get('customer')
        subscription_id = session.get('subscription')

        if not all([user_id, stripe_customer_id, subscription_id]):
            return 'Webhook Error: Missing data', 400

        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
            price_id = subscription['items']['data'][0]['price']['id']

            # Passo 2: Mapear o ID do preço de volta para o nome do plano
            # ATENÇÃO: Use os mesmos IDs de PREÇO de TESTE que você já configurou na rota /create-checkout-session
            price_ids_reverso = {
                'price_1Rw2qDI6qNljWf7uvyv6bAU3': 'basico',
                'price_1Rw2qnI6qNljWf7ux393MN2y': 'intermediario',
                'price_1Rw2rDI6qNljWf7uWnPUO5Nj': 'premium',
                'price_1Rw2rpI6qNljWf7uLqUuOjKb': 'anual',
            }
            
            # price_ids_reverso = {
            #     'price_1RbARyI6qNljWf7uGw17462K': 'basico',
            #     'price_1RbAoGI6qNljWf7ukTkebZgt': 'intermediario',
            #     'price_1RbAoWI6qNljWf7uMd3PI1bh': 'premium',
            #     'price_1RbAokI6qNljWf7uFlJ9UusN': 'anual',
            # }
            plano_comprado = price_ids_reverso.get(price_id, 'premium')
            user_ref = db.collection('users').document(user_id)
            user_doc = user_ref.get()

            if user_doc.exists:
                user_data = user_doc.to_dict()
                user_email = user_data.get('email')
                user_nome = user_data.get('nome', 'estudante')

                user_ref.update({
                    'plano': plano_comprado, 'stripeCustomerId': stripe_customer_id,
                    'stripeSubscriptionId': subscription_id, 'assinaturaStatus': 'ativa',
                    'trialFim': firestore.DELETE_FIELD
                })
                print(f"SUCESSO: Usuário {user_id} assinou o plano '{plano_comprado}'.")

                funcionalidades = {
                    'basico': ["Cronogramas com IA (10 por dia)", "Dicas Estratégicas (10 por dia)"],
                    'intermediario': ["Cronogramas (15 por dia)", "Dicas (15 por dia)", "Exercícios com IA (15 por dia)"],
                    'premium': ["Cronogramas (20 por dia)", "Exercícios (20 por dia)", "Questões Discursivas (20 por dia)"],
                    'anual': ["Todas as funcionalidades com limites do plano Premium"]
                }
                lista_html_funcionalidades = "".join([f'<li style="margin-bottom: 8px;">✅ {feat}</li>' for feat in funcionalidades.get(plano_comprado, [])])
                assunto = f"🎉 Assinatura Confirmada - Bem-vindo ao IAprovas {plano_comprado.capitalize()}!"
                frontend_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")
                
                # Template de e-mail de confirmação
                conteudo_html = f"""
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%); padding: 24px; text-align: center;"><h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">IAprovas</h1></div>
                    <div style="padding: 32px 24px;"><h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 22px; font-weight: bold;">Pagamento Confirmado!</h2><p style="color: #475569; margin: 0 0 24px 0; font-size: 16px; line-height: 1.5;">Olá, {user_nome}, sua jornada para a aprovação começou agora!</p><div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;"><div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0;"><span style="color: #64748b;">Plano Contratado:</span><span style="color: #1f2937; font-weight: bold;">{plano_comprado.capitalize()}</span></div><div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px;"><span style="color: #64748b;">Status:</span><span style="color: #16a34a; font-weight: bold;">✅ Ativo</span></div></div><p style="color: #475569; font-size: 16px;">Com seu plano, você tem acesso a:</p><ul style="color: #475569; list-style-type: none; padding-left: 0; margin-bottom: 24px;">{lista_html_funcionalidades}</ul><div style="text-align: center;"><a href="{frontend_url}/home.html" style="background-color: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600;">Acessar Meu Dashboard</a></div></div></div>
                """
                enviar_email(user_email, user_nome, assunto, conteudo_html, "")
        except Exception as e:
            print(f"ERRO CRÍTICO no webhook checkout.session.completed: {e}")
            traceback.print_exc()

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

    elif event['type'] == 'customer.subscription.updated':
        subscription = event.data.object
        previous_attributes = event.data.get('previous_attributes', {})
        stripe_customer_id = subscription.get('customer')
        
        user_query = db.collection('users').where('stripeCustomerId', '==', stripe_customer_id).limit(1)
        docs = list(user_query.stream())
        if not docs: return 'Success', 200
        user_doc = docs[0]
        user_data = user_doc.to_dict()
        user_email = user_data.get('email')
        user_nome = user_data.get('nome', 'estudante')

        # Cenário 1: O usuário cancelou a assinatura
        if subscription.get('cancel_at_period_end') and not previous_attributes.get('cancel_at_period_end'):
            cancel_timestamp = subscription.get('cancel_at')
            cancel_date = datetime.fromtimestamp(cancel_timestamp - 1, tz=timezone.utc)

            if user_data.get('assinaturaStatus') != 'cancelada':
                user_doc.reference.update({'assinaturaStatus': 'cancelada', 'dataFimAcesso': cancel_date})
            
            for doc in docs:
                user_data = doc.to_dict()
                if user_data.get('assinaturaStatus') != 'cancelada':
                    doc.reference.update({
                        'assinaturaStatus': 'cancelada',
                        'dataFimAcesso': cancel_date
                    })
                
                user_email = user_data.get('email')
                user_nome = user_data.get('nome', 'estudante')
                plano_cancelado = user_data.get('plano', 'Premium')
                data_formatada_br = format_date(cancel_date, "d 'de' MMMM 'de' yyyy", locale='pt_BR')
                assunto = "😔 Vimos que você cancelou sua assinatura IAprovas"
                frontend_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")

                # Template de e-mail profissional
                conteudo_html = f"""
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%); padding: 24px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">IAprovas</h1>
                    </div>
                    <div style="padding: 32px 24px;">
                        <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 22px; font-weight: bold;">Sua assinatura foi cancelada</h2>
                        <p style="color: #475569; margin: 0 0 24px 0; font-size: 16px; line-height: 1.5;">Olá, {user_nome}, este é um e-mail para confirmar que o cancelamento da sua assinatura do plano <strong>{plano_cancelado.capitalize()}</strong> foi agendado.</p>
                        <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
                            <p style="color: #475569; margin: 0 0 4px 0;">Seu acesso continua ativo até:</p>
                            <p style="color: #1f2937; font-weight: bold; font-size: 18px; margin: 0;">{data_formatada_br}</p>
                        </div>
                        <p style="color: #475569; font-size: 16px;">Seus dados e cronogramas serão mantidos caso decida voltar. Se o cancelamento foi um engano ou se você mudar de ideia, é fácil reativar.</p>
                        <div style="text-align: center; margin-top: 32px;">
                            <a href="{frontend_url}/meu-perfil.html" style="background-color: #16a34a; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600;">Reativar minha assinatura</a>
                        </div>
                    </div>
                </div>
                """
                conteudo_texto = f"Olá, {user_nome}. Confirmamos o cancelamento da sua assinatura {plano_cancelado.capitalize()}. Seu acesso continua até {data_formatada_br}."
                
                enviar_email(user_email, user_nome, assunto, conteudo_html, conteudo_texto)
                print(f"E-mail de cancelamento enviado e Firestore atualizado para o usuário {doc.id}.")
                break
        
        # Cenário 2: O usuário REATIVOU a assinatura (desistiu do cancelamento)
        elif not subscription.get('cancel_at_period_end') and previous_attributes.get('cancel_at_period_end'):
            user_doc.reference.update({
                'assinaturaStatus': 'ativa',
                'dataFimAcesso': firestore.DELETE_FIELD
            })

            plano_reativado = user_data.get('plano', 'Premium')
            assunto = f"✅ Sua assinatura do plano {plano_reativado.capitalize()} foi reativada!"
            conteudo_html = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%); padding: 24px; text-align: center;"><h1 style="color: white; margin: 0;">IAprovas</h1></div>
                <div style="padding: 32px 24px;">
                    <h2 style="margin: 0 0 16px 0;">Assinatura Reativada!</h2>
                    <p>Olá, {user_nome},</p>
                    <p>Confirmamos que sua assinatura do plano <strong>{plano_reativado.capitalize()}</strong> foi reativada com sucesso. A cobrança continuará normalmente no próximo ciclo.</p>
                    <p>Ficamos felizes em ter você de volta!</p>
                </div>
            </div>
            """
            enviar_email(user_email, user_nome, assunto, conteudo_html, "")
            print(f"Assinatura do usuário {user_doc.id} foi reativada.")

        # Cenário 3: O usuário mudou de plano (upgrade/downgrade)
        elif 'items' in previous_attributes:
            try:
                price_id = subscription['items']['data'][0]['price']['id']
                
                price_ids_reverso = {
                    'price_1Rw2qDI6qNljWf7uvyv6bAU3': 'basico',
                    'price_1Rw2qnI6qNljWf7ux393MN2y': 'intermediario',
                    'price_1Rw2rDI6qNljWf7uWnPUO5Nj': 'premium',
                    'price_1Rw2rpI6qNljWf7uLqUuOjKb': 'anual',
                }
                
                # price_ids_reverso = {
                #     'price_1RbARyI6qNljWf7uGw17462K': 'basico',
                #     'price_1RbAoGI6qNljWf7ukTkebZgt': 'intermediario',
                #     'price_1RbAoWI6qNljWf7uMd3PI1bh': 'premium',
                #     'price_1RbAokI6qNljWf7uFlJ9UusN': 'anual',
                # }
                novo_plano = price_ids_reverso.get(price_id, 'premium')

                users_ref = db.collection('users')
                query = users_ref.where('stripeCustomerId', '==', stripe_customer_id).limit(1)
                docs = query.stream()

                for doc in docs:
                    # Atualiza o plano no Firestore
                    doc.reference.update({'plano': novo_plano})
                    
                    user_data = doc.to_dict()
                    user_email = user_data.get('email')
                    user_nome = user_data.get('nome', 'estudante')

                    # Envia e-mail de confirmação da alteração de plano
                    assunto = f"✅ Seu plano IAprovas foi atualizado para {novo_plano.capitalize()}!"
                    conteudo_html = f"""
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                        <div style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%); padding: 24px; text-align: center;"><h1 style="color: white; margin: 0;">IAprovas</h1></div>
                        <div style="padding: 32px 24px;">
                            <h2 style="margin: 0 0 16px 0;">Plano Atualizado</h2>
                            <p>Olá, {user_nome},</p>
                            <p>Confirmamos que sua assinatura foi alterada com sucesso para o plano <strong>{novo_plano.capitalize()}</strong>.</p>
                            <p>Os novos benefícios já estão disponíveis na sua conta. A cobrança será ajustada na sua próxima fatura.</p>
                        </div>
                    </div>
                    """
                    conteudo_texto = f"Olá, {user_nome}. Seu plano foi alterado para {novo_plano.capitalize()}."
                    enviar_email(user_email, user_nome, assunto, conteudo_html, conteudo_texto)
                    print(f"Plano do usuário {doc.id} atualizado para '{novo_plano}'.")
                    break
            except Exception as e:
                print(f"ERRO ao processar atualização de plano: {e}")

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
                plano_antigo = user_data.get('plano', 'pago')


                # Desativa a conta no Firestore
                doc.reference.update({
                    'plano': 'trial',
                    'assinaturaStatus': 'expirada',
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
                                Sua assinatura do plano <strong>{plano_antigo.capitalize()}</strong> foi <strong>cancelada definitivamente</strong>. Isso ocorreu por:
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
                                <strong>Acesso {plano_antigo.capitalize()} removido:</strong> Você retornou ao plano trial com funcionalidades limitadas.
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

    elif event['type'] == 'invoice.payment_succeeded':
        invoice = event['data']['object']
        stripe_customer_id = invoice.get('customer')
        
        # Ignora o primeiro pagamento, que já é tratado pelo 'checkout.session.completed'
        if invoice.get('billing_reason') == 'subscription_cycle':
            users_ref = db.collection('users')
            query = users_ref.where('stripeCustomerId', '==', stripe_customer_id).limit(1)
            docs = query.stream()

            for doc in docs:
                user_data = doc.to_dict()
                user_email = user_data.get('email')
                user_nome = user_data.get('nome', 'estudante')
                plano = user_data.get('plano', '')

                assunto = f"✅ Sua assinatura do IAprovas foi renovada!"
                conteudo_html = f"""
                <p>Olá, {user_nome},</p>
                <p>Confirmamos a renovação mensal da sua assinatura do plano <strong>{plano.capitalize()}</strong>.</p>
                <p>Seu acesso continua normal. Agradecemos por continuar conosco!</p>
                <p>Bons estudos!</p>
                """
                conteudo_texto = f"Olá, {user_nome}. Sua assinatura do plano {plano.capitalize()} foi renovada com sucesso."
                
                enviar_email(user_email, user_nome, assunto, conteudo_html, conteudo_texto)
                print(f"Renovação de assinatura processada para {doc.id}.")
                break
    
    elif event['type'] == 'invoice.payment_succeeded':
        invoice = event['data']['object']
        if invoice.get('billing_reason') == 'subscription_cycle':
            stripe_customer_id = invoice.get('customer')

    elif event['type'] == 'customer.updated':
        previous_attributes = event.data.get('previous_attributes', {})
        if any(key in previous_attributes for key in ['address', 'name', 'phone']):
            stripe_customer_id = event.data.object.get('id')
            user_query = db.collection('users').where('stripeCustomerId', '==', stripe_customer_id).limit(1)
            docs = list(user_query.stream())
            if not docs: return 'Success', 200
            user_doc = docs[0]
            user_data = user_doc.to_dict()
            user_email = user_data.get('email')
            user_nome = user_data.get('nome', 'estudante')
            assunto = "Seus dados de faturamento foram atualizados"
            conteudo_html = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;"><div style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%); padding: 24px; text-align: center;"><h1 style="color: white; margin: 0;">IAprovas</h1></div><div style="padding: 32px 24px;"><h2 style="margin: 0 0 16px 0;">Dados de Faturamento Atualizados</h2><p>Olá, {user_nome},</p><p>Confirmamos que seus dados de faturamento (como nome ou endereço) foram atualizados.</p><p>Se você não reconhece esta alteração, por favor, contate nosso suporte.</p></div></div>
            """
            enviar_email(user_email, user_nome, assunto, conteudo_html, "")
            print(f"E-mail de atualização de dados de faturamento enviado para {user_doc.id}.")
    
    # NOVO EVENTO: MÉTODO DE PAGAMENTO ATUALIZADO (EX: NOVO CARTÃO)
    elif event['type'] == 'payment_method.attached':
        stripe_customer_id = event.data.object.get('customer')
        user_query = db.collection('users').where('stripeCustomerId', '==', stripe_customer_id).limit(1)
        docs = list(user_query.stream())
        if not docs: return 'Success', 200
        user_doc = docs[0]
        user_data = user_doc.to_dict()
        user_email = user_data.get('email')
        user_nome = user_data.get('nome', 'estudante')
        assunto = "Seu método de pagamento foi atualizado"
        conteudo_html = f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;"><div style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%); padding: 24px; text-align: center;"><h1 style="color: white; margin: 0;">IAprovas</h1></div><div style="padding: 32px 24px;"><h2 style="margin: 0 0 16px 0;">Método de Pagamento Atualizado</h2><p>Olá, {user_nome},</p><p>Confirmamos que um novo método de pagamento foi adicionado à sua conta IAprovas.</p><p>Se você realizou esta alteração, está tudo certo. Caso não reconheça esta atividade, por favor, entre em contato com nosso suporte.</p></div></div>
        """
        enviar_email(user_email, user_nome, assunto, conteudo_html, "")
        print(f"E-mail de atualização de método de pagamento enviado para {user_doc.id}.")


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
