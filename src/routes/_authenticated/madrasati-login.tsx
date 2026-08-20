import { createFileRoute } from "@tanstack/react-router";
import { MadrasatiOfficialLoginPage } from "@/platform/integration/connectors/madrasati/components/madrasati-official-login";

export const Route = createFileRoute("/_authenticated/madrasati-login")({
  component: MadrasatiLoginRoute,
});

function MadrasatiLoginRoute() {
  return <MadrasatiOfficialLoginPage />;
}
