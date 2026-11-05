# Hachori Class

교실 화면과 수업 도구를 모은 GitHub Pages 사이트입니다.

- [교실 화면 및 룰렛](https://hachori.github.io/hachoriclass/)
- [우주 캡슐 뽑기](https://hachori.github.io/hachoriclass/capsule/)
- [QR 스캐너 및 QR 만들기](https://hachori.github.io/hachoriclass/qr/)

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
