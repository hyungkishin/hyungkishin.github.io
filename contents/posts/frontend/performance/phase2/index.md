---
title: "🏗️ AMP 페이지 개발"
date: 2025-04-17
update: 2024-04-17
tags:
  - front-end
  - performance
---

## 🏗️ AMP 페이지 개발

AMP(Accelerated Mobile Pages)는 빠른 모바일 페이지 로딩을 위해 구글이 주도한 프레임워크로,  
**강력한 성능을 얻는 대신 엄격한 제약**을 동반한다.

Next.js에서도 AMP를 적용하려면 이 제약을 그대로 수용해야 하며,  
**페이지 구조, 스타일링, JS 사용 방식 등에서 별도의 대응이 필요하다.**

Next.js에서 AMP를 적용할 때도 이러한 제한이 그대로 적용된다.  

## ⚠️ AMP에서 제한되는 항목

AMP는 일반적인 React 환경과 달리 다음과 같은 제한이 있다:

☝️. **React Hook 사용 제한**  
- `useEffect`, `useState` 등 hook 기반 로직 사용 불가

✌️. **Sass/SCSS 등 외부 스타일 방식 제한**  
- 모든 스타일은 inline 또는 제한된 CSS 내에서 처리해야 함

🫰. **일반 script 태그 사용 불가**  
- `<script>` 태그 자체를 금지하며, JS는 `amp-script`로 제한적으로만 허용됨

> 전체 AMP 검증은 [AMP Validator](https://validator.ampproject.org/) 를 통해 실시간 확인 가능

## 🗂️ 디렉팅 구조 전략
pages 디렉토리 를 기반으로 amp 디렉토리를 생성하고, 하위에 slug 페이지를 작성한다.

> 🔖 slug 란 ?
> - ex ) /news/2025/04/17/기사제목
> - URL의 일부를 사람이 읽기 좋고 검색엔진 친화적으로 만든 문자열


middleware.ts 에서 /amp 로 시작하는 URL을 감지하여, 해당 페이지를 AMP 페이지로 리다이렉트 하도록 설정.

![img.png](img.png)
```bash
/src
|── components                     
    ├── amp                        👈 amp 페이지 내 공통컴포넌트 ( Header, Body, Footer 등 재사용 컴포넌트들 쭉쭉 넣어주고 ~ )
    |... 원래 있던 친구들 
├── pages
│   ├── amp                        👈 AMP 페이지 전용 디렉토리
│   │   └── [slug].tsx             👈 section 카테고리별 디렉토리
|   |     └── [depth1].tsx         👈 amp depth 1 본문 페이지
|   |         └── [depth2].tsx     👈 amp depth 2 본문 페이지
|   |             └── [depth3].tsx 👈 amp depth 3 본문 페이지
```

이렇게 되면 사실상 **사용자 관점** 에서 보이는 기사 뷰 페이지는 2벌이다.
- 일반 페이지 ( PC / MO ) 
- AMP 페이지 ( depth 별 )

기존 기사 본문 URL 구조는 **slug url** 형식으로 되어있으니 amp 페이지로 유입될 경우 본문에 해당되는 amp 페이지로 redirect 해주면 된다 
pages 만 UI 뼈대를 만든 후 공통화 컴포넌트화 시키면 되겠다.

![기사 본문 상단 구조](img_1.png)

( 그외 푸터 등등 모두 동일 ) 

> AMP는 제약은 많지만, 뉴스 도메인에선 여전히 유의미하다
> 
> React hook이나 script 사용은 어렵지만 기본 콘텐츠 위주 뉴스 페이지엔 큰 무리는 없다
> 
> middleware.ts + slug 기반으로 AMP 라우팅 처리하면 깔끔하게 대응 가능
> 
> AMP 페이지는 별도로 구성하되, 디자인/구조는 최대한 기존과 일치시키는 전략이 효과적이다


##  끝인줄 알았는데 등장하는 style 제약
AMP에서 사용하는 스타일은 용량에 명확한 제한이 있다:

- `<style amp-custom>` 태그에는 **최대 50KB까지만** CSS 작성 가능
- 인라인 스타일 (`style="..."`)도 포함되므로 실제 여유는 더 적을 수 있다
- 애니메이션 전용으로 허용된 `<style amp-keyframes>`는 **최대 500KB까지** 허용되지만,
  이는 `<body>` 하단에만 위치할 수 있고, 오직 키프레임 규칙만 작성 가능하다

👉 실무에서는 **총 CSS + 인라인 스타일 합산이 75KB를 넘지 않도록** 주의해야 한다 - [ 관련 공식문서 ](https://amp.dev/documentation/guides-and-tutorials/learn/spec/amphtml)

