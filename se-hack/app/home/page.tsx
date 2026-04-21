import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

export default async function ProtectedHomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  redirect("/dashboard");
}