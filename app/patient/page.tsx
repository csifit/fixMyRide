import PatientPortal from "../PatientPortalClient";
import { patientPortalData } from "../demo-data";

export default function PatientMedicalFolderPage() {
  return <PatientPortal data={patientPortalData} />;
}
