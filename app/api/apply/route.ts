import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message: "종료된 을왕리 신청 경로입니다. 프로젝트 제안 폼을 이용해 주세요."
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "private, no-cache, no-store, max-age=0"
      }
    }
  );
}
