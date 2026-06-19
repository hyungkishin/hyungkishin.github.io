---
title: "성능 최적화를 향해 - 4부"
date: 2025-12-26
update: 2025-12-26
tags:
  - front-end
  - performance
  - nextjs
  - rsc
  - series
---

> **TL;DR**
>
> LCP 이미지에 `eager`, `fetchPriority`, `srcset`, `sizes`를 줘도 한계가 있었다.
> CSR 구조에서는 브라우저가 JS를 받고 API를 호출한 뒤에야 이미지 URL을 알 수 있었다.
>
> 홈의 공개 상단 콘텐츠를 RSC/SSR 경로로 옮겼다.
> 다만 광고, 트래킹, 개인화처럼 브라우저 상태가 필요한 영역은 클라이언트 경계로 남겼다.

---

## 이미지 주소를 늦게 알면 우선순위도 늦다
3부에서 LCP 이미지를 먼저 불러오도록 정리했다.

`loading="eager"`  
`fetchPriority="high"`  
`srcset`, `sizes`  
첫 번째 영역 즉시 렌더링  

이 정도면 꽤 한 것 같았다.

근데 뭔가 찝찝했다.

LCP 이미지를 빨리 받게 해도 브라우저가 그 이미지 URL 을 아는 시점 자체가 늦으면 답이 없다.  
이미지를 먼저 받으라 해놓고 정작 이미지 주소는 JS 실행하고 API 호출한 뒤에 알게 되는 상황.

> 뭐지. 열심히 했는데 출발선이 너무 뒤에 있는 느낌인데?

다시 홈 구조를 봤다.

그리고 약간 허탈했다.

지금까지 줄이고 미루고 우선순위 주고 했던 작업들이  
알고보면 대부분 **CSR 위에서 어떻게든 버티는 작업**이었다.

![아니 이걸 이제 봤다고](../phase1/img_2.png)

---

## CSR에서는 왜 출발선이 늦었나?

CSR 구조에서는 브라우저가 할 일이 많다.

1. HTML 받기
2. JS 받기
3. JS 파싱하기
4. React 실행하기
5. API 호출하기
6. 데이터 받아서 화면 만들기
7. 그제야 이미지 요청하기

이러면 `fetchPriority="high"` 를 줘도 애매하다.

브라우저 입장에서는 아직 뭘 가져와야 하는지 모르는데  
"이거 중요하니까 빨리 가져와" 라고 말하고 있는 셈이다.

그래서 질문이 바뀌었다.

> 이미지를 어떻게 빨리 받을까?

가 아니라,

> 이미지가 들어간 HTML 을 서버에서 먼저 만들어줄 수 없을까?

가 됐다.

---

## 어디까지 서버에서 만들었나?

홈은 그냥 정적 페이지가 아니다.

헤더, top1 기사, top 기사 묶음, 섹션 기사, opinion, MyTimes, Top Stories, 광고, 배너가 한 화면에 다 들어온다.

이걸 전부 클라이언트에서 조립하면 당연히 무겁다.
그렇다고 전부 서버로 밀어 넣으면 광고나 트래킹, 로그인 상태 같은 것들이 또 터진다.

그래서 전부 바꾸지는 않았다.

첫 화면에서 바로 보여야 하는 공개 콘텐츠만 서버 렌더링 경로에 올렸다.

```tsx
export const HomePageServer = async ({ mainEdition, searchParams }) => {
  const [topArticlesRes, topStoriesRes] = await Promise.allSettled([
    getTopArticlesServer(mainEdition),
    getTopStoriesServer(),
  ]);

  const topOperatingData =
    topArticlesRes.status === "fulfilled" ? topArticlesRes.value : null;

  return (
    <ServerPageWrapper>
      <h1 className="a11y">The Korea Times</h1>
      <HomeHeaderServer />

      {topOperatingData?.top1 && <Top1Module data={topOperatingData.top1} />}

      {topOperatingData?.top?.map((topArticle) =>
        topArticle.designType === "divider" ? (
          <HomeTopDefault list={topArticle.list} />
        ) : (
          <HomeTopShortForm list={topArticle.list} />
        )
      )}
    </ServerPageWrapper>
  );
};
```

판단은 `Top1Module`, `HomeTopDefault`, `HomeTopShortForm` 같은 상단 영역을
JS 실행 이후에 만드는 게 아니라, 서버에서 먼저 만들어서 내려주는 것이다.

그러면 브라우저는 빈 껍데기 HTML 을 받고 기다리는 게 아니라,  
처음부터 기사 제목과 이미지가 들어갈 구조를 볼 수 있다.

LCP 이미지도 더 일찍 발견된다.

---

## 그렇다고 전부 RSC 로 밀지는 않았다

처음에는 욕심이 났다.

> 그냥 다 서버로 올리면 되는 거 아님?

근데 홈은 그렇게 단순하지 않았다.

광고 스크립트는 브라우저 환경이 필요하고 트래킹도 hydration 이후 타이밍이 중요하다.  
로그아웃 처리나 개인화 영역도 서버에서 막 밀어붙이면 이상해질 수 있다.

그래서 이런 식으로 나눴다.

```tsx
<ServerPageWrapper>
  <HomeHeaderServer />
  <Top1Module data={topOperatingData.top1} />

  <ScrollResponsiveContentsServer asideContents={...}>
    <TopAdvertisementClient />
    <HomeTopDefault />
    <HomeSection />
    <BottomAdvertisementClient />
  </ScrollResponsiveContentsServer>

  <ClientTracking />
  <LogoutHandler />
</ServerPageWrapper>
```

서버에서 만들 수 있는 건 서버로 올리고  
브라우저에서만 의미 있는 건 클라이언트 경계로 남겼다.

이게 생각보다 중요했다.

성능 최적화라고 해서 CSR 을 다 없애는 게 아니었다.  
CSR 이 필요한 자리만 남기는 게 더 맞았다.

포기한 것: 홈 전체를 RSC로 밀어 넣는 방식.
대신 첫 화면 공개 콘텐츠만 서버에서 만들고 광고와 트래킹은 클라이언트 경계에 남겼다.

---

## Header는 왜 따로 봤나?

홈 헤더는 로고 하나 있는 영역이 아니었다.

edition, section menu, trending topic, all section, notice, weather, mobile menu 까지 붙어 있었다.

그리고 거의 모든 페이지 첫 화면에 나온다.

헤더가 클라이언트 실행 이후에야 안정되면  
상단 기사 이미지를 아무리 빨리 불러와도 화면이 늦게 완성되어 보인다.

그래서 헤더도 서버에서 만들 수 있는 부분을 분리했다.

```tsx
<HomeHeaderServer edition={edition} previewMode={previewMode} />
```

물론 모바일 메뉴나 클릭 인터랙션처럼 브라우저 상태가 필요한 부분은 Client Component 로 남겼다.

이건 화려한 작업은 아니다.
근데 이런 작업이 점수에 꽤 영향을 준다.

처음 보이는 영역에서 브라우저가 조립해야 할 양이 줄어드니까.

---

## Suspense는 로딩 UI였을까?

예전에는 `Suspense` 를 그냥 로딩 UI 보여주는 도구 정도로 생각했다.

근데 RSC 로 홈을 나누다 보니, 얘는 로딩 UI 보다 경계에 가까웠다.

top 기사, 섹션 기사, 광고, opinion, MyTimes, Top Stories 가 다 같은 속도로 준비되지 않는다.

전부 한 번에 기다리면 빠른 영역도 같이 늦어진다.  
반대로 너무 잘게 쪼개면 화면이 여기저기서 따로 뜨면서 정신없다.

그래서 위쪽, 즉 사용자가 "페이지 떴다"라고 느끼는 영역은 최대한 빨리 안정시키고  
스크롤 이후 영역은 늦어도 되는 쪽으로 나눴다.

fallback 이 예쁘냐보다,
어떤 데이터와 UI 를 같은 경계에 둘지가 더 중요했다.

---

## Promise.allSettled 를 쓴 이유

서버에서 데이터를 가져와도 순서대로 기다리면 빨라지지 않는다.

서버에서 순서대로 API 를 호출하면 그냥 병목이 브라우저에서 서버로 옮겨간다.

그래서 홈 상단에 필요한 데이터는 병렬로 가져왔다.

```tsx
const [topArticlesRes, topStoriesRes] = await Promise.allSettled([
  getTopArticlesServer(mainEdition),
  getTopStoriesServer(),
]);
```

처음엔 `Promise.all` 도 생각했다.

근데 Top Stories 하나 실패했다고 top1 기사까지 죽으면 안 된다.
뉴스 홈에서 가장 먼저 지켜야 하는 건 첫 화면의 대표 기사다.
보조 데이터가 실패해도 그건 살려야 한다.

그래서 `Promise.allSettled` 를 썼다.

이건 성능만의 문제가 아니었다.

느린 API 하나가 전체를 늦추면 성능 문제고  
실패한 API 하나가 전체를 죽이면 운영 문제가 된다.

홈에서는 둘 다 봐야 했다.

---

## 여기까지 하고 나니 다음 문제가 보였다

CSR 에서 RSC/SSR 로 옮기면 브라우저가 할 일은 줄어든다.

근데 서버가 매번 HTML 을 새로 만들어야 한다면?

트래픽 많은 홈과 기사 상세가 매번 origin 까지 간다면?

브라우저는 편해졌는데 서버가 괴로워진다.

이때 다음 질문이 나왔다.

> 서버가 만든 HTML 을 CloudFront 에 태울 수 없을까?

이제부터는 컴포넌트 최적화가 아니라 HTML 캐시 정책 문제다.

그리고 이게 생각보다 훨씬 까다로웠다.

HTML 요청과 RSC 요청을 구분해야 하고 로그인/preview 페이지는 캐시하면 안 되고  
redirect 를 잘못 캐시하면 사고가 나고 Next prefetch 도 origin 부하를 만들 수 있었다.

다음 phase 에서는 드디어 CloudFront 가 등장한다.
