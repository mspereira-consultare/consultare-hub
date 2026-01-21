# Usa uma imagem Python leve
FROM python:3.10-slim

# 1. Instala dependências do sistema necessárias para o Chrome/Playwright e Compilação
RUN apt-get update && apt-get install -y \
    wget gnupg \
    && rm -rf /var/lib/apt/lists/*

# Define a pasta de trabalho
WORKDIR /app

# 2. Copia os arquivos de requisitos e instala as libs Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Instala os navegadores do Playwright (O pulo do gato!)
RUN playwright install chromium --with-deps

# 4. Copia todo o resto do seu código para dentro do container
COPY . .

# 5. Comando para rodar o Orquestrador quando o servidor ligar
CMD ["python", "workers/main.py"]