---
title: "셀렉트를 세 벌 그렸지만 로직은 한 벌만 짰습니다"
description: "다이얼로그를 두 개 띄웠다가 하나만 닫았다. 남은 창이 스크롤을 계속 잠가야 할 때, 열고 닫는 상태는 누가 맡아야 할까?"
date: 2026-07-10
update: 2026-11-14
tags:
  - front-end
  - e-commerce
  - react
  - next-js
  - design-pattern
---

셀렉트를 세 가지 모양으로 그려도 키보드로 다음 항목을 가리키는 동작은 같다. 다이얼로그 두 개를 겹쳐 열 때에는 하나를 닫아도 남은 창이 스크롤을 잠그고 있어야 한다. 두 컴포넌트에서 함께 쓰는 동작과 화면에 맡길 결정을 나눴다.

소유자가 정해지면 구조가 따라온다. 셀렉트 훅은 상태와 동작만 주고 생김새는 사용처가 그린다. controlled 다이얼로그는 변경 의도만 통지하고 결정은 부모가 한다. 스크롤 잠금은 인스턴스가 아니라 전역 카운트가 쥔다.
이 글은 소유자가 잘못 잡혔을 때 생기던 실패들을 다룬다. 닫혔는데 남아 있는 하이라이트, 증발하는 클릭, 영영 잠기는 스크롤, 비어 있던 lint 게이트.

배경은 짧게 한 줄이다. 베이스 저장소가 Vite에서 Next(App Router)로 갈아엎어지면서 기존 산출물이 사라졌고 그 위에 커머스 디자인 시스템의 뼈대가 될 Select와 Dialog를 라이브러리 없이 세웠다.

## 닫힌 셀렉트에 하이라이트가 남는 상태는 왜 존재했나

첫 구현의 셀렉트 상태는 두 개였다.

```ts
const [isOpen, setIsOpen] = useState(false)
const [highlightedIndex, setHighlightedIndex] = useState(-1)
```

동작에는 문제가 없었다. 이 구조의 실패는 관찰된 버그가 아니라 리뷰에서 지적된 경로다.
하이라이트는 열려 있을 때만 의미가 있는 값인데 두 상태를 따로 두면 "닫혔는데 하이라이트가 남은 상태"가 타입상 표현 가능하다. 지금은 open과 close가 두 setState를 짝지어 부르는 규율로 정합성이 유지되지만 `setIsOpen(false)`만 부르는 코드 경로가 하나 생기는 순간 남은 하이라이트가 다음 열기에서 그대로 렌더된다.

union으로 합치면 그 경로 자체가 사라진다.

```ts
// 하이라이트는 열려 있을 때만 존재한다. 닫힘과 하이라이트의 조합을 타입으로 봉쇄한다.
type OpenState = { isOpen: false } | { isOpen: true; highlightedIndex: number }
```

불가능한 상태는 규율로 막는 것보다 표현이 안 되게 만드는 쪽이 싸다. 규율은 다음 사람이 어기는 순간 끝난다.
다만 타입이 막는 것은 상태의 조합까지다. 런타임 엣지는 남는다. 열려 있는 동안 refetch로 items가 5개에서 3개로 줄면 하이라이트 인덱스가 범위 밖에 남아 방향키가 무반응이 된다. 렌더 중 클램프가 그 자리를 막는다. 전 옵션이 품절이라 선택할 것이 없으면 Enter는 네이티브 select처럼 닫기로 동작한다.

## 셀렉트 세 벌은 왜 컴포넌트가 아니라 훅이 됐나

요구는 생김새가 완전히 다른 셀렉트 세 개였다. 사이즈 선택, 썸네일 달린 상품 옵션, 무료배송 배지가 붙은 묶음 옵션. 로직은 한 벌로.

마크업을 컴포넌트가 쥐면 세 생김새는 세 prop 분기가 된다. `variant="thumbnail"` 같은 prop이 늘어나는 구조는 생김새가 하나 늘 때마다 컴포넌트를 고쳐야 한다.
그래서 화면을 모르는 훅이 됐다. 상태와 prop getter만 나간다.

```ts
return {
  isOpen,
  highlightedIndex,
  getToggleProps: () => ({ ... }),      // 트리거 버튼에 스프레드
  getOptionProps: (index) => ({ ... }), // 각 옵션 요소에 스프레드
  getOptionState: (index) => ({ selected, highlighted, disabled }),
}
```

마크업은 사용처가 그린다. 훅은 어떤 옵션이 selected인지, disabled인지만 안다. 그걸 굵게 표시할지 반투명으로 깔지는 전부 사용처의 판단이다.

onChange가 돌려주는 값은 id가 아니라 옵션 객체 전체다. id만 돌아오면 사용처는 가격을 계산하려고 배열을 다시 뒤진다. 객체가 통째로 돌아오면 개당가와 배송비가 렌더 중 파생값으로 바로 계산된다.
품절 판단도 훅 밖의 일이다. 재고가 0이면 품절이라는 건 도메인 지식이라 `isItemDisabled` 콜백으로 사용처에서 받는다. 훅이 책임지는 것은 disabled면 키보드 이동에서 건너뛰고 선택을 막는 동작뿐이다.

같은 훅을 쓰면서 화면마다 태그와 모양을 다르게 정할 수 있다. 어떤 태그를 쓰고 접근성 속성을 어디에 붙일지도 화면을 만드는 쪽에서 정해야 한다.

## 옵션을 선택하기 전에 목록이 닫혔다

데모 페이지에 셀렉트 세 개를 놓으니 실패가 눈에 보였다. 하나를 연 채로 다른 셀렉트를 클릭하면 둘 다 열려 있었다.

트리거의 blur에서 닫는 것으로 해결되는 문제다. 그런데 그 수정이 두 번째 실패를 만든다.
옵션을 누르면 먼저 `mousedown`이 발생하고 트리거에서 포커스가 빠진다. 이때 실행된 `blur` 핸들러가 목록을 닫았다. 뒤이어 `click`이 발생할 때는 이미 옵션 요소가 DOM에 없어서 선택이 안 됐다.

옵션의 `mousedown`에서 `preventDefault()`를 호출해 포커스가 트리거에 남도록 했다. 이제 옵션을 누르면 선택되고, 바깥으로 포커스를 옮기면 `blur`에서 목록이 닫힌다.

## 부모에서 open 값을 바꿔야 닫히는 다이얼로그

Dialog는 compound로 조립된다. Trigger, Overlay, Content, Title, Close가 Context에서 열림 상태를 읽고 배치는 사용처가 정한다.
알맹이는 조각이 아니라 이중 API다. controlled와 uncontrolled를 open prop의 유무로 판별한다.

```ts
const isControlled = controlledOpen !== undefined
const open = isControlled ? controlledOpen : uncontrolledOpen

const setOpen = (next: boolean) => {
  // controlled면 상태를 직접 바꾸지 않는다. 변경 의도만 부모에게 통지한다.
  if (!isControlled) setUncontrolledOpen(next)
  onOpenChange?.(next)
}
```

controlled 모드에서 `setOpen(false)`를 호출해도 내부 상태는 바뀌지 않는다. `onOpenChange(false)`를 받은 부모가 `open` 값을 바꿔야 닫힌다. Esc를 눌러도 마찬가지다.

테스트에서는 부모가 그 값을 그대로 두게 했다. 이때 다이얼로그가 열린 채로 남아야 한다. Esc나 오버레이 클릭만 예외로 두면 같은 `open` 값에서도 보이는 상태가 달라진다.

## 다이얼로그 두 개를 닫았는데 스크롤이 안 됐다

처음에는 다이얼로그마다 열기 직전의 `document.body.style.overflow` 값을 저장했다. 열린 동안에는 `hidden`으로 바꾸고 닫을 때 저장한 값을 복원했다. 하나만 띄우면 잘 됐다.

A를 열기 직전 값은 `''`이고, 그 위에 B를 열기 직전 값은 이미 `'hidden'`이다. Esc로 두 개가 함께 닫힐 때 A가 먼저 복원하고 B가 뒤이어 `'hidden'`을 쓰면 창을 다 닫아도 스크롤이 안 된다.

반대로 A만 먼저 닫으면 B가 아직 떠 있는데도 배경이 스크롤된다.

두 창이 바꾸는 값은 같은 `document.body.style.overflow`다. 열린 창 수를 한 곳에서 세도록 고쳤다.

```ts
let scrollLockCount = 0
let bodyOverflowBeforeLock = ''

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLockCount += 1
}

function unlockBodyScroll() {
  scrollLockCount -= 1
  if (scrollLockCount === 0) {
    document.body.style.overflow = bodyOverflowBeforeLock
  }
}
```

첫 창을 열 때 원래 값을 한 번 저장하고, 마지막 창을 닫을 때만 복원한다. 어느 창을 먼저 닫아도 배경은 계속 잠겨 있다.

Esc도 같은 소유권 문제였다. 열린 Content마다 document에 keydown 리스너를 달면 Esc 한 번에 모든 다이얼로그가 동시에 닫힌다. 확인 다이얼로그를 겹쳐 띄우는 흐름에서 Esc는 맨 위 하나만 닫아야 한다. 열린 순서의 스택이 그 결정을 쥔다.
한글 입력에는 단계가 하나 더 있다. 조합을 취소하는 Esc는 `isComposing: true`인 keydown을 먼저 보낸다. 이걸 거르지 않으면 조합만 취소하려던 사용자의 다이얼로그가 입력 내용과 함께 닫힌다.

```ts
if (event.key !== 'Escape') return
// 한글 IME 조합 취소 Esc가 다이얼로그까지 닫으면 안 된다.
if (event.isComposing) return
```

전역 자원의 상태는 인스턴스가 아니라 전역 하나가 쥔다. 스크롤도 Esc 응답권도 같은 규칙이다.

## lint 게이트는 비어 있었다

컴포넌트 밖에서도 소유권 문제가 하나 터졌다. 스택 전환 때 create-next-app의 `eslint-config-next`를 버리고 직접 세운 flat config를 이식했는데 리뷰에서 게이트의 구멍 셋이 나왔다.

`react/jsx-key`가 없었다. 버린 프리셋이 조용히 켜 주던 룰이라 교체와 함께 사라졌다. key 누락은 리스트 재정렬 때 상태가 엉뚱한 아이템에 붙는 프로덕션 버그다. 룰이 `**/*.{ts,tsx}`에만 걸려 있어 `.jsx` 파일은 검사 대상이 아니었다. 성능 룰이라고 error로 승격한 `no-html-link-for-pages`는 App Router에서 검사를 수행하지 않는 규칙이었다.

디폴트를 검토 없이 받지 말자고 시작한 작업이 검토 없이 버리다가 커버리지를 흘렸다. 잃어버린 룰은 복원되고 글롭은 `js,jsx,mjs`까지 넓어졌다. 수동 승격 대신 플러그인의 core-web-vitals 프리셋을 스프레드해서 프리셋이 업그레이드되면 승격 목록도 따라온다.
디폴트를 버릴 때는 버려지는 것의 목록을 확인해야 한다. 프리셋은 설정이 아니라 그 팀이 쌓은 실패의 목록이라서다.

## 사례들이 가리키는 것

실패들은 전부 같은 질문으로 돌아온다. 이 결정은 누가 쥐는 게 맞는가.

- 화면 표현은 사용처에서 정한다. 훅은 상태와 동작만 관리한다.
- controlled 다이얼로그의 열림은 부모가 쥔다. 컴포넌트는 의도를 통지할 뿐이다.
- 스크롤 잠금과 Esc 응답권은 인스턴스가 아니라 전역 하나가 쥔다.
- lint 커버리지는 프리셋이 아니라 그것을 버린 사람이 쥔다.

이 계약들은 테스트 45건이 지킨다. 품절 스킵, 경계 비순환, 통지 무시, 잠금 카운트, Esc 스택, IME 가드.
테스트는 공개 API로만 검증한다. prop getter와 상태만 쓰고 내부 인덱스 계산은 등장하지 않아서 상태 모델을 다시 갈아엎어도 테스트는 바뀌지 않는다.
도구의 한계는 테스트 안에 적혀 있다. "mousedown이 blur를 막아 클릭 이벤트가 처리된다"는 체인에서 jsdom이 검증하는 것은 preventDefault 호출까지다. 포커스가 실제로 움직이지 않는 것은 브라우저의 영역이다. 테스트가 통과해도 실제 포커스 동작은 브라우저에서 별도로 확인해야 한다.

## 아직 해결하지 않은 범위

포커스 트랩과 ARIA는 이번 범위에서 제외됐다. compound 조립과 이중 API를 세우는 일과 DOM 엣지케이스 싸움은 결이 달라서 섞으면 둘 다 어중간해진다. 접근성 없이 이 다이얼로그를 실서비스에 내보낼 수는 없다. 그 작업이 다음 경계다.
잠금과 blur의 최종 검증은 실브라우저 E2E의 몫으로 남아 있다. jsdom의 초록불은 preventDefault까지만 실제다.
`settings.react.version`을 `'detect'`로 바꾸는 일은 plugin-react가 eslint 10에서 제거된 API를 호출하며 크래시해서 보류됐다. 버전은 명시 고정돼 있고 플러그인이 따라오면 되돌린다는 사유가 주석에 남아 있다.
