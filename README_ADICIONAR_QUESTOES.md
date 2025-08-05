# 📚 COMO ADICIONAR NOVAS QUESTÕES AO BANCO

## 🎯 PROCEDIMENTO COMPLETO

### **1. 📝 Preparar o arquivo JSON**

Crie um arquivo JSON com as novas questões seguindo o formato:

```json
[
  {
    "texto_enunciado": "Enunciado da questão...",
    "resposta_correta": "Certo" ou "Errado" ou "A" ou "B" ou "C" ou "D" ou "E",
    "banca": "Nome da banca (ex: Cebraspe, FGV, VUNESP)",
    "concurso": "Nome do concurso",
    "ano": "Ano do concurso",
    "materia": "Matéria específica (opcional - será identificada pela IA)",
    "topico": "Tópico específico (opcional - será identificado pela IA)"
  }
]
```

**Exemplo:** `exemplo_novas_questoes.json`

### **2. 🔄 Executar o script de importação**

```bash
# Ativar o ambiente virtual
source venv/bin/activate

# Executar o script
python scripts/import_new_questions.py
```

### **3. 🤖 Processamento com IA (Opcional)**

O script perguntará se você quer usar IA para identificar matéria e tópico:

- **Se SIM:** A IA analisará cada questão e identificará automaticamente
- **Se NÃO:** Usará os campos `materia` e `topico` do JSON (se existirem)

### **4. 🔥 Importação para Firestore**

O script perguntará se quer importar para o banco:

- **Se SIM:** Gerará embeddings e salvará no Firestore
- **Se NÃO:** Apenas processará e salvará em arquivo local

## 📊 CAMPOS OBRIGATÓRIOS

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| `texto_enunciado` | Enunciado completo da questão | "Considerando a Constituição Federal..." |
| `resposta_correta` | Resposta correta | "Certo", "Errado", "A", "B", "C", "D", "E" |
| `banca` | Banca examinadora | "Cebraspe", "FGV", "VUNESP" |
| `concurso` | Nome do concurso | "Polícia Federal - Agente" |
| `ano` | Ano do concurso | "2021", "2022", "2023" |

## 📋 CAMPOS OPCIONAIS

| Campo | Descrição | Comportamento |
|-------|-----------|---------------|
| `materia` | Matéria específica | Se não informado, IA identificará |
| `topico` | Tópico específico | Se não informado, IA identificará |

## 🎯 EXEMPLOS DE USO

### **Cenário 1: Questões sem matéria/tópico**
```json
[
  {
    "texto_enunciado": "Questão sobre Direito Constitucional...",
    "resposta_correta": "Certo",
    "banca": "Cebraspe",
    "concurso": "Exemplo",
    "ano": "2023"
  }
]
```
**Resultado:** IA identificará automaticamente matéria e tópico

### **Cenário 2: Questões com matéria/tópico**
```json
[
  {
    "texto_enunciado": "Questão sobre Direito Constitucional...",
    "resposta_correta": "Certo",
    "banca": "Cebraspe",
    "concurso": "Exemplo",
    "ano": "2023",
    "materia": "Direito Constitucional",
    "topico": "Direitos Fundamentais"
  }
]
```
**Resultado:** Usará os campos informados

### **Cenário 3: Questões com matéria genérica**
```json
[
  {
    "texto_enunciado": "Questão sobre Direito...",
    "resposta_correta": "Certo",
    "banca": "Cebraspe",
    "concurso": "Exemplo",
    "ano": "2023",
    "materia": "Direito",
    "topico": "Geral"
  }
]
```
**Resultado:** IA refinará para "Direito Constitucional" ou "Direito Administrativo"

## 🔧 FUNCIONALIDADES DO SCRIPT

### **✅ Processamento Automático:**
- Remove prefixos `[MATÉRIA]` dos enunciados
- Identifica tipo de questão (múltipla escolha/certo-errado)
- Gera embeddings para busca semântica
- Valida dados obrigatórios

### **🤖 IA Inteligente:**
- Identifica matéria específica (não genérica)
- Identifica tópico específico
- Refina classificações genéricas
- Mantém consistência com banco existente

### **📊 Controle de Qualidade:**
- Validação de dados
- Tratamento de erros
- Logs detalhados
- Contadores de sucesso/erro

## 🚀 EXECUÇÃO PASSO A PASSO

1. **Preparar arquivo JSON** com as questões
2. **Executar script:** `python scripts/import_new_questions.py`
3. **Responder perguntas:**
   - Nome do arquivo JSON
   - Usar IA? (s/n)
   - Importar para Firestore? (s/n)
   - ID inicial (opcional)
4. **Acompanhar progresso** pelos logs
5. **Verificar resultado** no Firestore

## 📈 BENEFÍCIOS

- **Automatização:** Processo totalmente automatizado
- **Flexibilidade:** Suporte a diferentes formatos
- **Qualidade:** IA garante classificações precisas
- **Escalabilidade:** Funciona para qualquer quantidade de questões
- **Consistência:** Mantém padrão do banco existente

## ⚠️ OBSERVAÇÕES IMPORTANTES

- **Custo:** Processamento com IA gera custos da OpenAI
- **Tempo:** Depende da quantidade de questões
- **Backup:** Sempre faça backup antes de importar
- **Teste:** Teste com poucas questões primeiro
- **Validação:** Revise as classificações da IA

## 🆘 SOLUÇÃO DE PROBLEMAS

### **Erro de API:**
- Verificar chave da OpenAI
- Verificar limite de rate

### **Erro de Firestore:**
- Verificar credenciais
- Verificar conectividade

### **Erro de Embedding:**
- Verificar texto do enunciado
- Verificar limite de tokens

---

**🎉 Com este procedimento, você pode facilmente expandir o banco de questões mantendo a qualidade e consistência!** 