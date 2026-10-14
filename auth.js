document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signup-form");
  const signinForm = document.getElementById("signin-form");
  const forgotPasswordLink = document.getElementById("forgot-password");

  if (signupForm) {
    signupForm.addEventListener("submit", handleSignup);
  }

  if (signinForm) {
    signinForm.addEventListener("submit", handleSignin);
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", handlePasswordReset);
  }

  redirectIfSignedIn();
});

// Already logged in? Skip the sign-in / sign-up pages.
async function redirectIfSignedIn() {
  try {
    if (typeof supabaseClient === "undefined" || !supabaseClient?.auth) return;

    const { data } = await supabaseClient.auth.getSession();

    if (data?.session) {
      window.location.replace("dashboard.html");
    }
  } catch (error) {
    console.error("Could not check the current session:", error);
  }
}

// Builds a full URL next to the current page. Unlike window.location.origin
// this also works when the site is hosted in a sub-folder
// (e.g. https://name.github.io/spendwise/).
function pageUrl(fileName) {
  return new URL(fileName, window.location.href).href;
}

function showAuthMessage(element, message, type) {
  if (!element) return;

  element.textContent = message;
  element.className = `auth-message visible ${type}`;
}

function getSupabaseClient() {
  if (
    typeof supabaseClient === "undefined" ||
    !supabaseClient ||
    !supabaseClient.auth
  ) {
    throw new Error(
      "We couldn't reach the sign-in service. Check your internet connection and try again."
    );
  }

  return supabaseClient;
}

async function handleSignup(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const firstName = document.getElementById("first-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  const message = document.getElementById("signup-message");
  const button = document.getElementById("signup-button");

  if (firstName.length < 2) {
    showAuthMessage(message, "Please enter a valid first name.", "error");
    return;
  }

  if (password.length < 8) {
    showAuthMessage(message, "Your password must be at least 8 characters.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showAuthMessage(message, "Your passwords do not match.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "Creating account...";

  try {
    const client = getSupabaseClient();

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName },
        emailRedirectTo: pageUrl("dashboard.html")
      }
    });

    if (error) throw error;

    if (data.session) {
      window.location.replace("dashboard.html");
      return;
    }

    form.reset();

    showAuthMessage(
      message,
      "Account created! Check your email and verify your address before logging in.",
      "success"
    );
  } catch (error) {
    showAuthMessage(
      message,
      error.message || "We couldn't create your account. Please try again.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Create Account";
  }
}

async function handleSignin(event) {
  event.preventDefault();

  const email = document.getElementById("signin-email").value.trim();
  const password = document.getElementById("signin-password").value;
  const message = document.getElementById("signin-message");
  const button = document.getElementById("signin-button");

  button.disabled = true;
  button.textContent = "Logging in...";

  try {
    const client = getSupabaseClient();

    const { error } = await client.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    window.location.replace("dashboard.html");
  } catch (error) {
    showAuthMessage(
      message,
      error.message || "Login failed. Check your details and try again.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Log In";
  }
}

async function handlePasswordReset(event) {
  event.preventDefault();

  const emailInput = document.getElementById("signin-email");
  const email = emailInput.value.trim();
  const message = document.getElementById("signin-message");

  if (!email) {
    showAuthMessage(
      message,
      "Enter your email address above first, then click Forgot password.",
      "error"
    );
    emailInput.focus();
    return;
  }

  try {
    const client = getSupabaseClient();

    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: pageUrl("signin.html")
    });

    if (error) throw error;

    showAuthMessage(
      message,
      "If an account exists for this email, a password-reset link will be sent. Check your inbox.",
      "success"
    );
  } catch (error) {
    showAuthMessage(
      message,
      error.message || "Unable to request a password reset. Please try again.",
      "error"
    );
  }
}