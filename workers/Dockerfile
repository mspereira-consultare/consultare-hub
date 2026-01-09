# workers/Dockerfile
FROM python:3.9-slim

WORKDIR /app

# Instala as dependências
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código do worker
COPY . .

# Comando para rodar o script (ajuste o nome se mudar)
CMD ["python", "monitor_service.py"]