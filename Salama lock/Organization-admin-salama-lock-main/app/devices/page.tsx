import DashboardLayout from "@/components/layout/DashboardLayout";
import { devices } from "@/lib/data";
import DeviceManager from "./DeviceManager";

export default function DevicesPage() {
  return (
    <DashboardLayout title="Devices">
      <DeviceManager initialDevices={devices} />
    </DashboardLayout>
  );
}