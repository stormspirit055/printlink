FROM node:22-alpine AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=384
RUN apk add --no-cache openssl
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace=@printlink/api --include-workspace-root
COPY apps/api apps/api
RUN npm run db:generate && npm run build -w @printlink/api
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl && mkdir -p /app/uploads && chown node:node /app/uploads
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/package.json apps/api/package.json
USER node
CMD ["node","apps/api/dist/src/index.js"]
