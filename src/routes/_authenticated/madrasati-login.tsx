import { createFileRoute } from "@tanstack/react-router";
import { MadrasatiAuthPage } from "@/platform/integration/connectors/madrasati/components/madrasati-auth-page";

export const Route = createFileRoute("/_authenticated/madrasati-login")({
  component: MadrasatiLoginRoute,
});

function MadrasatiLoginRoute() {
  return <MadrasatiAuthPage />;
}
