---
title: "결국 LCP가 아니라 TTFB였다"
description: "홈을 서버에서 렌더링한 뒤에도 첫 바이트가 늦게 왔다. CloudFront가 HTML을 재사용하지 못하는 조건을 추적했다."
date: 2025-12-27
update: 2026-11-14
tags:
  - front-end
  - performance
  - nextjs
  - cloudfront
  - cache
  - series
---

뉴스 홈의 주요 기사를 첫 HTML에 담자 브라우저가 자바스크립트로 화면을 조립하는 일은 줄었다. 그런데 수천 명이 같은 홈을 열면 서버는 같은 HTML을 몇 번이나 만들어야 할까?

## 같은 홈을 열었는데 요청이 계속 서버에 갔다

서버 앞에 CloudFront를 붙였다. 공개 기사라면 앞선 방문자에게 보냈던 HTML을 다음 사람에게도 바로 줄 수 있다. 막상 콘솔을 열어 보니 캐시 적중률은 한 자릿수였다. 서버가 응답에 적어 보낸 캐시 지시부터 확인했다.

![아 이거 또..](../phase1/img_2.png)

---

## CloudFront 캐시 hit률이 낮았던 이유

응답 헤더를 까봤다.

```text
Cache-Control: private, no-cache, no-store, must-revalidate
```

홈, 섹션, 기사 상세 페이지 대부분의 응답에 `no-store`가 붙어 있었다. 이 헤더를 따르면 CloudFront는 받은 HTML을 캐시에 저장하지 않는다.

처음엔 `next.config.mjs`에 캐시 헤더를 잘못 넣었나 했다. 해당 설정은 없었다. Next.js가 응답에 자동으로 붙이는 헤더였다.

왜 그런가 봤더니, 페이지가 다 *dynamic* 으로 잡혀 있었다.

빌드 로그를 보면 페이지마다 마크가 찍힌다.

```text
○  Static (build time)
●  ISR (revalidate)
λ  Server (dynamic at runtime)
```

거의 다 `λ` 였다.

> 아 그래서 캐시가 안 먹혔구나.

---

## 어떤 한 줄이 페이지 전체를 dynamic으로 만들었나?

Next 14 App Router 가 좀 까다로웠다.

페이지 트리 어디에든 다음 중 하나만 들어가도 *그 페이지 전체가* dynamic 으로 바뀐다.

- `cookies()`, `headers()` 호출
- `searchParams` 사용
- `fetch(..., { cache: 'no-store' })`
- `export const dynamic = 'force-dynamic'`

홈 안에 로그인 상태를 확인하는 `cookies()` 가 어딘가 있었고  
검색 진입 처리하는 자리에 `searchParams` 가 있었다.

한 줄.  
그 페이지 전체가 *런타임에 매번 서버에서 만드는 페이지* 로 잡혀버렸다.

> 한 줄짜리 의도가, 전체 페이지의 캐시 가능성을 결정하고 있었다.

운영 hit률 보고 나서야 알았다.

---

## ISR 한 줄로 끝낼 수 있었나?

처음엔 답이 단순해 보였다.

> 그러면 다 `revalidate = 60` 박으면 되잖아?

근데 그게 답이 아닌 페이지들이 따로 있었다.

- `account` 페이지는 로그인한 사람 본인 정보다. 다른 사람과 캐시 공유하면 사고.
- `mytimes` 도 같은 이유.
- `search` 는 쿼리마다 응답이 다르다.
- `oauth/callback` 은 인증 콜백. 한 번 쓰고 버리는 응답이다.
- `preview` 는 운영자가 발행 전에 보는 페이지. 캐시되면 미공개가 새어나간다.

여기에 `revalidate` 박는 순간 *보안 사고 아니면 기능 깨짐* 이다.

그래서 페이지를 세 갈래로 갈랐다.

```ts
// 개인화 / 인증 / preview
export const dynamic = "force-dynamic"

// 콘텐츠 디테일 (섹션, 카테고리, 기사 상세)
export const revalidate = 60

// _next/static, 폰트, 빌드 산출물
// → next.config 에서 1년 immutable
```

기준은 두 가지였다.

1. *응답이 모든 사용자에게 같은가.* 같으면 공용 캐시 가능, 다르면 dynamic.
2. *얼마나 신선해야 하는가.* 콘텐츠는 60초 stale 허용. 기사 첫 발행 직후엔 운영팀이 별도 invalidate.

`force-dynamic` 으로 둔 페이지는 영원히 origin 이 받는다.  
그건 어쩔 수 없다. 공용 캐시 못 하는 자리니까.

포기한 것: 모든 페이지를 60초 ISR로 묶는 방식.
대신 개인화/인증/preview는 origin으로 보내고 공개 콘텐츠만 공유 캐시에 올렸다.

---

## CloudFront 헤더는 왜 path별로 갈랐나?

페이지 단위 갈래만으로는 부족했다.

`/api/*` 같은 endpoint, `/_next/static/*` 같은 빌드 산출물,  
`/images/*` 같은 사용자 업로드까지 다 캐시 정책이 달라야 했다.

`next.config.mjs` headers 에서 path 별로 박았다.

```text
/api/*            no-store, no-cache, must-revalidate
/_next/static/*   public, max-age=31536000, immutable
/_next/data/*     public, s-maxage=60, stale-while-revalidate=60
/images/*         public, max-age=86400
/fonts/*          public, max-age=31536000, immutable
/:path*           Vary: Accept, Accept-Encoding
```

각 줄이 한 가지 결정이다.

- `/api/*` 는 캐시 X. 사용자 데이터를 다른 사람한테 흘리지 않게.
- `/_next/static/*` 는 파일명에 hash 가 박혀 있다. 1년 immutable.
- `/_next/data/*` 는 RSC payload. 60초 캐시 + 60초 stale 허용.
- `/images/*` 는 CMS 업로드 이미지. 하루 캐시.
- 마지막 `Vary: Accept, Accept-Encoding` 이 진짜 함정 자리였다.

---

## 같은 URL에서 응답이 두 개면 어떻게 되나?

Next App Router 는 같은 URL 을 두 가지 응답으로 준다.

- 첫 진입 → HTML
- 클라이언트 라우팅 진입 → RSC payload (`application/x-component`)

CF 는 URL 만 보고 캐시 키를 잡는다.

만약 두 응답이 같은 키로 섞이면?

첫 진입 사용자가 받은 RSC payload 를, 다른 사용자가 *HTML 자리* 에서 받게 된다.

화면이 그냥 깨져버린다.

처음에 이거 보고 머리가 아팠다.

> CF 가 빠른데, 빠르게 *틀린 응답*을 퍼뜨리고 있었다.

해결은 `Vary: Accept` 한 줄이다.

CF 는 `Vary` 에 적힌 헤더를 캐시 키에 *포함*시킨다.

HTML 요청은 `Accept: text/html`, RSC 요청은 `Accept: text/x-component`.  
캐시 키가 갈라진다. 같은 URL 이라도 두 응답이 따로 캐시된다.

`Accept-Encoding` 도 같이 박았다.  
gzip 응답을 압축 안 한 브라우저에 그대로 주면 그것도 깨진다.

`Vary` 가 늘어날수록 캐시 키가 잘게 쪼개진다.  
hit률이 살짝 떨어진다.  
근데 *잘못된 응답을 캐시해 재사용하는 것* 보단 낫다.

---

## redirect도 캐시될 수 있나?

이건 한 번 운영에서 부딪혔다.

기사 하나가 정책으로 한 시간만 다른 URL 로 301 redirect 되고 있었다.  
정책 끝나서 redirect 제거했는데 다음 1년 동안 그 자리 사용자가 계속 옛 redirect 로 가더라.

CF 가 *301 응답을 캐시* 하고 있었다.

해결은 두 가지였다.

1. 301 대신 302 로. 영구 X.
2. `Cache-Control: no-store` 같이 박기.

```ts
return new Response(null, {
  status: 302,
  headers: {
    Location: redirectUrl,
    "Cache-Control": "no-store",
  },
})
```

이걸로 끝이었다.

근데 한 번 부딪히기 전에는 *redirect 가 캐시될 수 있다* 는 생각 자체가 잘 안 든다.

---

## prefetch에서 origin 요청이 30번 발생한 이유

Next 의 `<Link>` 는 viewport 에 들어온 링크를 자동으로 prefetch 한다.

뉴스 홈은 한 화면에 기사 카드가 30개 이상이다.  
사용자가 스크롤만 해도 prefetch 요청이 30번 나간다.

그게 CF 로 안 가고 *origin 직격* 으로 가는 자리가 있었다.

이유를 봤더니, prefetch 요청이 `Next-Router-Prefetch: 1` 같은 커스텀 헤더를 들고 갔다.  
그 헤더가 CF 의 cache key 에 포함돼서 매번 다른 키로 잡혔다.  
같은 URL 인데 prefetch 인지 아닌지에 따라 키가 갈라지니까 캐시 hit 못 함.

뉴스 홈 카드는 *30개 중 사용자가 평균 1~2개* 만 본다.  
나머지 28개 prefetch 는 origin 비용만 만든다.

해결은 두 갈래.

```tsx
// 트래픽 무거운 카드
<Link href="..." prefetch={false}>...</Link>
```

또 다른 방법은 CloudFront에서 `Next-Router-Prefetch` 헤더를 원본 서버에는 전달하되 캐시 키에서는 빼는 것이다.

prefetch 끄면 클릭 직후 응답 시간이 100~200ms 늘어난다.  
이 홈에서는 클릭할 때 조금 더 기다리더라도, 대부분 읽지 않는 기사 28건을 미리 요청하지 않는 쪽을 택했다.

---

## 압축은 누가 해야 하는가

이중 압축이 함정이었다.

Next 는 default 로 gzip 압축을 켠다 (`compress: true`).  
CF 도 default 로 압축을 시도한다.

origin 이 이미 gzip 한 응답을 CF 가 또 gzip 하면 의미가 없다.  
근데 더 큰 문제는 따로 있었다.

brotli 압축을 지원하는 브라우저에 *gzip 응답이 고정*돼서 내려간다.  
edge 단에서 더 좋은 압축으로 바꿔주지 못한다.

선택은 단순했다.

```ts
// next.config.mjs
compress: false,
```

압축은 CF 에서만 한다.  
브라우저 `Accept-Encoding` 보고 gzip 또는 brotli 를 고른다.

origin 은 압축 안 한 응답을 그대로 내려보낸다.

---

## 결국 LCP 가 아니라 TTFB 였다

이번 phase 정리하면서 한 가지가 명확해졌다.

3부, 4부에서 LCP 잡으려고 한 작업들 (eager, fetchPriority, srcset, sizes, RSC 전환) 이  
*다 의미 있었는데 CF 가 안 먹히는 상태에선 효과가 잘 안 보였다*.

캐시 적중률이 5%면 대부분의 요청이 원본 서버의 응답을 기다린다. 첫 바이트를 받기까지 800ms가 걸리니, 이미지 로딩에서 100ms를 줄여도 점수 차이를 보기 어려웠다.

이 phase 정리하고 나서야 LCP 작업의 효과가 진짜로 측정에 잡혔다.

이미지를 더 일찍 불러오는 방법부터 찾느라, 그 이미지 주소가 담긴 HTML은 얼마나 늦게 왔는지 한참 뒤에 봤다. 이걸 LCP보다 먼저 봤어야 했다.

---

## 다음 문제

이제 서버, CDN, 렌더링 경계까지 다 잡혔다.

근데 기사 상세는 이야기가 또 다르다.

본문이 React 컴포넌트가 아니다.  
CMS 에디터에서 만든 *HTML 문자열* 이 그대로 내려온다.

공통 이미지 컴포넌트 props 로 의도를 전달할 수가 없었다.

다음 phase 에서는 그 본문 HTML 을 어떻게 가공했는지 정리한다.
