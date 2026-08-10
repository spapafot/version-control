import type { Metadata } from "next";
import { LevelMap } from "@/components/course/LevelMap";

export const metadata: Metadata = {
  title: "Lessons — The Git map",
  description:
    "40 interactive Git missions across 9 worlds: git init, branches, merge conflicts, safe undos, stash and real Git disasters. Free.",
};

export default function StagesPage() {
  return <LevelMap />;
}
