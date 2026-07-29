import PatientPortal from "./PatientPortalClient";
import { patientPortalData } from "./demo-data";

export default function Home() {
  return <PatientPortal data={patientPortalData} />;
}
