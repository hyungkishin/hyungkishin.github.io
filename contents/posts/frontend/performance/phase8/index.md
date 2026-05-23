---
title: "퍼포먼스 최적화 를 향해 - 6부"
date: 2025-12-28
update: 2025-12-28
tags:
  - front-end
  - performance
  - nextjs
  - image
  - series
---

## 들어가며
5부까지 오면서 홈 화면은 어느 정도 정리됐다.

상단 이미지는 `OptimizedImage` 로 제어할 수 있었고,  
RSC 로 첫 화면 HTML 도 더 빨리 내려줄 수 있었고,  
CloudFront 로 공개 HTML 을 edge 에 태우는 구조도 잡았다.

그런데 기사 상세로 들어가면 이야기가 또 달라졌다.

홈 이미지는 React 컴포넌트다.

```tsx
<OptimizedImage isLCP withSkeleton={false} />
```

이런 식으로 props 를 넘기면 된다.

근데 기사 본문 이미지는 props 로 제어할 수 있는 컴포넌트가 아니었다.

CMS 에디터에서 내려온 HTML 문자열 안에 `<img>` 가 박혀 있었다.

```html
<div class="editor-img-box">
  <img
    src="https://newsimg.example.com/sample.jpg"
    data-resolved-width="1200"
    data-resolved-height="800"
  />
  <div class="caption">...</div>
</div>
```

이걸 보고 처음 든 생각은 이거였다.

> 아. 여긴 컴포넌트 최적화로 안 되겠구나.

![또 시작](../phase1/img_2.png)

---

## CMS HTML 은 그냥 렌더링하면 안 됐다

기사 본문은 에디터에서 만든 HTML 이다.

이미지도 있고, caption 도 있고, iframe 도 있고, float 이미지도 있고, 가끔 이상한 wrapper 도 들어온다.

이걸 그대로 렌더링하면 편하긴 하다.

근데 성능 관점에서는 문제가 많았다.

- 첫 번째 본문 이미지가 LCP 후보일 수 있다.
- width/height 정보가 없으면 CLS 가 난다.
- 두 번째 이후 이미지는 lazy 로 내려야 한다.
- basic, wide, darkroom 템플릿마다 적정 이미지 너비가 다르다.
- 기존 query string 이 붙은 이미지 URL 은 다시 정리해야 한다.
- Instagram iframe 같은 외부 요소도 높이를 잡아줘야 한다.

즉, CMS HTML 은 화면에 넣기 전에 한 번 가공해야 했다.

그래서 기사 본문 처리 파이프라인을 만들었다.

```ts
export function processDefaultContent(props: ProcessContentProps): ProcessContentReturn {
  const { contents, featuredImage, imageSizeData, pageType, templateType } = props;

  const $ = load(contents, { xmlMode: false, decodeEntities: false }, false);

  removeWriterElement($);

  const extractedSize = extractFeaturedImageSize($, featuredImage);
  const finalImageSize = imageSizeData || extractedSize;

  const images = extractImages($);

  processAllContainers($, pageType, templateType);
  processInstagramIframes($);
  processAllImages($, pageType, templateType);

  const featuredImageProps = buildFeaturedImageProps(
    featuredImage,
    finalImageSize,
    pageType,
    templateType
  );

  return {
    processedContents: $.html(),
    images,
    featuredImageProps,
    featuredImageSize: extractedSize,
  };
}
```

여기서 중요한 건 HTML 문자열을 그냥 치환한 게 아니라는 점이다.

Cheerio 로 DOM 처럼 읽고, 필요한 것만 바꿨다.

---

## 첫 번째 이미지는 다르게 봤다

기사 상세에서 첫 번째 본문 이미지는 LCP 후보가 될 수 있다.

그래서 모든 이미지를 같은 규칙으로 처리하면 안 됐다.

첫 번째 이미지는 `fetchpriority="high"` 와 `loading="eager"` 를 주고,  
두 번째 이후 이미지는 `loading="lazy"` 로 내려야 했다.

테스트도 이 기준으로 잡았다.

```ts
it("첫 번째 이미지에 fetchpriority=high를 설정해야 한다", () => {
  const result = processDefaultContent({
    contents: `<img src="https://example.com/image.jpg" />`,
    pageType: ARTICLE_DETAIL_PAGE_TYPE.DEFAULT,
  });

  expect(result.processedContents).toContain('fetchpriority="high"');
  expect(result.processedContents).toContain('loading="eager"');
});

it("두 번째 이후 이미지는 lazy loading을 설정해야 한다", () => {
  const result = processDefaultContent({
    contents: `
      <img src="https://example.com/image1.jpg" />
      <img src="https://example.com/image2.jpg" />
    `,
    pageType: ARTICLE_DETAIL_PAGE_TYPE.DEFAULT,
  });

  expect(result.processedContents).toContain('loading="lazy"');
});
```

이게 없으면 누군가 나중에 본문 처리 로직을 건드리다가  
첫 번째 이미지까지 lazy 로 밀어버릴 수 있다.

홈에서 겪었던 문제를 기사 상세에서 또 반복하고 싶지 않았다.

---

## 템플릿마다 이미지 크기가 달랐다

기사 상세는 레이아웃이 하나가 아니었다.

기본 기사, 와이드 기사, 다크룸 기사에서 이미지가 차지하는 폭이 다르다.
그러면 같은 원본 이미지를 같은 width 로 요청하면 안 된다.

그래서 이미지 정책을 따로 뺐다.

```ts
export const IMAGE_POLICY = {
  BASIC: {
    pc: 728,
    mobile: 728,
    mobileQuery: 673,
  },
  WIDE: {
    pc: 1288,
    mobile: 728,
    mobileQuery: 673,
  },
  DARKROOM: {
    pc: 1600,
    mobile: 728,
    mobileQuery: 673,
  },
} as const;
```

처음에는 단순히 큰 이미지를 주면 화질이 좋아질 거라고 생각하기 쉽다.

근데 그러면 모바일에서 필요 이상으로 큰 이미지를 받을 수 있다.
반대로 너무 작은 이미지를 주면 PC 에서 화질이 깨진다.

그래서 템플릿 타입과 페이지 타입을 보고 정책을 고르게 했다.

```ts
export function resolvePolicy(pageType?: ArticleDetailPageType, templateType?: ArticleViewTemplateType): Policy {
  if (pageType && PAGE_TYPE_MAP[pageType]) {
    return IMAGE_POLICY[PAGE_TYPE_MAP[pageType]!];
  }

  if (templateType && TEMPLATE_TYPE_MAP[templateType]) {
    return IMAGE_POLICY[TEMPLATE_TYPE_MAP[templateType]!];
  }

  return IMAGE_POLICY.BASIC;
}
```

여기서도 예외가 있었다.

원본 이미지가 정책보다 작은데 억지로 1288, 1600 을 요청하면 의미가 없다.
그냥 원본 크기를 써야 한다.

```ts
export function calculateImageConfig(originalWidth: number | null, policy: Policy): ImageConfig {
  const needsMobileSource = policy.pc !== policy.mobile;

  if (!originalWidth) {
    return {
      pcWidth: policy.pc,
      mobileWidth: policy.mobile,
      isSmall: false,
      needsMobileSource,
    };
  }

  if (originalWidth <= policy.mobile) {
    return {
      pcWidth: originalWidth,
      mobileWidth: originalWidth,
      isSmall: true,
      needsMobileSource: false,
    };
  }

  if (originalWidth <= policy.pc) {
    return {
      pcWidth: originalWidth,
      mobileWidth: policy.mobile,
      isSmall: true,
      needsMobileSource,
    };
  }

  return {
    pcWidth: policy.pc,
    mobileWidth: policy.mobile,
    isSmall: false,
    needsMobileSource,
  };
}
```

이미지 최적화라고 해서 무조건 줄이거나 무조건 키우는 게 아니었다.

원본 크기, 기사 템플릿, 모바일 분기를 같이 봐야 했다.

---

## picture 로 바꾸고, aspect-ratio 를 넣었다

본문 이미지에는 `data-resolved-width`, `data-resolved-height` 가 들어오는 경우가 있었다.

이 값이 있으면 그냥 버리면 안 된다.
CLS 를 막는 데 쓸 수 있다.

그래서 가공 과정에서 `aspect-ratio` 를 넣었다.

```ts
it("data-resolved-width와 height가 있으면 aspect-ratio를 설정해야 한다", () => {
  const result = processDefaultContent({
    contents: `<img src="https://example.com/image.jpg" data-resolved-width="800" data-resolved-height="600" />`,
    pageType: ARTICLE_DETAIL_PAGE_TYPE.DEFAULT,
  });

  expect(result.processedContents).toContain("aspect-ratio: 800 / 600");
});
```

그리고 wide, darkroom 같은 템플릿은 모바일 source 를 따로 둬야 했다.

```ts
it("WIDE 템플릿은 673px 이하에서 728px source를 가져야 한다", () => {
  const result = processDefaultContent({
    contents: largeImageHTML,
    pageType: ARTICLE_DETAIL_PAGE_TYPE.DEFAULT,
    templateType: ARTICLE_VIEW_TEMPLATE_TYPE.WIDE,
  });

  expect(result.processedContents).toContain('media="(max-width: 673px)"');
  expect(result.processedContents).toContain("srcset=");
  expect(result.processedContents).toContain("?w=728");
});
```

이렇게 해서 본문 이미지를 그냥 `<img>` 로 두지 않고,
필요한 경우 `<picture>` 구조로 감쌌다.

처음에는 코드가 조금 귀찮아졌다.

근데 이 귀찮음은 필요했다.

CMS 에디터에서 내려오는 HTML 은 매번 사람이 손으로 맞춰줄 수 없다.
렌더링 전에 한 번 정리해두지 않으면, 기사마다 다른 성능 문제가 계속 튀어나온다.

---

## JSDOM 에서 Cheerio 로 바꾼 이유

처음부터 Cheerio 로 간 건 아니었다.

본문 HTML 을 다루려다 보면 JSDOM 을 떠올리기 쉽다.
브라우저 DOM 처럼 다룰 수 있으니까 편하다.

근데 서버 렌더링 경로에서 매번 기사 본문을 처리해야 한다면 얘기가 다르다.

JSDOM 은 기능이 많은 만큼 무겁다.
그리고 standalone 빌드나 서버 환경에서 불필요한 의존성이 따라붙을 수 있었다.

그래서 결국 Cheerio, 그것도 `cheerio/slim` 쪽으로 옮겼다.

```ts
const $ = load(contents, { xmlMode: false, decodeEntities: false }, false);
```

여기서 `xmlMode: false` 도 일부러 넣었다.

한 번은 iframe 이 self-closing 처럼 처리되면서 HTML 쪽에서 이상하게 나오는 문제가 있었다.
HTML 의 iframe 은 void element 가 아니라서 `<iframe />` 처럼 닫히면 안 된다.

이런 건 성능 최적화 글에 안 어울릴 정도로 사소해 보이는데,
실제 본문 렌더링에서는 바로 화면 문제로 이어진다.

그래서 파서는 가볍게 가져가되, HTML 모드로 명시했다.

---

## 테스트를 꽤 촘촘히 둔 이유

이 작업은 눈으로만 확인하면 위험했다.

기사 본문 HTML 은 케이스가 너무 많다.

- 이미지가 하나만 있는 기사
- 이미지가 여러 개인 기사
- 원본 이미지가 정책보다 작은 기사
- wide 템플릿
- darkroom 템플릿
- 기존 query string 이 붙은 이미지
- width/height 정보가 없는 이미지
- iframe 이 섞인 기사

그래서 테스트를 많이 뒀다.

`?w=` 가 붙는지, 기존 query string 이 제거되는지,  
BASIC 은 728px 로 가는지, WIDE 는 1288px 로 가는지,  
DARKROOM 은 원본이 더 작으면 원본 크기를 쓰는지 확인했다.

```ts
it("기존 쿼리스트링은 제거되어야 한다", () => {
  const result = processDefaultContent({
    contents: `<img src="https://example.com/image.jpg?existing=param" />`,
    pageType: ARTICLE_DETAIL_PAGE_TYPE.DEFAULT,
  });

  expect(result.processedContents).not.toContain("existing=param");
});
```

이 테스트들이 없으면 나중에 누가 리팩터링하다가  
LCP, CLS, 모바일 이미지 정책을 한 번에 깨뜨릴 수 있다.

퍼포먼스 작업은 한 번 좋아졌다고 끝나는 게 아니다.
좋아진 상태를 유지할 장치가 있어야 한다.

---

## 마무리

홈에서는 이미지 컴포넌트를 고치면 됐다.

하지만 기사 상세에서는 CMS HTML 문자열을 렌더링 전에 바꿔야 했다.

첫 번째 이미지는 LCP 후보로 보고,  
두 번째 이후 이미지는 lazy 로 내리고,  
width/height 가 있으면 `aspect-ratio` 로 CLS 를 막고,  
템플릿마다 `BASIC`, `WIDE`, `DARKROOM` 이미지 정책을 다르게 적용했다.

그리고 JSDOM 대신 Cheerio 로 바꿔서 서버 처리 비용도 줄였다.

이 단계까지 오니 성능 최적화가 진짜 귀찮은 일이 됐다.

처음에는 번들 줄이고 이미지 lazy 하면 될 줄 알았다.
근데 실제 서비스에서는 홈, 기사 상세, CMS, 광고, CloudFront, RSC, Google 검색 요구사항이 다 엮인다.

하나만 고치면 끝나는 게 아니라,
각 영역에서 "처음 보여야 하는 것", "늦어도 되는 것", "캐시해도 되는 것", "절대 캐시하면 안 되는 것"을 계속 나눠야 했다.

그래도 여기까지 오면서 확실해진 건 있다.

프론트엔드 성능 최적화는 Lighthouse 점수를 맞추는 일이 아니라,
사용자가 실제로 보는 화면이 언제, 어떤 순서로, 얼마나 안정적으로 완성되는지 계속 쪼개서 보는 일이다.
