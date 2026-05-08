import { LoginForm } from "./LoginForm";
import { BackLink } from "../_components/BackLink";

export const metadata = {
  title: "Login • react-math-captcha demo",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 sm:px-6 py-10 sm:py-16 bg-zinc-50 dark:bg-black">
      <div className="flex flex-col items-center gap-6 w-full">
        <LoginForm />
        <BackLink />
      </div>
    </main>
  );
}