---
title: "이미지 우선순위를 올려도 소용없던 이유는 주소를 늦게 알아서였다"
description: "브라우저는 자바스크립트와 API 응답을 받은 뒤에야 첫 이미지 주소를 알았다. 그 주소를 초기 HTML에 싣도록 바꿨다."
date: 2025-12-26
update: 2026-11-14
tags:
  - front-end
  - performance
  - nextjs
  - rsc
  - series
---

홈의 첫 기사 사진에 `fetchPriority="high"`를 줬다. 그런데 브라우저는 자바스크립트를 실행하고 기사 API 응답을 받을 때까지 그 사진의 주소조차 몰랐다.

홈의 공개 상단 콘텐츠를 RSC/SSR 경로로 옮겼다.
다만 광고, 트래킹, 개인화처럼 브라우저 상태가 필요한 영역은 클라이언트 경계로 남겼다.

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

> 이미지 우선순위는 높였지만 요청 시작 시점이 여전히 늦었다.

다시 홈 구조를 봤다.

그리고 약간 허탈했다.

지금까지 줄이고 미루고 우선순위 주고 했던 작업들이  
알고보면 대부분 **CSR 위에서 어떻게든 버티는 작업**이었다.

![아니 이걸 이제 봤다고](../phase1/img_2.png)

---

## CSR에서 이미지 요청 시작이 늦었던 이유

CSR 구조에서는 브라우저가 할 일이 많다.

1. HTML 받기
2. JS 받기
3. JS 파싱하기
4. React 실행하기
5. API 호출하기
6. 데이터 받아서 화면 만들기
7. 그제야 이미지 요청하기

`fetchPriority="high"`는 이미지 요청의 우선순위를 높인다. 그런데 이 홈에서는 API 응답까지 와야 이미지 주소가 생긴다. 그 전에는 브라우저가 요청할 주소 자체가 없다.

그래서 첫 HTML에 이미지 주소를 넣을 방법부터 찾았다.

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

근데 RSC 로 홈을 나누다 보니, Suspense는 로딩 UI와 함께 렌더링 대기 범위를 구분하는 역할을 했다.

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

근데 Top Stories 조회가 실패해도 top1 기사는 표시할 수 있어야 했다.
뉴스 홈에서 가장 먼저 지켜야 하는 건 첫 화면의 대표 기사다.
보조 데이터가 실패해도 그건 살려야 한다.

그래서 `Promise.allSettled` 를 썼다.

이건 성능만의 문제가 아니었다.

느린 API 하나가 전체를 늦추면 성능 문제고  
하나의 API 실패가 전체 화면의 렌더링 실패로 전파되지 않도록 해야 한다.

홈에서는 둘 다 봐야 했다.

---

## 여기까지 하고 나니 다음 문제가 보였다

RSC/SSR로 옮기고 나니 브라우저에서 화면을 조립하는 일은 줄었다. 그런데 뉴스 홈을 열 때마다 원본 서버에서 같은 HTML을 다시 만든다면? 방문자가 많을수록 같은 렌더링만 반복한다.

여기서 CloudFront를 다시 봤다. 이미 만들어 보낸 HTML을 캐시에 남기면 다음 요청 때도 쓸 수 있다. 문제는 어떤 응답까지 공유해도 되느냐였다.

HTML 요청과 RSC 요청을 구분해야 하고 로그인/preview 페이지는 캐시하면 안 되고  
redirect 를 잘못 캐시하면 사고가 나고 Next prefetch 도 origin 부하를 만들 수 있었다.

다음 편에서는 홈의 응답 헤더와 CloudFront 캐시 설정을 열어 봤다.
