// Top-level gate: decides whether to show the auth screen or the app.
import { useAuth } from "./lib/auth";
import { AuthScreen, Splash } from "./AuthScreen";
import Shell from "./Shell";

export default function Root() {
  const { loading, user, needsMfa } = useAuth();
  if (loading) return <Splash />;
  if (!user || needsMfa) return <AuthScreen />;
  return <Shell />;
}
