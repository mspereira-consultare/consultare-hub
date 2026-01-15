# Usa uma imagem oficial do Playwright (já tem python e navegadores)
FROM mcr.microsoft.com/playwright/python:v1.40.0-jammy

# Define diretório de trabalho
WORKDIR /app

# Copia os arquivos do projeto
COPY . .

# Instala dependências do Python
RUN pip install --no-cache-dir -r requirements.txt

# Expõe a porta do Next.js (se for rodar o front junto) ou do worker
EXPOSE 3000

# Comando de inicialização
# Aqui você decide: vai rodar o Next.js? Vai rodar só os workers?
# Exemplo para rodar o Next.js (que chama os workers via API ou cron)
RUN npm install
RUN npm run build
CMD ["npm", "start"]