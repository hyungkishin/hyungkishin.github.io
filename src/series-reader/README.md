# 송금 시리즈 리더

송금 시리즈의 목차와 각 글은 독립 HTML로 열린다. 작은 화면에서도 SVG를 확대하고 애니메이션을 멈출 수 있으며, JVM 로그 같은 실험 자료를 글 옆에서 내려받을 수 있다. 글 URL은 Gatsby가 생성하는 경로와 같다.

## 빌드

Node.js 22에서 의존성을 설치하고 프로젝트 루트에서 실행한다.

```bash
npm test
node --test scripts/*.test.mjs
npm run build
```

Gatsby가 본문과 페이지 데이터를 만든 뒤 [onPostBuild](../../gatsby-node.js)가 [빌더](./build.mjs)를 실행한다. 빌더는 [시리즈 규칙](../utils/seriesRules.js)에서 글 순서를 가져오고, 각 글의 Gatsby 페이지 데이터에서 제목과 렌더링된 본문을 가져온다. 결과는 `public/backend/transfer-performance/`에 들어간다. 페이지 데이터는 그대로 남으며, RSS와 사이트맵에는 같은 주소가 실린다.

`assets/`에는 공통 탐색 스타일과 리더용 CSS·JavaScript가 들어간다. 글별 SVG와 `evidence/` 파일은 원문 디렉터리에서 복사한다. 일반 페이지에서 독립 리더로 이동할 때는 [ReadingLink](../components/ReadingLink/index.jsx)가 문서 전체를 연다. Markdown 안의 링크도 같은 방식으로 열리도록 Gatsby의 링크 가로채기 대상에서 이 경로를 제외했다.

독립 리더 산출물만 따로 검토하려면 전체 빌드 직후 다음 명령을 실행한다. 출력은 빈 디렉터리를 지정한다.

```bash
node scripts/build-transfer-series.mjs --public-dir public --output-dir /tmp/transfer-series-dist
```

## 발행 확인

`develop`에는 원문과 소스를, `master`에는 사이트 산출물을 올린다. 전체 발행 시 기존 운영 사이트의 글 주소와 RSS 항목을 새 빌드와 대조한다. 두 브랜치에 서로 다른 원고가 있었다면 먼저 소스에 반영해야 다음 빌드에도 수정분이 남는다.

홈과 검색에서 시리즈로 이동해 본다. 목차에서 각 글로 들어간 뒤 절 링크, 이전·다음 글, 그림 확대, 애니메이션 정지·재생, 근거 파일을 확인한다. 모바일에서는 코드와 표만 각각의 영역 안에서 가로로 스크롤되는지 확인한다. 발행 후 같은 주소에서 다시 확인한다.
