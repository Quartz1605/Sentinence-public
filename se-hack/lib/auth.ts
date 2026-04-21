import { cookies } from "next/headers";

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  created_at: string;
  last_login: string;
};

const backendBaseUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(`${backendBaseUrl}/me`, {
      headers: {
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AuthUser;
  } catch {
    return null;
  }
}