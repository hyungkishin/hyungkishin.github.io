---
title: "상품 목록 리팩터링은 500줄을 줄이는 일이 아니었습니다"
date: 2026-07-03
update: 2026-07-24
tags:
  - front-end
  - e-commerce
  - react
  - typescript
  - refactoring
---

**TL;DR**

이 리팩터링에서 중요한 건 500줄짜리 컴포넌트를 작게 자르는 일이 아니었다. 어떤 질문을 어디서 답하게 만들 것인가였다.

경계가 정해지면 읽는 순서가 생긴다. 서버와의 계약은 service에서, 상태 변경 흐름은 훅에서, 파생 계산은 순수 함수에서 읽는다.
이 글은 그 경계가 없거나 잘못 그어졌을 때 실제로 생긴 실패들을 다룬다. 글자 하나마다 나가던 요청, 뒤로가기 한 번에 하나씩 늘던 히스토리, 응답만 버려지고 서버까지 살아가던 요청, 재시도를 깨뜨린 페이지 보정.

## 글자 하나에 요청이 하나씩 나갔다

검색창에 "shoes"를 치면 요청이 다섯 번 나갔다. `s`, `sh`, `sho`, `shoe`, `shoes`. 목업 서버라 티가 나지 않았을 뿐, 실제 API였으면 네 번은 버려지는 요청이다.

원인은 상태 하나가 두 역할을 겸한 데 있다. 검색어 상태가 "화면에 보이는 값"이면서 동시에 "서버에 보낼 값"이었다. 입력창은 즉시 반응해야 하고 요청은 손이 멈춘 뒤에 나가야 한다. 요구되는 타이밍이 다르면 같은 값이 아니다.

```ts
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debouncedValue
}
```

입력창은 `searchQuery`를 그대로 쓴다. 요청과 URL과 하이라이트는 300ms 멈춘 뒤의 `debouncedSearchQuery`를 쓴다.
타이밍이 다른 두 소비자는 같은 상태를 공유할 수 없다. 다만 값이 둘로 갈라지는 순간 새 문제가 생긴다. 두 값이 어긋나 있는 300ms의 창이다. 다음 실패가 그 창에서 나왔다.

## 뒤로가기 한 번에 히스토리가 하나 늘었다

필터를 바꾸고 뒤로가기를 눌러도 화면이 돌아오지 않았다.
URL 갱신이 전부 `replaceState`였기 때문이다. replace는 히스토리에 새 항목을 만들지 않고 지금 항목을 덮어쓴다. 필터를 아무리 바꿔도 뒤로 갈 데가 없다.

수정의 골격은 이동의 주인을 나누는 것이다. 사용자가 필터나 페이지를 바꾸면 `pushState`로 쌓는다. 첫 렌더나 자동 보정처럼 사용자가 만든 이동이 아니면 `replaceState`로 덮는다. `popstate`를 구독해 뒤로 가기에서 URL을 읽어 상태를 복원한다.

그런데 이 구조가 디바운스의 300ms 창과 만나면 히스토리가 오염된다. 경로는 이렇다.

검색어를 바꾸고 300ms가 지나기 전에 뒤로가기를 누른다. popstate가 필터를 복원하며 URL 동기화가 한 번 돌고 "다음 동기화는 replace"라는 표시가 소비된다. 300ms 뒤 밀려 있던 디바운스 값이 갱신되며 동기화가 한 번 더 돈다. 표시는 이미 소비된 뒤라 이번엔 pushState로 실행된다. 뒤로가기 한 번에 히스토리 항목이 하나 늘어난다.

```tsx
// 디바운스 진행 중에는 URL 동기화를 보류한다.
// 안 그러면 뒤로가기 직후 밀린 디바운스가 pushState로 히스토리를 오염시킨다.
if (searchQuery !== debouncedSearchQuery) {
  return
}

const url = `?${params.toString()}`
if (replaceNextRef.current) {
  window.history.replaceState(null, '', url)
  replaceNextRef.current = false
} else {
  window.history.pushState(null, '', url)
}
```

입력값과 요청값이 다른 동안은 URL을 건드리지 않는다. 두 값이 만난 뒤에만 동기화가 돌면 replace 표시가 엉뚱한 타이밍에 소비될 길이 없다.
히스토리에는 사용자가 만든 이동만 쌓인다. 이 경로는 리뷰에서 잡혔다. 검색어를 치자마자 뒤로가기를 누르는 동선은 만든 사람의 손이 잘 밟지 않는다.

## 응답만 버려지고 요청은 서버까지 갔다

필터를 빠르게 바꾸면 이전 요청들이 전부 서버까지 갔다. 화면이 멀쩡해 보인 이유는 `ignore` 플래그가 늦게 온 응답을 버려서다.

```ts
let ignore = false
// ...
if (ignore) return   // 늦게 온 응답은 버린다
return () => { ignore = true }
```

이 구조가 취소하는 것은 응답의 사용이지 요청이 아니다. 네트워크와 서버는 아무도 쓰지 않을 작업을 끝까지 처리한다.
`AbortController`로 바꾸면 cleanup의 `controller.abort()`가 진행 중인 fetch를 실제로 끊는다.

```ts
useEffect(() => {
  const controller = new AbortController()

  const fetchProducts = async () => {
    try {
      const data = await getProducts({ /* ...params */ }, controller.signal)

      // 주입된 getProducts가 signal을 무시할 수 있으므로
      // 늦게 온 응답은 여기서 한 번 더 버린다.
      if (controller.signal.aborted) return

      setProducts(data.products)
      setTotalCount(data.totalCount)
      setHasLoaded(true)
    } catch (err) {
      if (!controller.signal.aborted) setError(err as Error)
    }
  }

  fetchProducts()
  return () => controller.abort()
}, [/* ...deps */])
```

`signal.aborted` 가드가 남아 있는 이유는 주입 경계 때문이다. `useProducts`는 테스트를 위해 `getProducts`를 주입받고 주입된 함수는 signal을 무시할 수 있다. 실제 요청은 abort가 끊고, 계약을 어기는 구현은 가드가 막는다.
취소는 취소를 아는 계층이 실제 작업을 하는 계층까지 신호를 전달해야 성립한다. 응답 폐기는 취소가 아니다.

> **포기한 것**: 캐시와 포커스 리페치까지 직접 만드는 선택. stale-while-revalidate를 손으로 짜면 TanStack Query의 열화판이 된다. 목록 화면 하나에서 거기까지 가면 이번 문제보다 도구 설명이 커진다. 서버 상태의 경계를 손으로 먼저 만들고 캐시는 도구를 들일 때 가져온다.

## 범위 밖 page 보정이 재시도를 깨뜨렸다

URL에 page=999가 담긴 채 열리면 totalCount 24 기준 실제 마지막 페이지는 2다. 성공 응답을 받은 뒤 page를 2로 보정해야 한다.

문제는 totalCount의 초기값이 0이라는 점이다. 응답이 오기 전에 totalPages가 1로 계산되면 보정이 너무 일찍 달려서 page를 1로 내려 버린다. API가 실패한 상태에서도 같은 일이 벌어져 에러 재시도 흐름이 깨진다.

```tsx
useEffect(() => {
  if (productsQuery.hasLoaded && page > pageInfo.totalPages) {
    changePage(pageInfo.totalPages)
  }
}, [changePage, page, pageInfo.totalPages, productsQuery.hasLoaded])
```

`hasLoaded`가 보정의 자격을 정한다. 진짜 데이터가 도착한 뒤에만 범위를 판단한다.
자동 보정은 아직 오지 않은 데이터 위에서 실행되면 안 된다. 이 충돌은 눈이 아니라 테스트가 먼저 알았다. 범위 밖 page 보정을 넣자 에러 재시도 테스트가 깨졌고, 두 동작이 서로 건드리는 지점이 거기서 드러났다.

## 같은 의미의 값이 다른 기준으로 들어왔다

URL parser는 방어하고 있었다. 잘못된 category와 sort는 기본값으로, 음수 page는 1로, 숫자가 아닌 가격은 빈 필터로 돌아간다.

```ts
export function readProductListSearchParams(
  params: URLSearchParams,
): ProductListUrlState {
  return {
    filters: {
      category: readCategory(params.get('category')),
      searchQuery: params.get('q') ?? DEFAULT_FILTERS.searchQuery,
      sortBy: readSortBy(params.get('sort')),
      minPrice: readPositiveNumber(params.get('minPrice')),
      maxPrice: readPositiveNumber(params.get('maxPrice')),
      inStockOnly: params.get('inStock') === 'true',
    },
    page: readPositivePage(params.get('page')),
  }
}
```

그런데 같은 값이 들어오는 문이 하나 더 있었다. 가격 입력창이다. 비정상 문자열이 `Number(value)`를 지나면 NaN이 되고, NaN은 필터 상태를 거쳐 API query까지 전파된다. `minPrice=NaN`이 서버로 나가면 필터 결과가 통째로 비어 보인다. URL 경로만 방어하고 입력 경로를 비워 둔 구멍이다. 같은 정규화가 필터 훅에도 들어갔다.

```ts
function parsePriceFilter(value: string): number | '' {
  if (value === '') {
    return ''
  }

  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : ''
}
```

기준의 단일화는 필터 값만의 문제가 아니었다. 재고 필터가 클라이언트에서만 적용되던 구간에서는 목록은 걸러졌는데 totalCount는 서버 기준 그대로였다. 목록만 맞아 보이고 페이지네이션이 어긋난다. `inStockOnly`가 true면 요청에 `inStock=true`가 실리고 클라이언트는 응답을 다시 거르지 않는다.
같은 의미의 값은 어느 문으로 들어와도 같은 기준으로 정규화된다. 그리고 목록, 총 개수, 페이지 수는 같은 곳에서 계산된 값을 본다.

## 사례들이 만든 경계

실패들이 가른 경계는 파일 크기가 아니라 질문의 주소다.

- 서버와의 계약이 궁금하면 `productService`를 연다. query 이름, 에러 형식, 취소 신호가 전부 거기 있다. 화면은 상품을 가져오는 방법을 모른다.
- 조건이 바뀔 때 무슨 일이 생기는지 궁금하면 훅을 연다. `useProductFilters`에는 필터 변경이 page를 1로 되돌리는 규칙이, `useProducts`에는 서버 상태와 재시도가, `useProductPagination`에는 페이지 계산이 있다. 각 훅은 한 문장으로 설명되는 범위까지만 안다.
- 배지와 할인율 같은 파생값은 상태로 저장되지 않는다. `isAlmostSoldOut`, `isBestSeller` 같은 React를 모르는 순수 함수가 상품 데이터에서 매번 계산한다. 저장하는 순간 원본과 어긋날 수 있는 값들이다.
- localStorage 동기화는 위시리스트와 최근 본 상품 훅 안에 격리된다. 브라우저 저장소는 React 밖의 외부 시스템이라 그 실패를 페이지가 알 필요가 없다.
- 페이지에는 조합이 남는다. 훅들의 출력을 UI 컴포넌트에 연결하는 자리까지 비우면 이 화면이 어떻게 움직이는지 찾을 곳이 없어진다.

에러 화면의 버튼도 이 경계를 따른다. 실패한 것은 상품 조회이므로 다시 하는 것도 상품 조회다. `window.location.reload()`가 아니라 `useProducts`의 `refetch`가 같은 조건으로 다시 요청한다.

이 계약들은 테스트 39건이 지킨다. URL 초기 상태 복원, 정규식 특수문자 검색어, 전체 새로고침 없는 재시도, 범위 밖 page 보정, NaN 차단, 그리고 fetch 두 번째 인자에 취소 신호가 실려 나가는지까지.

> **포기한 것**: 배지 표시용 view model을 미리 만드는 선택. 배지 규칙을 다른 화면에서도 쓰게 되는 날 만들면 된다. 지금 만들면 재사용 지점이 없는 미리 만든 추상화다.

## 아직 해결하지 않은 범위

`ProductCard` 안에는 작은 표시 덩어리들이 남아 있다. `Badge`, `PriceArea`까지 쪼개는 것은 지금 재사용보다 탐색 비용이 크다.
캐시, stale-while-revalidate, 포커스 리페치는 서버 상태 도구를 들일 때의 결정으로 남아 있다. 이번에 만든 경계는 그 도구가 들어올 자리다.

리뷰가 잡아준 세 가지, 디바운스와 뒤로가기와 요청 취소는 같은 결이다. 경계는 나뉘었지만 그 경계를 실제로 밟는 사용자의 동선은 만든 사람의 손이 따라가지 못한다. 그 동선은 리뷰와 테스트가 대신 밟는다.

이 작업을 한 줄로 줄이면 이렇다. 500줄이 작게 잘린 게 아니라 질문마다 열어야 할 파일이 정해졌다.
