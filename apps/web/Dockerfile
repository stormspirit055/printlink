FROM node:22-alpine AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=384
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=@printlink/web --include-workspace-root
COPY apps/web apps/web
RUN npm run build -w @printlink/web
FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
