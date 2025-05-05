---
title: "AMP"
date: 2025-04-17
update: 2024-04-17
tags:
  - front-end
---

# 📝 Next.js + Docker + ECR + CloudFront 실전 배포 자동화

## 배경
회사는 언론사(미디어)라 AMP 지원 필수 였다.

검색엔진 최적화(SEO)와 트래픽 최적화가 필요하게 되어서 배포 진행중 갑자기 문제가 발생했다.

App Router + Pages Router 혼용 프로젝트

Docker + ECR + EC2 서버기반 서비스 운영

CDN은 AWS CloudFront 사용 중

## 문제 상황 발생
기존 수동 Docker Build + Push + 서버 재배포 과정 복잡

서버 Docker OverlayFS 스토리지 드라이버 과부하로 터짐

에러: "error creating overlay mount... no such file or directory"

디스크 I/O 병목 발생 → 캐시 레이어 비정상화

빌드 중 중간 레이어가 깨져서 docker-compose up 실패

CDN 캐시 퍼지(purge)도 수동이라

구버전 CSS + 신버전 HTML 섞여 로딩 → 스타일 깨짐 """

3. 해결 목표
"""text

Dockerfile 구조 최적화 (멀티 스테이지 + 퍼미션 오류 제거)

배포 자동화 스크립트 작성 (Build → Push → 서버 업데이트)

CloudFront 캐시 퍼지 스크립트 작성

Slack 배포 결과 알림

Docker OverlayFS 장애 대비 (항상 clean build) """

## Dockerfile
```
1. 기본 베이스 이미지
FROM node:20.19.0-alpine AS base

ARG NEXT_PUBLIC_ENV ARG NODE_ENV

RUN apk --no-cache add tzdata &&
cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime &&
echo "Asia/Seoul" > /etc/timezone

2. 의존성 설치
FROM base AS deps WORKDIR /app COPY package.json pnpm-lock.yaml ./ RUN corepack enable && corepack prepare pnpm@10.9.0 --activate && pnpm install --frozen-lockfile

3. 앱 빌드
FROM base AS builder WORKDIR /app COPY --from=deps /app/node_modules ./node_modules COPY . . RUN corepack enable && corepack prepare pnpm@10.9.0 --activate

ENV NODE_ENV=production ENV NEXT_TELEMETRY_DISABLED=1 ENV CSS_MODULES_HASH_PREFIX=stable_ ENV OUTPUT=standalone

ARG NEXT_PUBLIC_ENV RUN if [ "$NEXT_PUBLIC_ENV" = "production" ]; then
cp ./env/.env.production .env.production;
elif [ "$NEXT_PUBLIC_ENV" = "staging" ]; then
cp ./env/.env.staging .env.production;
elif [ "$NEXT_PUBLIC_ENV" = "development" ]; then
cp ./env/.env.development .env.production;
else
cp ./env/.env.test .env.production;
fi

RUN pnpm run build
```

## 런타임
```
FROM base AS runner WORKDIR /app

RUN npm install -g pm2 RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./ COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static COPY --from=builder --chown=nextjs:nodejs /app/public ./public COPY --from=builder --chown=nextjs:nodejs /app/public/fonts ./public/fonts COPY --from=builder --chown=nextjs:nodejs /app/.next/server/pages/amp ./.next/server/pages/amp

RUN mkdir -p .next/static/media && chown -R nextjs:nodejs .next

USER nextjs

EXPOSE 3000 ENV PORT=3000 ENV HOSTNAME="0.0.0.0"

CMD ["pm2-runtime", "start", "server.js", "-i", "2", "--max-memory-restart", "1536M"] """

```

## 배포 자동화 스크립트 (deploy.sh)
``` 
#!/bin/bash

set -e

AWS_PROFILE=default AWS_REGION=ap-northeast-2 AWS_ECR_REPOSITORY=537124952818.dkr.ecr.ap-northeast-2.amazonaws.com/kthome-prd-frontend-ecr CLOUDFRONT_DISTRIBUTION_ID=YOUR_CLOUDFRONT_ID SLACK_WEBHOOK_URL=YOUR_SLACK_WEBHOOK_URL NEXT_PUBLIC_ENV=production SERVER_IP=YOUR_SERVER_IP DOCKER_COMPOSE_DIR=/home/ubuntu/deploy-folder

GIT_COMMIT_HASH=$(git rev-parse --short HEAD) IMAGE_TAG=$GIT_COMMIT_HASH

echo "🚀 배포 시작 (태그: $IMAGE_TAG)"

docker build --build-arg NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV -t $AWS_ECR_REPOSITORY:$IMAGE_TAG . aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ECR_REPOSITORY docker push $AWS_ECR_REPOSITORY:$IMAGE_TAG

ssh ubuntu@$SERVER_IP << EOF cd $DOCKER_COMPOSE_DIR sed -i "s|image: .*|image: $AWS_ECR_REPOSITORY:$IMAGE_TAG|" docker-compose.yml docker-compose pull docker-compose up -d --remove-orphans EOF

aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths
"/_next/data/" "/_next/static/" "/favicon.ico" "/robots.txt" "/sitemap.xml" "/index.html"

curl -X POST -H 'Content-type: application/json' --data "{ "text": "✅ 배포 완료: $IMAGE_TAG", "attachments": [ { "color": "#36a64f", "fields": [ { "title": "배포 서버", "value": "$SERVER_IP", "short": true }, { "title": "태그", "value": "$IMAGE_TAG", "short": true } ] } ] }" $SLACK_WEBHOOK_URL

echo "✅ 전체 배포 완료!"
```

## Docker OverlayFS 이슈 대응 방법
Docker Build 시 --no-cache 옵션 사용 습관화

오래된 dangling 이미지 주기적 제거 (ex: docker system prune -af)

디스크 공간 부족 대비 → EBS 확장 정책 준비

대규모 프로젝트 빌드 시 layer 수 줄이기 """

## 최종 정리
배포 자동화 성공

서버 깨짐(overlay2 디스크 에러) 복구

AMP SEO + 일반 SEO 대응 완비

Slack 실시간 배포 알림 연동

ECR + EC2 + CloudFront 캐시 퍼지 자동화 완료


