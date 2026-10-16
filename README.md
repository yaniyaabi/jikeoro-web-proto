# 지켜路 — 우리 동네 보행안전 지도

전국의 주민이 보행 중 발견한 우리 동네 위험요소를 위치정보와 함께 기록하고, 연구진과 담당 기관이 대응 현황을 이어갈 수 있도록 만든 1차년도 웹 프로토타입입니다.

## 현재 구현 범위

- PC·모바일 반응형 메인 화면
- 로그인 사용자 제보와 GPS 또는 직접 위치 입력
- 로그인 후 참여 미션, 내 기록과 대응 단계 확인
- 10,000P부터 온누리상품권 등 지역상품권 교환을 안내하는 리워드 프로토타입
- 연구진·담당 기관용 관리자 화면
- GPS가 포함된 기록만 모아 보는 별도 무료 현황지도
- 앱과 공유하는 Supabase 기반 사용자·제보·처리상태·첨부파일 저장

사진·영상·음성 파일은 비공개 Supabase Storage에 저장되며, 제보 작성자와 운영진만 원본 파일을 조회할 수 있습니다.

## VS Code에서 실행하기

Node.js 22 이상이 필요합니다.

1. ZIP 파일을 압축 해제합니다.
2. VS Code에서 압축을 푼 `jikeoro-web` 폴더를 엽니다.
3. VS Code 터미널에서 아래 명령을 실행합니다.

```bash
npm install
npm run dev
```

터미널에 표시된 로컬 주소를 브라우저에서 열면 됩니다. 기본 포트가 사용 중이면 3001, 3002처럼 사용 가능한 주소가 자동으로 표시됩니다.

주요 파일:

- `app/page.tsx`: 첫 화면
- `app/map/page.tsx`: GPS 위험요소 현황지도
- `app/my/page.tsx`: 로그인 사용자 화면
- `app/admin/page.tsx`: 관리자 화면
- `app/globals.css`: 전체 디자인과 반응형 스타일
- `supabase/migrations/202610160001_initial_jikeoro.sql`: Supabase 데이터베이스·권한·저장소 구조

## Supabase 연결

기본 프로젝트 설정은 코드에 포함되어 있어 GitHub Pages에서도 바로 연결됩니다. 다른 Supabase 프로젝트를 사용할 때는 `.env.example`을 참고해 아래 값을 설정합니다.

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

`sb_secret_...` 또는 `service_role` 키는 브라우저 코드나 GitHub 저장소에 넣으면 안 됩니다.

## GitHub Desktop으로 올리기

1. GitHub Desktop에서 **File → Add local repository**를 선택합니다.
2. 압축을 푼 `jikeoro-web` 폴더를 선택합니다.
3. 저장소가 없다는 안내가 나오면 **create a repository**를 선택합니다.
4. 저장소 이름을 확인하고 **Create repository**를 누릅니다.
5. 첫 커밋을 만든 뒤 **Publish repository**로 GitHub에 올립니다.

`node_modules`, 빌드 결과, 로컬 데이터와 환경변수는 `.gitignore`에 포함되어 GitHub에 올라가지 않습니다.

## 확인 명령

```bash
npm run build
```

## 다음 개발 단계

- 상품권 제휴 정책과 교환 API 연결
- 전국 단위 주민참여 연구용 개인정보·위치정보 동의 절차 반영
- 관리자 통계와 연구 데이터 내보내기
