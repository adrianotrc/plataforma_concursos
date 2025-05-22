from flask import Flask, jsonify, request
from flask_cors import CORS # Importe o CORS

app = Flask(__name__)
CORS(app) # Habilite o CORS para toda a sua aplicação Flask

@app.route("/")
def ola_mundo():
    return "Olá, Mundo! Meu backend Flask está funcionando!"

# Novo endpoint para gerar o plano de estudos
@app.route("/gerar-plano-estudos", methods=['POST'])
def gerar_plano():
    # Por enquanto, vamos apenas simular o recebimento de dados e retornar um JSON de exemplo.
    # No futuro, aqui vamos:
    # 1. Receber os dados do usuário (concurso, matérias, tempo) que virão do front-end.
    # 2. Construir um prompt para a IA com esses dados.
    # 3. Chamar a API da IA.
    # 4. Processar a resposta da IA.
    # 5. Retornar o plano de estudos formatado.

    # Exemplo de dados que poderíamos receber do front-end (vamos implementar isso depois)
    # dados_usuario = request.json 
    # print(f"Dados recebidos do usuário: {dados_usuario}")

    plano_exemplo = {
        "mensagem": "Plano de estudos gerado com sucesso (simulação)!",
        "concurso_desejado": "Exemplo de Concurso Nacional",
        "cronograma": [
            {"dia": "Segunda", "foco": "Português e Raciocínio Lógico"},
            {"dia": "Terça", "foco": "Direito Constitucional"},
            {"dia": "Quarta", "foco": "Revisão e Exercícios"},
        ]
    }
    return jsonify(plano_exemplo)

if __name__ == "__main__":
    app.run(debug=True)