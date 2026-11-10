import { PatientView } from "@/components/PatientView";

export default async function PatientPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  return <PatientView token={token} />;
}
