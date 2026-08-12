import { ImageResponse } from "next/og";
import { OG_SIZE, ogImage } from "@/lib/og";

/** metadata image routes are route handlers; static export needs this pinned */
export const dynamic = "force-static";

export const alt = "VersionControl.gr, a free interactive Git course";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    ogImage({
      eyebrow: "git init",
      title: "Learn Git, using Git.",
      subtitle: "66 interactive missions in a real browser terminal. Free, nothing to install.",
    }),
    OG_SIZE,
  );
}
