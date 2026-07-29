import DoctorPortal from "./DoctorPortalClient";
import { doctorPortalData } from "../demo-data";

export default function DoctorPage() {
  return <DoctorPortal initialData={doctorPortalData} />;
}
