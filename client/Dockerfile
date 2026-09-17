FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build
EXPOSE 5173
CMD ["npm", "run", "preview"]
