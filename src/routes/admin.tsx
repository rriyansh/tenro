import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminScreen } from "@/components/tenro/account-sheets";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin")({
  component: AdminRoute,
});

function AdminRoute() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isPending && !user) navigate({ to: "/login" });
  }, [isPending, user, navigate]);
  if (isPending || !user) return <main className="grove min-h-dvh" aria-busy="true" />;
  return <AdminScreen />;
}
