import DashboardLayout from "@/components/layout/DashboardLayout";
import { users } from "@/lib/data";
import UserManager from "./UserManager";

export default function UsersPage() {
  return (
    <DashboardLayout title="Users">
      <UserManager initialUsers={users} />
    </DashboardLayout>
  );
}