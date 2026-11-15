---
title: "환불 문의에 입력을 902토큰 더 넣었는데 답은 같았다"
description: "배달 정책 문서 일곱 건을 검색 대상으로 넣었다. 모델에 전달된 문장과 실제 보상 안내를 대조했다."
date: 2026-07-22
update: 2026-11-15
tags:
  - AI
  - Spring
  - SpringAI
  - RAG
  - PgVector
---

“비 오는 날 배달이 늦으면 보상받나요?” 이 질문에 답하려면 주문 번호를 기억하는 것만으로는 부족하다. 모델이 이번 주문에 적용할 정책 문구를 찾아 답변에 반영해야 한다.

이전 실험에서 대화 이력을 연결해 주문을 다시 찾을 수 있었다. 보상 안내에는 회사가 정한 기준도 필요했다. 이번에는 배달 정책 문서 7건을 PgVector에 넣고 검색 결과를 프롬프트에 넣었다. 임베딩은 Ollama `qwen3-embedding:0.6b`(1024차원), 생성은 그대로 `qwen2.5`다.

`QuestionAnswerAdvisor`를 연결한 뒤 같은 질문으로 청크 크기와 검색 건수, 유사도 기준을 바꿔 봤다. 설정 중 결과를 예상하기 어려웠던 건 Advisor의 순서였다. 순서를 한 번 바꿨더니 정책 원문이 대화 이력에 저장됐다.

<style>
.agent-fig,.fig-defs{
  --fig-surface:#ffffff;--fig-ink:#0f172a;--fig-ink2:#334155;--fig-muted:#94a3b8;--fig-hair:#e6eaf1;
  --c-green:#16a34a;--c-greenink:#15803d;--c-red:#ef4444;--c-redink:#b91c1c;
  --c-blue:#2f6fed;--c-blueink:#1d4ed8;--c-amber:#d97706;--c-amberink:#b45309;
}
@media (prefers-color-scheme: dark){
  .agent-fig,.fig-defs{
    --fig-surface:#121317;--fig-ink:#f2f5fa;--fig-ink2:#cbd5e1;--fig-muted:#697588;--fig-hair:#252a33;
    --c-green:#34d399;--c-greenink:#6ee7b7;--c-red:#f87171;--c-redink:#fca5a5;
    --c-blue:#5b9bff;--c-blueink:#93c5fd;--c-amber:#fbbf24;--c-amberink:#fcd34d;
  }
}
.agent-fig{margin:2.4em 0;border:1px solid var(--fig-hair);border-radius:18px;background:var(--fig-surface);
  padding:18px 20px 10px;overflow:hidden;box-shadow:0 1px 2px rgba(2,6,23,.05),0 14px 40px rgba(2,6,23,.09)}
@media (prefers-color-scheme: dark){.agent-fig{box-shadow:0 1px 2px rgba(0,0,0,.4),0 18px 46px rgba(0,0,0,.5)}}
.agent-fig svg{width:100%;height:auto;display:block;max-width:100%}
.agent-fig svg text{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace}
.agent-fig .cap-head{display:flex;justify-content:space-between;align-items:baseline;gap:14px;margin-bottom:6px}
.agent-fig .cap-tag{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--fig-muted);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.agent-fig figcaption{font-size:13.5px;color:var(--fig-muted);line-height:1.6;padding:12px 2px 6px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.agent-fig figcaption b{color:var(--fig-ink2);font-weight:600}
@media (prefers-reduced-motion: reduce){.agent-fig svg animate,.agent-fig svg animateMotion{display:none}}
</style>

## 800토큰에서 2,000토큰으로 늘렸는데 왜 둘 다 7행일까?

검색에 쓸 문서 조각을 청크라고 한다. 이번에는 정책 파일 일곱 개를 잘라서 청크 하나당 `vector_store` 한 행에 넣었다. 청크를 크게 잡으면 몇 행이나 줄어들까?

| 실험 | 청크 크기(토큰) / 최소 구두점 위치(글자) | 저장된 행 | 평균 입력 토큰 |
|---|---|---|---|
| A | 800 / 350 | 7 | 약 2381 |
| B | 100 / 40 | 49 | 약 1977 |
| C | 2000 / 800 | 7 | 약 2381 |

입력 토큰 평균은 로그가 남은 네 턴으로 냈다. 다섯 턴 중 하나는 누락됐다.

A는 800토큰에 7행. C는 2,000토큰인데 또 7행이다. 당시 정책 파일 일곱 개를 같은 splitter에 다시 넣어 보니, 가장 짧은 개인정보 문서는 485토큰, 가장 긴 기상 지연 문서는 584토큰이었다. 어느 설정에서든 각 파일이 딱 한 조각으로 나왔다. [실험에 쓴 정책 파일 일곱 개](https://github.com/hyungkishin/loop-play-spring-ai-agent/tree/c213d52/src/main/resources/knowledge)

두 설정이 항상 같은 결과를 내는 걸까? 이번엔 구두점 없이 `cat`만 공백으로 이어서 1,199토큰을 넣었다. A에서는 두 조각, C에서는 한 조각이 나왔다. 입력이 800토큰을 넘기고 나서야 두 설정의 차이가 보였다.

표에 적힌 350과 800은 어디에 쓰일까? Spring AI 1.0.0의 `TokenTextSplitter`는 먼저 남은 토큰 중 최대 `chunkSize`개를 문자열로 풀어 본다. 그 안에서 마지막 마침표, 물음표, 느낌표 또는 줄바꿈을 찾는다. 그 위치가 `minChunkSizeChars`보다 뒤면 거기까지 자른다. 방금 넣은 `cat`에는 그중 어느 것도 없다. 그래서 A는 앞의 800토큰에서 잘리고 C는 1,199토큰 전부가 한 조각에 들어갔다. [TokenTextSplitter 1.0.0의 분할 코드](https://github.com/spring-projects/spring-ai/blob/v1.0.0/spring-ai-commons/src/main/java/org/springframework/ai/transformer/splitter/TokenTextSplitter.java#L99-L128)

정책 파일 일곱 개를 실제로 쪼갠 설정은 B였다. 기상 지연 문서 하나가 여덟 조각이 됐다. “비 오는 날 배달이 늦으면 보상받나요?”라는 문의에는 “기상 특보 발효 여부와 실제 지연 시간을 확인해야 합니다”라는 답이 왔다.

![기상 지연 정책 문서가 여덟 조각으로 잘린 뒤, 비 오는 현관에서 고객이 받은 답장에는 지연 시간 숫자가 비어 있다.](./scene-rainy-missing-minutes.webp)

지연 시간을 확인하라는데, 그래서 몇 분일까? 원문에 있던 ‘예상 시간 + 30분’과 ‘60분 이상’이 둘 다 빠졌다.

숫자가 들어 있는 조각이 검색에서 빠졌을 수 있다. 하지만 당시 응답 기록에는 실제로 뽑힌 네 조각이 없다. 모델이 숫자를 봤는데도 답에서 빼먹었을 가능성이 남는다. 같은 B에서 취소 질문에는 오히려 주문 상태 `CREATED`와 `ACCEPTED`까지 들어간 답이 왔다. [100토큰 설정에서 받은 응답 원문](https://github.com/hyungkishin/loop-play-spring-ai-agent/blob/c213d52/docs/4주차/실측-raw/단계2-B-100.md)

이 일곱 파일에는 800/350을 쓰기로 했다. 기상 지연 문서를 한 건 찾으면 기준 시간과 적용 조건을 같이 읽을 수 있어서다. 정책이 길어지면 다시 봐야 한다. 방금 본 splitter는 마침표와 줄바꿈을 찾으면서 같은 정책 조항이 어디까지인지는 따지지 않는다.

```java
@Bean
public TokenTextSplitter tokenTextSplitter() {
    return new TokenTextSplitter(
            800,    // chunkSize
            350,    // minChunkSizeChars : 마지막 구두점이 이 글자 위치보다 뒤일 때만 거기서 자름
            5,      // minChunkLengthToEmbed
            10_000, // maxNumChunks
            true    // keepSeparator
    );
}
```

## 검색 결과를 네 건으로 제한하면 어떤 문서가 남을까

검색한 문단 가운데 모델에 몇 건까지 보낼지는 Top-K가, 어느 정도 비슷해야 후보에 넣을지는 `similarityThreshold`가 정한다. 같은 질문에 두 값을 따로 바꿔 봤다.

```java
private static final int TOP_K = 4;
private static final double SIMILARITY_THRESHOLD = 0.5;

@Bean
public QuestionAnswerAdvisor questionAnswerAdvisor(VectorStore vectorStore) {
    return QuestionAnswerAdvisor.builder(vectorStore)
            .searchRequest(SearchRequest.builder()
                    .topK(TOP_K)
                    .similarityThreshold(SIMILARITY_THRESHOLD)
                    .build())
            .order(20)   // memory(10) 뒤, performance(100) 앞
            .build();
}
```

“환불도 안 되고 배달도 늦었어요”처럼 정책이 두 개 필요한 질문에 검색 결과를 한 건만 쓰면 한쪽 조건이 빠질 수 있다. 반대로 정책 문서가 일곱 건뿐인데 상한을 열 건으로 높이면 관련 없는 조항까지 입력에 포함될 수 있다.

임계값을 0.5로 고정해도 답은 달랐다. 첫 실행에서는 정책을 인용했는데 다시 실행하자 “확인이 필요합니다”가 돌아왔다.

유사도 점수는 기록하지 않았다. 검색 결과가 달라졌는지, 같은 결과를 받아도 모델의 응답이 달라졌는지는 이 실험으로 구분할 수 없다.

## Advisor 순서를 뒤집으면 벌어지는 일

같은 정책 문단도 Advisor가 어떤 순서로 처리하느냐에 따라 저장되는 곳이 달라졌다. 기존 체인에서는 대화 이력을 다루는 memory(10)가 정책 문단을 붙이는 rag(20)보다 앞에 있었다.

```mermaid
flowchart TD
    A["사용자 : 아까 그 주문 환불 돼요?"] --> B["Memory: 이전 대화와 현재 질문을 순서대로 추가"]
    B --> C["RAG: 현재 질문으로 정책 검색"]
    C --> D["모델 호출 : Context 는 이번 호출에만"]
    D --> E["Memory 에는 원래 발화와 답변만 저장"]
```

Spring AI 1.0.0에서 Memory Advisor는 이전 메시지를 현재 질문 앞에 추가한다. RAG Advisor는 그중 마지막 사용자 메시지로 검색한다. 이때 검색어는 “아까 그 주문 환불 돼요?”다. 이전 대화의 주문번호까지 검색어에 넣으려면 질의를 따로 재작성해야 한다. [대화 메시지를 추가하는 코드](https://github.com/spring-projects/spring-ai/blob/v1.0.0/spring-ai-client-chat/src/main/java/org/springframework/ai/chat/client/advisor/MessageChatMemoryAdvisor.java#L73-L90), [검색어를 정하는 코드](https://github.com/spring-projects/spring-ai/blob/v1.0.0/advisors/spring-ai-advisors-vector-store/src/main/java/org/springframework/ai/chat/client/advisor/vectorstore/QuestionAnswerAdvisor.java#L103-L125)

순서를 rag(5), memory(10)로 바꿔 문의 한 건을 보냈다. 응답은 비슷했는데 저장된 메시지는 달랐다. “사용자 발화”에 질문과 정책 문서 본문이 함께 들어 있었다.

<figure class="agent-fig">
  <div class="cap-head"><span class="cap-tag">advisor order flip</span><span class="cap-tag">rag(5) before memory(10)</span></div>
  <svg viewBox="0 0 720 250" role="img" aria-label="Memory를 먼저 실행하면 질문을 저장한다. RAG를 먼저 실행하면 검색한 정책까지 사용자 메시지에 저장한다" xmlns="http://www.w3.org/2000/svg">
    <text x="20" y="28" font-size="12" font-weight="700" fill="var(--fig-ink2)">memory(10) 다음 rag(20), 질문 원문 저장</text>
    <g font-size="11" text-anchor="middle">
      <rect x="20" y="40" width="130" height="40" rx="9" fill="var(--c-blue)" opacity="0.12"/>
      <text x="85" y="64" fill="var(--fig-ink)">사용자 발화</text>
      <rect x="220" y="40" width="150" height="40" rx="9" fill="var(--c-amber)" opacity="0.12"/>
      <text x="295" y="64" fill="var(--fig-ink)">+ 정책 Context</text>
      <rect x="440" y="40" width="110" height="40" rx="9" fill="var(--fig-muted)" opacity="0.12"/>
      <text x="495" y="64" fill="var(--fig-ink)">모델 호출</text>
      <rect x="590" y="40" width="112" height="40" rx="9" fill="var(--c-green)" opacity="0.12"/>
      <rect x="590" y="40" width="112" height="40" rx="9" fill="none" stroke="var(--c-green)" stroke-opacity="0.45"/>
      <text x="646" y="58" fill="var(--fig-ink)">Memory</text>
      <text x="646" y="73" fill="var(--c-greenink)" font-size="9.5">발화와 답변만</text>
    </g>
    <circle r="4" fill="var(--c-amber)" filter="url(#fx-glow4)">
      <animateMotion path="M150 60 L440 60 L550 60" dur="3.4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;0.95" dur="3.4s" repeatCount="indefinite"/>
    </circle>
    <text x="20" y="128" font-size="12" font-weight="700" fill="var(--fig-ink2)">rag(5) 다음 memory(10), 질문과 검색 결과 저장</text>
    <g font-size="11" text-anchor="middle">
      <rect x="20" y="140" width="130" height="40" rx="9" fill="var(--c-blue)" opacity="0.12"/>
      <text x="85" y="164" fill="var(--fig-ink)">사용자 발화</text>
      <rect x="220" y="140" width="150" height="40" rx="9" fill="var(--c-amber)" opacity="0.12"/>
      <text x="295" y="164" fill="var(--fig-ink)">+ 정책 Context</text>
      <rect x="440" y="140" width="262" height="72" rx="9" fill="var(--c-red)" opacity="0.08"/>
      <rect x="440" y="140" width="262" height="72" rx="9" fill="none" stroke="var(--c-red)" stroke-width="1.4">
        <animate attributeName="stroke-opacity" values="1;0.35;1" dur="2.6s" repeatCount="indefinite"/>
      </rect>
      <text x="571" y="160" fill="var(--fig-ink)">Memory</text>
      <text x="571" y="178" fill="var(--c-redink)" font-size="9.5">"사용자 발화" = 정책 원문 수백 토큰</text>
      <text x="571" y="196" fill="var(--c-redink)" font-size="9.5">이력이 남아 있는 동안 다음 요청에도 포함</text>
    </g>
    <circle r="4" fill="var(--c-red)" filter="url(#fx-glow4)">
      <animateMotion path="M150 160 L370 160 L470 160" dur="3.4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;1;1;1" keyTimes="0;0.1;0.85;1" dur="3.4s" repeatCount="indefinite"/>
    </circle>
    <text x="360" y="238" text-anchor="middle" font-size="10.5" fill="var(--fig-muted)">두 순서에서 답변은 비슷했지만 저장된 사용자 메시지는 달랐다.</text>
  </svg>
  <figcaption>아래 순서에서는 <b>정책 본문까지 사용자 메시지에 저장</b>됐다. 이 메시지를 보관하는 동안 다음 요청에도 같은 본문이 들어간다.</figcaption>
</figure>

<svg class="fig-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0">
  <defs>
    <filter id="fx-glow4" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
</svg>

응답만 봤다면 순서를 바꿔도 차이가 없다고 생각했을 것이다. 어느 문장이 실제로 저장됐는지는 ChatMemory에서 사용자 메시지의 JSON을 열어 보고 확인했다.



## 같은 환불 문의에 RAG를 켰을 때

첫 질문을 세 가지 구성에 똑같이 보냈다. 답변은 세 번 모두 “확인이 필요합니다. 상담원 연결로 도와드리겠습니다”였다. 입력 토큰 수는 달랐다.

| 조건 | 체인 | promptTokens | 응답 |
|---|---|---|---|
| (a) | performance | 1688 | Fallback |
| (b) | memory, performance | 1688 | Fallback |
| (c) | memory, rag, performance | 2590 | Fallback |

첫 문의라 이전 대화가 없었다. 대화 이력을 켜도 입력은 1,688토큰으로 같았다. 여기에 RAG를 추가했을 때 2,590토큰으로 늘었다. 차이는 902토큰이다.

배달 후 환불에는 증빙이 필요하다. 상담원에게 넘긴 답이 틀렸다고 단정할 수는 없다는 뜻이다. 902토큰을 더 넣고도 같은 답이 나올 경로가 적어도 셋이다. 필요한 조항이 검색되지 않았거나, 프롬프트에 있었지만 답에 반영되지 않았거나, 증빙을 확인하라는 뜻으로 같은 안내를 했거나.

위 답변만으로는 셋을 구분하기 어렵다. 한 요청에서 검색한 문서, 실제 프롬프트, 답변을 함께 기록해야 가를 수 있다.

검색에는 유사도 기준을 두고, 프롬프트에는 정책을 찾지 못했을 때 사용할 안내 문구를 적었다.

```text
[정책 인용 규칙]
- 환불, 취소, 배달 지연 보상, 쿠폰 관련 질문은 제공된 Context 를 근거로만 답합니다.
- Context 에서 답을 찾을 수 없으면 추측하지 않고:
  "해당 내용은 확인이 필요합니다. 상담원 연결로 도와드리겠습니다."
- 정책 인용 시 원문의 수치 조건("24시간 이내", "예상 시간 + 30분")을 그대로 사용합니다.
```

인용 규칙을 빼고 “오늘 점심 뭐 먹을까요?”라고 물었더니 점심 메뉴를 추천하는 답이 나왔다. 검색 결과가 비었을 때 무엇을 답할지는 검색 임계값만으로 정할 수 없었다.

## 다음 이야기

이번 보상 문의에는 기준 시간과 그 시간이 적용되는 조건이 모두 필요했다. 환불 문의에서 세 번 모두 같은 안내가 나온 이유는 확인이 덜 됐다. 당시의 유사도 점수도 남아 있지 않다.

중복을 검사하는 `alreadyLoaded`는 faqId만 비교한다. 그래서 같은 문서의 본문을 수정해도 재적재하지 않는다. 내용 변경까지 감지하려면 본문의 해시도 비교해야 한다.

DataSource를 추가했더니 JDBC ChatMemory 자동 구성과 기존 Bean이 충돌했다. 이번 실험에서는 프로파일을 분리해 두 설정이 동시에 적용되지 않도록 했다.

현재 질문에 개인정보가 포함되면 그 문장이 검색어로도 쓰인다. 다음 편에서는 모델을 호출하기 전과 고객에게 답을 보내기 전에 각각 어떤 검사를 할 수 있는지 확인했다.
