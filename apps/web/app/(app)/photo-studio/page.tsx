import { PhotoStudio } from "@/components/document/PhotoStudio";

/**
 * The photo studio (R1 section 3, ruling P7): a window of its own that the writing window opens at `/photo-studio#id=<id>`, not a place of a project. Under
 * `(app)` for the sign-in check, the language and the toast host; it holds no document and loads no project, so nothing here can write one.
 */
export default function PhotoStudioPage() {
  return <PhotoStudio />;
}
