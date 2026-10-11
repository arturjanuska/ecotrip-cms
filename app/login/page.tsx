import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getAuthState } from "@/lib/auth";

export default async function LoginPage() {
  const state = await getAuthState();

  if (state === "admin") {
    redirect("/postcodes");
  }
  if (state === "forbidden") {
    redirect("/no-access");
  }

  return <LoginForm />;
}
