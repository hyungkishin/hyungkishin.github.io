---
title: "finalPrice가 useState 초기값으로 잡혀 있었다"
description: "가격 표시와 주문 화면에 흩어졌던 할인 계산을 따라가며 최종 금액이 어디서 결정되는지 확인했다."
date: 2026-06-26
update: 2026-11-15
tags:
  - front-end
  - e-commerce
  - react
  - typescript
  - refactoring
---

체크아웃에서 배송지를 도서산간 주소로 바꾸면 배송비가 붙는다. 그런데 결제 버튼에 처음 금액이 그대로 남아 있다면 어디부터 봐야 할까? 버튼으로 넘어오는 `finalPrice`를 따라갔다.

## 최종 금액이 한 곳에서 결정되지 않았다

체크아웃 화면은 원래 길다. 상품, 배송지, 쿠폰, 포인트, 결제 수단, 약관이 한 파일에 있었고 컴포넌트부터 나누고 싶어지는 모양새였다.

`finalPrice`를 찾은 곳은 `useState`의 초기값이었다. 첫 렌더 때 상품 합계와 배송비, 쿠폰, 포인트를 반영한 금액이 거기 저장됐다.
처음 화면을 띄웠을 때는 금액이 맞았다. 문제는 배송지나 쿠폰을 바꾼 뒤였다. 도서산간 주소를 고르면 배송비 3,000원이 붙고 쿠폰을 적용하면 결제 버튼에 표시할 금액이 줄어야 한다. 적립금까지 쓰면 주문 완료 화면에도 그 금액이 나와야 한다.

![배송지를 섬 주소로 바꾸자 배송비 3,000원이 붙었다. 결제 버튼의 금액은 바꾸기 전과 그대로다.](./scene-stale-pay-button.webp)

처음 저장한 `finalPrice`는 그대로였다. 첫 화면의 가격만 확인했다면 이 오류를 놓쳤을 것이다.

계산을 별도 함수로 분리하고 입력이 바뀔 때마다 호출하면 저장된 금액이 갱신되지 않는 문제를 막을 수 있다. 계산 함수는 UI에 의존하지 않고 장바구니, 배송지, 회원, 쿠폰, 포인트 사용 여부를 받아 요약값을 반환한다.

```ts
export type CheckoutSummary = {
  itemTotal: number
  shippingFee: number
  couponDiscount: number
  memberDiscount: number
  pointDiscount: number
  finalPrice: number
}
```

```ts
const payableBeforePoint = Math.max(
  0,
  itemTotal + shippingFee - couponDiscount - memberDiscount,
)

const pointDiscount = usePoint
  ? Math.min(Math.max(0, pointInput), member.point, payableBeforePoint)
  : 0
```

쿠폰으로 이미 결제액이 0원이 됐다면 포인트를 더 쓸 수 있을까? 위 코드에서 `payableBeforePoint`가 0이면 `pointInput`에 얼마를 넣든 `pointDiscount`도 0원이 된다.

이제 결제 버튼에 넘길 금액은 구했다. 그 옆에 쿠폰으로 얼마를 뺐는지 보여 주는 곳은 `OrderLineRow`였다.

## 쿠폰 라인에 썸네일을 넘길 수 있었다

`OrderLineRow`는 이름만 보면 주문 금액 한 줄을 그리는 컴포넌트다. 실제로는 상품이면 썸네일과 옵션과 수량, 배송비면 라벨과 금액, 쿠폰이면 쿠폰 코드, 할인이면 마이너스 표시까지 전부 한 컴포넌트가 받았다.

```tsx
<OrderLineRow
  type="coupon"
  label="쿠폰 할인"
  amount={couponDiscount}
  couponCode={coupon.code}
  isDiscount
/>
```

이 인터페이스에서는 필요 없는 props도 항상 열려 있다. 상품 라인이 아닌데 `thumbnail`을 넘길 수 있고 쿠폰 라인이 아닌데 `couponCode`를 넘길 수 있다. `isDiscount`를 빠뜨리면 할인인데 빨간색도 마이너스 표시도 붙지 않는다. 타입이 막지 않는 조합은 전부 사람의 기억이 막아야 한다.

그래서 주문 내역 한 줄에 어떤 값을 넘길 수 있는지 종류별로 적었다.

```ts
export type ProductOrderLine = {
  kind: 'product'
  id: string
  label: string
  amount: number
  thumbnail: string
  option: string
  quantity: number
}

export type CouponDiscountOrderLine = {
  kind: 'coupon'
  label: string
  amount: number
  couponCode: string
}
```

컴포넌트는 optional props를 방어하는 대신 `kind`를 보고 그 라인에 맞는 값만 읽는다.

```tsx
function LineDescription({ line }: { line: OrderLine }) {
  switch (line.kind) {
    case 'product':
      return (
        <small>
          {line.option} · 수량 {line.quantity}
        </small>
      )
    case 'coupon':
      return line.couponCode ? <small>{line.couponCode}</small> : null
    case 'subtotal':
    case 'shipping':
    case 'memberDiscount':
    case 'point':
      return null
    default:
      return assertNever(line)
  }
}
```

여섯 종류의 항목을 union 타입으로 나누면 쿠폰에 상품 전용 필드를 넣는 실수를 타입 검사에서 잡을 수 있다. 카드 즉시할인 같은 항목을 추가하고 렌더링 분기를 빠뜨려도 `assertNever(line)`에서 타입 오류가 난다.

부분 취소나 무료배송 쿠폰이 추가되면 이 여섯 가지로 표시할 수 있는지 다시 봐야 한다.

## 가격 컴포넌트에서 별도로 할인을 계산하고 있었다

`Price`는 가격을 보여주는 컴포넌트인데 그 안에 VIP 할인 규칙이 있었다.

표시 컴포넌트에서도 할인을 계산하면 금액 규칙이 중복된다. 계산 모델의 결과가 65,000원이어도 Price에서 VIP 할인을 다시 적용하면 화면에는 다른 금액이 표시될 수 있다.

할인은 `checkoutModel`로 옮겨졌고 `Price`는 결과만 보여준다.

```ts
const memberDiscount =
  member.grade === 'VIP' ? Math.round((itemTotal - couponDiscount) * 0.1) : 0
```

쿠폰을 먼저 적용하고 남은 상품 금액에서 VIP 할인 10%를 계산한다. 할인 순서를 바꿀 일이 생겨도 고칠 곳은 이 함수 하나다.

## Context는 금액의 출처를 숨길 뻔했다

배송지, 쿠폰, 포인트, 약관, 결제 수단. 여러 상태를 전달하기 위해 Context 도입을 검토했지만 이번에는 적용하지 않았다.

이 화면에서는 계산한 금액을 몇 단계 건너 보내지 않아도 됐다. 버튼에 잘못된 금액이 찍혔을 때는 props를 넘긴 곳에서 바로 계산 함수를 찾을 수 있는 편이 나았다.

## 쿠폰 할인액이 결제 금액보다 클 때

일반 배송과 도서산간 배송, 쿠폰과 포인트, VIP 할인 조합별로 계산 결과를 테스트했다. 아래는 쿠폰 할인액이 결제할 금액을 넘어서는 경우다.

```ts
assert.equal(summary.finalPrice, 0)
assert.equal(summary.couponDiscount, 65000)
assert.equal(summary.memberDiscount, 0)
assert.equal(summary.pointDiscount, 0)
```

쿠폰 할인액이 결제할 금액보다 크면 최종 금액은 0원이다. 그 뒤에 적용할 회원 할인과 포인트 할인도 0원이 되는지 검사했다.

계산 테스트와 빌드는 통과했다. 당시 로컬 브라우저에서 Apple Events의 JavaScript 실행이 꺼져 있어, 배송지를 바꾼 뒤 결제 버튼의 금액까지 읽는 자동 테스트는 돌리지 못했다.

다시 확인한다면 처음부터 도서산간 주소를 골라 두지 않고, 일반 배송에서 도서산간으로 직접 바꿔 보겠다. 첫 화면의 금액은 예전 코드로도 맞았다. 바꾸고 나서 결제 버튼에 3,000원이 더 붙는지가 궁금하다.
