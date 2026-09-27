import { Metadata } from "next";
import { DocsView } from "@/components/docs/docs-view";

export const metadata: Metadata = {
  title: "API Documentation & CLI Guide | GPHost",
  description:
    "Learn how to use your GPHost API key to upload and share files directly from your terminal, command prompt, or Python scripts in simple, easy-to-understand words.",
};

export const dynamic = "force-static";

export default function DocsPage() {
  return <DocsView />;
}
