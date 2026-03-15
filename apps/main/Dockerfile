FROM node:20-bookworm-slim AS build

WORKDIR /workspace

COPY apps/main/package.json apps/main/package-lock.json ./apps/main/
COPY apps/cv-site/package.json apps/cv-site/package-lock.json ./apps/cv-site/
COPY apps/legacy_rewored/package.json apps/legacy_rewored/package-lock.json ./apps/legacy_rewored/

WORKDIR /workspace/apps/main
RUN npm ci

WORKDIR /workspace/apps/cv-site
RUN npm ci

WORKDIR /workspace/apps/legacy_rewored
RUN npm ci

WORKDIR /workspace
COPY . .

WORKDIR /workspace/apps/main
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=build /workspace/apps/main/package.json /workspace/apps/main/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /workspace/apps/main/dist ./dist

EXPOSE 5000

CMD ["npm", "start"]
