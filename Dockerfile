FROM node:18-alpine

WORKDIR /app

# Copiar package.json
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código
COPY . .

# Expor porta
EXPOSE 3000

# Comando de inicialização
CMD ["npm", "start"]