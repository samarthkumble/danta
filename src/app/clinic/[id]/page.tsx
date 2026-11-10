import { ClinicView } from "@/components/ClinicView";

export default async function ClinicPage({ params }: PageProps<"/clinic/[id]">) {
  const { id } = await params;
  return <ClinicView id={id} />;
}
