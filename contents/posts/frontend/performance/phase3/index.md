---
title: "퍼포먼스 최적화 를 향해 - 1부"
date: 2025-05-03
update: 2024-05-03
tags:
  - front-end
  - performance
  - series
---

## 들어가며
웹페이지가 빠르지 않으면, 유저는 기다려주지 않는다.  
특히 뉴스/언론 사이트처럼 콘텐츠 소비가 빠르게 이루어지는 환경에서는 더더욱 그렇다.  

네트워크 텝을 열어보니 JS 가 프로젝트 사이즈에 비해 많은 용량을 차지하고 있었다.

그래서 가장 먼저 손을 댄 건 JS 번들 다이어트.   
JS 번들의 크기가 클 수록 Core Web Vital 의 TBT 성능에도 영향을 주는데, 한마디로 main Thread 가 일을 너무 많이 하는 바람에 UI 를 그리기 힘들어 할 수 있다.  

그래서 사용되는 JS Library 들이 TreeShaking 잘 되고 있는지, 총 bundle 의 크기가 어떻게 되는지 파악 이 필요했다.

개선 목표
- JS bundle 점검 및 개선
  - TreeShaking
  - 불필요 library 다이어트

---

## JS 번들을 정검 해보자

```bash

$ yarn add -D @next/bundle-analyzer
```

그런다음 next.config.js 에서 analyzer 를 활성화.
```js


import createBundleAnalyzer from "@next/bundle-analyzer";

// ...

const withBundleAnalyzer = createBundleAnalyzer({
    enabled: process.env.ANALYZE === "true",
    openAnalyzer: false,
});

// ... 

export default withBundleAnalyzer(nextConfig);
```

package.json script 부분역시, 명령어 활성화 필요. 

```js
"script": {
 ... 
  "analyze": "ANALYZE=true next build", 
  "analyze-explorer": "source-map-explorer '.next/static/chunks/*.js'",
 ...
}
 
```

먼저 어떤 라이브러리들이 번들에 포함되어 있는지 확인하기 위해 bundle-analyzer 를 설치해 주고 분석해 보니, lodash-es 와 moment-timezone 이 포함되어 있었다.
700KB 와 500KB 먹음직 스럽게 제거할 수 있는 크기였다.

![프로젝트 내 js 번들 결과](img_1.png)

 
## lodash 최적화

프로젝트 내에서 lodash-es가 설치되어 있었고, 실제 사용하는 함수는 debounce 하나뿐이었다.  
아마도 Tree Shaking을 노리고 lodash-es를 선택했던 것 같다.   

> tree shaking 이란 ?
> 실상 쓰는 코드만 번들에 포함시키고, 안 쓰는 코드를 제거하는 기능인 Tree Shaking

하지만 애석하게도, lodash-es는 ESM 구조이다.  
Tree Shaking이 가능하다고 알려져 있지만, 내부적으로 많은 공통 유틸 함수들이 함께 import되기 때문에,     
debounce 하나만 불러와도 수많은 내부 의존성 코드가 함께 번들된다.  

즉, 다음과 같은 코드 는 실제 번들 사이즈를 눈에 띄게 줄이지 못한다.
```js
import { debounce } from "lodash-es";
```

함수 단위 패키지로 대체 가 가능한 lodash 로 변경하기로 결정하였다.  
개별 모듈(함수)로 쪼개서 npm 패키지를 배포하고, 무었보다 monorepo로 관리하기 때문에 효과적으로 다이어트가 가능하다고 판단했다.  

lodash.debounce를 import하려면 lodash.debounce 패키지를 따로 설치해야 하고,  
타입스크립트 환경에서는 타입 정의 패키지(@types/lodash.debounce)도 필요하다.

```bash

$ yarn add lodash.debounce

$ yarn add -D @types/lodash.debounce
````

최소한의 코드만 번들에 포함되고, 사용방법은 다음과 같다.

```js
import debounce from "lodash.debounce";
```

## moment-timezone ⏰ 최적화 

앞서 말한 것 처럼 lodash는 함수별로 npm 패키지가 분리되어 있거나, ES 모듈 구조라서 개별 함수만 import할 수 있지만,   
moment/moment-timezone 는 하나의 큰 번들(모듈)로 배포되고 내부적으로 모든 기능이 단일 객체(moment)에 결합되어 있다.

죽, moment-timezone은 하나의 큰 번들이고, 부분 import 안 된다.. 구조 상 ESM도 아니고, 트리셰이킹도 불가능.

```js
import { tz } from "moment-timezone"; <- ❌
import moment from "moment/timezone"; <- ❌
```

구버전 브라우저(특히  Edge, 구형 크롬/파이어폭스 등)까지 완벽히 커버하면서, 타임존 목록 및 오프셋, 타임존 변환 등 기능을 제공하려면  
moment-timezone을 계속 사용하는 것이 가장 안전한 선택이라.. 이대로 두기로 하였다. ( 언론 뉴스 페이지다 보니, 해외 구형 디바이스 까지 커버 해야 한다. )  

moment-timezone은 오래된 브라우저까지 호환성을 고려해 설계되어 있다 (IE9 이상, 구형 모바일 브라우저 등 포함)
최신 방식인 Intl.supportedValuesOf('timeZone')는 최신 브라우저(크롬 104+, 사파리 16.4+ 등)에서만 지원되고  
구버전 브라우저에서는 동작하지 않는다.

굳이 하려면, 데이터 범위를 줄여서 번들 사이즈를 최적화 하는게 유일한 방법이다.   

```bash

# slim 빌드 사용
$ npx moment-timezone-data-builder --zones="Asia/Seoul" --start-year=1990 --end-year=2026 > data/packed/latest.json
```

## 영혼까지 끌어모아 다이어트
추가적으로 next.config.js 내부 설정중 optimizePackageImports 를 사용하면 소위말해 조금 더 영끌 다이어트를 할 수 있다.  

date-fns, moment, swiper 같은 덩치 큰 라이브러리에서 "쓰는 것만 가져오도록" 자동 변환해줘서 번들 크기를 줄여준다. ( 아 물론 lodash-es 는 효과가 미미...)  
```js

experimental: {
  optimizePackageImports: ["moment-timezone", "date-fns", "react-share", "swiper"],
   ...
},
```

## 결과 ✨  
3.11 MB -> 2.38 MB 로 줄어들었다.  

![before](img_2.png)  ➡️
![after](img_3.png)

드라마틱 한 다이어트는 아니지만, 약 23.5% 감소로 인해 실제 웹 성능에선 체감 가능한 수준 으로 보인다.  


느린 네트워크, CPU 환경에서 0.7MB 감소는 LCP, TTI에 직격 영향을 줄 수 있고,  
JS는 CPU cost가 높아서 압축되어도 실행 비용이 크다.  

JS 줄이기만 해도 LCP, FID, CLS 등 모든 항목에 긍정적 영향 을 준다.  
게다가 3G 환경에선 700KB는 수 초 차이로 이어질 수 있다.  

( 현재 도메인 유저에는 해외 사용자가 많고, 구형 디바이스 유저도 많다. )

운영 중에는 예상치 못한 상황이 자주 발생하고,  
신규 페이지나 기능을 급하게 작업할 때는 라이브러리 도입을 신중히 검토하기 어려운 경우도 많다.

하지만 작은 습관 하나 *즉, 도입하는 라이브러리의 실제 용도와 비용을 점검하는 습관* 만으로도,
나중의 **리팩토링 부담과 전체 성능 저하** 를 막는 데 큰 도움이 된다.

업무가 바쁘더라도 관성적으로 아래와 같은 체크리스트를 갖고 움직이자
- 🤔 이 라이브러리는 정말 필요한가?
- 🤔 동일 기능을 기존 유틸로 구현할 수는 없을까?
- 🤔 ESM 구조이거나 트리셰이킹이 가능한가?
- 🤔 스타일(CSS)이나 다른 의존성을 암묵적으로 같이 끌고 오지 않는가?

> 조금만 습관을 들이면, 성능을 깎아먹는 '무심한 도입'을 줄일 수 있다.

## 결론
JS 번들 최적화는 단순히 용량을 줄이는 일이 아니다.
사용자 경험, Core Web Vitals, SEO 성능에까지 직결되는 제품 품질의 핵심이다.

개발 속도와 마감 기한에 쫓기다 보면, 무심코 라이브러리를 도입하고 의존성을 늘리기 쉽다.
하지만 작은 습관 하나—"진짜 필요한가?" 라는 질문만으로도 많은 비용을 아낄 수 있다.

- 정기적으로 번들 사이즈를 분석하고
- 라이브러리 도입 전 체크리스트를 습관화하며
- 팀 차원에서 도입 가이드라인을 마련해두자.

