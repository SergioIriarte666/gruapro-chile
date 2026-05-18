import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_app/ordenes")({
  component: () => <PlaceholderPage title="Órdenes de servicio" />,
});
