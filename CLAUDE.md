# 기술 블로그 프로젝트

Gatsby 기반 기술 블로그. 실무에서 겪은 시스템 설계와 성능 최적화 경험을 기록한다.

## 구조

- 포스트: `contents/posts/<카테고리>/<주제>/index.md` (카테고리: backend, frontend, data-base, devops, e-commerce, company, books, resume)
- 이미지와 SVG: 같은 디렉토리에 kebab-case로 두고 상대경로로 참조 (예: `./01-architecture.svg`)
- frontmatter: `title`, `date`, `update`, `tags` (YAML). 발행된 글을 고치면 `update`를 갱신한다.

## 작업 라우팅

| 작업 | 따르는 절차 |
|---|---|
| 새 글 쓰기 | write-post 스킬. 발굴 절차는 `.claude/rules/discovery-protocol.md` |
| 기존 글의 AI 티 윤문 | humanize-korean 스킬 |
| 기존 글의 구조 감산 | `.claude/rules/tone-harness.md` 11.2절 편집 연산 순서 |
| 시각 자료 결정과 제작 | `tone-harness.md` 8.1절(쓸지 결정), 8.2절(제작 규칙) |
| 기획 요건의 영향 판정 | `.claude/rules/requirement-impact-harness.md`. 글쓰기와 섞지 않는다 |
| 발행 전 검문 | `npm run check:post -- <index.md>` |

후보 발굴과 감산 편집을 같은 패스에서 하지 않는다.

## 톤

- **서술의 주체는 개발자가 아니라 구조다.** 작업 일지가 아니라 설계 판단으로 쓴다 (tone-harness 11절이 상세 규칙).
- "무엇을 했다"의 과거형 나열 대신 "이 구조에서는 무엇이 보장된다"의 현재형 귀결.
- 짧은 문장. 한 문장에 하나의 정보만. 문장 길이와 형태는 일부러 고르지 않게.
- 자문자답, 가르치는 말투, 억지 구어 종결(~거든요) 금지. 자기평가와 교훈도 금지.
- 막연한 형용사 대신 측정값. "빨라졌다"가 아니라 전후 수치를 쓴다.
- 해결에는 트레이드오프나 한계 절이 따른다. 없으면 만들 것이 아니라 찾아서 쓴다.

## 다이어그램

- 그림이 필요한지, 표와 코드와 산문 중 무엇이 그 판단을 맡을지는 tone-harness 8.1절이 정한다. 형식을 먼저 고르지 않는다.
- 구조도(소유권, 경계, 계층 같은 정적 관계)는 정적 SVG나 표. 시간 변화 자체가 판단일 때만 애니메이션 SVG.
- 흐름도(분기와 순서의 정적 비교)는 mermaid.
- 라이트 카드 테마(흰 배경, 블랙톤 금지), Pretendard, 노드 7개 이하. 복잡하면 쪼갠다.
- 표와 다이어그램이 같은 내용이면 하나만 남긴다.
- em dash 금지. 다이어그램 라벨에도 콜론으로 대체한다.
- SVG 테마 값, 팔레트, SMIL 구현은 tone-harness 8.2절.

## 태그

- 한국어 도메인 태그와 영어 기술 태그 혼용 (예: `대기열`, `동시성`, `Redis`, `Spring`, `Kafka`)

## 발행 게이트

발행 전 반드시 한 번 돌린다.

```bash
npm run check:post -- contents/posts/<경로>/index.md
```

구조 검사(frontmatter, 자산 참조 실재, em dash, 코드 펜스 짝)를 하고 lint:tone과 lint:mermaid를 이어서 돌린다. `error`가 0개여야 한다. 개별 실행은 `npm run lint:tone -- <파일>`, `npm run lint:mermaid`.

한국어 AI 티(번역투, 관용구, 리듬)의 판단 기준은 `.claude/rules/ai-tell-taxonomy.md`(분류 체계 정본), `ai-tell-quick-rules.md`(슬림 룰북), `rewriting-playbook.md`(치환 레시피)다.

## 커밋

- 접두사: `docs:` (블로그 포스트), `fix:` (수정), `feat:` (기능)
- 메시지는 한국어
