import type { Metadata } from "next";
import { PlaygroundClient } from "./PlaygroundClient";

export const metadata: Metadata = {
  title: "Playground — a free Git sandbox",
  description:
    "Try real Git commands in the browser with an empty repository, a terminal and a live commit graph. No missions and nothing scored.",
};

export default function PlaygroundPage() {
  return <PlaygroundClient />;
}
