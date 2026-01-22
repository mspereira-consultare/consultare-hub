# Usa imagem oficial do Playwright (já vem com Python e Browsers instalados)
# Isso economiza muita dor de cabeça com dependências do Linux
FROM mcr.microsoft.com/playwright/python:v1.41.0-jammy

WORKDIR /app

# Variáveis para garantir logs imediatos
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Copia requisitos
COPY requirements.txt .

# Instala dependências Python
# Nota: libsql-client e pandas precisam ser instalados, o playwright lib já vem
RUN pip install --no-cache-dir -r requirements.txt

# Instala apenas o navegador Chromium (mais leve que instalar todos)
RUN playwright install chromium

# Copia todo o código para dentro do container
COPY . .

# Comando de inicialização correto (apontando para main.py)
CMD ["python", "main.py"]