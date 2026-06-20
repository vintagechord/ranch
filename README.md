# 목장의 아침

을왕리 친구 파티 참가 신청 원페이지 사이트입니다. Next.js App Router 기반이며, 신청 데이터와 저금통 금액은 서버 Route Handler를 통해 Supabase에 저장합니다.

이 프로젝트는 `src/` 디렉터리 없이 Next.js 기본 `app/` 디렉터리를 사용합니다.

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
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
ADMIN_PASSWORD=
```

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon public key, 현재 클라이언트 직접 호출은 없지만 배포 환경에 같이 보관
- `SUPABASE_SERVICE_ROLE_KEY`: 서버 Route Handler 전용 키
- `DATABASE_URL`: 직접 DB 연결 또는 마이그레이션용, 현재 런타임 필수는 아님
- `ADMIN_PASSWORD`: `/admin` 관리자 페이지 로그인 비밀번호

`.env`, `.env.local`, `.env.production`, Supabase service role key, DB 비밀번호는 Git에 올리지 않습니다.

## Supabase 준비

Supabase 프로젝트 생성 후 아래 값을 확인합니다.

- Project URL
- Anon public key
- Service role key
- Database password

Supabase Dashboard > SQL Editor에서 [supabase/schema.sql](./supabase/schema.sql)을 실행합니다.

현재 스키마는 아래 테이블을 만듭니다.

- `party_applications`: 참가 신청 폼 저장
- `piggy_bank`: 관리자 저금통 잔액 저장

RLS는 켜져 있고 public insert policy는 만들지 않습니다. 신청 저장과 저금통 수정은 service role key를 사용하는 서버 코드에서만 처리합니다.

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
NEXT_PUBLIC_SUPABASE_ANON_KEY=
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

관리자 페이지에서 신청 목록을 확인하고, 저금통 금액을 추가할 수 있습니다.

## 신청 폼 API 테스트

```bash
curl -X POST http://localhost:3000/api/apply \
  -H "Content-Type: application/json" \
  -d '{
    "name": "테스트",
    "phone": "010-0000-0000",
    "auction_item": "모르겠음",
    "advance_team": false,
    "creative_project": "",
    "food_note": "",
    "memo": "",
    "privacy_agreed": true
  }'
```

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
