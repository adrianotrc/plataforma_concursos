from flask import Flask

# Cria uma instância da aplicação Flask
# __name__ é uma variável especial em Python que representa o nome do módulo atual.
# O Flask a usa para localizar recursos como templates e arquivos estáticos.
app = Flask(__name__)

# Define uma rota para a URL raiz ("/") do seu servidor.
# Esta função será chamada quando alguém acessar http://seu_servidor/
@app.route("/")
def ola_mundo():
    return "Olá, Mundo! Meu backend Flask está funcionando!"

# Esta parte verifica se o script está sendo executado diretamente
# (e não importado como um módulo em outro script).
if __name__ == "__main__":
    # Inicia o servidor de desenvolvimento do Flask.
    # debug=True é útil durante o desenvolvimento, pois reinicia o servidor
    # automaticamente quando você faz alterações no código e mostra erros detalhados no navegador.
    # O servidor estará acessível em http://127.0.0.1:5000/ por padrão.
    app.run(debug=True)