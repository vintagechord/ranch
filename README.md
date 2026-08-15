# 목장의 아침

음악 프로젝트의 진행 상황과 제작 기록을 공개하는 인터랙티브 프로젝트 플랫폼입니다. Next.js App Router 기반이며, 헤더의 S/F 음원 아카이브와 저금통 기능을 함께 운영합니다.

이 프로젝트는 `src/` 디렉터리 없이 Next.js 기본 `app/` 디렉터리를 사용합니다.

## 프로젝트 페이지

프로젝트의 제목·비주얼 템플릿은 `lib/projects.ts`에서 관리하고, 공개 여부·수명주기·정렬 순서는 관리자 페이지와 `project_page_settings`에서 관리합니다. `진행 중`인 공개 프로젝트만 메인, 헤더, `/projects/[slug]`에 노출되며 완료·보관된 프로젝트의 운영 기록은 삭제하지 않습니다.

현재 공개 중인 프로젝트:

- SunizShine — `이별의 도수`
- 빈티지코드 — `PPP` (Post Production Project)

이전 을왕리 참가자 공개 경로(`/participants`)는 메인으로 이동하며, 관리자에서 사용하던 참가자 설정과 을왕리 참가 신청 기록은 운영 시스템에서 제거했습니다.

## 개발 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

로컬 주소는 `http://localhost:3000`입니다.

## 환경변수

`.env.example`을 참고해 로컬은 `.env.local`, 배포는 Vercel Environment Variables에 설정합니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PROPOSAL_RATE_LIMIT_SECRET=
DATABASE_URL=
ADMIN_PASSWORD=
```

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: 프로젝트 제안 접수와 관리자 조회에 사용하는 서버 전용 키
- `PROPOSAL_RATE_LIMIT_SECRET`: IP를 저장하지 않고 요청 제한용 HMAC을 만드는 선택 키. 없으면 service role key를 사용합니다.
- `DATABASE_URL`: 직접 DB 연결 또는 마이그레이션용, 현재 런타임 필수는 아님
- `ADMIN_PASSWORD`: `/admin` 관리자 페이지 로그인 비밀번호

`.env`, `.env.local`, `.env.production`, Supabase service role key, DB 비밀번호는 Git에 올리지 않습니다.

## Supabase 준비

Supabase 프로젝트 생성 후 아래 값을 확인합니다.

- Project URL
- Anon public key
- Service role key
- Database password

Supabase Dashboard > SQL Editor에서 [supabase/schema.sql](./supabase/schema.sql)을 실행하거나, Supabase CLI로 프로젝트를 연결한 뒤 migration을 push합니다.

```bash
supabase link --project-ref 프로젝트_REFERENCE_ID
supabase db push
```

현재 스키마는 아래 테이블을 만듭니다.

- `project_proposals`: 프로젝트 제안 폼 저장(접수일 기준 최대 1년)
- `request_rate_limits`: 프로젝트 제안·관리자 로그인 요청 제한용 단기 HMAC 저장
- `piggy_bank`: 관리자 저금통 잔액 저장
- `open_chat_settings`: 신청 완료 후 보여줄 오픈채팅방 링크 저장
- `site_settings`: 메인 파형 모니터의 다음 모임 일정과 장소
- `project_page_settings`: 프로젝트 공개 여부, 진행·완료·보관 상태, 메인 정렬 순서
- `project_lifecycle_events`: 프로젝트 상태 변경과 종료 시 마감된 모집의 이전 상태 감사 기록
- `music_releases`: PPP 발매 목록과 음악 프로젝트 참여 항목
- `release_role_types`, `release_roles`: 프로젝트별 참여 파트와 모집 상태
- `release_credits`: 공개 참여 크레딧
- `release_participation_applications`, `release_application_status_events`: 프로젝트 참여 신청과 검토 이력

`release-covers` Storage bucket에는 관리자가 등록한 음원 대표 이미지를 WebP로 정규화해 저장합니다. 업로드 이미지는 3MB 이하의 JPG, PNG, WebP, AVIF만 허용하며 공개 다운로드 외의 Storage 작업은 서버의 service role로만 처리합니다.

종료된 을왕리 신청 API(`/api/apply`)는 `410 Gone`을 반환합니다. `project_proposals`는 공개 권한 없이 서버의 service role을 통해서만 저장·조회합니다. 관리자 조회, 저금통 수정, 오픈채팅방 링크 관리도 service role key를 사용하는 서버 코드에서 처리합니다.

## Vercel 배포

1. GitHub 저장소에 코드를 푸시합니다.
2. Vercel에서 해당 GitHub repo를 Import 합니다.
3. Framework Preset은 `Next.js`로 둡니다.
4. Build Command는 `npm run build`를 사용합니다.
5. Install Command는 `npm install`을 사용합니다.
6. Output Directory는 기본값을 사용합니다.
7. Environment Variables에 환경변수를 추가한 뒤 Deploy 합니다.

Vercel에 최소로 필요한 값:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
```

보관 권장 값:

```bash
DATABASE_URL=
```

## 관리자 페이지

로컬:

```text
http://localhost:3000/admin
```

배포 후:

```text
https://배포도메인/admin
```

관리자 화면은 좌측 카테고리 내비게이션을 기준으로 다음처럼 나뉩니다.

- `운영 대시보드`: 전체 제안·참여 신청과 현재 운영 상태 요약
- `메인 운영`: 다음 모임 일정, 저금통, 오픈채팅 링크
- `프로젝트 제안`: 상시 제안 채널의 목록과 상세 내용
- `프로젝트 관리`: 프로젝트 디렉터리, 프로젝트별 음원·대표 이미지·참여 파트, 참여 신청

각 프로젝트 작업실은 다른 프로젝트 데이터를 펼치지 않고 해당 프로젝트만 보여줍니다. 프로젝트를 `완료` 또는 `보관`으로 전환하면 공개 페이지와 메인에서 숨기고 진행 중이던 모집을 마감하되, 기존 신청·크레딧·발매 기록은 보존합니다. PPP의 새 UP NEXT 항목은 마지막 번호 다음 번호로 자동 배정되며 비공개 초안으로 생성됩니다. 이후 대표 이미지를 업로드하고 아트워크·소개글·뮤직비디오 등의 파트를 연 뒤 사이트에 공개할 수 있으며, 발매 완료 시 상태와 YouTube 영상 ID를 수정해 RELEASED 목록으로 이동할 수 있습니다.

새 스키마를 포함한 배포는 반드시 `supabase db push` 성공 후 애플리케이션을 배포합니다. 앱이 먼저 배포되면 새 설정 테이블을 읽는 관리자·공개 화면이 정상 동작하지 않습니다.

## 프로젝트 제안 API

메인의 `프로젝트 제안` 버튼에서 `/api/project-proposals`로 접수합니다. 제안은 전용 테이블에 저장됩니다. 개인정보 동의 시각과 고지문 버전, 중복 제출 방지 키를 함께 보관하고 동일 요청의 반복 저장과 짧은 시간의 과도한 제출을 원자적으로 제한합니다. 제안은 접수 시 보관 만료일이 정해지며 Supabase Cron이 15분마다 만료 자료를 삭제합니다.

## GitHub 업로드 순서

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/계정명/프로젝트명.git
git push -u origin main
```

핵심은 코드만 Git에 올리고, 비밀키는 Vercel/Supabase 환경변수에만 넣는 것입니다.
