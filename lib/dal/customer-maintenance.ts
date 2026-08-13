import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type CustomerMaintenanceNotification = {
  id: string;
  title: string;
  message: string;
  workshopName: string;
  bookingUrl: string;
  publishedAt: string;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadMyCustomerMaintenanceNotifications(): Promise<CustomerMaintenanceNotification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_customer_maintenance_notifications");
  if (error) fail(error);
  return ((data ?? []) as Array<{ notification: CustomerMaintenanceNotification }>).map((row) => row.notification);
}

export async function dismissMyCustomerMaintenanceNotification(notificationId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_my_customer_maintenance_notification", { requested_notification_id: notificationId });
  if (error) fail(error);
}
