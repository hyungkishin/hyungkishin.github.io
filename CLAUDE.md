# 기술 블로그 프로젝트

Gatsby 기반 기술 블로그. 실무에서 겪은 시스템 설계/성능 최적화 경험을 기록합니다.

## 블로그 구조

- 포스트 경로: `contents/posts/e-commerce/technical-writing/week{N}/index.md`
- 이미지/SVG: 같은 디렉토리에 상대경로로 참조 (예: `./01-architecture.svg`)
- 프론트매터: `title`, `date`, `update`, `tags` (YAML)

## 글쓰기 규칙

### 톤
- **서술의 주체는 개발자가 아니라 구조다.** 작업 일지가 아니라 설계 판단으로 쓴다 (tone-harness 11절이 상세 규칙).
- "무엇을 했다"의 과거형 나열 대신 "이 구조에서는 무엇이 보장된다"의 현재형 귀결.
- 짧은 문장. 한 문장에 하나의 정보만. 문장 길이와 형태는 일부러 고르지 않게.
- 자문자답, 가르치는 말투, 억지 구어 종결(~거든요) 금지. 자기평가와 교훈도 금지.
- 불필요한 접속사 제거. "~하는데요," → 마침표로 끊기.

### 구조
- 쓰기 전에 무엇을 쓸지 고르는 절차는 `.claude/rules/discovery-protocol.md`. 이미 쓴 글을 깎는 규칙은 `tone-harness.md`. 후보를 발굴하면서 동시에 감산하지 않는다.
- TL;DR → 들어가며(왜) → 문제 구조 → 병목 분석 → 해결 → 구현 → 트레이드오프 → 정리
- "왜 이런 구조가 생겼는지"를 먼저. 해결은 나중에.
- 정리 섹션에서 구조적 한계 인정 (consumer 대응 vs 근본 해결)

### 다이어그램
- 그림이 필요한지, 표·코드·산문 중 무엇이 그 판단을 맡을지는 `.claude/rules/tone-harness.md` 8.1절이 정한다. 형식을 먼저 고르지 않는다.
- 구조도: 소유권, 경계, 계층 같은 정적 관계는 정적 SVG나 표로 표현한다. 시간 변화가 판단의 일부일 때만 애니메이션 SVG를 쓴다.
- 흐름도: 분기와 순서를 정적으로 비교하면 mermaid. 이동, 반복, 중단, 전파처럼 시간 변화 자체가 판단이면 애니메이션 SVG를 검토한다.
- 라이트 카드 테마(흰 배경, 블랙톤 금지), Pretendard, 7개 노드 이하. 복잡하면 쪼개기.
- 표와 다이어그램이 같은 내용이면 하나만 남기기.
- em dash 금지(`—`). 다이어그램 라벨에도 콜론으로 대체.
- SVG를 선택한 뒤의 테마 값, 팔레트, SMIL 구현 규칙은 `tone-harness.md` 8.2절을 따른다.

### 태그
- 한국어 도메인 태그 + 영어 기술 태그 혼용
- 예: `대기열`, `동시성`, `Redis`, `Spring`, `Kafka`

## 톤 가드

글 발행 전 반드시 한 번 돌린다.

```bash
npm run lint:tone -- contents/posts/<path>/index.md
npm run lint:mermaid
```

`error`가 0개여야 한다. lint:mermaid는 전체 글의 mermaid 블록을 실제 파서로 검증한다 (실패 블록은 배포 페이지에서 에러 SVG로 나타난다). 룰 정의는 `scripts/tone-guard.mjs` + `.claude/rules/tone-harness.md` 7.5~7.6절.

한국어 AI 티(번역투·관용구·리듬)는 `.claude/rules/ai-tell-taxonomy.md`(분류 체계 SSOT) + `ai-tell-quick-rules.md`(슬림 룰북) + `rewriting-playbook.md`(치환 레시피)를 기준으로 본다. 깊은 윤문은 `/humanize-korean` 스킬.

## 커밋
- 접두사: `docs:` (블로그 포스트), `fix:` (수정), `feat:` (기능)
- 메시지는 한국어
