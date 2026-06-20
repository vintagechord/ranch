import { NextResponse } from "next/server";
import { getPiggyBankBalance } from "@/lib/piggyBank";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const piggyBank = await getPiggyBankBalance();

    return NextResponse.json({
      balanceAmount: piggyBank.balanceAmount,
      updatedAt: piggyBank.updatedAt
    });
  } catch (error) {
    console.error(
      "Piggy bank load failed:",
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      {
        balanceAmount: 0,
        updatedAt: null
      },
      { status: 500 }
    );
  }
}
