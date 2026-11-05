# Hachori Class

교실 화면과 수업 도구를 모은 GitHub Pages 사이트입니다.

- [교실 화면 및 룰렛](https://hachori.github.io/hachoriclass/)
- [우주 캡슐 뽑기](https://hachori.github.io/hachoriclass/capsule/)
- [QR 스캐너 및 QR 만들기](https://hachori.github.io/hachoriclass/qr/)
- [할 일·자유 메모·링크](https://hachori.github.io/hachoriclass/memo/)

## 교실 메모

하단 독의 **메모**에서 할 일 추가·수정·완료 체크, 자유 메모 자동 저장, 링크 저장을 사용할 수 있습니다.
창을 닫아도 교실 화면을 유지하고 저장을 마무리합니다. 저장 상태가 **클라우드에 저장됨**으로 표시되면 다른 기기에서도 불러올 수 있습니다.
다른 교실 컴퓨터에서는 **내 메모 링크**를 복사해 사용하거나 즐겨찾기로 보관합니다. 이 링크를 가진 사람은 해당 메모를 읽고 수정할 수 있으므로 공개 게시하지 않습니다.
각 기기에서는 마지막으로 연 메모장을 기억하며, 기존 메모 링크는 같은 버튼의 입력란에서 열 수 있습니다.

내용은 브라우저에서 AES-GCM으로 암호화한 뒤 기존 Firestore의 `classes/memo_v1_<SHA-256>` 문서에 저장합니다.
암호화 키는 링크의 fragment(`#v1.…`)에 있으며 Firestore에 전송하지 않습니다. 명단 및 자리배치 문서에는 쓰지 않습니다.
기기 내 초안은 입력 즉시 `localStorage`에 저장하고, 연결이 돌아오면 자동 동기화합니다.
서로 다른 항목의 변경 사항은 합치고, 같은 항목은 마지막 변경을 적용합니다. 문서 갱신 조건으로 동시 저장 충돌을 감지해 다시 합칩니다.

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
