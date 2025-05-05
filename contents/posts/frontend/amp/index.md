---
title: "AMP"
date: 2025-04-17
update: 2024-04-17
tags:
  - front-end
---

### amp
AMP(Accelerated Mobile Pages)는 빠른 로딩을 위해 엄격한 제약을 두는 프레임워크입니다. Next.js에서 AMP를 적용할 때도 이러한 제한이 그대로 적용됩니다.

1. useHook (React Hook) 사용 제한

AMP 자체는 React의 훅 사용을 직접적으로 제한하지 않습니다.

하지만, AMP 페이지는 클라이언트 측에서 실행되는 JavaScript(특히 커스텀 JS)를 거의 허용하지 않으므로,
React Hook을 이용해 동적으로 상태를 변경하거나, 효과를 실행하는 로직이 AMP 페이지에서 동작하지 않습니다.

AMP 페이지는 기본적으로 정적이어야 하며, 동적 인터랙션은 AMP에서 제공하는 컴포넌트(예: amp-bind, amp-form 등)로만 구현할 수 있습니다.

2. Sass 방식의 스타일링 제한

Next.js는 Sass(.scss, .sass) 및 CSS Modules를 지원하지만,
AMP 페이지에서는 CSS-in-JS만 지원됩니다.

Sass, CSS Modules, 글로벌 CSS 등은 AMP 페이지에서 사용할 수 없습니다.

AMP에서는 <style amp-custom> 태그를 통해 75KB 이내의 인라인 CSS만 허용하며,
Next.js의 AMP 페이지에서는 styled-components, emotion과 같은 CSS-in-JS 방식만 정상적으로 동작합니다.

Sass로 작성한 스타일을 AMP 페이지에 적용하려면, CSS-in-JS로 변환하거나,
<style amp-custom>을 직접 <Head>에 넣는 식으로만 제한적으로 사용할 수 있습니다.

3. <script> 태그 사용 제한

AMP는 커스텀 JavaScript를 절대적으로 금지합니다.

<script> 태그는 오직 AMP에서 공식적으로 제공하는 컴포넌트 로딩(예: <script async custom-element="amp-img" ...>) 용도로만 허용됩니다.

개발자가 직접 작성한 JavaScript를 AMP 페이지에 삽입하면 AMP 검증에서 실패합니다.

Next.js AMP 페이지에서도 <script>를 자유롭게 쓸 수 없으며,
필요한 경우 next/head를 통해 공식 AMP 컴포넌트만 추가할 수 있습니다.