---
title: "FSD 경계를 개수로 정할 때마다 설계가 뒤집혔다"
date: 2026-07-31
update: 2026-08-01
tags:
  - front-end
  - e-commerce
  - FSD
  - 아키텍처
  - error-handling
---

**TL;DR**

FSD 전환에서 레이어 수나 파일 수를 먼저 정하지 않았다. 장바구니와 위시리스트의 runtime, 실패가 멈추는 화면 범위, 슬라이스의 Public API를 실제 의존 관계에 따라 정했다.

store 분리, 오류 경계, `index.ts` 사용 여부에 대한 초기 판단은 셋 다 바뀌었다.

전환 전에는 `shopping.ts` 하나가 장바구니와 위시리스트의 상태와 action과 reset 경계를 함께 들고 있었다. 조회 실패는 화면마다 인라인으로 처리했고 route 단위 오류 경계는 없었다.

결정을 한꺼번에 내리지 않았다. 장바구니와 위시리스트의 경계를 먼저 정했다. 그 경계가 정해지자 토글 UI를 어느 레이어에 둘지와 상품 카드에 행위를 어디서 붙일지가 따라 나왔다. 조회 계약의 소유자가 정해진 뒤에야 Public API 범위를 정했다. 구조 이동을 마친 뒤에는 실패가 멈출 화면을 코드에 배치했다.

옮기는 순서도 같은 이유로 아래에서 위였다. `shared`가 먼저 자리를 잡아야 위 레이어가 이동하면서 그것을 참조할 수 있다. 반대로 하면 상위가 아직 옮기지 않은 하위를 임시 경로로 참조하는 구간이 생긴다.

레이어 개수는 계획이 아니라 이 결정들이 남긴 결과였다. 가로 띠 하나가 레이어이고 그 안의 상자 하나가 슬라이스다. 슬라이스는 한 관심사의 코드를 모아 둔 폴더이고, 레이어는 그 슬라이스들이 서로를 어느 방향으로만 참조할 수 있는지 정하는 층이다.

![app 아래로 _pages, widgets, entities, shared 네 레이어가 놓이고 import는 아래로만 향한다. _pages의 home과 product-list, widgets의 header 세 슬라이스에만 index.ts로 공개 계약을 뒀고 나머지 다섯은 deep import가 열려 있다. features 레이어는 점선으로 비어 있고 토글에 정책이 없어 열지 않았다는 표시가 붙어 있다. entities의 cart와 wishlist는 서로를 모른다](./02-layer-map.svg)

아래 셋은 그중 첫 번째 결정과 마지막 두 결정이다.

## 하나의 store에 모으려다 화살표가 거꾸로 섰다

지켜야 할 것은 하나였다. 위시리스트를 지워도 장바구니의 모델과 계약과 테스트가 바뀌지 않아야 한다. 여기서 capability는 둘처럼 독립적으로 변경되는 기능 단위다.

모델은 나누되 runtime store는 하나로 뒀다. 문제는 selector의 소유 위치였다. 통합 store를 조립부에 두면 조립부는 두 capability를 함께 import하므로 `entities`보다 위에 있어야 한다. 그런데 토글 UI는 `entities/cart/ui`에 있고 `useIsInCart` 같은 selector를 쓴다. 하위 레이어가 상위 조립부를 참조하게 된다.

![통합 store 조립부는 cart와 wish model을 import하지만 entities의 cart UI가 다시 상위 조립부의 selector를 import해 의존 방향을 거스른다. store와 selector를 capability 안으로 나누면 cart UI의 import가 entities 레이어 안에서 끝난다](./01-store-dependency-direction.svg)

빠져나갈 길이 셋 있었지만 전부 더 큰 결합을 만든다. store 인스턴스를 `shared`에 두면 합쳐진 타입이 두 capability 상태를 알아야 해서 `shared`가 `entities`를 참조한다. 조립부가 store를 props로 내려주면 조합부부터 leaf까지 들고 내려가야 한다. 토글 UI를 조립부와 같은 레이어로 올리면 정책이 없는 UI를 위해 레이어를 여는 것과 같다.

store 분리는 두 store를 함께 비우는 reset 헬퍼 하나를 추가했다. 통합 store는 하위 레이어가 상위 조립부에 의존하게 만들었다. 전자를 골랐다.

하나의 store에 슬라이스를 모으는 건 Zustand의 관례이지 도메인의 요구가 아니다. 두 capability를 독립으로 정해 놓고 그 경계를 지키려고 라이브러리 관례를 우회하는 factory를 만들었다. 그 우회가 레이어 규칙까지 건드리고 있었다. 관례를 지키려고 설계를 비틀고 있다는 신호다.

장바구니와 위시리스트의 생성과 초기화 생명주기가 갈라졌다. 한쪽을 제거해도 다른 쪽의 런타임 구성이 바뀌지 않는다. 각 capability의 모델과 UI 의존이 슬라이스 안에서 닫힌다.

## `index.ts`를 몇 개 만들지 정하려 했다

슬라이스가 여덟 개다. Public API는 슬라이스 밖에서 접근을 허용한 진입점이고, deep import는 이 진입점을 거치지 않고 내부 파일을 직접 읽는 경로다.

처음 기준은 숨길 대상의 개수였다. 여럿이고 여러 세그먼트에 걸쳐 있으면 파일을 만든다. 하나면 검증 항목으로 처리한다. 이 기준으로 `widgets/header`는 파일 없이 갔다. 감출 것이 `HeaderCounts` 하나이고 소비자도 `app/layout.tsx` 하나였기 때문이다.

검증 항목은 사람이 지키는 규칙일 뿐 deep import를 기술적으로 막지 못한다. 그리고 1과 2 사이에 선을 그을 근거가 없었다. 기준을 유무로 바꿨다.

```ts
// header 슬라이스가 외부에 공개하는 전부다.
export { default as Header } from './ui/Header'
```

`HeaderCounts`를 외부에서 직접 import하면 개수 배지만 클라이언트 컴포넌트로 두고 `Header`는 서버 컴포넌트로 남긴 분리 방식이 사용처에 노출된다. 그래서 `Header`만 공개하고 `HeaderCounts`는 내부에 남겼다.

숨길 것이 없는 슬라이스에는 만들지 않았다. `entities` 셋과 `shared`가 그렇다. `entities/cart/model`은 store 인스턴스를 export하지 않고 selector 훅만 내보낸다. `index.ts` 없이도 성립하는 Public API다.

모든 슬라이스에 두는 안은 반려했다. 숨길 내부가 없는 다섯 개의 `index.ts`는 내부를 그대로 재수출하는 파일이 된다. 그게 정확히 barrel이다. 경계 의도가 없는 재수출은 이름 충돌과 순환 의존의 입구다.

## 실패가 멈추는 화면 범위

오류 경계도 status 번호로 정하지 않았다. 과제 예시는 `5xx는 경계로, 4xx는 화면 안에서`를 든다. 이 선을 따르면 상품 목록에서 5xx가 났을 때 검색 폼과 카테고리와 정렬까지 사라진다. 사용자는 조건을 바꿔 다른 결과로 갈 수 있었다. 반대로 홈에서는 4xx여도 그릴 것이 없어 `main` 전체가 죽는 편이 맞다.

실패 범위를 HTTP 분류가 아니라 응답 없이 유지 가능한 사용자 행동으로 정했다. 목록 API가 죽으면 결과 영역만 죽고 필터와 페이지네이션과 Header는 산다. 홈 API가 죽으면 `main`이 죽지만 Header가 `layout`에 있어 다른 화면으로 나갈 수 있다.

이 과정에서 재시도 가능 여부와 화면이 설명할 수 있는 실패가 한 조건에 섞여 있는 것을 확인했다. 200 응답이 계약을 어겨 파싱이 깨지면 `SyntaxError`가 나는데, 이게 네트워크 단절과 같은 취급을 받아 결과 영역에 다시 시도 버튼이 붙었다. 다시 받아도 같은 본문이라 눌러도 같은 실패다.

```ts
export const isExpectedFailure = (error: unknown) =>
  error instanceof ApiError || error instanceof NetworkError || isTimeout(error)

// 다시 보내면 달라질 수 있는 것은 서버 오류, 타임아웃, 네트워크 단절뿐이다.
export const isRetryable = (error: unknown) => {
  if (error instanceof ApiError) return error.status >= 500
  return isTimeout(error) || error instanceof NetworkError
}
```

둘을 나눴다. 하나는 화면이 이 실패를 설명할 수 있는가, 다른 하나는 다시 보내면 결과가 달라지는가다. `throwOnError`는 앞엣것을, 자동 재시도는 뒤엣것을 쓴다.

## 처음 근거는 셋 다 세기 쉬운 값이었다

| 결정 | 처음 근거 | 바꾼 근거 |
| --- | --- | --- |
| store를 몇 개 둘까 | 하나면 reset 조율 비용이 없다 | 조립부가 `entities` 위에 앉아야 해서 의존이 역방향이 된다 |
| `index.ts`를 몇 개 만들까 | 숨길 것이 여럿이면 파일, 하나면 검증 항목 | 하나라도 명확하면 경계는 성립한다 |
| 무엇을 경계로 올릴까 | 5xx는 경계, 4xx는 화면 안 | 같은 status가 화면에 따라 다른 범위를 가져야 한다 |

store 개수, 숨길 대상 개수, status 번호. 셋 다 세기 쉽다. 바꾼 근거는 셋 다 결합의 방향이다. 누가 누구를 import하는가, 그 하나가 무엇을 지탱하는가, 화면이 응답 없이 살 수 있는가.

세기 쉬운 값으로 정하면 임계값을 어디 둘지가 남는다. 그리고 임계값에는 대개 근거가 없다. 1과 2 사이에 선을 그은 이유를 적을 수 없었던 것이 그 예다.

## 감수한 위험

경계를 기계가 아니라 사람이 지킨다. `index.ts`가 없는 다섯 슬라이스는 deep import를 막을 방법이 없다. 파일을 옮기면 소비자가 깨진다. 슬라이스가 작아서 옮길 일이 적다는 것에 기대고 있고, 이 기대가 틀리면 다시 본다. 의존 규칙을 도구로 강제하는 일은 이번 범위에 넣지 않았다.

store를 나누면서 하나의 store가 주던 reset 일관성을 잃었다. 두 capability가 항상 함께 비워져야 하는 정책이 생기면 통합을 다시 본다.

`error.tsx`가 실제로 도달 가능해졌지만 route 경계라 단위 테스트로 재현하기 어렵다. 지금은 수동 검증으로 남아 있다.
