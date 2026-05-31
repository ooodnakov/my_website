FROM node:20-bookworm-slim AS build

WORKDIR /workspace

RUN corepack enable pnpm && corepack prepare pnpm@10.18.3 --activate

COPY apps/main/package.json apps/main/pnpm-lock.yaml ./apps/main/
COPY apps/cv-site/package.json apps/cv-site/pnpm-lock.yaml ./apps/cv-site/
COPY apps/legacy_rewored/package.json apps/legacy_rewored/pnpm-lock.yaml ./apps/legacy_rewored/

WORKDIR /workspace/apps/main
RUN pnpm install --frozen-lockfile

WORKDIR /workspace/apps/cv-site
RUN pnpm install --frozen-lockfile

WORKDIR /workspace/apps/legacy_rewored
RUN pnpm install --frozen-lockfile

WORKDIR /workspace
COPY . .

WORKDIR /workspace/apps/main
RUN pnpm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

RUN corepack enable pnpm && corepack prepare pnpm@10.18.3 --activate

COPY --from=build /workspace/apps/main/package.json /workspace/apps/main/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune

COPY --from=build /workspace/apps/main/dist ./dist

EXPOSE 5000

CMD ["pnpm", "start"]
