export const recoveryPortals = [
  "customer",
  "workshop_manager",
  "service_organisation",
  "admin",
] as const;

export type RecoveryPortal = (typeof recoveryPortals)[number];

export function normalizeRecoveryPortal(value: string | null | undefined): RecoveryPortal {
  return recoveryPortals.includes(value as RecoveryPortal)
    ? value as RecoveryPortal
    : "customer";
}

export const recoveryLoginPaths: Record<RecoveryPortal, string> = {
  customer: "/customer/login",
  workshop_manager: "/workshop-manager/login",
  service_organisation: "/service-organisation/login",
  admin: "/admin/login",
};
