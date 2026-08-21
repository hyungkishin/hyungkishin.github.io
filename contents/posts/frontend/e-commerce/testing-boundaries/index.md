---
title: "테스트 296개가 초록이어도 뒤로가기는 깨져 있었다"
date: 2026-08-21
tags:
  - front-end
  - e-commerce
  - testing
  - Vitest
  - MSW
  - Playwright
---

상품 목록의 히스토리 저장 방식을 `push`에서 `replace`로 바꿨다. 카테고리를 바꾼 뒤 뒤로가기를 누르면 이전 목록으로 돌아가야 하지만 현재 목록에 그대로 남게 만든 변경이었다.

단위 테스트와 통합 테스트 296개는 전부 통과했다. production build를 띄운 E2E 두 건만 실패했다.

테스트를 더 쓰기 전에 답해야 할 질문이 여기 있었다. 몇 개를 쓸지가 아니라 어떤 실패를 어느 실행 환경에서 잡을 것인가. 8주차에는 15개 검증 대상을 먼저 적고 각 테스트가 빨간불이 될 이유를 정했다. 구현을 마친 뒤에는 코드를 일부러 세 군데 망가뜨려 그 배치가 실제로 회귀를 잡는지 확인했다.

## 빨간불이 알려줄 내용을 먼저 적었다

시작할 때 이미 테스트가 269개 있었다. 숫자를 늘리는 일만으로는 빈 곳을 알기 어려웠다. 기존 테스트가 무엇을 보장하는지도 한 문장으로 설명하기 힘들었다.

검증 대상마다 실패했을 때 알게 될 사실을 먼저 적었다.

| 검증 대상 | 방법 | 빨간불이 알려주는 것 |
| --- | --- | --- |
| 담기 토글과 개수 파생 | 단위 | 같은 상품을 다시 눌러도 빠지지 않거나 ID 수와 헤더 개수가 어긋난다 |
| 카테고리 변경 | 통합 | URL은 바뀌지만 요청과 목록이 이전 조건에 남거나 page가 1로 돌아가지 않는다 |
| 뒤로가기와 앞으로가기 | E2E | URL만 돌아가고 목록은 남거나 히스토리 한 칸이 두 칸으로 쌓인다 |

담기 규칙은 React 밖에서도 성립한다. `toggleCartId`와 `cartCountOf`를 순수 함수로 꺼내자 DOM 없이 경계를 전부 밟을 수 있었다. hook이 그 규칙을 실제로 구독하는지는 상품 카드와 헤더를 함께 그리는 통합 테스트가 맡았다.

```ts
export const toggleCartId = (ids: readonly string[], productId: string) =>
  ids.includes(productId)
    ? ids.filter((existing) => existing !== productId)
    : [...ids, productId]

export const cartCountOf = (ids: readonly string[]) => ids.length
```

처음에는 “빈 목록에서 빼려 해도 빈 목록 그대로다”라는 기대를 썼다. 토글은 빈 목록에서 상품을 추가해야 한다. 순수 함수 테스트가 바로 실패했고 기대를 “상품 하나만 남는다”로 고쳤다. 화면을 그렸다면 규칙을 잘못 이해한 것인지 배선이 끊긴 것인지부터 갈라야 했을 문제였다.

반면 뒤로가기는 브라우저가 소유한 동작이다. jsdom의 history는 호출을 흉내 내지만 사용자가 실제로 누르는 뒤로가기와 Next.js 라우팅이 이어지는 구간을 대신하지 못한다. 이 항목만 production build 위의 Playwright로 올렸다.

## fetch를 바꿔치기하자 요청이 검증에서 사라졌다

7개 테스트 파일이 `vi.stubGlobal('fetch', ...)`를 쓰고 있었다. 응답을 원하는 순서로 만들기는 쉬웠지만 앱의 요청은 네트워크까지 가지 않았다. URL 조립이 맞아도 전송 경로가 다른 주소를 호출하면 테스트는 통과한다. `AbortSignal`을 fetch에 넘겼는지만 검사할 뿐 진행 중인 요청이 실제로 끊기는지도 알 수 없었다.

fetch는 그대로 두고 MSW가 요청을 가로채게 바꿨다.

```ts
const server = setupServer(...handlers)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  server.resetHandlers()
})
```

기본 핸들러에는 성공 응답만 뒀다. 오류, 빈 결과, 지연은 해당 테스트가 `server.use`로 덮는다. 등록하지 않은 요청은 실패시켰다. 개발 서버가 우연히 떠 있는지에 따라 테스트 결과가 달라지는 일을 막기 위해서다.

목록을 만드는 코드도 두 벌로 두지 않았다. route와 MSW 핸들러가 `selectProducts`를 함께 호출한다. 검증과 mock 지연, `scenario=empty|error` 판정은 요청을 받은 route에 남겼다. 조건에서 상품을 고르고 정렬하고 페이지를 자르는 규칙만 공유했다.

이관 뒤 취소 테스트의 질문도 달라졌다.

```ts
server.use(
  http.get(TRANSPORT_URL, async () => {
    await delay('infinite')
    return HttpResponse.json({})
  }),
)

const pending = fetchJson(TRANSPORT_URL, controller.signal)
controller.abort()

await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
```

이제 “신호 객체의 aborted가 true인가”가 아니라 “진행 중인 요청이 AbortError로 끝나는가”를 본다. 네트워크 실패도 `Promise.reject(new TypeError())`를 직접 돌려주지 않는다. `HttpResponse.error()`가 만든 실제 fetch 실패를 전송 계층이 `NetworkError`로 바꾸는 경로를 지난다.

## 모든 테스트를 jsdom에 두자 취소 결과가 달라졌다

테스트 37개 파일이 모두 jsdom에서 돌고 있었다. 그중 22개는 DOM을 전혀 쓰지 않았다. `.test.ts`는 node, `.test.tsx`는 jsdom에서 실행하도록 Vitest project를 둘로 나눴다.

| 구성 | 환경 셋업 | 벽시계 | 결과 |
| --- | ---: | ---: | --- |
| 전부 jsdom 37파일 | 약 23초 | 4.6초 | 36파일 통과, 1파일 실패 |
| node 22파일, jsdom 15파일 | 약 12초 | 3.3초 | 37파일 통과 |

환경 셋업은 절반이 됐지만 벽시계 차이는 1.3초였다. 워커가 병렬로 준비되므로 셋업 감소량이 실행 시간에 그대로 더해지지 않았다. 속도만 보면 큰 변화라고 쓰기 어렵다.

분리를 유지한 이유는 마지막 열이다. 전부 jsdom으로 돌리면 `http.test.ts`의 취소 테스트가 실패했다. jsdom의 fetch 구현과 node fetch가 취소를 다르게 처리했다. 서버에서도 실행되는 전송 계층을 브라우저 흉내 하나에서만 확인하면 테스트 결과가 실행 의미와 달라졌다.

확장자 규약에는 구멍이 있다. JSX를 쓰지 않는 DOM 테스트는 `.tsx`라는 이름만 보고 이유를 알아채기 어렵다. 현재 코드에서는 DOM 테스트가 React를 그리고 대부분 JSX를 썼다. 예외는 `renderHook` 테스트 하나뿐이었다. 파일별 주석을 늘리는 대신 ESLint가 `.test.ts`의 `@testing-library/*` import를 error로 막게 했다. 규약이 어긋나면 CI보다 먼저 파일 확장자를 바꾸라는 메시지가 나온다.

환경을 나누며 숨은 12초도 발견했다. node에서 route 테스트 하나가 12.4초였고 jsdom에서는 45ms였다. mock API의 500ms 지연을 끄는 조건이 `NODE_ENV === 'test'`였는데 jsdom에서는 Vite가 값을 치환했고 node에서는 셸의 `development`가 남았다. Vitest 설정에 테스트 환경을 명시하자 두 project가 같은 조건으로 실행됐다.

## E2E를 check에 넣되 build는 한 번만 했다

E2E를 `pnpm test`에는 넣지 않았다. 저장할 때마다 도는 짧은 루프에서 production build는 너무 비쌌다. 커밋과 PR의 게이트인 `pnpm check`에는 넣었다. 별도 명령만 만들고 게이트 밖에 두면 실행되지 않는 테스트가 되기 쉬웠다.

처음에는 `check`의 build가 끝난 뒤 Playwright webServer가 다시 build했다. E2E 구간만 8.8초가 걸렸다. 실행 경로를 둘로 나눴다.

```json
{
  "test:e2e": "pnpm build && playwright test",
  "test:e2e:prebuilt": "playwright test",
  "check": "... && pnpm build && ... && pnpm test:e2e:prebuilt"
}
```

단독 실행은 산출물을 직접 만들고 `check`는 앞 단계의 산출물을 재사용한다. E2E 구간은 2.5초가 됐다. `prebuilt`만 실행하면 산출물이 없을 때 실패한다. 개발 서버로 조용히 내려가는 경로는 두지 않았다. 서버 컴포넌트의 사전 렌더와 번들 분할은 production build에서만 확인되기 때문이다.

## 세 군데를 망가뜨려 테스트 배치를 확인했다

작업이 끝난 뒤 테스트 코드는 그대로 두고 구현을 한 곳씩 망가뜨렸다.

| 변경 | 잡은 테스트 | 놓친 테스트 |
| --- | --- | --- |
| 담긴 상품을 다시 눌러도 제거하지 않음 | 단위 3건, 통합 2건 | 없음 |
| 카테고리를 바꿀 때 page를 1로 돌리지 않음 | 통합 2건 | 없음 |
| 히스토리 `push`를 `replace`로 변경 | E2E 2건 | 단위와 통합 296건 전부 통과 |

첫 번째 실패는 규칙 테스트 이름과 배열 차이만 보고 토글의 제거 경로를 열 수 있었다. 두 번째는 “뒤쪽 페이지에서 카테고리를 바꾸면 1페이지가 열린다”는 이름이 원인을 좁혔다.

세 번째 E2E의 locator 실패 메시지만으로는 `replace`가 원인인지 알기 어려웠다. 그래도 실패한 테스트 이름이 히스토리 경계까지 범위를 줄였다. jsdom 통합 테스트로 내렸다면 1초보다 빨리 실행됐겠지만 이 변경에는 아무 빨간불도 켜지지 않았다.

테스트 피라미드의 층을 개수로 정하면 이 차이가 보이지 않는다. 실패를 만든 주체가 순수 규칙이면 단위 테스트로 내리고, 여러 코드의 배선이면 통합 테스트에서 본다. 실제 브라우저가 결과를 결정하면 E2E까지 올린다. 실행 비용은 그 다음에 줄였다.

최종 게이트는 node 22파일과 jsdom 15파일, Storybook, lint, typecheck, build, E2E를 한 명령으로 돌린다. 숫자보다 남은 것은 각 빨간불의 주소다. 토글이 깨지면 모델을 열고, 조건 전환이 깨지면 화면과 URL 배선을 열고, 뒤로가기가 깨지면 브라우저 히스토리를 연다.
