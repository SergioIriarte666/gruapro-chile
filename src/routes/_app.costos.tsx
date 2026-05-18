import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_app/costos")({
  component: () => <PlaceholderPage title="Costos" />,
});
