document.addEventListener("DOMContentLoaded", async () => {
  const heading = document.getElementById("welcome-heading");
  const subtitle = document.getElementById("welcome-subtitle");

  try {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error || !data.user) {
      window.location.replace("signin.html");
      return;
    }

    const user = data.user;

    let firstName = user.user_metadata?.first_name || "";

    const { data: profile, error: profileError } =
      await supabaseClient
        .from("profiles")
        .select("first_name")
        .eq("id", user.id)
        .maybeSingle();

    if (!profileError && profile?.first_name) {
      firstName = profile.first_name;
    }

    if (heading) {
      heading.textContent = firstName
        ? `Welcome, ${firstName}!`
        : "Welcome to SpendWise!";
    }

    if (subtitle) {
      subtitle.textContent = "Here's an overview of your money.";
    }
  } catch (error) {
    console.error("Dashboard authentication error:", error);
    window.location.replace("signin.html");
  }
});