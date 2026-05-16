"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <Printer className="mr-1.5 size-4" />
      Imprimir
    </Button>
  );
}
