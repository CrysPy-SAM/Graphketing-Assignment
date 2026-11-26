FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY database ./database
COPY scripts/init-db.js scripts/run-init.js scripts/create-admin.js ./scripts/
USER node
EXPOSE 5000
CMD ["sh", "-c", "npm run db:init && exec node src/server.js"]
