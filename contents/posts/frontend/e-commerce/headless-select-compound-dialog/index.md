---
title: "셀렉트를 세 벌 그렸지만 로직은 한 벌만 짰습니다"
date: 2026-07-10
update: 2026-07-24
tags:
  - front-end
  - e-commerce
  - react
  - next-js
  - design-pattern
---

**TL;DR**

이번 구현에서 중요한 건 headless와 compound라는 패턴 이름이 아니었다. 열림 상태, 하이라이트, 스크롤 잠금 같은 결정을 누가 쥐느냐였다.

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

컴포넌트가 결정을 덜 쥘수록 더 많은 생김새를 받아낸다. 대신 마크업의 자유는 접근성 책임도 사용처로 넘긴다. 이 경계는 마지막 절에서 다시 나온다.

## 옵션을 클릭했는데 클릭이 증발했다

데모 페이지에 셀렉트 세 개를 놓으니 실패가 눈에 보였다. 하나를 연 채로 다른 셀렉트를 클릭하면 둘 다 열려 있었다.

트리거의 blur에서 닫는 것으로 해결되는 문제다. 그런데 그 수정이 두 번째 실패를 만든다.
옵션을 클릭하는 순간 브라우저는 mousedown에서 트리거의 포커스를 먼저 뺏는다. blur 핸들러가 리스트를 닫는다. 클릭이 완성되기 전에 옵션 요소가 DOM에서 사라진다. 사용자가 보기에 클릭이 증발한다.

닫힘과 클릭이 같은 이벤트 순서 위에서 경쟁하고 있었다. 옵션의 mousedown에서 `preventDefault`를 걸어 포커스를 트리거에 붙잡아 두면 blur가 일어나지 않고 클릭이 살아남는다. blur 닫기와 mousedown 가드는 한 쌍이고 하나만 있으면 각자 다른 버그가 된다.

## 통지를 무시한 다이얼로그는 닫히지 않는다

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

이 setOpen은 상태 변경 함수가 아니다. controlled 모드에서는 아무 상태도 바꾸지 않고 onOpenChange로 의도를 통지한다. 부모가 그 통지를 무시하면 다이얼로그는 닫히지 않는다. Esc를 눌러도.

버그처럼 들리는 이 동작이 controlled의 정의다. 열림 상태의 진실이 부모에게 있다는 말은 닫힘도 부모의 결정이라는 뜻이다. "통지를 무시하면 닫히지 않는다"는 테스트가 하나 들어 있다. 컴포넌트가 내부 상태를 몰래 만들지 않는다는 증거다.

> **포기한 것**: Esc나 오버레이 클릭만은 컴포넌트가 직접 닫아주는 절충. 한 군데라도 컴포넌트가 몰래 상태를 쥐면 이중 API가 아니라 삼중 API가 된다.

## 다이얼로그 두 개가 스크롤을 영영 잠글 뻔했다

첫 구현의 스크롤 잠금은 인스턴스가 각자 기억하고 각자 복원했다. 열릴 때 `document.body.style.overflow`를 기억하고 hidden으로 바꾼다. 닫힐 때 기억한 값으로 되돌린다. 다이얼로그가 하나면 결함이 없다.

두 개를 열면 경로가 이렇다. A가 열리며 `''`를 기억한다. B가 열리며 `'hidden'`을 기억한다. Esc로 둘이 같이 닫히면 A가 `''`로 복원한 직후 B가 `'hidden'`을 다시 쓴다. 다이얼로그는 하나도 없는데 페이지 스크롤이 영구히 잠긴다. 닫는 순서가 반대면 열린 다이얼로그 뒤로 스크롤이 풀린다.

잠금은 전역 자원이라 관리도 전역이어야 한다. 참조 카운트가 그 소유자다.

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

첫 잠금이 원래 값을 기억하고 마지막 해제만 복원한다. 닫는 순서는 더 이상 결과에 관여하지 않는다.

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

`react/jsx-key`가 없었다. 버린 프리셋이 조용히 켜 주던 룰이라 교체와 함께 사라졌다. key 누락은 리스트 재정렬 때 상태가 엉뚱한 아이템에 붙는 프로덕션 버그다. 룰이 `**/*.{ts,tsx}`에만 걸려 있어 `.jsx` 파일은 검사 대상이 아니었다. 성능 룰이라고 error로 승격한 `no-html-link-for-pages`는 App Router에서 아무것도 검사하지 않는 죽은 룰이었다.

디폴트를 검토 없이 받지 말자고 시작한 작업이 검토 없이 버리다가 커버리지를 흘렸다. 잃어버린 룰은 복원되고 글롭은 `js,jsx,mjs`까지 넓어졌다. 수동 승격 대신 플러그인의 core-web-vitals 프리셋을 스프레드해서 프리셋이 업그레이드되면 승격 목록도 따라온다.
디폴트를 버릴 때는 버려지는 것의 목록을 확인해야 한다. 프리셋은 설정이 아니라 그 팀이 쌓은 실패의 목록이라서다.

## 사례들이 가리키는 것

실패들은 전부 같은 질문으로 돌아온다. 이 결정은 누가 쥐는 게 맞는가.

- 생김새는 사용처가 쥔다. 훅은 상태와 동작의 진실만 쥔다.
- controlled 다이얼로그의 열림은 부모가 쥔다. 컴포넌트는 의도를 통지할 뿐이다.
- 스크롤 잠금과 Esc 응답권은 인스턴스가 아니라 전역 하나가 쥔다.
- lint 커버리지는 프리셋이 아니라 그것을 버린 사람이 쥔다.

이 계약들은 테스트 45건이 지킨다. 품절 스킵, 경계 비순환, 통지 무시, 잠금 카운트, Esc 스택, IME 가드.
테스트는 공개 API로만 검증한다. prop getter와 상태만 쓰고 내부 인덱스 계산은 등장하지 않아서 상태 모델을 다시 갈아엎어도 테스트는 바뀌지 않는다.
도구의 한계는 테스트 안에 적혀 있다. "mousedown이 blur를 막아 클릭이 살아남는다"는 체인에서 jsdom이 검증하는 것은 preventDefault 호출까지다. 포커스가 실제로 움직이지 않는 것은 브라우저의 영역이다. 경계를 모르는 초록불이 제일 위험하다.

## 아직 해결하지 않은 범위

포커스 트랩과 ARIA는 이번 범위에서 제외됐다. compound 조립과 이중 API를 세우는 일과 DOM 엣지케이스 싸움은 결이 달라서 섞으면 둘 다 어중간해진다. 접근성 없이 이 다이얼로그를 실서비스에 내보낼 수는 없다. 그 작업이 다음 경계다.
잠금과 blur의 최종 검증은 실브라우저 E2E의 몫으로 남아 있다. jsdom의 초록불은 preventDefault까지만 실제다.
`settings.react.version`을 `'detect'`로 바꾸는 일은 plugin-react가 eslint 10에서 제거된 API를 호출하며 크래시해서 보류됐다. 버전은 명시 고정돼 있고 플러그인이 따라오면 되돌린다는 사유가 주석에 남아 있다.
