import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const PIGGY_BANK_ID = 1;

type PiggyBankRow = {
  balance_amount: number | null;
  updated_at: string | null;
};

export type PiggyBankBalance = {
  balanceAmount: number;
  updatedAt: string | null;
};

function normalizePiggyBank(row: PiggyBankRow | null): PiggyBankBalance {
  return {
    balanceAmount: Number(row?.balance_amount ?? 0),
    updatedAt: row?.updated_at ?? null
  };
}

export async function getPiggyBankBalance(): Promise<PiggyBankBalance> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("piggy_bank")
    .select("balance_amount, updated_at")
    .eq("id", PIGGY_BANK_ID)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return normalizePiggyBank(data as PiggyBankRow | null);
}

export async function addPiggyBankAmount(amount: number): Promise<PiggyBankBalance> {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("추가 금액이 올바르지 않습니다.");
  }

  const supabase = getSupabaseAdmin();
  const { data: currentData, error: currentError } = await supabase
    .from("piggy_bank")
    .select("balance_amount")
    .eq("id", PIGGY_BANK_ID)
    .maybeSingle();

  if (currentError) {
    throw new Error(currentError.message);
  }

  const nextBalance = Number((currentData as PiggyBankRow | null)?.balance_amount ?? 0) + amount;
  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("piggy_bank")
    .upsert(
      {
        id: PIGGY_BANK_ID,
        balance_amount: nextBalance,
        updated_at: updatedAt
      },
      { onConflict: "id" }
    )
    .select("balance_amount, updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizePiggyBank(data as PiggyBankRow);
}
