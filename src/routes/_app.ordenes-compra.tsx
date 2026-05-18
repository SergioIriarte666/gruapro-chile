import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_app/ordenes-compra")({
  component: () => <PlaceholderPage title="ordenes-compra" />,
});
