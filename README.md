# Hachori Class

교실 화면과 수업 도구를 모은 GitHub Pages 사이트입니다.

- [교실 화면 및 룰렛](https://hachori.github.io/hachoriclass/)
- [우주 캡슐 뽑기](https://hachori.github.io/hachoriclass/capsule/)
- [QR 스캐너 및 QR 만들기](https://hachori.github.io/hachoriclass/qr/)
- [할 일·자유 메모·링크](https://hachori.github.io/hachoriclass/memo/)

## 교실 메모

하단 독의 **메모**에서 할 일 추가·수정·완료 체크, 자유 메모 자동 저장, 링크 저장을 사용할 수 있습니다.
메인 화면에서 시계·영어노트와 함께 메모 창이 자동으로 열립니다. 제목 표시줄을 드래그해 이동하고 오른쪽 아래 모서리로 크기를 조절합니다.
하단 독의 **메모** 또는 닫기 버튼으로 숨기거나 다시 열 수 있으며, 창 위치와 크기를 이 기기에 기억합니다.
**로그인 없이** 같은 교실 사이트 주소에서 같은 메모를 불러옵니다. 별도의 메모 링크를 복사하지 않아도 됩니다.
창을 닫아도 교실 화면을 유지하고 저장을 마무리합니다. **자동 저장됨**이면 다른 기기에서도 불러올 수 있습니다.
**이전 메모 가져오기**에서 예전 링크 메모 또는 이 기기에 로그인해 두었던 계정 메모를 가져옵니다.
기존 할 일과 링크를 합치고, 자유 메모는 현재 메모 뒤에 붙입니다. 이전 메모 원본은 지우지 않습니다.

기본 메모는 기존 자리배치와 같은 익명 접근 방식으로 `classes/hachoriclass_memo_main_v3`에 저장하며, 이 사이트를 여는 기기들이 공유합니다.
명단·자리배치 문서는 수정하지 않습니다. 기본 메모는 Firebase Auth SDK를 불러오지 않습니다.
입력 즉시 기기에 사본을 저장하고, 연결이 돌아오면 자동 동기화합니다.
서로 다른 항목의 변경 사항은 합치고, 같은 항목은 마지막 변경을 적용합니다. 문서 갱신 조건으로 동시 저장 충돌을 감지해 다시 합칩니다.
이전 `classes/memo_v1_<SHA-256>` 문서는 기존 메모를 가져올 때만 읽습니다.

이전 계정 메모의 복구 화면은 `memo/account/`에 보존합니다. `teacherMemos/{uid}`의 암호문과 `memoAccounts/{uid}`의 키는 기존 본인 접근 규칙을 유지합니다.
계정 복구·가져오기를 명시적으로 선택할 때만 Google CDN의 Firebase SDK 13.2.0을 불러옵니다. 배포한 규칙의 사본은 `firebase/firestore.rules`입니다.

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
