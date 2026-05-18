import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "yolocut_session";

const CreateLayout = async ({ children }: { children: React.ReactNode }) => {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;

  if (userId !== "gruns") {
    redirect("/");
  }

  return children;
};

export default CreateLayout;
