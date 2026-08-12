import { JsonLd } from "@/components/seo/JsonLd";
import { NotesDialog } from "@/components/challenge/NotesDialog";
import { PlaygroundAbout } from "@/components/challenge/PlaygroundAbout";
import { breadcrumbSchema, webApplicationSchema } from "@/lib/schema";
import { PAGE_SEO } from "@/lib/page-seo";
import { pageMetadata } from "@/lib/seo";
import { PlaygroundClient } from "./PlaygroundClient";

const seo = PAGE_SEO["/playground/"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/playground/",
});

export default function PlaygroundPage() {
  return (
    <>
      <PlaygroundClient />
      {/* the sandbox is client-only, so this is what a crawler reads; the
          dialog keeps it in the HTML but off the screen until the About
          button asks for it, so the sandbox fits one viewport */}
      <NotesDialog label="About the playground">
        <PlaygroundAbout />
      </NotesDialog>
      <JsonLd
        data={[
          webApplicationSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Playground", path: "/playground/" },
          ]),
        ]}
      />
    </>
  );
}
