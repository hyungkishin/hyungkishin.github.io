---
title: "퍼포먼스 최적화 를 향해 - 5부"
date: 2025-12-27
update: 2025-12-27
tags:
  - front-end
  - performance
  - nextjs
  - cloudfront
  - cache
  - series
---

## 들어가며
4부에서 홈을 RSC/SSR 쪽으로 옮겼다.

브라우저가 화면을 통째로 조립하지 않아도 되게 만들었고,  
첫 화면 HTML 안에 메인 기사들이 들어오게 됐다.

근데 그게 끝이 아니었다.

뉴스 홈은 트래픽이 진짜 많다.  
같은 페이지를 수천 명이 거의 같은 시간에 본다.

서버가 그 HTML 을 매번 만들고 있다면?

그건 그냥 *브라우저가 했던 일을 서버로 옮긴 것*에 가깝다.

> 그러면 빨라지긴 했나? 라는 질문이 다시 들어왔다.

그래서 CloudFront 를 origin 앞에 붙였다.

좋다, 캐시 잘 먹겠지 했다.

근데 CF 콘솔 hit률이 한 자리수에서 안 올라갔다.

![아 이거 또..](../phase1/img_2.png)

---

## CloudFront 가 안 먹히고 있었다

응답 헤더를 까봤다.

```text
Cache-Control: private, no-cache, no-store, must-revalidate
```

홈, 섹션, 기사 디테일 거의 다 이렇게 나가고 있었다.  
CF 입장에서는 *"이건 캐시하지 말라"* 는 명시.

처음엔 `next.config.mjs` 의 cache header 설정을 잘못 박았나 했다.  
근데 그 자리는 깨끗했다.

문제는 그게 아니었다.  
Next 가 *자동으로* 그 헤더를 박고 있었다.

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

## 한 줄이 페이지 전체를 dynamic 으로 만들었다

Next 14 App Router 가 좀 까다로웠다.

페이지 트리 어디에든 다음 중 하나만 들어가도 *그 페이지 전체가* dynamic 으로 바뀐다.

- `cookies()`, `headers()` 호출
- `searchParams` 사용
- `fetch(..., { cache: 'no-store' })`
- `export const dynamic = 'force-dynamic'`

홈 안에 로그인 상태를 확인하는 `cookies()` 가 어딘가 있었고,  
검색 진입 처리하는 자리에 `searchParams` 가 있었다.

한 줄.  
그 페이지 전체가 *런타임에 매번 서버에서 만드는 페이지* 로 잡혀버렸다.

> 한 줄짜리 의도가, 전체 페이지의 캐시 가능성을 결정하고 있었다.

운영 hit률 보고 나서야 알았다.

---

## ISR 한 줄로 다 풀릴 거라 봤다

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

---

## CloudFront 헤더는 path 별로 갈라야 했다

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

## 같은 URL 인데 응답이 두 개였다

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
근데 *틀린 응답을 퍼뜨리는 것* 보단 낫다.

---

## redirect 가 캐시되는 자리도 있었다

이건 한 번 운영에서 부딪혔다.

기사 하나가 정책으로 한 시간만 다른 URL 로 301 redirect 되고 있었다.  
정책 끝나서 redirect 제거했는데, 다음 1년 동안 그 자리 사용자가 계속 옛 redirect 로 가더라.

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

## prefetch 가 origin 을 30번씩 때리고 있었다

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

또는 CF behavior 에서 `Next-Router-Prefetch` 헤더를 *origin 에 forward 는 하되 캐시 키에는 포함 안 함* 으로 설정.

prefetch 끄면 클릭 직후 응답 시간이 100~200ms 늘어난다.  
근데 그 비용이 *원하지도 않은 28번의 origin 부하* 보다 작았다.

---

## 압축은 누가 해야 하는가

이중 압축이 함정이었다.

Next 는 default 로 gzip 압축을 켠다 (`compress: true`).  
CF 도 default 로 압축을 시도한다.

origin 이 이미 gzip 한 응답을 CF 가 또 gzip 하면 의미가 없다.  
근데 더 큰 문제는 따로 있었다.

brotli 압축을 지원하는 브라우저에 *gzip 응답이 고정*돼서 내려간다.  
edge 단에서 더 좋은 압축으로 바꿔주지 못한다.

답은 단순했다.

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
*다 의미 있었는데, CF 가 안 먹히는 상태에선 효과가 잘 안 보였다*.

CF hit률 5% 면 모든 첫 응답이 origin TTFB 를 그대로 받는다.  
LCP 100ms 줄여도 TTFB 800ms 면 점수가 안 움직인다.

이 phase 정리하고 나서야 LCP 작업의 효과가 진짜로 측정에 잡혔다.

> 클라이언트 최적화는 *origin 에 도달한 다음 게임* 이었다.
>
> 그 전에 *origin 까지 안 가게 만드는 결정* 이 훨씬 더 무거웠다.

이걸 LCP 보다 먼저 봤어야 했다.  
실제로는 LCP 잡고 나서야 CF 보게 됐다.  
순서가 뒤집혔던 자리.

---

## 다음 phase

이제 서버, CDN, 렌더링 경계까지 다 잡혔다.

근데 기사 상세는 이야기가 또 다르다.

본문이 React 컴포넌트가 아니다.  
CMS 에디터에서 만든 *HTML 문자열* 이 그대로 내려온다.

`OptimizedImage` 같은 props 로 의도를 전달할 수가 없었다.

다음 phase 에서는 그 본문 HTML 을 어떻게 가공했는지 정리한다.
