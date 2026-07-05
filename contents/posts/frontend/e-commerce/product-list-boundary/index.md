---
title: "상품 목록 리팩터링은 500줄을 줄이는 일이 아니었습니다"
date: 2026-07-03
update: 2026-07-05
tags:
  - front-end
  - e-commerce
  - react
  - typescript
  - refactoring
---

**TL;DR**

상품 목록 화면을 처음 열었을 때 제일 먼저 보인 건 긴 컴포넌트였습니다.
필터, 검색, 정렬, 페이지네이션, API 호출, 로딩과 에러 처리, localStorage 동기화가 한 파일에 다 있었어요.

그런데 이번 목표를 "파일을 작게 만들기"로 잡으면 방향이 틀어진다고 봤습니다.
500줄을 100줄짜리 다섯 개로 쪼개도, 어디서 데이터를 가져오고 어디서 상태가 바뀌는지 모르면 읽기 쉬워진 게 아니니까요.

그래서 먼저 읽는 순서를 잡았습니다.
화면은 컴포넌트에서 읽습니다. 동작은 훅, 서버 계약은 서비스, 계산은 유틸. 이 순서를 만드는 게 이번 작업이었어요.

## 왜 긴 컴포넌트보다 읽는 순서가 먼저였을까요?

긴 컴포넌트는 불편합니다.
그런데 길다는 사실만으로 나쁜 코드는 아니에요.
더 위험한 건 한 파일 안에서 여러 변경 이유가 서로 섞여 있는 상태였습니다.

상품 목록 화면에는 이런 변경 이유가 같이 있었어요.
카테고리 필터 정책이 바뀔 수 있고 검색어가 URL에 남아야 할 수도 있습니다.
서버의 API query 이름도 바뀝니다. 위시리스트 저장 방식도 언젠가는 바뀌겠죠.
상품 카드의 배지 기준도 마찬가지고요.

이걸 한 파일에서 다 처리하면 수정할 때마다 같은 파일을 엽니다.
문제는 파일을 여는 횟수가 아니라, 읽는 동안 계속 관심사가 바뀐다는 점이었어요.
필터 상태를 보다가 갑자기 fetch를 읽습니다. 그러다 카드 배지 계산으로 넘어가고 다시 localStorage를 봐야 하죠.

그래서 처음 질문을 이렇게 잡았습니다.

> 이 코드를 몇 줄로 줄일까가 아니라, *어떤 질문을 어디서 답하게 만들까?*

이 질문을 기준으로 나누니 분리 단위가 조금 선명해졌어요.
UI는 화면을 보여줍니다. Hook에서는 상태 변경 흐름을 봅니다.
Service에는 서버와의 계약이 남고 Utils는 입력을 출력으로 바꾸는 작은 규칙을 맡습니다.

> **포기한 것**: 줄 수만 줄이는 리팩터링. 파일이 작아져도 읽는 순서가 생기지 않으면, 같은 문제를 다른 파일로 옮긴 것뿐이라고 봤습니다.

## API 호출은 왜 페이지에서 빠져야 했을까요?

페이지 컴포넌트 안에 `fetch`가 있으면 처음엔 편합니다.
필터 상태를 바로 읽어 `URLSearchParams`를 만들고 응답을 받은 뒤 `products`와 `totalCount`를 setState 하면 되니까요.

문제는 API 계약이 화면 코드에 박힌다는 점이었어요.
`category`, `sort`, `q`, `page`, `size`, `minPrice`, `inStock` 같은 query 이름을 페이지가 전부 알게 됩니다.
나중에 서버 query 이름이 바뀌면 화면 컴포넌트를 열어야 하고 에러 메시지 형식이 바뀌어도 같은 파일을 봐야 하죠.

그래서 API 호출은 `productService`로 뺐습니다.
페이지는 상품을 가져오는 방법을 모릅니다. 그냥 `useProducts`가 돌려준 서버 상태를 읽어요.

```ts
export const productService = {
  async getProducts(params: GetProductsParams): Promise<ProductListResponse> {
    const searchParams = new URLSearchParams({
      category: params.category,
      sort: params.sortBy,
      q: params.searchQuery,
      page: String(params.page),
      size: String(params.pageSize),
    })

    if (params.inStockOnly) {
      searchParams.set('inStock', 'true')
    }

    const response = await fetch(`/api/products?${searchParams.toString()}`)

    if (!response.ok) {
      throw new Error(`API 호출 실패 (status: ${response.status})`)
    }

    return response.json()
  },
}
```

이렇게 나누고 나니 테스트도 쉬워졌어요.
페이지 전체를 렌더링하지 않아도 됩니다. API query contract는 서비스 테스트에서 바로 확인됩니다.

재고 필터가 클라이언트에서만 적용되던 문제도 여기서 잡았습니다.
`inStockOnly`가 true면 API 요청에 `inStock=true`가 들어갑니다. 훅에서는 서버 응답을 다시 필터링하지 않아요.

이 판단은 사소해 보여도 중요했습니다.
클라이언트에서 한 번 더 필터링하면 목록은 맞아 보일 수 있어요.
하지만 `totalCount`는 서버 기준입니다. 그 순간 페이지네이션과 목록이 어긋납니다.
보이는 목록만 맞아서는 부족했어요. 목록, 총 개수, 페이지 수가 같은 기준을 봐야 했습니다.

> **포기한 것**: 페이지 안에서 query를 바로 만드는 편함. 대신 서버와의 계약을 service 한 곳에서 읽게 했습니다.

## Hook은 어디까지 책임져야 했을까요?

처음엔 `useProductListPage` 같은 큰 훅 하나로 빼는 선택도 있었어요.
그렇게 하면 페이지 컴포넌트는 더 짧아집니다.
하지만 큰 컴포넌트가 큰 훅으로 이동할 뿐이면, 리팩터링이라고 부르기 어렵습니다.

그래서 훅은 한 문장으로 설명되는 단위까지만 나눴어요.

`useProducts`는 상품 목록 서버 상태를 관리합니다.
loading, error, products, totalCount, stale response 방지, refetch가 같이 움직여요.

`useProductFilters`에는 필터 상태와, 필터 변경 시 페이지를 1로 되돌리는 규칙을 뒀습니다.
카테고리, 가격, 정렬, 검색어, 재고 토글은 모두 "목록 조건"이라는 같은 축에 있으니까요.

`useProductPagination`은 현재 페이지와 페이지 번호 계산을 맡습니다.
API 응답 구조는 모릅니다. `totalCount`와 `pageSize`만 받아서 화면이 쓸 `pageNumbers`를 돌려줘요.

위시리스트와 최근 본 상품은 별도 훅으로 뺐습니다.
localStorage 동기화가 있기 때문이에요. 브라우저 저장소는 React 밖의 외부 시스템입니다.
페이지 컴포넌트가 try/catch로 저장소 실패까지 알 필요는 없다고 봤습니다.

```ts
const productsQuery = useProducts({
  category,
  sortBy,
  searchQuery,
  page,
  pageSize: PAGE_SIZE,
  minPrice,
  maxPrice,
  inStockOnly,
})
```

여기서 페이지가 하는 일은 조합입니다.
필터 상태와 페이지 상태를 읽어 서버 상태 훅에 넘기는 거죠.
이 정도 조합은 페이지에 남겼어요. 모든 연결까지 밖으로 빼면, 오히려 "이 화면이 어떻게 움직이는지"를 찾기 어려워지니까요.

> **포기한 것**: 페이지를 빈 껍데기처럼 만드는 선택. 페이지는 여러 훅과 UI 컴포넌트를 조합하는 책임을 가져도 된다고 봤습니다.

## 파생값은 상태로 들고 있지 않았나요?

상품 목록에는 파생값이 많습니다.
할인율, 품절 여부, 품절 임박, 무료배송, BEST, NEW. 전부 상품 데이터에서 다시 계산되는 값이에요.

이 값들을 상태로 들면 동기화할 대상이 늘어납니다.
상품 데이터가 바뀌었는데 배지 상태가 같이 안 바뀌면, UI는 틀린 말을 하게 되죠.

그래서 상품 규칙은 `productRules`라는 순수 함수로 뺐습니다.
React를 모르는 함수로 만들면 테스트가 쉬워요. 컴포넌트에서 계산 의도도 더 잘 보입니다.

```ts
export function isAlmostSoldOut(product: { stock: number }) {
  return product.stock > 0 && product.stock <= 5
}

export function isBestSeller(product: { rating: number; reviewCount: number }) {
  return product.rating >= 4.5 && product.reviewCount >= 100
}
```

카드 컴포넌트는 이 함수를 호출해서 렌더링합니다.
여기서 조금 고민했어요.
상품 카드가 `productRules`를 import하면, UI 컴포넌트가 도메인 규칙을 아는 것처럼 보일 수 있거든요.

그래도 이번 단계에서는 허용했습니다.
카드 안에서만 쓰는 표시 규칙이고 계산 자체는 순수 함수로 빠져 있으니까요.
나중에 같은 배지 규칙을 다른 화면에서도 쓰게 되면 그때 별도 view model을 만들면 됩니다.
지금 만들면 미리 만든 추상화예요.

> **포기한 것**: 배지 표시용 view model을 미리 만드는 선택. 아직 재사용 지점이 없어서 `ProductCard`와 순수 함수 조합으로 충분하다고 봤습니다.

## URL 상태는 왜 따로 다뤘을까요?

목록 화면에서 필터와 검색어와 페이지는 단순한 UI 상태가 아니었어요.
새로고침해도 유지되어야 합니다. URL을 공유해도 같은 화면이 떠야 하고요.
그렇다면 이 값들은 URL 상태입니다.

처음엔 상태가 바뀔 때마다 페이지에서 직접 `URLSearchParams`를 만져도 됩니다.
하지만 읽는 규칙과 쓰는 규칙이 흩어지면 금방 어긋나요.
읽을 때는 `sort`를 보는데 쓸 때는 `sortBy`로 쓰면, 공유 링크가 깨집니다. `inStock`도 마찬가지고요.

그래서 URL 읽기와 쓰기를 한 파일에 모았습니다.

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

여기서는 방어도 같이 했어요.
잘못된 category나 sort가 들어오면 기본값으로 돌립니다. 음수 page는 1로 돌리고요.
가격도 숫자가 아니면 빈 필터로 봅니다.

나중에 실제로 하나 더 걸렸습니다.
입력창에서 비정상 문자열이 들어오면 `Number(value)`가 `NaN`을 만들 수 있었어요.
URL parser는 방어하고 있었는데 사용자가 직접 입력하는 경로는 방어하지 못한 거죠.
그래서 필터 훅에도 같은 기준을 넣었습니다.

```ts
function parsePriceFilter(value: string): number | '' {
  if (value === '') {
    return ''
  }

  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : ''
}
```

작은 버그처럼 보여도 실제로는 API query까지 전파됩니다.
`minPrice=NaN`이 서버로 나가면 필터 결과가 전부 비어 보일 수 있어요.
테스트를 추가하고 나니 이런 입력 경로가 더 잘 보였습니다.

> **포기한 것**: URL과 입력값을 각각 대충 처리하는 편함. 같은 의미의 값은 같은 기준으로 정규화해야 한다고 봤습니다.

## 에러 화면에서 새로고침 버튼은 왜 부족했을까요?

API가 실패했을 때 처음 구현은 `window.location.reload()`였습니다.
눈으로 보면 다시 시도 버튼처럼 보이죠. 실제로는 페이지 전체를 다시 로드합니다.

이 방식은 서버 상태 훅을 만든 의미와 맞지 않았어요.
상품 조회가 실패했다면, 같은 조건으로 상품 조회만 다시 하면 됩니다.
문서, 번들, React 앱 전체를 다시 시작할 필요는 없죠.

그래서 `useProducts`가 `refetch`를 반환하게 했습니다.
에러 화면의 버튼은 이 함수를 호출해요.

```ts
return {
  products,
  totalCount,
  isLoading,
  error,
  hasLoaded,
  refetch: () => setRefetchKey((key) => key + 1),
}
```

처음엔 refetch만 넣으면 끝이라고 생각했어요.
그런데 엣지가 하나 더 있었습니다.
URL에 `page=999`가 들어온 상태에서 totalCount가 24라면, 실제 마지막 페이지는 2입니다.
이때는 성공 응답을 받은 뒤 page를 2로 보정해야 하죠.

문제는 totalCount의 초기값이 0이라는 점이었어요.
응답이 오기 전에 totalPages가 1로 계산되면, page를 너무 빨리 1로 내려버릴 수 있습니다.
그래서 `hasLoaded`를 두고 성공 응답 이후에만 page 범위를 보정했어요.

```tsx
useEffect(() => {
  if (productsQuery.hasLoaded && page > pageInfo.totalPages) {
    changePage(pageInfo.totalPages)
  }
}, [changePage, page, pageInfo.totalPages, productsQuery.hasLoaded])
```

이 부분은 테스트가 아니었으면 놓쳤을 겁니다.
처음엔 out-of-range page만 보정하려 했어요. 그 보정이 에러 재시도 테스트를 깨뜨렸습니다.
두 동작이 서로 건드리는 지점을, 테스트가 대신 알려준 셈이죠.

> **포기한 것**: 실패하면 전체 새로고침하는 단순한 선택. 서버 상태 훅이 책임지는 범위 안에서 다시 요청하도록 했습니다.

## 검색어를 칠 때마다 요청이 나가고 있었습니다

여기까지가 경계를 나눈 이야기입니다.
그다음은 리뷰를 받고 나서 다시 손본 자리예요. 멘토가 짚어준 것 중 첫 번째가 검색이었습니다.

검색창에 "shoes"를 치면 요청이 다섯 번 나갔어요.
`s`, `sh`, `sho`, `shoe`, `shoes`. 글자 하나마다 API가 한 번씩 불립니다.
목업 서버라 티가 안 났을 뿐, 실제 API였으면 네 번은 버리는 요청이었죠.

원인은 하나였습니다.
검색어 상태 하나가 "화면에 보이는 값"과 "서버에 보낼 값"을 겸하고 있었어요.
입력창은 즉시 반응해야 하지만 요청은 손이 멈춘 뒤에 나가야 합니다. 둘은 같은 값이 아니었던 거죠.

그래서 입력값과 요청값을 나눴습니다.

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

입력창은 `searchQuery`를 그대로 씁니다. 즉시 보여야 하니까요.
요청과 URL과 하이라이트는 `debouncedSearchQuery`를 씁니다. 손이 300ms 멈춘 뒤의 값이에요.

> **포기한 것**: 입력이 곧 요청이라는 단순함. 대신 "보이는 값"과 "보내는 값"을 분리했습니다.

## 뒤로가기를 눌러도 목록이 그대로였습니다

두 번째로 걸린 건 뒤로가기였어요.
필터를 바꾸고 뒤로가기를 눌러도 화면이 안 돌아왔습니다.

원인을 따라가 보니, URL을 `replaceState`로만 쓰고 있었어요.
`replaceState`는 히스토리에 새 항목을 만들지 않습니다. 지금 항목을 덮어쓸 뿐이죠.
그러니 필터를 아무리 바꿔도 뒤로 갈 데가 없었던 겁니다.

그래서 두 가지를 나눴어요.
사용자가 필터나 페이지를 바꾸면 `pushState`로 히스토리에 쌓습니다.
첫 렌더나 page 보정처럼 사용자가 만든 이동이 아닌 경우엔 `replaceState`로 덮습니다.
그리고 `popstate`를 구독해서, 뒤로/앞으로 갈 때 URL을 읽어 상태를 복원했어요.

여기서 한 번 헛디뎠습니다.
디바운스와 뒤로가기가 엮이는 지점이 있었거든요.

검색어를 바꾸고 300ms가 지나기 전에 뒤로가기를 누르면 이렇게 됩니다.
popstate가 필터를 복원하면서 URL 동기화가 한 번 돕니다. 이때 "다음 동기화는 replace"라고 걸어둔 표시가 소비됩니다.
그런데 300ms 뒤에 밀려 있던 디바운스 값이 갱신되면서 동기화가 한 번 더 돕니다.
이번엔 표시가 이미 소비된 뒤라, `pushState`로 실행됩니다.
뒤로가기 한 번에 히스토리 항목이 하나 더 쌓이는 거죠.

이건 코드 리뷰에서 잡혔습니다.
고친 방식은 간단했어요. 디바운스가 진행 중이면, 즉 입력값과 요청값이 다르면 URL 동기화를 미룹니다.

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

디바운스가 끝난 뒤에만 URL을 갱신하니, replace 표시가 엉뚱한 타이밍에 소비되는 일이 사라졌어요.
혼자 짤 때는 이 순서를 못 봤습니다. 검색어를 바꾸고 바로 뒤로가기를 누르는 경로를, 손으로는 잘 안 밟게 되거든요.

> **포기한 것**: URL 쓰기를 하나의 effect로 뭉뚱그리는 편함. push와 replace를 나누고 디바운스 타이밍까지 같이 봐야 했습니다.

## 이전 요청은 응답만 버려지고 있었습니다

세 번째는 요청 취소였어요.
`useProducts`는 원래 `ignore` 플래그로 stale response를 막고 있었습니다.

```ts
let ignore = false
// ...
if (ignore) return   // 늦게 온 응답은 버린다
return () => { ignore = true }
```

멘토가 짚어준 건 여기였습니다.
`ignore`는 늦게 온 응답을 버릴 뿐, 요청 자체는 서버로 계속 나간다는 점이었어요.
필터를 빠르게 바꾸면 이전 요청들이 다 살아서 서버까지 갑니다. 결과만 안 쓸 뿐이죠.

그래서 `AbortController`로 바꿨습니다.
cleanup에서 `controller.abort()`를 부르면 진행 중이던 fetch가 실제로 끊깁니다.

```ts
useEffect(() => {
  const controller = new AbortController()

  const fetchProducts = async () => {
    setIsLoading(true)
    setError(null)
    setHasLoaded(false)

    try {
      const data = await getProducts({ /* ...params */ }, controller.signal)

      // fetch는 abort로 끊기지만 주입된 getProducts가 signal을 무시할 수도
      // 있으므로 늦게 온 응답도 여기서 한 번 더 버린다.
      if (controller.signal.aborted) return

      setProducts(data.products)
      setTotalCount(data.totalCount)
      setHasLoaded(true)
    } catch (err) {
      if (!controller.signal.aborted) setError(err as Error)
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }

  fetchProducts()

  return () => controller.abort()
}, [/* ...deps */])
```

`signal.aborted` 가드를 그대로 둔 이유가 있어요.
`useProducts`는 테스트를 위해 `getProducts`를 주입받게 되어 있습니다.
주입된 가짜 함수는 `signal`을 무시할 수 있거든요. 실제 요청은 abort로 끊되, 혹시 늦게 도착한 응답은 가드로 한 번 더 막았습니다.

여기서 멘토가 캐시와 포커스 리페치도 제안했어요.
그건 이번에 넣지 않았습니다.
자체 구현으로 stale-while-revalidate와 포커스 재요청까지 만들면, TanStack Query가 주는 것의 열화판을 손으로 짜는 셈이거든요.
단일 목록 화면 하나에서 거기까지 가면, 이번 문제보다 도구 설명이 더 커집니다.
지금은 손으로 서버 상태의 경계를 먼저 만들어 보고 캐시는 도구를 들일 때 같이 가져오기로 했어요.

> **포기한 것**: 요청 취소를 응답 폐기로 대신하는 편함. 그리고 캐시까지 직접 만드는 선택. 후자는 도구가 해결할 자리라고 선을 그었습니다.

## UI 컴포넌트는 어디까지 나눴을까요?

마지막으로 UI를 나눴습니다.
처음부터 UI를 안 나눈 이유는 간단해요.
API 호출, URL 상태, localStorage 동기화, 파생 계산이 한곳에 섞여 있었습니다.
그 상태에서 UI만 쪼개면 문제를 가릴 것 같았거든요.

상태와 통신 경계를 먼저 정한 뒤에 UI를 나누니 기준이 생겼습니다.

`ProductFilterPanel`은 필터 UI만 봅니다.
`ProductToolbar`에는 검색, 정렬, 보기 모드 UI가 있어요.
`ProductGrid`에서는 목록과 빈 상태를 처리합니다. `ProductCard`는 상품 하나를 그리고요.
페이지 버튼은 `ProductPagination`이 맡습니다.

페이지는 이렇게 읽힙니다.

```tsx
<ProductFilterPanel
  categories={CATEGORIES}
  category={category}
  minPrice={minPrice}
  maxPrice={maxPrice}
  inStockOnly={inStockOnly}
  onCategoryChange={handleCategoryChange}
  onMinPriceChange={filters.changeMinPrice}
  onMaxPriceChange={filters.changeMaxPrice}
  onInStockToggle={filters.changeInStockOnly}
  onResetFilters={handleResetFilters}
/>

<ProductToolbar
  searchQuery={searchQuery}
  sortBy={sortBy}
  sortOptions={SORT_OPTIONS}
  viewMode={viewMode}
  onSearchChange={filters.changeSearchQuery}
  onSortChange={filters.changeSortBy}
  onViewModeChange={setViewMode}
/>
```

이 정도면 페이지가 비어 있진 않습니다.
하지만 읽는 순서는 생겼어요.
상태와 서버 조회를 보고 싶으면 위쪽 훅 조합을 봅니다. 필터 UI가 궁금하면 `ProductFilterPanel`로 가면 되죠.
상품 카드의 배지와 가격 표시가 궁금하면 `ProductCard`로 갑니다.

> **포기한 것**: `Badge`, `PriceArea`, `RatingArea`까지 전부 쪼개는 선택. 지금은 재사용보다 탐색 비용이 더 크다고 봤습니다.

## 테스트는 무엇을 증명해야 했을까요?

이번 리팩터링에서 테스트가 "컴포넌트를 나눠도 렌더링된다"만 확인하면 부족했어요.
실제로 위험했던 건, 사용자가 눈으로 바로 못 보는 흐름이었습니다.

URL에서 초기 상태를 읽는지 확인했습니다.
검색어에 `.` 같은 정규식 특수문자가 들어와도 안 깨져야 하고요.
API 실패 뒤에는 전체 새로고침 없이 재요청해야 합니다.
URL page가 결과 범위를 벗어나면 마지막 페이지로 보정되어야 하죠.
가격 입력이 `NaN`으로 전파되지 않는지도 훅 테스트로 잠갔습니다.

AbortController를 넣을 때는 테스트 계약이 하나 바뀌었어요.
`fetch`에 `signal`이 붙으면서 호출 인자를 검증하던 테스트가 두 번째 인자를 마저 봐야 했습니다.
번거로워 보이지만 덕분에 "요청에 취소 신호가 실제로 실려 나가는지"까지 테스트가 잡게 됐죠.

마지막 검증은 단순했습니다.

```bash
pnpm test
pnpm lint
pnpm build
```

테스트는 39개까지 늘었어요.
숫자가 중요한 건 아닙니다.
다만 "어디를 고쳤는지"보다 "무엇이 다시 깨지면 안 되는지"가 남았다는 점이 중요했어요.

> **포기한 것**: 스냅샷으로 렌더링 결과를 크게 고정하는 선택. 이번에 중요한 건 DOM 모양 전체가 아니라, 상태와 서버 요청의 계약이었습니다.

## 결국 좋은 분리는 어디서 느껴질까요?

이 리팩터링 뒤에도 코드가 완벽해진 건 아닙니다.
`ProductCard` 안에는 아직 작은 표시 덩어리들이 남아 있어요.
실제 서비스라면 React Query 같은 서버 상태 도구를 검토할 순간도 오겠죠.

하지만 지금 단계에서는 일부러 하지 않았습니다.
목록 화면 하나에서 캐싱과 invalidate 전략까지 들고 오면, 이번 문제보다 도구 설명이 더 커지니까요.
먼저 손으로 서버 상태의 경계를 만들어 보는 게 맞다고 봤습니다.

돌아보면 리뷰가 잡아준 세 가지, 디바운스와 뒤로가기와 요청 취소는 다 같은 결이었어요.
경계는 나눴지만 그 경계를 실제로 밟는 사용자의 동선까지는 아직 안 따라가 봤던 겁니다.
혼자서는 검색어를 치자마자 뒤로가기를 누르지 않으니까요.

좋은 분리는 파일 개수에서 느껴지지 않았습니다.
질문이 생겼을 때 어디를 열어야 하는지가 빨리 떠오르는 쪽에 가까웠어요.

API query가 궁금하면 service를 봅니다.
필터가 page를 왜 1로 돌리는지 궁금하면 filter hook으로 갑니다.
URL 공유 링크가 왜 유지되는지는 URL util에 남겨뒀고요.
상품 카드의 배지 기준은 product rules와 card에 남겨뒀어요.

이번 리팩터링을 한 줄로 줄이면 이래요.
500줄을 작게 자른 게 아니라, 읽는 순서를 만들었습니다.

> **포기한 것**: 모든 문제를 한 번에 끝내는 선택. 대신 지금 화면에서 실제로 변경 이유가 갈라지는 지점만 나눴습니다.
