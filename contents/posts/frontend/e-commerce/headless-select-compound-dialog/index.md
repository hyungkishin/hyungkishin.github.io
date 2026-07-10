---
title: "셀렉트를 세 벌 그렸지만 로직은 한 벌만 짰습니다"
date: 2026-07-10
update: 2026-07-10
tags:
  - front-end
  - e-commerce
  - react
  - next-js
  - design-pattern
---

**TL;DR**

프로젝트 환경이 통째로 바뀌었습니다.
Vite로 쌓아온 커머스가 Next(App Router) 프로젝트로 교체됐어요. 그동안 만든 상품 목록도 이 전환과 함께 사라졌습니다.

그 위에서 두 가지 컴포넌트를 만들었습니다.
Select는 headless로, Dialog는 compound로요. 앞으로 커머스 전반에서 쓰일 디자인 시스템의 뼈대라, 라이브러리를 들이는 대신 패턴 자체를 직접 구현하기로 했습니다.

만들고 보니 두 패턴의 공통점이 하나 보였어요.
컴포넌트가 결정을 쥐지 않고, 사용처에 돌려주는 API 설계였습니다.
생김새는 사용처가 정하고(headless), 조립 순서도 사용처가 정합니다(compound).
컴포넌트가 책임지는 건 동작과 상태의 진실뿐이에요.

## 프로젝트가 사라졌을 때 무엇을 살렸을까요?

전환된 베이스를 당겨오니 머지 충돌이 스무 개 넘게 났습니다.
스택 전환이 결정되면서 베이스 저장소가 Vite 앱을 전부 지우고 Next 16 프로젝트로 갈아엎어졌거든요.
그동안 만든 `src/productList`, `src/market`이 전부 modify/delete 충돌로 걸렸습니다.

여기서 선택지는 둘이었어요.
기존 파일을 트리에 남겨두거나, 전환을 따라 지우거나.

지우는 쪽을 골랐습니다.
package.json에서 vite가 빠진 순간 기존 파일들은 빌드조차 안 되는 장식이 됩니다.
그리고 지난 작업은 git 히스토리와 이전 브랜치에 그대로 남아 있어요. 트리를 깨끗하게 유지하는 비용이 더 쌌습니다.

다만 하나는 살렸습니다. 품질 인프라요.
전환된 새 package.json에는 husky도 lint-staged도 prettier도 없었습니다.
프로젝트 초기에 세운 커밋 게이트가 머지 한 번에 사라지는 거죠.
그래서 충돌을 해결하면서 Next 구성 위에 게이트만 다시 올렸습니다.

> **포기한 것**: 그동안 만든 코드를 트리에 남기는 선택. 히스토리에 있는 코드를 작업 트리에 두는 건 보존이 아니라 미련이라고 봤습니다.

## 스캐폴딩이 깔아준 ESLint는 왜 그대로 두지 않았을까요?

create-next-app이 깔아주는 `eslint-config-next`는 잘 만든 설정입니다.
그런데 "잘 만들어서 그대로 쓴다"와 "왜 이 룰이 켜져 있는지 안다"는 다른 상태예요.
Vite 시절 룰 하나하나 레벨 근거를 달아가며 세운 flat config가 있으니, 그걸 Next로 이식했습니다.

이식하면서 두 가지를 정리했어요.
react-refresh 플러그인은 지웠습니다. Vite HMR 전용이라 Next에선 죽은 룰이거든요.
Next 전용 룰(`@next/eslint-plugin-next`)은 새로 들였습니다. `<a>`로 내부 이동을 하면 풀 리로드가 나는 것처럼, 프레임워크 계약 위반은 프레임워크 저자가 제일 잘 아니까요.

게이트도 재검증했습니다.
일부러 `any`와 `console.log`가 든 파일을 스테이징하고 커밋을 시도했어요.
pre-commit이 두 룰 위반으로 커밋을 막는 걸 확인하고 파일을 지웠습니다.
"설정을 옮겼다"와 "게이트가 실제로 막는다"는 다른 얘기라서요.

그런데 이 커밋을 리뷰에 올리니 구멍이 셋 나왔습니다.

첫째, 제 config에는 `react/jsx-key`가 없었어요.
`eslint-config-next`가 조용히 켜주던 룰이었는데, 교체하면서 같이 사라진 겁니다.
key 누락은 리스트가 재정렬될 때 상태가 엉뚱한 아이템에 붙는 프로덕션 버그라, 이게 빠진 채로 게이트를 통과하고 있었어요.

둘째, 룰을 전부 `**/*.{ts,tsx}`에만 걸어놔서 `.jsx` 파일은 아예 검사 대상이 아니었습니다.
누가 `.jsx`로 파일을 만들면 훅 규칙도 console 금지도 전부 우회됩니다.

셋째, 성능 룰이라고 error로 승격한 `no-html-link-for-pages`는 App Router에선 아무것도 검사하지 않는 룰이었어요.
pages 디렉토리만 보는 룰이거든요. 막고 있다고 믿는 게이트가 실제로는 비어 있었던 겁니다.

디폴트를 검토 없이 받지 말자고 시작한 작업이, 검토 없이 버리다가 커버리지를 흘린 셈이죠.
잃어버린 룰을 복원하고, 글롭을 `js,jsx,mjs`까지 넓히고, 수동 승격 대신 플러그인이 제공하는 core-web-vitals 프리셋을 스프레드하는 걸로 고쳤습니다.
프리셋이 업그레이드되면 승격 목록도 따라오도록요.

하나는 계획대로 안 됐습니다.
`settings.react.version`을 `'detect'`로 바꾸려 했는데, eslint 10에서 plugin-react가 제거된 API를 호출하며 크래시했어요.
플러그인의 peer 범위가 아직 eslint 9까지라는 걸 리뷰가 미리 경고했는데, 실제로 터진 자리였습니다.
버전을 명시 고정하고, 플러그인이 따라오면 되돌리기로 사유를 주석에 남겼어요.

> **포기한 것**: 디폴트 설정을 통째로 신뢰하는 편함과, 통째로 버리는 편함. 버릴 때는 버려지는 게 뭔지 목록으로 확인해야 했습니다.

## Select는 왜 화면을 하나도 안 그렸을까요?

이번 Select는 요구 조건이 특이했습니다.
사이즈 선택, 썸네일 달린 상품 옵션, 무료배송 배지가 붙은 묶음 옵션.
화면마다 생김새가 완전히 다른 셀렉트 세 개가 필요했어요. 로직은 한 벌로요.

컴포넌트로 만들면 이 조건을 못 맞춥니다.
마크업을 컴포넌트가 쥐는 순간, 세 가지 생김새는 세 가지 prop 분기가 되거든요.
`variant="thumbnail"` 같은 prop이 늘어나는 방향은 네 번째 생김새에서 무너집니다.

그래서 훅으로 만들었습니다. 상태와 prop getter만 노출해요.

```ts
return {
  isOpen,
  highlightedIndex,
  getToggleProps: () => ({ ... }),   // 트리거 버튼에 스프레드
  getOptionProps: (index) => ({ ... }),  // 각 옵션 요소에 스프레드
  getOptionState: (index) => ({ selected, highlighted, disabled }),
}
```

마크업은 사용처가 `<div>`/`<ul>`로 직접 그립니다.
훅은 어떤 옵션이 selected인지, highlighted인지, disabled인지만 알려줘요.
그걸 굵게 표시할지, 주황 테두리를 두를지, 반투명으로 깔지는 전부 사용처의 판단입니다.

value 설계는 사용처의 요구에서 답이 나왔습니다. 문자열이 아니라 옵션 객체 전체요.

```ts
const select = useSelect({
  items: BUNDLE_OPTIONS,
  value: selectedBundle,
  onChange: setSelectedBundle,   // 객체 전체가 돌아온다
  getItemId: (bundle) => bundle.id,
  isItemDisabled: (bundle) => bundle.soldOut,
})

// 선택된 "객체"에서 렌더 중 계산한다.
const totalWithShipping = selectedBundle
  ? selectedBundle.price + (selectedBundle.freeShipping ? 0 : SHIPPING_FEE)
  : null
```

`onChange`가 `'b1'` 같은 id만 돌려주면, 사용처는 가격을 계산하려고 배열을 다시 뒤져야 합니다.
객체가 통째로 돌아오니 개당가와 배송비가 파생값으로 바로 계산돼요.

품절 처리에서 경계를 한 번 그었습니다.
훅은 "품절"을 모릅니다. `isItemDisabled` 콜백으로 판단을 사용처에서 받아요.
훅이 책임지는 건 disabled면 키보드 이동에서 건너뛰고 선택을 막는 동작뿐입니다.
재고가 0이면 품절이라는 건 도메인 지식이고, 그건 훅 밖의 일이니까요.

> **포기한 것**: 마크업까지 제공하는 친절함. headless의 값어치는 컴포넌트가 덜 아는 데서 나왔습니다.

## 상태 두 개가 리뷰에서 union 하나로 바뀌었습니다

처음 구현은 상태가 두 개였어요.

```ts
const [isOpen, setIsOpen] = useState(false)
const [highlightedIndex, setHighlightedIndex] = useState(-1)
```

동작은 했습니다. 그런데 리뷰가 이렇게 짚었어요.
하이라이트는 열려 있을 때만 의미가 있는 값인데, 두 상태를 따로 두면 "닫혔는데 하이라이트가 남은 상태"가 타입상 표현 가능하다고요.
지금은 open과 close가 두 setState를 짝지어 부르는 규율로 정합성이 유지되지만, 나중에 `setIsOpen(false)`만 부르는 코드 경로가 하나 생기면 유령 하이라이트가 렌더된다는 겁니다.

그래서 union으로 합쳤습니다.

```ts
// 하이라이트는 열려 있을 때만 존재한다 — 닫힘+하이라이트 조합을 타입으로 봉쇄한다.
type OpenState = { isOpen: false } | { isOpen: true; highlightedIndex: number }
```

불가능한 상태는 규율로 막는 것보다 표현이 안 되게 만드는 쪽이 쌉니다.
같은 리뷰에서 엣지가 두 개 더 나왔어요.

열려 있는 동안 items가 줄어들면(refetch로 옵션이 5개에서 3개가 되면) 하이라이트 인덱스가 범위 밖에 좌초해서, 위아래 키가 전부 무반응이 됐습니다.
렌더 중에 인덱스를 클램프하는 걸로 고쳤어요.

그리고 전 옵션이 품절이면 Enter가 조용한 no-op이었습니다.
열 수는 있는데 선택할 게 없으니, Enter를 눌러도 아무 일도 안 일어나요.
네이티브 select는 이때 닫힙니다. 같은 동작으로 맞췄습니다.

데모 페이지에서만 보이는 문제도 하나 있었죠.
셀렉트 세 개를 한 페이지에 놓으니, 하나를 연 채로 다른 걸 클릭하면 둘 다 열려 있었습니다.
트리거의 blur에서 닫는 걸로 해결했는데, 여기 함정이 하나 있어요.
옵션을 클릭하는 순간 트리거가 먼저 blur되면서 리스트가 닫히고, 클릭이 증발합니다.
옵션의 mousedown에서 `preventDefault`를 걸어 포커스를 트리거에 붙잡아두는 게 짝으로 필요했습니다.

> **포기한 것**: 키보드 이동을 끝에서 처음으로 순환시키는 선택. 경계에서 멈추는 쪽이 "더 갈 데가 없다"는 신호를 주고, 구현도 단순했습니다.

## Dialog에서 이중 API의 알맹이는 어디였을까요?

Dialog는 compound로 조립했습니다.
`Dialog.Trigger`, `Dialog.Overlay`, `Dialog.Content`, `Dialog.Title`, `Dialog.Description`, `Dialog.Close`.
조각들은 Context에서 열림 상태를 읽고, 조립 순서는 사용처가 정해요.

이번 구현의 알맹이는 조각보다 이중 API였습니다.
controlled와 uncontrolled를 open prop의 "유무"로 판별하는 부분이요.

```ts
const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)

const isControlled = controlledOpen !== undefined
const open = isControlled ? controlledOpen : uncontrolledOpen

const setOpen = (next: boolean) => {
  // controlled면 상태를 직접 바꾸지 않는다 — 변경 "의도"만 부모에게 통지한다.
  if (!isControlled) setUncontrolledOpen(next)
  onOpenChange?.(next)
}
```

핵심은 setOpen이 상태 변경 함수가 아니라는 점이에요.
controlled 모드에서 setOpen은 아무 상태도 바꾸지 않습니다. onOpenChange로 의도를 통지할 뿐이죠.
부모가 그 통지를 무시하면 다이얼로그는 안 닫힙니다. Esc를 눌러도요.

이게 버그처럼 들리면 controlled의 정의를 다시 보게 됩니다.
열림 상태의 진실이 부모에게 있다는 건, 닫힘도 부모의 결정이라는 뜻이에요.
"통지를 무시하면 안 닫힌다"는 테스트를 일부러 하나 넣었습니다. 내부 상태를 안 만든다는 증거로요.

> **포기한 것**: Esc나 오버레이 클릭만은 컴포넌트가 직접 닫아주는 절충. 한 군데라도 컴포넌트가 몰래 상태를 쥐면 이중 API가 아니라 삼중 API가 됩니다.

## 다이얼로그 두 개가 스크롤을 영영 잠글 뻔했습니다

첫 구현의 스크롤 잠금은 이랬어요.
열릴 때 `document.body.style.overflow`를 기억해두고 hidden으로 바꾸고, 닫힐 때 기억해둔 값으로 복원합니다.
다이얼로그가 하나면 완벽하게 동작합니다.

리뷰가 두 개를 열었습니다.
A가 열리면서 `''`를 기억하고, B가 열리면서 `'hidden'`을 기억해요.
이제 Esc로 둘이 같이 닫히면, A가 `''`로 복원한 직후 B가 `'hidden'`을 다시 써버립니다.
다이얼로그는 하나도 없는데 페이지 스크롤이 영구히 잠기는 거죠.
닫는 순서가 반대면 이번엔 열린 다이얼로그 뒤로 스크롤이 풀리고요.

인스턴스가 각자 기억하고 각자 복원하는 구조 자체가 문제였습니다.
잠금은 전역 자원이라, 관리도 전역이어야 했어요. 참조 카운트로 바꿨습니다.

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

첫 잠금이 원래 값을 기억하고, 마지막 해제만 복원합니다. 닫는 순서는 이제 상관없어요.

Esc도 같은 결의 문제였습니다.
열린 Content마다 document에 keydown 리스너를 달았더니, Esc 한 번에 모든 다이얼로그가 동시에 닫혔어요.
다이얼로그 위에 "변경사항을 버릴까요?" 확인 다이얼로그를 띄우는 흐름을 생각하면, Esc는 맨 위 하나만 닫아야 합니다.
열린 순서대로 스택에 쌓고, 맨 위일 때만 반응하게 했어요.

하나 더, 한국 서비스라서 그냥 못 넘어가는 게 있었습니다.
한글을 입력하다 조합을 취소하려고 Esc를 누르면, 브라우저는 `isComposing: true`인 keydown을 먼저 보냅니다.
이걸 거르지 않으면 조합만 취소하려던 사용자의 다이얼로그가 통째로 닫혀요. 입력하던 내용과 함께요.

```ts
if (event.key !== 'Escape') return
// 한글 IME 조합 취소 Esc가 다이얼로그까지 닫으면 안 된다.
if (event.isComposing) return
```

> **포기한 것**: 포커스 트랩과 ARIA. 이번 범위에서 의도적으로 제외했습니다. compound 조립과 이중 API를 세우는 일과 DOM 엣지케이스 싸움은 결이 달라서, 섞으면 둘 다 어중간해진다고 봤어요.

## 테스트는 다시 왜 필요해졌을까요?

프로젝트가 교체되면서 vitest도 함께 사라졌습니다.
테스트 대상 코드가 전부 지워졌으니, 그 시점엔 하네스만 남기는 게 무의미했거든요.

그런데 이번에 쌓인 게 전부 상호작용 로직이었습니다.
품절 스킵, 경계 비순환, 이중 API, 잠금 카운트, Esc 스택.
그리고 리뷰 두 라운드에서 나온 결함이 전부 "행동" 버그였어요.
이런 버그는 고쳐도, 회귀 테스트로 고정하지 않으면 다음 리팩터링에서 다시 태어납니다.

그래서 vitest를 다시 들였습니다.
Jest + next/jest도 후보였지만 next/image나 라우터 목킹처럼 Next 특화가 필요한 테스트가 없어서 이점이 없었고, Playwright는 이 단계엔 과했어요.

테스트는 45개를 넣었는데, 개수보다 지킨 원칙 두 개가 남았습니다.

하나는 공개 API로만 검증하기입니다.
useSelect 테스트는 prop getter와 상태만 씁니다. 내부의 인덱스 계산이나 스택 배열은 건드리지 않아요.
union으로 상태를 갈아엎었을 때 테스트가 한 줄도 안 바뀌었는데, 그게 이 원칙의 배당금이었습니다.

다른 하나는 도구의 한계를 테스트에 적어두기입니다.
"옵션 mousedown이 blur를 막아서 클릭이 살아남는다"는 체인에서, jsdom이 검증할 수 있는 건 preventDefault가 호출됐다는 사실까지예요.
포커스가 실제로 안 움직이는지는 진짜 브라우저의 영역입니다.

```ts
it('옵션 mousedown은 preventDefault된다 — blur 닫힘이 클릭을 증발시키지 않도록', () => {
  // jsdom 한계: "blur가 안 일어난다"는 창발 행동은 브라우저 몫이고,
  // 여기선 그 전제인 preventDefault 메커니즘까지만 검증한다.
  const notPrevented = fireEvent.mouseDown(screen.getByTestId('option-a'))
  expect(notPrevented).toBe(false)
})
```

테스트가 주는 확신에도 경계가 있고, 그 경계를 모르는 초록불이 제일 위험하다고 봤어요.

> **포기한 것**: 실브라우저 E2E까지 지금 세우는 선택. 잠금과 blur의 최종 검증은 서비스로 갈 때 Playwright 스모크로 미뤘습니다.

## 두 패턴은 결국 같은 이야기였습니다

headless와 compound를 나란히 만들고 나니, 서로 다른 패턴이 아니라 같은 태도의 두 표현이었습니다.

Select 훅은 생김새를 모릅니다. 상태만 돌려주고 스타일 판단은 사용처가 해요.
Dialog는 조립을 모릅니다. 조각만 주고 배치는 사용처가 해요.
controlled 모드의 Dialog는 심지어 자기 상태도 모릅니다. 의도만 통지하고 결정은 부모가 해요.

셋 다 컴포넌트가 결정을 덜 쥐는 방향입니다.
그리고 재미있게도, 이번 전환 내내 반대편에서 같은 교훈을 배웠어요.
ESLint 디폴트를 버릴 때 커버리지를 흘린 것도, 스크롤 잠금을 인스턴스가 각자 쥐고 있던 것도, 결정의 소유자를 잘못 잡은 문제였으니까요.

설정이든 컴포넌트든 한 줄로 줄이면 이렇습니다.
이 결정은 누가 쥐는 게 맞는지부터 정하고, 나머지는 그 결정을 배신하지 않게 만드는 일이었어요.

> **포기한 것**: 세 벌의 셀렉트 UI에 반복되는 버튼 리셋 스타일을 공용 상수로 빼는 선택. 생김새는 사용처가 전부 소유한다는 데모의 취지가, 30줄의 중복보다 비쌌습니다.
