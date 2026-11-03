# 송금 시리즈의 독립 리더 빌드와 추가 배포

독립 리더는 Gatsby가 만든 본문 데이터를 읽어 `/backend/transfer-performance/` 아래의 목차와 다섯 글을 HTML로 생성한다. 기존 `master`의 다른 글과 Gatsby 런타임을 보존해야 할 때 이 경로만 추가한다.

소스의 정본 브랜치는 `develop`, 사이트 산출물의 배포 브랜치는 `master`다. 원문과 빌더의 변경은 소스 브랜치에서 관리한다. 배포 작업 디렉터리는 배포 직전에 확인한 `origin/master`를 기준으로 준비한다. 소스 작업 디렉터리와 배포 작업 디렉터리를 서로 구분한다.

`origin/develop`에 없는 기존 발행 수정이 운영 중인 `master`에 포함될 수 있다. 이런 차이를 조정하지 않고 새 Gatsby `public/` 전체를 복사하면 이미 발행한 글이 이전 내용으로 돌아갈 수 있다. 배포 전에는 `contents/posts/frontend/loopers-fe-10-weeks/index.md`와 운영 경로 `/frontend/loopers-fe-10-weeks/` 같은 기존 글을 비교한다. 독립 리더를 추가하는 배포에서는 원문 차이를 해결했다고 가정하지 않고 기존 산출물을 보존한다.

## 생성 범위와 입력

글의 순서는 [시리즈 규칙](../utils/seriesRules.js)의 `transfer-performance` 항목에서 읽는다. 제목과 본문은 Gatsby의 `public/page-data/backend/transfer-performance/<글 경로>/page-data.json` 안에 있는 `result.data.markdownRemark`를 사용한다. SVG와 `evidence/` 파일은 각 원문 디렉터리에서 읽어 같은 글 경로로 복사한다.

출력에는 목차 경로와 다섯 글의 `index.html`, 글별 SVG와 재현 파일, 공용 `assets/reader.css`와 `assets/reader.mjs`가 들어간다. 공용 자산도 `/backend/transfer-performance/` 안에 둔다. 빌더는 다른 경로를 삭제하거나 Gatsby의 `app-data.json`, `page-data/`, 공용 JavaScript 파일을 교체하지 않는다.

본문의 코드와 표는 Gatsby가 생성한 HTML을 유지한다. 빌더가 추가하는 구조는 글 제목, 절 목차, 이전·다음 이동, 그림 확대와 애니메이션 제어다. SVG는 별도 `object` 문서로 로드하므로 그림 안의 CSS가 본문으로 퍼지지 않는다. 구현은 [build.mjs](./build.mjs), 브라우저 동작은 [reader.mjs](./reader.mjs)에 있다.

## 소스 검증과 산출물 생성

Gatsby 빌드에는 Node.js 22 LTS를 권장한다. 같은 의존성 잠금 파일로 설치한 환경에서 프로젝트 루트를 작업 디렉터리로 사용한다. 아래 명령을 실행하기 전에 `node --version`으로 선택한 런타임을 확인한다. 전역 Node 버전이 다른 경우에는 사용하는 버전 관리 도구에서 22를 선택한다.

운영자는 글 검사, 전체 테스트, 도구 테스트 순서로 실행한다. 글 검사의 error가 남거나 테스트가 실패하면 빌드로 넘어가지 않는다. 경고는 해당 문장을 읽고 판단한다. 컴파일 조건 같은 기술적 한계를 숨기기 위해 조건부 표현을 단정문으로 바꾸지 않는다.

```bash
node --version

for post in contents/posts/backend/transfer-performance/*/index.md; do
  npm run check:post -- "$post" || exit 1
done

npm test
node --test scripts/tone-guard.test.mjs scripts/build-transfer-series.test.mjs
```

운영자는 Gatsby 빌드가 성공한 뒤 독립 리더를 생성한다. 원문이나 SVG를 수정했다면 Gatsby부터 다시 실행한다. 기존 `page-data.json`과 새 원문 자산을 섞지 않는다. 출력 디렉터리는 이번 검증에 사용할 빈 디렉터리로 준비한다. 빌더는 이전 실행에서 남은 파일을 정리하지 않는다.

```bash
npm run build
node scripts/build-transfer-series.mjs \
  --public-dir public \
  --output-dir /tmp/transfer-series-dist
```

빌더가 `6 routes written`을 출력하면 `/tmp/transfer-series-dist/backend/transfer-performance/`를 검토한다. 이 메시지는 HTML 생성 결과만 뜻한다. 실제 사이트의 배포 성공이나 브라우저 동작을 보장하지 않는다. 글의 원문과 애니메이션 개수는 바뀔 수 있으므로 소스와 출력의 SVG 목록을 대조한다.

## 기존 master에 추가하는 범위

운영자는 배포 작업 디렉터리의 기준 커밋과 기존 파일 목록을 보관한다. `/tmp/transfer-series-dist/backend/transfer-performance/` 전체를 배포 작업 디렉터리의 같은 경로에 복사한다. 이번 산출물에서 다른 경로를 가져오지 않는다. 전체 Gatsby `public/` 복사와 삭제 동기화 옵션은 사용하지 않는다.

운영자는 홈의 Gatsby 루트 바깥에 시리즈 목차로 가는 작은 일반 링크를 추가한다. Gatsby가 관리하는 렌더 트리 안을 직접 수정하면 hydration 때 링크가 사라질 수 있다. 홈의 기존 글 목록과 스크립트는 유지한다. 홈에서 링크를 눌렀을 때와 목차 URL을 직접 열었을 때를 각각 확인한다.

사이트맵에는 목차를 포함한 여섯 URL을 반영한다. RSS에는 다섯 글의 항목을 반영한다. 기존 `sitemap-0.xml`과 `rss.xml`을 기준으로 URL 또는 GUID가 같은 신규 시리즈 항목을 갱신하고, 없는 항목만 추가한다. `sitemap-index.xml`은 사이트맵 파일 구성이나 관련 메타데이터 변경이 필요한 경우에만 수정한다. 기존 항목을 새 Gatsby 결과로 통째로 대체하지 않는다.

배포 검토에서 허용하는 변경은 새 시리즈 경로, 홈의 진입 링크, 사이트맵과 RSS의 해당 항목이다. 운영자는 `git status --short --untracked-files=all`과 `git diff --name-only`로 추가 파일과 수정 파일을 함께 확인한다. 수정한 홈·사이트맵·RSS는 각각 diff를 읽는다. 이 범위 밖의 기존 파일은 배포 기준과 해시가 같은지 확인한다. 예상하지 않은 변경이 있으면 배포 반영을 멈추고 복사 범위부터 확인한다.

## 브라우저와 운영 경로 확인

운영자는 배포 전 로컬 HTTP 서버에서 출력 디렉터리를 열어 여섯 경로를 확인한다. 각 글의 제목이 한 번만 나타나는지, 목차 링크가 해당 절로 이동하는지, 이전·다음이 시리즈 순서와 일치하는지 검사한다. 코드·표의 내용과 출처 링크, `evidence/` 파일의 응답도 확인한다.

운영자는 390px 화면에서 본문 전체가 가로로 밀리지 않는지 확인한다. 코드와 표는 필요한 경우 그 영역 안에서 가로 스크롤한다. 키보드로 목차, 애니메이션 버튼, 그림 확대 링크에 접근한다. 모션 감소 설정에서는 의미가 있는 정적 그림 또는 정지 상태로 시작해야 한다. 재생 버튼을 누르면 애니메이션이 시작되고, 멈추기 버튼을 누르면 실제 움직임이 멈추는지 확인한다.

운영자는 `master` 반영과 호스팅 배포가 끝난 뒤 아래 여섯 경로를 직접 연다. HTTP 성공 응답만으로 검사를 끝내지 않고 제목, 본문, 그림과 제어 버튼을 확인한다. 개발자 도구의 네트워크 오류와 SVG·스크립트 로드 실패도 확인한다.

- `https://hyungkishin.github.io/backend/transfer-performance/`
- `https://hyungkishin.github.io/backend/transfer-performance/01-measurement/`
- `https://hyungkishin.github.io/backend/transfer-performance/02-jvm-execution/`
- `https://hyungkishin.github.io/backend/transfer-performance/03-transfer-contract/`
- `https://hyungkishin.github.io/backend/transfer-performance/04-kafka-redis/`
- `https://hyungkishin.github.io/backend/transfer-performance/05-jpa-access/`

기존 `/frontend/loopers-fe-10-weeks/`를 포함한 발행 글과 홈도 다시 연다. 새 글의 정상 응답과 기존 글의 보존은 별도 검사다. RSS·사이트맵에는 기존 항목이 남아 있고 새 항목이 중복되지 않아야 한다. 이 검사를 마친 뒤에만 운영 반영 결과를 보고한다.

## 다음 정규 Gatsby 배포의 처리

독립 리더 빌더는 `npm run build`에 연결되어 있지 않다. Gatsby 빌드만 실행하면 별도 리더 생성이나 overlay가 자동으로 이어지지 않는다. 원문과 시리즈 규칙이 소스 브랜치에 들어간 뒤 정규 Gatsby 산출물을 전체 배포하면, 같은 글 URL은 일반 Gatsby 리더로 교체될 수 있다. 독립 리더의 그림 제어와 레이아웃도 함께 바뀐다.

다음 전체 배포 담당자는 기존 발행 수정과 소스 브랜치의 차이를 먼저 조정한다. 독립 리더를 유지할 경우에는 새 Gatsby 빌드 뒤에 이 빌더와 시리즈 경로 overlay를 다시 수행한다. 일반 Gatsby 리더로 통합할 경우에는 필요한 그림 제어와 접근성 동작을 일반 템플릿에 옮겨 검증한다. 두 경로 모두 글 URL과 시리즈 순서를 유지한다.

별도 HTML 리더와 Gatsby 템플릿을 함께 관리하는 비용은 남는다. 본문의 생성 경로는 공유하지만 스타일, metadata, 그림 제어에는 별도 구현이 있다. 소스와 운영 산출물의 차이를 정리한 뒤에는 어느 리더를 정본으로 유지할지 결정하고 배포 명령에도 그 결정을 반영해야 한다.
