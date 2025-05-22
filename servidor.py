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
    dados_usuario = request.json 

    print("===============================================")
    print("DADOS DO USUÁRIO RECEBIDOS PELO BACKEND:")
    if dados_usuario:
        for chave, valor in dados_usuario.items():
            print(f"  {chave}: {valor}")
    else:
        print("  Nenhum dado JSON recebido no corpo da requisição.")
    print("===============================================")

    mensagem_resposta = "Plano de estudos simulado recebido e processado!"
    concurso_info = "Não informado"
    materias_info = "Não informadas"
    tempo_info = "Não informado"
    dias_info = "Não informados"

    if dados_usuario:
        if dados_usuario.get('concurso'):
            mensagem_resposta = f"Plano simulado para o concurso '{dados_usuario.get('concurso')}'!"
            concurso_info = dados_usuario.get('concurso')
        materias_info = dados_usuario.get('materias', 'Não informadas')
        tempo_info = dados_usuario.get('horas_semanais', 'Não informado')
        dias_info = ", ".join(dados_usuario.get('dias_estudo', [])) # Transforma lista em string


    plano_resposta_simulada = {
        "mensagem": mensagem_resposta,
        "concurso_desejado": concurso_info,
        "materias_recebidas": materias_info,
        "tempo_recebido": tempo_info,
        "dias_de_estudo_recebidos": dias_info, # Novo campo na resposta
        "cronograma": [
            {"dia": "Dia 1 (Conforme seus dias)", "foco": f"Estudar: {materias_info[:30]}..."},
            {"dia": "Dia 2 (Conforme seus dias)", "foco": "Revisar conteúdo e fazer exercícios."},
            {"dia": "Dia 3 (Conforme seus dias)", "foco": f"Aprofundar em matéria prioritária, considerando as {tempo_info} semanais."}
        ]
    }
    return jsonify(plano_resposta_simulada)

if __name__ == "__main__":
    app.run(debug=True)