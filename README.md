# Hachori Class

교실 화면과 수업 도구를 모은 GitHub Pages 사이트입니다.

- [교실 화면 및 룰렛](https://hachori.github.io/hachoriclass/)
- [우주 캡슐 뽑기](https://hachori.github.io/hachoriclass/capsule/)
- [QR 스캐너 및 QR 만들기](https://hachori.github.io/hachoriclass/qr/)
- [할 일·자유 메모·링크](https://hachori.github.io/hachoriclass/memo/)

## 교실 메모

하단 독의 **메모**에서 할 일 추가·수정·완료 체크, 자유 메모 자동 저장, 링크 저장을 사용할 수 있습니다.
**Google 계정으로 로그인**하면 어느 교실 컴퓨터에서도 같은 계정의 메모를 불러옵니다.
창을 닫아도 교실 화면을 유지하고 저장을 마무리합니다. 저장 상태가 **내 계정에 저장됨**으로 표시되면 다른 기기에서도 불러올 수 있습니다.
로그인은 현재 브라우저 세션 동안 유지됩니다. **로그아웃**하면 메모 화면과 세션의 키·초안을 지웁니다.
이전 링크 방식의 메모는 로그인 후 **기존 메모 가져오기**에서 이 기기의 사본 또는 이전 링크를 사용해 가져옵니다.
기존 할 일과 링크를 합치고, 자유 메모는 현재 메모 뒤에 붙입니다. 이전 메모 원본은 지우지 않습니다.

계정 메모는 브라우저에서 AES-GCM으로 암호화해 `teacherMemos/{uid}`에 저장합니다.
암호화 키는 본인만 읽을 수 있는 `memoAccounts/{uid}`에 보관하며, 최초 생성 뒤에는 클라이언트에서 바꾸거나 지울 수 없습니다.
두 컬렉션은 Firebase Authentication의 `request.auth.uid`로 본인만 접근하도록 제한합니다. 배포한 규칙의 사본은 `firebase/firestore.rules`입니다.
계정용 키는 URL과 `localStorage`에 저장하지 않습니다. 브라우저 세션에만 보관하고, 기기 내 지속 캐시에는 암호문을 저장합니다.
입력 즉시 세션 초안을 저장하고, 연결이 돌아오면 자동 동기화합니다.
서로 다른 항목의 변경 사항은 합치고, 같은 항목은 마지막 변경을 적용합니다. 문서 갱신 조건으로 동시 저장 충돌을 감지해 다시 합칩니다.
이전 `classes/memo_v1_<SHA-256>` 문서는 기존 메모를 가져올 때만 읽습니다.

Firebase Authentication의 Google 제공업체 및 승인 도메인 `hachori.github.io`를 사용합니다.
Firebase SDK는 Google CDN의 13.2.0 버전으로 고정하고, 기본 프로필로만 로그인합니다.

## 주소 변경

저장소와 사이트 경로를 `englishclass`에서 `hachoriclass`로 변경했습니다.
기존 사이트 주소로 만든 즐겨찾기나 QR 코드는 새 주소로 수정해야 합니다.
GitHub 저장소 주소의 자동 이동과 달리, GitHub Pages의 이전 사이트 주소는 자동 이동이 보장되지 않습니다.

내부 페이지 이동과 글꼴·CSS·JavaScript 파일은 상대 경로를 사용합니다.
명단, 룰렛 역할 프리셋, 캡슐 설정에 쓰는 기존 `localStorage` 키는 저장된 데이터를 계속 사용하도록 유지합니다.
사이트의 호스트(`hachori.github.io`)가 같으므로 기존 브라우저에 저장된 설정도 같은 저장 공간에서 불러옵니다.

## 배포

GitHub Pages에서 `main` 브랜치의 루트(`/`)를 게시합니다.
로컬 저장소 연결 주소는 `https://github.com/hachori/hachoriclass.git`을 사용합니다.
