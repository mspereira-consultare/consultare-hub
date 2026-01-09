# Dockerfile (na raiz)
FROM node:18-alpine

WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm install

# Copia o resto do projeto
COPY . .

# Gera o build de produção (mais rápido e leve)
RUN npm run build

# Expõe a porta 3000
EXPOSE 3000

# Inicia o servidor Next.js
CMD ["npm", "start"]