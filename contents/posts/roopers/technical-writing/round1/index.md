---
title: "컨텍스트 미아가 되어 버렸어요."
date: 2026-02-05
update: 2026-02-05
tags:
  - loopers
  - technical-writing
---

## 배경

회원가입 E2E 테스트가 실패했습니다.  
Testcontainers가 실행되지 않았습니다.

```
Could not find a valid Docker environment
```

에러 메시지의 의미는 명확했습니다.
"Docker Engine과 정상적인 프로토콜 통신이 성립하지 않는다."

터미널에서 `docker ps`를 쳐봤는데요, 정상이었습니다.
`docker run hello-world`도 문제없이 돌아갔습니다.
Docker는 멀쩡한데 Testcontainers만 Docker를 못 찾겠다고 합니다.

이 시점에서 두 가지 방향 중 하나를 선택해야 했습니다.

- **환경을 의심하는 방향**: Docker와 Testcontainers 사이의 통신 경로를 추적합니다.
- **코드를 의심하는 방향**: 테스트 설정 구조에 문제가 있다고 보고 코드를 수정합니다.

저는 후자를 골랐습니다.
이유가 있었는데요.

제공된 testFixtures 설정이 `@Configuration` + `companion object init` 구조였기 때문입니다.
이 구조는 Spring의 ApplicationContext lifecycle과 무관하게 클래스 로딩 시점에 Docker 컨테이너를 기동합니다.
테스트가 아니어도 컨테이너가 뜨고, 병렬 테스트에서 리소스 충돌 위험이 있으며, Bean lifecycle과 무관하게 외부 리소스를 점유할 수 있습니다.

구조가 의심스러우니까, 이게 원인이라고 믿고 싶었습니다.

그래서 AI에게 말했습니다.

`Q: 테스트 인프라의 제어권이 모듈 경계를 넘어가고 있는 것 같은데 맞아?`
`A: 네 맞습니다, @TestConfiguration + @Import 방식으로 명시적으로 로딩하도록 변경하겠습니다.`

환경 체크가 아닌 코드 레벨에서 접근을 시작한 순간, 운전대를 빼앗겼습니다.

![...](image-1.png)


## 운전대를 넘겼어요

클선생(Claude)은 성실했습니다.  
내가 "코드 문제"라는 전제를 제공하자, 그 전제 안에서 할 수 있는 모든 것을 시도했습니다.  

- `@Configuration`을 `@TestConfiguration`으로 전환
- `companion object eager start()`를 `by lazy`로 변경
- `System.setProperty` 제거
- `@Container + @DynamicPropertySource`로 전환
- docker-java 버전 강제 업그레이드
- Testcontainers 버전 변경

하나를 바꾸면 다른 곳에서 에러가 났습니다.  
에러를 잡으면 또 다른 에러가 나왔습니다.  

클선생은 매번 "이렇게 수정하면 해결될 것입니다"라고 했고,   
저는 매번 "그래 끝까지 가보는 거야"라고 했습니다.

돌이켜보면 이 시점에서 이미 이상 신호가 있었습니다.  

수정 한 번으로 끝나지 않고 꼬리에 꼬리를 무는 수정이 이어진다면,   

전제 자체를 의심했어야 했습니다.

> 하지만 저는 ... 예

![아..아..](image-2.png)


## BOM을 믿으라고@

![아직도 정신 못 차리는 거냐구@@@](image-5.png)

코드 수정으로 해결이 안 되니, 다음 수순으로 docker-java를 수동 업그레이드했습니다.

```kotlin
// 추가된 docker-java 의존성
testImplementation("com.github.docker-java:docker-java-api:3.5.1")
```

Spring Boot는 Dependency Management BOM을 통해 testcontainers, docker-java, junit-jupiter의 버전을 검증된 조합으로 고정합니다.  

이 조합에는 이유가 있는데요,   
특정 버전의 testcontainers가 특정 버전의 docker-java와 정상 동작하도록 검증된 결과이기 때문입니다.

그런데 docker-java만 수동으로 override하면, Spring Boot가 의도한 버전 트리를 깨뜨리게 됩니다.  
업그레이드한 docker-java 3.5.1은 Spring Boot 3.4.4와 검증되지 않은 조합이었습니다.  

사실 이런 버전 문제는 `context7에서 현재 버전과 일치하는 버전으로 체크 부탁해`라고 요청하면 끝이었습니다.  
BOM이 관리하는 버전을 신뢰했어야 했습니다.  


## 22 files changed, AM 5시

![주인. 여기서 자면 끝나는 거야 :)](image-3.png)

docker-java 업그레이드도 효과가 없었습니다.  
이쯤 되면 의심해야 할 것은 코드가 아니라 전제였는데요,   
저와 클선생은 이미 너무 깊이 와 있었습니다..

코드 전반에 걸쳐 Testcontainers 설정 방식을 통일하기 시작했습니다.  
`@TestConfiguration`, `@Container`, `System.setProperty`, `withReuse(true)`, testFixtures 방식이 혼재되어 있었고, 이걸 `@Container + @DynamicPropertySource` 하나로 단일화하려 했습니다.

좋은 취지인 것은 압니다.  
Testcontainers 패턴은 프로젝트 내에서 단일화하는 것이 맞습니다.  
하지만 지금 이 시점에서 해야 할 일은 아니었습니다.  

원래 문제는 "Docker 환경을 못 찾겠다"였는데,   
어느새 "Testcontainers 설정 구조 전체 리팩토링"을 하고 있었습니다.  

> 변경된 파일: 22 files changed.
> 현재시각: AM 5시

아차 싶었습니다..

> "문제를 해결하고 있는 게 아니라, 문제를 키우고 있다는 것을."


## 진짜 원인은 뭐였을까?

![해가 떠버렸다구@@](image-6.png)

해가 뜨고 나서야 정신을 차렸습니다.  
처음으로 돌아가서, 이번에는 환경부터 확인했습니다.  

AI에게 한 줄만 던졌습니다.  

> Docker Desktop의 버전과 현재 프로젝트 환경이 충돌하는 게 있는지 확인해.

진짜 원인은 Docker Desktop의 버전 문제였습니다.

- Docker Desktop 29.1.2
- Engine API 1.52
- docker-java 3.4.x

Testcontainers는 내부적으로 docker-java를 사용하고,   
docker-java는 `/version`, `/info` API를 호출해 Docker Engine과 API version 협상을 진행합니다.  

Docker CLI는 API 버전이 맞지 않아도 fallback 전략으로 동작하지만,   
docker-java는 strict하게 응답을 파싱합니다.  

Docker Desktop 29.1.2가 반환하는 API 응답을 docker-java 3.4.x가 유효한 응답으로 인식하지 못한 것이었습니다.

> CLI 정상 ≠ 라이브러리 정상

Docker Desktop을 .28 버전으로 downgrade하니,   
무슨 문제였는지 기억조차 흐려질 정도로 빠르게 해결되었습니다.  

밤새 22개 파일을 수정한 그 모든 작업은 필요 없었습니다.


## AI는 언제 멈춰야 할까?

이번 경험을 복기하면, 잘못된 것은 AI가 아니라 제 플래닝이었습니다.

AI는 내가 제공한 전제 안에서 가능한 모든 해결책을 시도합니다.  

"코드 문제"라는 전제를 주면 코드 안에서 답을 찾으려 하고,   
심지어 점점 더 많은 파일을 수정합니다.  

다 박살 내놓고, 원한다면 흐름도 설명해준데요 ㅠ.

잘못된 전제 위에서 AI에게 가스라이팅을 한 셈이었죠..

올바른 플래닝은 이랬어야 해요

1. 환경 확인 (`docker info`, Docker Desktop 버전)
2. 네트워크/소켓 직접 테스트 (docker-java가 사용하는 소켓 경로)
3. 라이브러리 버전 호환성 확인 (BOM 기준)
4. 그 다음에 코드 수정

저는 4번부터 시작했어요.
1번에서 출발했다면 30분이면 끝났을 문제를 밤새 끌고 갔습니다.

"과잉"이다 싶을 때 던져야 할 질문이 있습니다.

- "이 수정은 과한가?"
- "문제의 범위를 벗어나고 있지 않은가?"

이 질문을 던지고 멈추는 것이, 끝까지 가보는 것보다 훨씬 더 중요했습니다.

`그렇지 않으면, 파급력을 감당할 수 없게 됩니다.`

> 플래닝을 1번부터 출발하게끔 통제할 것.
> 의도와 달리 모호한 답변이 나오지 않고, 의도대로 조율하게 된다면,
> 통제 성공의 객관적인 지표가 될 것입니다.


## TL;DR

- Docker 연결 실패는 코드 문제가 아니었습니다.
- Docker Desktop과 docker-java 간 API negotiation 이슈였습니다.
- BOM이 관리하는 버전을 신뢰했어야 했습니다.
- AI는 범위를 넓힙니다. 개발자는 범위를 줄여야 합니다.

> "AI를 멈추는 판단"의 중요성을 깨달았습니다.


### 다음에는

- Integration과 E2E를 어떻게 구조적으로 분리할 것인가?
- Testcontainers 공통 베이스를 만들 것인가?
- CI 환경에서 Docker 전략은 어떻게 가져갈 것인가?

를 시간이 될 때 정리해보고 싶습니다.
