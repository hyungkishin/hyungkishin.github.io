---
title: "본문 layer는 왜 마지막 자리였을까요"
date: 2025-12-28
update: 2025-12-28
tags:
  - front-end
  - performance
  - nextjs
  - image
  - cms
  - cheerio
  - series
---

> **TL;DR**
>
> 5부에서 CloudFront가 안 먹혔던 이유를 잡고, 페이지를 dynamic/ISR/static 세 갈래로 갈랐어요.  
> 그 다음에야 *본문 layer*를 손볼 수 있었습니다.
>
> 본문은 React 컴포넌트가 아니었어요.  
> CMS 에디터가 만든 HTML 문자열이었습니다.  
> `OptimizedImage` 같은 props로 의도를 전달할 자리가 없었어요.
>
> 그래서 SSR 단계에서 CMS HTML을 Cheerio로 한 번 읽었습니다.  
> 첫 번째 본문 이미지는 LCP 후보로 올리고, 두 번째 이후는 lazy로 내리고, `data-resolved-width/height` 는 `aspect-ratio` 로 바꿨어요.
>
> 템플릿별로 `BASIC`, `WIDE`, `DARKROOM` 이미지 정책도 갈랐습니다.  
> JSDOM은 무거워서 Cheerio/slim으로 옮겼고, iframe 깨짐 때문에 `xmlMode: false`를 명시했어요.
>
> 본문 layer는 *마지막 자리* 였습니다.  
> 그 위 layer들이 다 잡힌 다음 마지막으로 손봐야 효과가 보였어요.

---

## 왜 본문이 마지막 자리였을까요?

성능 최적화는 *어디부터 손대느냐* 가 결정의 절반입니다.  
시리즈를 거치면서 그 순서가 점점 명확해졌어요.

1. *비즈니스*, 뉴스 도메인에서 성능 = 검색 노출 = 광고 수익 (1부)
2. *AMP*, 모바일 검색 진입 (2부)
3. *진단*, 뭘 측정하고 뭘 풀지 갈래 (3부)
4. *클라이언트 layer*, CLS / FCP / TBT / LCP 디테일 (4~5부)
5. *렌더링 경계*, 서버 컴포넌트로 클라이언트 JS 비용 옮기기 (6부 = 현 phase6)
6. *서버 / CDN layer*, CloudFront가 안 먹혔던 이유 (7부 = 현 phase7)
7. **본문 layer**, *지금 이 자리*

본문 이미지를 *먼저* 손봤다면 그 효과가 안 보였을 거예요.  
CF hit률이 5%면 본문 이미지 우선순위를 아무리 올려도 *origin TTFB* 가 LCP를 깎아먹습니다.  
서버/CDN 잡힌 다음에야 클라이언트 layer 효과가 진짜로 측정됐고, 본문 layer는 그 위에 마지막 칠처럼 얹혔어요.

---

## 본문 이미지가 컴포넌트가 아닌 이유는 뭘까요?

홈 이미지는 React 컴포넌트였습니다.

```tsx
<OptimizedImage isLCP withSkeleton={false} />
```

props 한 줄로 의도를 전달할 수 있었어요.  
LCP 후보면 `isLCP`, skeleton 깜빡임이 거슬리면 `withSkeleton={false}`.

기사 본문은 달랐습니다.  
운영팀이 CMS 에디터에서 작성한 *HTML 문자열* 이 그대로 내려와요.

```html
<p>본문 첫 문단입니다.</p>
<img src="https://cdn.koreatimes.co.kr/.../article1.jpg" alt="..." />
<p>두 번째 문단.</p>
<img src="https://cdn.koreatimes.co.kr/.../article2.jpg" alt="..." />
<iframe src="https://www.youtube.com/embed/..." />
```

이 HTML에는 *props가 없어요*. `<img>` 가 그대로 들어가 있고, 어떤 이미지가 LCP 후보인지, 어떤 이미지를 lazy로 내려야 하는지 표현할 자리가 없습니다.

CMS 에디터 자체를 바꾸자는 옵션도 있었지만, 운영팀 워크플로우가 거기에 묶여 있었어요.  
*렌더링 시점에 HTML을 한 번 읽고 손보는* 쪽이 빠른 답이었습니다.

---

## CMS HTML을 그대로 렌더링하면 뭐가 터질까요?

`dangerouslySetInnerHTML` 로 그대로 박으면 다음이 다 깨졌어요.

| 자리 | 무엇이 깨졌나 |
|---|---|
| 첫 번째 본문 이미지 | LCP 후보인데 평범한 `<img>` 로 잡혀서 우선순위 낮음 |
| 두 번째 이후 이미지 | 모두 즉시 로드. lazy 처리 안 됨. |
| 모든 이미지 | `width`/`height` 없으면 CLS 발생 |
| iframe 임베드 | `width`/`height` 없으면 fold 아래 영역까지 CLS 영향 |
| 광고 코드 | 본문 가운데에 광고가 끼어들어 CLS |

그래서 SSR 단계에서 CMS HTML을 한 번 *읽어서 손본* 다음 렌더링하기로 했습니다.

처음엔 JSDOM으로 갔어요.  
브라우저랑 가장 비슷한 동작이라서 안전할 거라고 봤습니다.  
근데 SSR 매 요청마다 JSDOM 인스턴스를 만들면 *서버 메모리 + 시간* 부담이 컸어요.

> 서버 SSR에서는 *JSDOM = 정답* 이 아니었습니다.  
> 브라우저 호환성이 아니라 *HTML 파싱 + 변형* 만 필요한 자리였어요.

Cheerio (slim) 로 옮겼습니다.

```ts
import { load } from "cheerio/slim"

const $ = load(html, { xmlMode: false })
$("img").each((idx, el) => {
  const $img = $(el)
  if (idx === 0) {
    $img.attr("loading", "eager")
    $img.attr("fetchpriority", "high")
  } else {
    $img.attr("loading", "lazy")
    $img.attr("fetchpriority", "low")
  }
})
return $.html()
```

`xmlMode: false` 가 한 줄 같지만 함정 자리였어요. 다음 섹션에서 짚습니다.

---

## 첫 번째 본문 이미지는 왜 따로 봐야 했을까요?

CMS 본문 렌더링은 *기사 디테일 페이지의 LCP 후보 자리*입니다.

뉴스 사용자는 *기사 디테일 → 본문 → 첫 이미지* 순으로 시선이 이동해요.  
그 첫 이미지가 LCP를 결정합니다.

근데 CMS HTML에서 첫 이미지는 *그냥 평범한 `<img>`* 였어요.  
브라우저가 이걸 LCP 후보로 *늦게* 인지합니다.

세 줄로 처리했습니다.

```ts
$("img").first()
  .attr("loading", "eager")
  .attr("fetchpriority", "high")
  .attr("decoding", "sync")
```

- `loading="eager"`, lazy 안 함. 첫 이미지는 항상 받음.
- `fetchpriority="high"`, 같은 우선순위 이미지 중 *먼저* 받음.
- `decoding="sync"`, 받은 다음 *즉시 디코딩*. 다른 작업으로 미루지 않음.

> **포기한 것**: 광고/iframe이 첫 번째 본문 요소면 첫 `<img>` 가 *fold 아래* 일 수도 있어요. 그래도 eager로 받습니다. 본문 트래픽 패턴에서 그 케이스는 5% 미만.

---

## BASIC, WIDE, DARKROOM 이미지는 같은 크기로 받아도 될까요?

본문 이미지는 *템플릿* 마다 렌더링 폭이 달랐습니다.

| 템플릿 | 본문 폭 | 적정 이미지 폭 |
|---|---|---|
| BASIC | 760px | 760 / 1440 (2x) |
| WIDE | 100vw (최대 1440) | 1440 / 2560 (2x) |
| DARKROOM (포토 갤러리) | 100vw (최대 2560) | 2560 / 3840 (2x) |

같은 CDN 이미지 URL에 `?w=` 파라미터로 폭을 지정할 수 있었어요.  
템플릿별로 다른 `srcset` + `sizes` 를 박았습니다.

```ts
const buildSrcSet = (cdnUrl: string, template: Template) => {
  const widths = TEMPLATE_WIDTHS[template]  // BASIC: [760, 1440], WIDE: [1440, 2560], ...
  return widths.map((w) => `${cdnUrl}?w=${w} ${w}w`).join(", ")
}
```

DARKROOM에 BASIC 폭 이미지를 박으면 모바일 사용자는 *4배 큰 이미지*를 받습니다.  
모바일 트래픽이 70%인 환경에서 큰 손해.

> **포기한 것**: 템플릿이 추가될 때마다 `TEMPLATE_WIDTHS` 에 항목 추가하는 운영 부담. CMS에서 자동 추론은 못 했어요.

---

## width와 height는 왜 같이 박아야 했을까요?

CLS 잡으려면 *이미지 받기 전에* 차지할 공간이 정해져 있어야 합니다.  
브라우저가 이미지 metadata 받기 전엔 *그 자리가 빈 곳* 으로 시작해요. 이미지 도착 후 *밀어내기* 가 발생하면 CLS 폭발.

`<img>` 의 `width`/`height` 속성이 있으면 브라우저가 *aspect ratio* 를 계산해서 미리 자리를 잡아둡니다.

CMS HTML에는 이미지 메타가 `data-resolved-width="800" data-resolved-height="500"` 같이 *data attribute로만* 들어가 있었어요.  
브라우저는 이걸 안 봅니다.

Cheerio 단계에서 변환했습니다.

```ts
$("img").each((_, el) => {
  const $img = $(el)
  const w = $img.attr("data-resolved-width")
  const h = $img.attr("data-resolved-height")
  if (w && h) {
    $img.attr("width", w)
    $img.attr("height", h)
    $img.css("aspect-ratio", `${w} / ${h}`)
  }
})
```

`aspect-ratio` 까지 같이 박으면 브라우저가 *반응형* 환경에서도 정확히 그 비율로 자리를 잡습니다.  
이미지가 실제로 도착하기 *전에* CSS가 비율로 박스를 그려둬요. CLS 0.

> **포기한 것**: data attribute가 없는 옛 기사들. CMS 마이그레이션 전 글들은 비율 모름. 그 자리는 *기본 비율 16:9 가정*. 가끔 어긋나서 작은 CLS가 발생하지만 1%대.

---

## JSDOM이 편한데, 왜 Cheerio로 바꿨을까요?

JSDOM은 *브라우저 환경 전체* 를 흉내냅니다.  
DOM API 거의 다 지원하고, querySelector 도 정확.

근데 SSR 매 요청마다 JSDOM 인스턴스를 만드는 게 *서버 비용*이었어요.

|  | JSDOM | Cheerio (slim) |
|---|---|---|
| 인스턴스 생성 시간 | 50~150ms | 1~5ms |
| 메모리 | ~50MB | ~2MB |
| DOM API | 거의 다 | querySelector + 변형만 |
| 브라우저 호환성 | 매우 높음 | 낮음 (그래도 본문 HTML엔 충분) |

본문 HTML 파싱은 *querySelector + 속성 변형* 만 필요했어요.  
JSDOM의 100% 브라우저 호환성은 *과한 비용* 이었습니다.

```ts
import { load } from "cheerio/slim"
```

`/slim` 은 옛 jQuery slim 같이 *DOM 조작에 필요한 핵심만* 포함. translation/i18n/parser 보조 모듈 제외.

SSR 매 요청 당 본문 처리 시간이 *100ms → 3ms* 로 떨어졌어요. origin response time 자체가 짧아짐.

---

## xmlMode: false 가 왜 그렇게 중요했을까요?

Cheerio는 default가 `xmlMode: false` 인데, 안전망 차원에서 *명시*했어요.

문제는 iframe.

```html
<iframe src="https://www.youtube.com/embed/..."></iframe>
```

`xmlMode: true` 인 경우 Cheerio가 이 iframe을 *self-closing* 으로 잘못 해석할 수 있어요.

```html
<!-- 잘못된 출력 -->
<iframe src="..." />
```

`<iframe />` 은 HTML spec 에서 *self-close 안 됨*. 브라우저가 이걸 보면 *그 다음 본문 전체를 iframe 안쪽으로* 잡아버립니다. 본문이 통째로 사라져요.

```ts
const $ = load(html, { xmlMode: false })
```

이 한 줄을 명시해서 *HTML mode 로 강제*. iframe이 정상적으로 닫히고, 그 다음 본문이 안 깨집니다.

> **포기한 것**: 없음. 명시만 하면 끝. 단지 *이게 함정인 줄을 모르고* 한 번 운영에서 본문 깨짐 사고가 있었습니다.

---

## 테스트를 왜 이렇게 많이 깔았을까요?

CMS HTML은 *운영팀이 만든다*는 사실이 가장 큰 변수였어요.

- 운영자가 새 템플릿을 만들면 *모르는 markup*이 본문에 들어옴
- 외부 임베드 (트위터, 인스타그램, 유튜브)가 추가되면 *예상 못 한 self-close 자리*가 늘어남
- CMS 마이그레이션 진행 중이라 *옛 기사와 새 기사*가 다른 markup

테스트가 없으면 *운영팀 한 명의 새 markup* 이 *전체 본문 렌더링 사고*로 번질 수 있었습니다.

```ts
// __tests__/articleHtml.test.ts
describe("article body transform", () => {
  it("첫 이미지는 eager + fetchpriority high", () => {
    const out = transform(`<p>x</p><img src="a"/><img src="b"/>`)
    expect(out).toContain('loading="eager"')
    expect(out).toContain('fetchpriority="high"')
  })
  it("iframe이 self-close로 깨지지 않는다", () => {
    const out = transform(`<iframe src="x"></iframe><p>after</p>`)
    expect(out).toContain("<p>after</p>")
  })
  it("data-resolved-width 가 width/height/aspect-ratio 로 변환된다", () => {
    const out = transform(`<img data-resolved-width="800" data-resolved-height="500"/>`)
    expect(out).toMatch(/width="800"/)
    expect(out).toMatch(/aspect-ratio:\s*800\s*\/\s*500/)
  })
})
```

테스트 10개 안팎인데, 운영 사고 *3건* 을 막았어요.

> **포기한 것**: 새 외부 임베드가 들어오면 *그 변형* 에 대한 새 테스트가 추가돼야 합니다. 운영 변경 따라가는 비용.

---

## 결국 무엇을 갈랐고 무엇을 얻었을까요?

| 결정 | 얻은 것 | 포기한 것 |
|---|---|---|
| SSR 단계에서 CMS HTML 변형 | 본문 LCP/CLS 컨트롤 | SSR 시간에 본문 처리 비용 (Cheerio로 3ms 수준) |
| 첫 이미지 eager + fetchpriority + decoding sync | 기사 디테일 LCP 안정화 | 광고/iframe이 첫 자리일 때 fold 밖 이미지를 받음 |
| 템플릿별 srcset / sizes (BASIC / WIDE / DARKROOM) | 모바일 트래픽에서 4x 큰 이미지 안 받음 | 템플릿 추가될 때마다 운영 등록 |
| data attribute → width/height/aspect-ratio | CLS 0 수준 | 옛 기사 (data 없음) 는 16:9 가정 |
| JSDOM → Cheerio/slim | 본문 처리 100ms → 3ms | 일부 브라우저 호환성 잃음 (본문 HTML 범위 안에선 영향 없음) |
| `xmlMode: false` 명시 | iframe self-close 사고 안 남 | 명시만 하면 끝 |
| 테스트 10개 안팎 | 운영팀 새 markup 들어와도 사고 안 남 | 새 임베드 들어올 때 테스트 추가 비용 |

---

## 무엇을 아직 못 정했을까?

- **CMS 에디터에서 LCP 후보를 명시할 수 있게**, 지금은 *첫 이미지 = LCP* 라고 가정. 운영자가 *대표 이미지* 를 별도 지정하면 더 정확함. CMS 변경 작업이라 미뤘어요.
- **이미지 placeholder (LQIP)**, 본문 첫 이미지에 base64 blur placeholder를 박으면 LCP 인식이 더 빨라질 가능성. CMS에서 placeholder 생성하는 파이프라인이 필요해서 보류.
- **외부 임베드 lazy frame**, 트위터/인스타 임베드는 *각자 자기 JS*를 로드. 본문 첫 진입 시 차단 가능. lazy iframe 또는 IntersectionObserver로 풀 수 있는데 운영 사고 우려로 미뤘습니다.
- **AMP 본문에서도 같은 파이프라인**, 지금 본문 변형은 일반 페이지에만. AMP는 별도 markup 룰이 있어서 분기 필요.

---

## 어디서 본문이 *마지막 자리* 라는 걸 알았을까요?

처음엔 본문 이미지를 *제일 먼저* 손봤어요.  
LCP가 빨개서 본문 첫 이미지에 `fetchpriority="high"` 박았고, lazy 처리도 했습니다.

근데 Lighthouse 숫자가 거의 안 움직였어요.

원인은 *그 위 layer* 였습니다.  
- CSR이 데이터 받고 *조립한 뒤* 에야 이미지 URL이 생겼고
- CF hit률 5%라 origin TTFB가 800ms+ 였고
- JS 번들이 무거워 main thread가 막혔어요

본문 이미지를 *완벽하게* 손봐도, 그 이미지가 *어떤 layer 안*에 있느냐가 더 큰 결정이었어요.

서버/CDN/렌더링 layer 다 잡힌 다음 본문을 손봤더니 그제야 숫자가 움직였습니다.  
순서가 *뒤집혔던 자리*. 그게 phase 시리즈 전체에서 가장 큰 교훈이었어요.

> 성능 최적화는 *어디서 시작하느냐* 가 *무엇을 고치느냐* 보다 큰 결정.
