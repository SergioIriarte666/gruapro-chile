import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_app/gruas")({
  component: () => <PlaceholderPage title="gruas" />,
});
