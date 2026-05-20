---
title: "퍼포먼스 최적화 를 향해 - 5부"
date: 2025-12-27
update: 2025-12-27
tags:
  - front-end
  - performance
  - nextjs
  - cloudfront
  - series
---

## 들어가며
4부에서 홈을 RSC/SSR 쪽으로 옮겼다.

이제 브라우저가 모든 화면을 조립하지 않아도 된다.  
서버가 만든 HTML 안에 첫 화면 콘텐츠가 들어오기 시작했다.

그럼 다음 생각은 자연스럽게 이거다.

> 이 HTML, 매번 origin 에서 다시 만들 필요가 있나?

뉴스 홈은 트래픽이 많고, 기사 상세도 반복 조회가 많다.
RSC/SSR 로 브라우저 일을 줄였는데 모든 요청이 origin 까지 들어가면, 이번엔 서버가 힘들어진다.

그래서 CloudFront 를 붙이기 시작했다.

처음엔 솔직히 조금 쉽게 봤다.

정적 파일은 길게 캐시하고, API 는 `no-store`, HTML 은 `s-maxage` 주면 되겠지?

![CloudFront 시작](../phase1/img_2.png)

근데 아니었다.

CloudFront 는 빠르게 해주는 장치이기도 하지만,  
잘못된 응답을 아주 빠르게 퍼뜨릴 수 있는 장치이기도 했다.

---

## next.config 에서 끝날 줄 알았다

처음에는 `next.config.mjs` 의 `headers()` 에서 처리하면 될 줄 알았다.

```ts
{
  source: "/_next/static/:path*",
  headers: [
    { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
  ],
}
```

이런 건 명확하다.

빌드 해시가 붙은 정적 파일은 오래 캐시해도 된다.
폰트도 비슷하게 볼 수 있다.
API 는 반대로 `no-store` 를 걸면 된다.

문제는 HTML 이었다.

Next App Router 에서는 같은 URL 이라고 해서 항상 같은 성격의 요청이 아니다.

주소창에 `/` 를 치고 들어오는 HTML 요청이 있고,  
Next 내부에서 가져가는 RSC Flight 요청이 있고,  
prefetch 로 생기는 요청도 있다.

겉으로는 같은 `/` 처럼 보이는데, 응답의 의미가 다르다.

이걸 CloudFront 입장에서 같은 캐시 객체처럼 보면 바로 사고다.

그래서 HTML 캐시 정책을 `next.config` 에만 두기 어렵다고 봤다.
경로와 요청 헤더를 보고 더 세밀하게 나눠야 했다.

결국 middleware 로 내려왔다.

---

## HTML 과 RSC 를 나눠야 했다

처음에는 `_rsc` query 를 보면 될 줄 알았다.

근데 이게 또 생각처럼 깔끔하지 않았다.
Next.js 가 middleware 까지 `_rsc` 파라미터를 항상 기대한 방식으로 넘겨주지 않는 케이스가 있었다.

그래서 query 만 믿는 방식은 버렸다.

요청 헤더를 봤다.

```ts
const accept = (request.headers.get("accept") || "").toLowerCase();
const secFetchDest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();

const isRSCRequest =
  !accept.includes("text/html") && secFetchDest === "empty";

if (isRSCRequest) {
  return createNoCacheResponse();
}
```

HTML 을 기대하는 요청은 `accept` 에 `text/html` 이 들어온다.
반대로 RSC 쪽 요청은 성격이 다르다.

이 구분을 해놓고 나서야 HTML 에만 cache header 를 줄 수 있었다.

```ts
const isHtmlRequest =
  (request.method === "GET" || request.method === "HEAD") &&
  accept.includes("text/html");

if (isHtmlRequest) {
  res.headers.set(
    "Cache-Control",
    `public, max-age=60, s-maxage=${cacheDuration}, stale-while-revalidate=60`
  );
  res.headers.set("Vary", "Accept");
}
```

여기서 `Vary: Accept` 도 같이 들어갔다.

CloudFront 가 HTML 요청과 RSC 요청을 같은 것으로 보면 안 된다.
같은 URL 이라도 `Accept` 가 다르면 다른 의미의 응답이다.

이때부터 CloudFront 작업이 단순히 "캐시 켜기"가 아니라는 걸 알았다.

캐시 hit 를 높이는 것보다 먼저,  
캐시된 응답이 같은 의미의 요청에만 재사용되게 해야 했다.

---

## 캐시하면 안 되는 페이지부터 막았다

처음엔 공개 페이지를 어떻게 캐시할지만 생각했다.

홈, 기사 상세, 섹션, 컬렉션.
이런 페이지들은 공개 콘텐츠라 CloudFront 에 태울 수 있다.

근데 실제로는 반대로 보는 게 더 안전했다.

> 뭐를 절대 캐시하면 안 되지?

계정, 검색, preview, 구독, oauth 같은 영역은 사용자 상태나 요청 조건이 섞인다.
이런 응답이 edge 에 들어가면 빠른 게 문제가 아니라 틀린 화면이 빠르게 퍼진다.

그래서 이런 경로는 no-cache 로 뺐다.

```ts
const NON_CACHE_PREFIXES = [
  "/account",
  "/search",
  "/preview",
  "/subscribe",
  "/login-blocked",
  "/oauth",
];
```

query string 도 조심해야 했다.

`?preview=1`, `?debug=1`, `?test=1`, `?nocache=1`, `?_vercel=...`

이런 요청은 개발, preview, 디버깅, 플랫폼 동작과 엮인다.
잘못 캐시되면 원인을 찾기도 싫어진다.

그래서 위험한 query 는 아예 no-cache 로 돌렸다.

```ts
const CACHE_POISON_PARAMS = new Set([
  "debug",
  "preview",
  "test",
  "nocache",
  "cache",
  "admin",
  "dev",
  "_vercel",
]);
```

이건 멋있는 최적화는 아니다.

근데 운영에서는 이런 게 더 중요할 때가 있다.
빠른 오답은 느린 정답보다 훨씬 위험하다.

---

## redirect 캐시는 진짜 조심해야 했다

CloudFront 작업하면서 제일 찝찝했던 게 redirect 였다.

예를 들어 AMP 경로는 이렇게 보낸다.

```ts
if (searchParams.get("amp") === "1" && !pathname.startsWith("/amp/")) {
  url.pathname = `/amp${pathname}`;
  searchParams.delete("amp");
  return createNoCacheRedirect(url, 308);
}
```

대문자 path 를 소문자로 정규화하는 처리도 있다.

```ts
if (pathname !== pathname.toLowerCase()) {
  url.pathname = pathname.toLowerCase();
  return createNoCacheRedirect(url);
}
```

여기서 301, 308 같은 redirect 가 잘못 캐시되면 답이 없다.

특히 홈처럼 트래픽 큰 경로에서 redirect cache 사고가 나면,  
origin 을 고쳐도 edge 나 브라우저가 계속 예전 응답을 들고 있을 수 있다.

그래서 redirect 는 무조건 no-cache 로 뺐다.

```ts
function createNoCacheRedirect(url: URL, status = 308) {
  const res = NextResponse.redirect(url, status);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
```

이건 성능을 조금 손해 보더라도 안전하게 가는 쪽이었다.

redirect 는 빠르게 캐시하는 순간, 실수가 서비스 전체로 퍼질 수 있다.

---

## prefetch 때문에 origin 이 두 번 맞을 수 있었다

Next 의 `Link` prefetch 는 원래 좋은 기능이다.

사용자가 클릭하기 전에 미리 받아두니, 클릭했을 때 빠르게 넘어갈 수 있다.

근데 뉴스 홈에서는 문제가 됐다.

홈에는 링크가 너무 많다.

기사 링크, 섹션 링크, 컬렉션 링크, Top Stories, Trending Topic, Opinion, Darkroom ...

사용자가 클릭하지도 않은 링크들이 prefetch 를 만들고,  
그 요청이 RSC/Flight 쪽으로 origin 을 깨우기 시작했다.

더 짜증나는 건, 이 요청들이 CloudFront HTML cache hit 으로 해결되는 것도 아니라는 점이었다.

사용자가 클릭도 안 했는데 서버를 한 번 치고,  
실제로 클릭하면 또 한 번 치는 상황이 나올 수 있었다.

그래서 주요 링크에는 `prefetch={false}` 를 넣었다.

```tsx
<Link href={articleUrl} prefetch={false}>
  {title}
</Link>
```

물론 손해도 있다.

prefetch 를 끄면 실제 클릭 순간에 미리 받아둔 이점은 줄어든다.
하지만 이 경우에는 그 이점보다 origin 부하와 캐시 오염 가능성이 더 컸다.

뉴스 홈처럼 링크가 많은 화면에서는  
사용자가 읽지도 않을 수십 개 페이지를 미리 준비하는 게 오히려 손해였다.

이건 "Next 기능을 껐다"가 아니라,  
CloudFront 캐시 전략에 맞게 링크 동작을 조정한 것이다.

---

## CompressionPlugin 도 결국 뺐다

초반에는 Webpack 쪽에서 CompressionPlugin 으로 gzip/brotli 를 만들 생각도 했다.

근데 CloudFront 가 이미 edge 에서 압축을 처리할 수 있다.

그러면 애플리케이션 빌드 단계에서 또 압축 파일을 만들 필요가 없다.
오히려 빌드 산출물만 복잡해진다.

그래서 CompressionPlugin 은 제거했다.

성능 작업을 하다 보면 자꾸 뭔가를 더 붙이고 싶어진다.
근데 이 경우에는 빼는 게 맞았다.

CloudFront 가 잘하는 일은 CloudFront 에 맡기고,  
Next build 는 화면을 만드는 일에 집중시키는 쪽이 더 단순했다.

---

## 최신성과 캐시 사이에서 줄타기

뉴스 사이트에서 캐시는 항상 애매하다.

너무 짧게 잡으면 CloudFront 를 붙인 의미가 줄어든다.
너무 길게 잡으면 빠르긴 한데 낡은 뉴스가 보일 수 있다.

그래서 모든 HTML 에 같은 TTL 을 주지 않았다.

홈, 섹션, 기사 상세는 성격이 다르다.
홈과 섹션은 자주 바뀌고, 기사 상세는 상대적으로 덜 바뀌지만 수정 가능성은 있다.

그래서 브라우저에는 짧게, CloudFront 에는 페이지 성격에 맞게,  
그리고 갱신 중에는 `stale-while-revalidate` 로 살짝 버티게 했다.

```ts
Cache-Control:
  public,
  max-age=60,
  s-maxage=${cacheDuration},
  stale-while-revalidate=60
```

이게 정답이라는 뜻은 아니다.

다만 이 서비스에서는 "항상 origin 을 치는 구조"와 "오래된 HTML 을 너무 오래 들고 있는 구조" 사이에서
이 정도가 현실적인 타협점이었다.

---

## 마무리

CloudFront 를 붙인다고 성능이 자동으로 좋아지는 건 아니었다.

오히려 Next App Router 에서는 조심할 게 많았다.

- HTML 요청과 RSC 요청을 구분해야 한다.
- `Vary: Accept` 로 같은 URL 안의 다른 응답을 나눠야 한다.
- preview, account, search 같은 영역은 edge 에 올리면 안 된다.
- redirect 와 위험한 query string 은 no-cache 로 빼야 한다.
- `Link` prefetch 가 origin 부하를 만들 수 있다.
- CDN 이 이미 하는 압축을 app build 에서 또 할 필요는 없다.

여기까지 오고 나서야, 프론트엔드 성능 최적화가 컴포넌트 코드만의 문제가 아니라는 걸 좀 세게 느꼈다.

브라우저, Next 서버, CloudFront, origin 사이에서  
어떤 응답을 어디까지 재사용할지 정하는 일.

이제 다음은 기사 상세 본문이다.

홈 이미지는 React 컴포넌트에서 어느 정도 제어할 수 있었지만,  
기사 본문 이미지는 CMS HTML 문자열 안에 들어 있었다.

그 `<img>` 들을 어떻게 `picture`, `aspect-ratio`, `loading`, `fetchpriority`, `?w=` 정책으로 바꿨는지 다음 phase 에서 정리해보려 한다.
