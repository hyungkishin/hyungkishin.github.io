---
title: "배포 중 들어온 주문은 어느 버전이 받을까"
description: "주문 API를 예로 들어 롤링 배포와 블루그린 배포에서 새 요청의 목적지가 바뀌는 시점을 비교한다."
date: 2022-11-18
update: 2026-11-14
tags:
  - 배포
---

주문 API를 배포하는 동안에도 장바구니에서는 주문이 들어온다. 기존 버전이 세 개의 Pod에서 실행 중이고 새 버전을 준비하는 상황을 가정해 보자. 같은 코드를 배포해도 Pod를 하나씩 교체할 때와 새 버전을 따로 띄워 두고 트래픽을 전환할 때는 주문이 도착하는 곳이 다르다.

## 롤링 배포에서는 두 버전이 함께 주문을 받는다

아래는 주문 Deployment에서 교체 속도를 정하는 설정이다.

```yaml
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

유지할 Pod 수는 3개다. `maxSurge: 1`이므로 교체를 시작할 때 새 Pod 하나를 추가로 띄울 수 있다. 새 Pod가 준비되어 가용 복제본 수를 채우면 기존 Pod 하나를 줄일 수 있다. 이 과정을 반복하며 버전을 교체한다. [Kubernetes의 RollingUpdate 설정](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-update-deployment)

전환 중에는 같은 Service가 준비된 구버전과 신버전 Pod 모두에 요청을 보낼 수 있다. 첫 주문은 구버전이, 바로 뒤의 주문은 신버전이 받을 수 있다는 뜻이다.

새 버전이 DB에 새로운 주문 상태를 기록한다면 구버전도 그 상태를 읽을 수 있어야 한다. Pod 수를 유지하는 설정은 이 호환성까지 검사해 주지 않는다.

## 블루그린 배포에서는 새 요청의 목적지를 바꾼다

블루그린 방식으로 구성하면 기존 버전인 blue와 새 버전인 green을 각각 별도 Deployment로 둔다. 운영 Service가 blue를 가리키는 동안에는 green에 테스트 요청을 보내고 응답을 확인할 수 있다. 전환할 때는 Service의 selector를 green의 레이블과 일치하도록 바꾼다. Kubernetes가 EndpointSlice를 갱신하면 변경 사항이 반영된 경로로 새 연결이 들어간다. [Kubernetes Service와 selector](https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service)

전환 직전에 blue가 받은 주문은 여전히 처리 중일 수 있다. 그래서 green이 첫 주문을 받았다는 사실만으로 blue를 바로 내리기 어렵다. 기존 연결과 요청이 끝날 시간을 주려면 두 환경을 함께 운영할 자원이 필요하다.

## 되돌릴 때는 이미 쓴 데이터도 확인한다

새 버전에서 오류가 늘었다고 하자. 롤링 배포에서는 이전 Pod 템플릿으로 다시 교체하고, 블루그린에서는 blue가 살아 있다면 Service의 목적지를 되돌릴 수 있다. 어느 쪽이든 새 버전이 이미 저장한 주문은 DB에 남는다. [Kubernetes Deployment 롤백](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment)

이 예에서 배포 전에 확인할 일은 구체적이다. 두 버전이 동시에 주문을 받아도 되는지, 이전 버전이 새 주문 레코드를 읽을 수 있는지, 전환 중인 요청은 언제 끝나는지를 살핀다. 버전이 섞여도 되는 시간과 두 환경을 유지할 여유가 배포 방식의 선택을 가른다.
