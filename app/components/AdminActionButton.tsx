"use client";

import { useFormStatus } from "react-dom";

type AdminActionButtonProps = {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
};

export default function AdminActionButton({
  children,
  pendingLabel,
  className = "admin-form-button"
}: AdminActionButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
