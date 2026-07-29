"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useFormStatus } from "react-dom";

export default function PendingSubmitButton({
  disabled,
  ...props
}: ComponentPropsWithoutRef<"button">) {
  const { pending } = useFormStatus();
  return <button {...props} disabled={disabled || pending} />;
}
