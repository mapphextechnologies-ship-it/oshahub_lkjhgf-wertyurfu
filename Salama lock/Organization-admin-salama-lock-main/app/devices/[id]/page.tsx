import DashboardLayout from "@/components/layout/DashboardLayout";
import { auditEvents, devices } from "@/lib/data";
import DeviceCommandCenter from "./DeviceCommandCenter";

export default async function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const device = devices.find((item) => item.id === id) ?? devices[0];

  return (
    <DashboardLayout title="Device Command Center">
      <DeviceCommandCenter device={device} events={auditEvents} />
    </DashboardLayout>
  );
}