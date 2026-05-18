import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_app/operadores")({
  component: () => <PlaceholderPage title="operadores" />,
});
