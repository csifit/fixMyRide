export const personnelTypes = [
  "mechanic",
  "electrician",
  "painter",
  "body_technician",
  "diagnostic_technician",
  "tyre_technician",
  "other_personnel",
] as const;

export const workstationTypes = [
  "bay",
  "ramp",
  "lift",
  "paint_booth",
  "diagnostic_station",
  "tyre_station",
  "wash_station",
  "other_workstation",
] as const;

export type PersonnelType = (typeof personnelTypes)[number];
export type WorkstationType = (typeof workstationTypes)[number];
export type CapacityResource = {
  id: string;
  category: "personnel" | "workstation";
  type: PersonnelType | WorkstationType;
  name: string;
  active: boolean;
  assignedStationId: string | null;
  assignedStationName: string | null;
  absences: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
  }>;
};

export type WorkshopCapacityLocation = {
  workshopId: string;
  workshopName: string;
  city: string | null;
  dailyCapacity: number;
  resources: CapacityResource[];
};
