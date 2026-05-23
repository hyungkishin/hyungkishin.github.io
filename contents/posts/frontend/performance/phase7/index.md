---
title: "모든 페이지가 dynamic이라 CloudFront가 안 먹혔어요"
date: 2025-12-27
update: 2025-12-27
tags:
  - front-end
  - performance
  - nextjs
  - cloudfront
  - cache
  - ssr
  - isr
  - series
---

> **TL;DR**
>
> CloudFront를 켜놨는데 cache hit률이 한 자리 수였어요.  
> 응답 헤더를 까보니 거의 모든 페이지가 `Cache-Control: private, no-store` 로 나가고 있었습니다.
>
> 원인은 코드에 박힌 한 줄이 아니라 *기본값*이었어요.  
> Next 14 App Router에서는 페이지 안에 `searchParams`나 `cookies()`가 한 군데만 들어가도 그 페이지가 *통째로 dynamic*이 됩니다.
>
> 그래서 `revalidate=60`을 페이지에 박는 것보다 먼저, 페이지를 세 갈래로 갈라야 했습니다.  
> dynamic 유지 / ISR / immutable 자산.
>
> CloudFront 헤더는 그 위에 path 별로 붙였어요.  
> `s-maxage`, `stale-while-revalidate`, `Vary: Accept`, prefetch 트래픽 처리까지 같이 봐야 했습니다.
>
> 이 글은 LCP/CLS 직전에 했어야 했던 결정이에요.  
> 클라이언트 최적화는 *origin에 도달한 다음 게임*이고, 그 전에 *origin까지 안 가게 만드는 결정*이 훨씬 무거웠습니다.

---

## CF를 켰는데 왜 hit률이 안 올라갔을까요?

CloudFront를 origin 앞에 붙였습니다.  
콘텐츠 페이지에는 캐시가 잘 먹힐 거라고 봤어요.

근데 CF 콘솔의 cache hit률이 5% 안팎에서 멈춰 있었습니다.  
대부분 요청이 그대로 origin까지 갔어요.

응답 헤더를 까봤습니다.

```text
Cache-Control: private, no-cache, no-store, must-revalidate
```

홈, 섹션, 기사 디테일 거의 다 이 헤더로 나가고 있었어요.  
CF 입장에서는 *"이건 캐시하지 말라"* 는 명시 신호. hit률이 올라갈 자리가 없습니다.

처음엔 `next.config.mjs`에서 헤더를 잘못 박은 줄 알았어요.  
근데 그 자리는 깨끗했습니다. 헤더가 *Next에서 자동으로* 그렇게 내려가고 있었어요.

---

## 왜 모든 페이지가 dynamic이 됐을까요?

Next.js 14 App Router의 동작이었습니다.

페이지가 *정적*으로 빌드되려면 build time에 모든 데이터가 결정 가능해야 합니다.  
그런데 페이지 트리 어딘가에 다음 중 하나만 들어가도 그 페이지가 *통째로 dynamic*으로 전환돼요.

- `cookies()`, `headers()` 호출
- `searchParams` 사용
- `fetch(..., { cache: 'no-store' })`
- `export const dynamic = 'force-dynamic'`
- dynamic API 의존 (예: `request` 객체)

홈 안에는 사용자 로그인 상태를 보는 `cookies()`가 어딘가 있었고, 검색 진입 처리를 위해 `searchParams`를 보는 자리가 있었습니다.  
한 줄만 들어가도 그 페이지가 빌드 결과에서 *λ 함수*로 잡혀요. CF가 캐시할 수 없는 응답이 됩니다.

빌드 로그를 보면 페이지별 마크가 찍힙니다.

```text
○  Static (build time)
●  ISR (revalidate)
λ  Server (dynamic at runtime)
```

거의 다 `λ`였습니다. 그래서 CF가 안 먹혔던 거예요.

> 본문 한 줄이 페이지 *전체*의 캐시 전략을 결정하는 구조라는 걸, 운영 hit률을 보고 나서야 알았습니다.

---

## ISR 한 줄로 다 풀릴 거라 봤는데, 그게 맞았을까요?

처음 답은 단순했습니다.  
*"전부 `revalidate=60` 박으면 되잖아."*

근데 그게 답이 아닌 자리들이 있었어요.

- `account`, 로그인한 사용자 본인 정보. 다른 사람과 캐시 공유하면 사고.
- `mytimes`, 개인 스크랩/북마크. 같은 이유.
- `search`, 쿼리마다 응답이 다름. 캐시 키가 폭발.
- `oauth/callback`, 인증 콜백. 한 번 쓰고 버리는 응답.
- `preview`, 운영 미공개 콘텐츠. 캐시되면 비공개가 새어나감.

이 페이지들에 `revalidate`를 박는 순간 *보안 사고* 또는 *기능 깨짐*입니다.

그래서 페이지를 세 갈래로 갈랐어요.

| 갈래 | 어떤 페이지 | 설정 |
|---|---|---|
| dynamic 유지 | `account`, `mytimes`, `search`, `oauth/*`, `preview` | `export const dynamic = 'force-dynamic'` |
| ISR | 콘텐츠 디테일 (entertainment, business 등 섹션/카테고리) | `export const revalidate = 60` |
| 정적 자산 | `_next/static`, fonts, favicon | 빌드 산출물, 1년 immutable |

기준은 두 가지였어요.

1. 응답이 *모든 사용자에게 같은가*, 같으면 공용 캐시 가능, 다르면 dynamic.
2. *얼마나 신선해야 하는가*, 콘텐츠 디테일은 60초 stale 허용, 기사 첫 발행 직후엔 운영팀이 별도 invalidate.

> **포기한 것**: `force-dynamic` 으로 둔 페이지는 영원히 origin이 받습니다.  
> CF가 그 트래픽을 흡수해주지 않아요. 그 비용은 *공용 캐시 불가능* 이라는 도메인 사실의 대가.

---

## CloudFront 헤더는 path별로 어떻게 갈랐을까요?

페이지 단위 갈래만으로는 부족했습니다.  
`/_next/static/*` 같은 자산, `/api/*` 같은 동적 endpoint, `/images/*` 같은 사용자 업로드까지 *path 마다* 캐시 정책이 달라야 했어요.

`next.config.mjs`에서 path 별로 명시했습니다.

```text
/api/*            no-store, no-cache, must-revalidate
/_next/static/*   public, max-age=31536000, immutable
/_next/data/*     public, s-maxage=60, stale-while-revalidate=60
/images/*         public, max-age=86400
/fonts/*          public, max-age=31536000, immutable
/(favicon|robots) public, max-age=86400
/:path*           Vary: Accept, Accept-Encoding
```

각 줄이 한 가지 결정입니다.

- `/api/*` 는 캐시 X. 사용자 데이터를 다른 사람한테 흘리지 않는 안전망.
- `/_next/static/*` 는 빌드 hash가 파일명에 박혀 있어요. 같은 hash면 같은 내용이 보장돼서 1년 immutable.
- `/_next/data/*` 는 RSC payload. 60초 캐시 + 60초 동안은 stale을 그대로 내보내고 백그라운드에서 재검증.
- `/images/*` 는 CMS 업로드 이미지. 하루 캐시 + CDN level에서 따로 키 invalidation.
- 마지막 줄 `Vary: Accept, Accept-Encoding`, *함정 자리* 였습니다. 다음 섹션에서 짚어요.

---

## 같은 URL인데 HTML과 RSC가 섞이면 어떻게 될까요?

Next App Router는 같은 URL을 *두 가지 응답*으로 줍니다.

- 첫 진입: HTML
- 클라이언트 라우팅 진입: RSC payload (`application/x-component`)

CF는 *URL만 보고* 캐시 키를 잡으니까, 두 응답이 같은 키로 섞이면 큰 사고가 납니다.  
첫 진입 때 받은 RSC payload를 다른 사용자가 *HTML 자리*에서 받게 되는 경우. 화면이 깨져요.

`Vary: Accept` 한 줄이 이 사고를 막습니다.

```text
Vary: Accept, Accept-Encoding
```

CF는 `Vary` 헤더에 적힌 요청 헤더를 *캐시 키에 포함*시켜요.  
HTML 요청은 `Accept: text/html`, RSC 요청은 `Accept: text/x-component` 라서 캐시 키가 갈라집니다.  
같은 URL이라도 두 응답이 *별도 캐시* 됩니다.

`Accept-Encoding`도 같은 이유. gzip 응답을 압축 안 한 브라우저에 그대로 주면 깨져요.

> **포기한 것**: `Vary` 가 늘어날수록 CF 캐시 키가 더 잘게 쪼개집니다.  
> hit률이 살짝 떨어져요. 사고를 막는 대가.

---

## redirect가 캐시되면 왜 무서울까요?

CF가 *3xx 응답*을 캐시할 수 있다는 게 함정이었습니다.

예시 시나리오:
- `/article/123` 이 운영 정책으로 한 시간 동안 `/promo/special` 로 301 redirect 중.
- 정책 종료. 운영자가 redirect 제거.
- 근데 CF는 *301 응답을 캐시*해서 그 다음 1년간 사용자가 `/article/123` 가도 `/promo/special` 로 보냅니다.

solution: redirect를 띄울 자리는 *명시적으로 no-cache* 또는 *짧은 max-age*.

```ts
// app/article/[id]/page.tsx 안의 redirect 자리
return new Response(null, {
  status: 302,  // 301 대신 302 (영구 X)
  headers: {
    Location: redirectUrl,
    "Cache-Control": "no-store",
  },
})
```

302 자체로는 CF가 *기본 캐시 안 함*. 그래도 `Cache-Control: no-store`를 같이 박아서 *서명* 합니다.  
"이 응답을 캐시하지 마라" 는 의지를 두 군데로.

---

## prefetch가 왜 origin을 두 번 때릴까요?

Next의 `<Link>` 는 viewport에 들어온 링크를 자동으로 prefetch 합니다.  
뉴스 홈은 한 화면에 *기사 카드가 30개 이상*. 사용자가 스크롤만 해도 prefetch 요청이 30번 나갑니다.

이 prefetch가 CF로 안 가고 origin 직격으로 가던 자리가 있었어요.  
이유: prefetch 헤더가 `Next-Router-Prefetch: 1` 같은 *커스텀 헤더*를 들고 가는데, CF의 origin behavior가 그 헤더를 *Vary*에 포함시켜놨어서 캐시 키가 폭발.

해결책 둘 중 하나:

1. CF behavior에서 `Next-Router-Prefetch` 헤더를 *origin에 그대로 forward는 하되 캐시 키엔 포함 안 함*. 즉 CF cache key spec에서 제외.
2. 트래픽 무거운 섹션의 카드 `<Link>` 에 `prefetch={false}`, 사용자 클릭 직전에 fetch.

뉴스 홈 카드는 *모두 클릭되지 않음*. 30개 중 사용자가 평균 1~2개만 봐요. 나머지 prefetch는 origin 비용만 발생.

> **포기한 것**: prefetch를 끄면 *클릭 직후 응답 시간이 100~200ms 늘어남*. CF가 채워주는 자리지만 첫 hit 때만 그래요. 그 비용 vs origin 부하의 trade-off.

---

## 압축은 Next가 해야 할까요, CloudFront가 해야 할까요?

이중 압축이 함정이에요.

Next는 default로 gzip 압축을 켭니다 (`compress: true`).  
CF도 default로 압축을 시도해요.

origin이 이미 gzip한 응답을 CF가 또 gzip 하면 *느려지기만* 합니다 (조금).  
더 큰 문제: brotli 압축을 지원하는 브라우저에 gzip 응답이 *고정*돼서 내려가는 자리.

답은 단순했습니다.

```ts
// next.config.mjs
compress: false,
```

압축은 *CF에서만* 합니다. CF가 브라우저 `Accept-Encoding` 에 맞춰 gzip 또는 brotli를 골라줘요.  
origin은 압축 안 한 응답을 그대로 내려보내고, edge에서 압축 결정.

---

## 결국 무엇을 갈랐고 무엇을 얻었을까요?

| 결정 | 얻은 것 | 포기한 것 |
|---|---|---|
| 페이지를 세 갈래로 (dynamic / ISR / static) | 콘텐츠 페이지 CF hit률 70%+ 회복 | 페이지마다 *이게 어느 갈래인지* 코드에 표시해야 하는 운영 부담 |
| `next.config.mjs` headers를 path 별로 명시 | `/api/*`, `/_next/static/*` 등이 정확한 정책으로 분리 | `next.config.mjs`가 길어지고, 변경 시 전체 영향 |
| `Vary: Accept, Accept-Encoding` | 같은 URL의 HTML/RSC/압축 응답이 안 섞임 | 캐시 키가 잘게 쪼개져 hit률 손실 약간 |
| 압축은 CF에서만 | brotli 응답 가능. 이중 압축 회피 | origin 응답이 크게 나가는 자리에서 *내부 트래픽* 약간 증가 |
| 뉴스 홈 카드 `prefetch={false}` | prefetch 30회 × N pod 부하 절감 | 클릭 시 첫 응답 100~200ms 추가 |
| 301 redirect → 302 + `no-store` | CF가 redirect를 영구 캐시하지 않음 | redirect 변경 시 *기다리지 않고 바로 반영* 됨. 그 자체는 의도된 것. |

---

## 무엇을 아직 못 정했을까?

- **`mytimes`의 *공용 부분*은 캐시 가능한가**, 헤더 영역, GNB 같은 공용 부분만 따로 떼어서 ISR로 보내면 dynamic 페이지 안에서도 부분 캐시 가능. RSC streaming 으로 풀 수 있는데 운영팀 합의가 안 끝났어요.
- **CMS 발행 직후 CF invalidation 자동화**, 지금은 운영자가 수동으로 invalidate. 발행 이벤트와 묶어서 자동화하면 60초 stale 구간을 0에 가깝게 줄일 수 있음. 워크플로우 결합이라 미뤘습니다.
- **prefetch 정책의 임계**, `prefetch={false}` 가 정말 뉴스 홈 *전부*에 맞는지, 아니면 top stories 처럼 클릭률 높은 자리는 prefetch를 켜둬야 하는지. A/B 측정 대기.
- **edge function 분리**, header 처리, 로그인 redirect 같은 자리는 CF edge function으로 보낼 수 있습니다. CF + Lambda@Edge 운영 학습 곡선 때문에 보류.

---

## 어디서 *순서가 잘못됐다*는 걸 알았을까요?

처음엔 LCP/CLS/TBT 같은 클라이언트 메트릭부터 잡고 있었습니다.  
이미지를 eager로, srcset을 정확히, JS를 줄이고, Suspense로 stream 하고.

근데 그 모든 게 *origin에 도달한 뒤*의 게임이었어요.  
CF hit률 5%면 *모든 사용자의 모든 첫 응답이 origin TTFB를 그대로 받습니다*. LCP를 100ms 줄여도 TTFB가 800ms면 의미가 작아져요.

페이지 갈래 + CF 헤더 정리한 뒤에야 LCP 최적화의 *효과가 진짜로* 보였습니다.  
한 자리는 클라이언트, 한 자리는 서버, 한 자리는 CDN. 셋 다 잡혀야 빨라지는 거고, *어디서부터 잡느냐* 가 더 큰 결정이었어요.

> CloudFront는 빠르게 해주는 장치이면서, 틀린 응답을 빠르게 퍼뜨리는 장치이기도 했습니다.

다음 글 (6부) 에서는 서버 layer가 정리된 다음 *본문 layer*, CMS가 내려주는 HTML 파이프라인을 어떻게 깎았는지 다룹니다.
