import { Link } from "@tanstack/react-router";

import { Button } from "@/shared/ui/button";
import { isEntitlementDeniedError } from "../billing.logic";

export function EntitlementDeniedCta({ error }: { error: unknown }) {
  if (!isEntitlementDeniedError(error)) return null;

  return (
    <Button asChild className="h-11 min-h-[44px]">
      <Link to="/subscription">الاشتراك</Link>
    </Button>
  );
}
