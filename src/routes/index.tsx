import { createFileRoute } from "@tanstack/react-router";
import { TenroApp } from "@/components/tenro/tenro-app";

export const Route = createFileRoute("/")({
  component: TenroApp,
});
