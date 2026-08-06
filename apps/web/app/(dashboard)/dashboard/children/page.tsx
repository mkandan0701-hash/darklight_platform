import { redirect } from "next/navigation";

// The dashboard home's PARENT branch already *is* the children index, so there
// is no second list to render here. This exists only so a guessable URL lands
// somewhere sensible rather than on a 404.
export default function ChildrenIndexPage() {
  redirect("/dashboard");
}
