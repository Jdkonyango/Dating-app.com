if (window.MEETDAY_CONFIG?.supabaseUrl && window.MEETDAY_CONFIG?.supabasePublishableKey) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm");
  const config = window.MEETDAY_CONFIG;
  const url = String(config.supabaseUrl).trim();
  const key = String(config.supabasePublishableKey).trim();
  let projectUrl;

  try {
    projectUrl = new URL(url);
  } catch {
    throw new Error("Meetday Supabase settings are invalid. Check dating/config.js.");
  }
  const isLocalProject = ["localhost", "127.0.0.1"].includes(projectUrl.hostname);
  if ((!isLocalProject && projectUrl.protocol !== "https:") || !key) {
    throw new Error("Meetday Supabase settings are invalid. Check dating/config.js.");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const byId = (id) => document.getElementById(id);
  const ui = {
    authButton: byId("auth-button"),
    signupButton: byId("signup-button"),
    authDialog: byId("auth-dialog"),
    authError: byId("auth-error"),
    authForm: byId("auth-form"),
    authModeToggle: byId("auth-mode-toggle"),
    authSubmit: byId("auth-submit"),
    password: byId("auth-password"),
    passwordHelp: byId("password-help"),
    passwordStrength: byId("password-strength"),
    passwordStrengthCopy: byId("password-strength-copy"),
    passwordToggle: byId("password-toggle"),
    passwordResetButton: byId("password-reset-button"),
    authStatus: byId("live-account-status"),
    appNav: document.querySelector(".nav"),
    accountAvatar: byId("account-avatar"),
    accountBio: byId("account-bio"),
    accountEmail: byId("account-email"),
    accountFacts: byId("account-facts"),
    accountInterests: byId("account-interests"),
    accountName: byId("account-name"),
    accountPanel: byId("my-account"),
    accountUsername: byId("account-username"),
    accountLink: byId("my-account-link"),
    bottomGrid: document.querySelector(".bottom-grid"),
    chatDialog: byId("chat-dialog"),
    chatForm: byId("chat-form"),
    chatMessages: byId("chat-messages"),
    chatStatus: byId("chat-status"),
    connectionsCopy: byId("connections-copy"),
    connectionsEmpty: byId("connections-empty"),
    connectionsHeading: byId("connections-heading"),
    connectionsList: byId("connections-list"),
    discover: byId("discover"),
    distanceFilter: byId("distance-filter"),
    footerMode: byId("footer-data-mode"),
    hero: document.querySelector(".hero"),
    intentFilter: byId("intent-filter"),
    liveAuthCta: byId("live-auth-cta"),
    liveAuthGate: byId("live-auth-gate"),
    liveAuthMessage: byId("live-auth-message"),
    liveSetupNote: byId("live-setup-note"),
    editAccountButton: byId("edit-account-button"),
    profileDialog: byId("profile-dialog"),
    profileError: byId("profile-error"),
    profileForm: byId("profile-form"),
    profileButton: byId("profile-button"),
    profileSearch: byId("profile-search"),
    profileSubmit: byId("profile-submit"),
    profiles: byId("profiles"),
    reportDialog: byId("report-dialog"),
    reportError: byId("report-error"),
    reportForm: byId("report-form"),
    resultsCount: byId("results-count"),
    safetyCopy: byId("safety-note-copy"),
    safetyNote: byId("safety-note"),
    signOutButton: byId("sign-out-button"),
    footer: document.querySelector(".footer"),
    toast: byId("toast")
  };
  let session = null;
  let lastSessionKey;
  let ownProfile = null;
  let matches = [];
  let activeMatch = null;
  let activeReportTarget = null;
  let authMode = "sign-in";
  let includePassed = false;
  let matchChannel = null;
  let messageChannel = null;
  let searchTimer = 0;
  let toastTimer = 0;

  byId("project-key-form").hidden = true;
  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, 4200);
  }

  function setError(element, error) {
    element.textContent = error?.message || String(error);
  }

  function authErrorMessage(error) {
    const message = error?.message || String(error);
    if (/function public\.(get_my_profile|discover_profiles|get_my_matches)|schema cache|PGRST202|42P01/i.test(message)) {
      return `The Meetday database is not set up yet. Open Supabase → SQL Editor and run dating/supabase-schema.sql. Details: ${message}`;
    }
    if (/invalid api key|no api key|apikey/i.test(message)) {
      return "Supabase rejected the project key. Check that you copied the public publishable/anon key for this project into dating/config.js or the setup box.";
    }
    if (/email not confirmed/i.test(message)) {
      return "Please verify your email using the link we sent, then log in again.";
    }
    return message;
  }

  function setAuthMode(mode) {
    authMode = mode;
    ui.authSubmit.textContent = mode === "sign-in" ? "Log in" : "Create account";
    ui.authModeToggle.textContent = mode === "sign-in" ? "Create account" : "I already have an account";
    ui.authDialog.querySelector("#auth-dialog-title").textContent = mode === "sign-in" ? "Log in to Meetday" : "Create your account";
    byId("auth-dialog-copy").textContent = mode === "sign-in"
      ? "Welcome back. Log in to open your profile, discover members, and continue your conversations."
      : "Create your account with your email. Verify it, then create your personal Meetday profile.";
    ui.authForm.elements.password.autocomplete = mode === "sign-in" ? "current-password" : "new-password";
    ui.password.minLength = mode === "sign-in" ? 1 : 10;
    ui.password.value = "";
    ui.passwordStrength.dataset.mode = mode;
    ui.passwordHelp.textContent = mode === "sign-in"
      ? "Use the password you chose for your Meetday account."
      : "Use at least 10 characters with 3 of these: uppercase, lowercase, number, symbol.";
    updatePasswordStrength();
    ui.authError.textContent = "";
  }

  function updatePasswordStrength() {
    const value = ui.password.value;
    const types = [
      /[a-z]/.test(value),
      /[A-Z]/.test(value),
      /\d/.test(value),
      /[^A-Za-z0-9]/.test(value)
    ].filter(Boolean).length;
    const score = Math.min(4, Number(value.length >= 10) + Number(types >= 2) + Number(types >= 3) + Number(types === 4));
    const labels = ["Add a password", "Weak", "Fair", "Strong", "Very strong"];
    ui.passwordStrength.dataset.strength = String(score);
    ui.passwordStrengthCopy.textContent = value
      ? `${labels[score]}${score < 3 ? " — use 10+ characters and at least 3 character types." : ""}`
      : "Use 10+ characters and combine letters, numbers, and symbols.";
  }

  function setLiveView(hasProfile) {
    const hasVerifiedAccount = Boolean(session?.user?.email_confirmed_at);
    ui.liveSetupNote.hidden = true;
    ui.hero.hidden = true;
    ui.discover.hidden = !hasProfile;
    ui.bottomGrid.hidden = !hasProfile;
    ui.accountPanel.hidden = !hasProfile;
    ui.accountLink.hidden = !hasProfile;
    ui.appNav.hidden = !hasProfile;
    ui.safetyNote.hidden = !hasProfile;
    ui.footer.hidden = !hasProfile;
    ui.liveAuthGate.hidden = hasProfile;
    ui.authButton.hidden = hasVerifiedAccount;
    ui.signupButton.hidden = hasVerifiedAccount;
    ui.signOutButton.hidden = !session;
    ui.profileButton.hidden = !hasVerifiedAccount;
    ui.authStatus.textContent = session ? "My account" : "Live dating";
    ui.footerMode.textContent = "Live accounts · mutual matches · private messages";
    ui.safetyCopy.innerHTML = "<b>Adults 18+ only.</b> Age is self-declared, not verified. Meetday is not an emergency service. Block or report any unsafe behavior.";
    ui.profileSearch.placeholder = "Search members, city, or interests";
    ui.resultsCount.textContent = "Members on Meetday";
    ui.connectionsHeading.textContent = "Your mutual matches";
    ui.connectionsCopy.textContent = "Only mutual likes can message. You can unmatch, block, or report a member at any time.";
    ui.connectionsEmpty.textContent = "No mutual matches yet. Keep exploring and show interest in people you like.";
    ui.profileButton.textContent = ownProfile ? "Edit profile" : "Set up profile";
    byId("profile-consent-copy").textContent = "I confirm I’m at least 18. I understand my dating profile is visible to signed-in members and my email stays private.";
    byId("profile-dialog-copy").textContent = ownProfile
      ? "Update your personal profile. Your email stays private; never include private contact details in your bio."
      : "Create your personal profile. Your email stays private; never include private contact details in your bio.";
    ui.profileSubmit.textContent = ownProfile ? "Save profile changes" : "Create my profile";
    byId("avatar-help").textContent = ownProfile?.avatar_path
      ? "Choose a new JPG, PNG, or WebP image up to 3 MB to replace your current profile photo."
      : "Optional. Choose a JPG, PNG, or WebP image up to 3 MB. It will only be visible to signed-in members.";
    renderOwnProfile();
    ui.discover.querySelector(".section-subtitle").textContent = "Explore verified-email member accounts. Profile ages are self-declared.";
    ui.discover.querySelector(".eyebrow").textContent = "A GOOD PLACE TO BEGIN";
    ui.liveAuthMessage.textContent = session
      ? "Finish your profile to see real members. Only the information you choose to share is shown."
      : "Sign in or create an account to see real member profiles.";
    ui.liveAuthCta.textContent = session ? "Complete your profile" : "Sign in or join →";
    ui.distanceFilter.hidden = true;
    if (!hasProfile) {
      ui.profiles.replaceChildren();
      ui.accountAvatar.replaceChildren();
      ui.accountName.textContent = "";
      ui.accountUsername.textContent = "";
      ui.accountEmail.textContent = "";
      ui.accountBio.textContent = "";
      ui.accountFacts.replaceChildren();
      ui.accountInterests.replaceChildren();
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function intentLabel(intent) {
    return ({ relationship: "Long-term", friends: "New friends", exploring: "Open to seeing" })[intent] || "Getting to know people";
  }

  function setProfileForm(profile) {
    if (!profile) {
      ui.profileForm.reset();
      return;
    }
    ui.profileForm.elements.name.value = profile.first_name;
    ui.profileForm.elements.username.value = profile.username;
    ui.profileForm.elements.age.value = profile.age;
    ui.profileForm.elements.city.value = profile.city;
    ui.profileForm.elements.intent.value = profile.intent;
    ui.profileForm.elements.interests.value = (profile.interests || []).join(", ");
    ui.profileForm.elements.bio.value = profile.bio;
    ui.profileForm.elements.adult.checked = true;
  }

  async function attachAvatarUrls(profiles) {
    const paths = profiles.filter((profile) => profile.avatar_path).map((profile) => profile.avatar_path);
    if (!paths.length) return profiles;
    const uniquePaths = [...new Set(paths)];
    const { data, error } = await supabase.storage
      .from("meetday-avatars")
      .createSignedUrls(uniquePaths, 600);
    if (error) throw error;
    const urls = new Map(data.map((file) => {
      if (file.error) throw new Error(file.error);
      return [file.path, file.signedUrl];
    }));
    return profiles.map((profile) => ({ ...profile, avatar_url: profile.avatar_path ? urls.get(profile.avatar_path) : null }));
  }

  function renderOwnProfile() {
    if (!ownProfile || !session) return;
    ui.accountName.textContent = ownProfile.first_name;
    ui.accountUsername.textContent = `@${ownProfile.username}`;
    ui.accountEmail.textContent = `Private account email: ${session.user.email}`;
    ui.accountBio.textContent = ownProfile.bio;
    ui.accountFacts.replaceChildren(
      element("span", "", `${ownProfile.age} years old`),
      element("span", "", ownProfile.city),
      element("span", "", intentLabel(ownProfile.intent))
    );
    ui.accountInterests.replaceChildren();
    (ownProfile.interests || []).forEach((interest) => ui.accountInterests.append(element("span", "tag", interest)));
    ui.accountAvatar.replaceChildren();
    if (ownProfile.avatar_url) {
      const photo = element("img", "", "");
      photo.src = ownProfile.avatar_url;
      photo.alt = "";
      ui.accountAvatar.append(photo);
    } else {
      ui.accountAvatar.textContent = ownProfile.first_name.trim().slice(0, 1).toUpperCase();
    }
  }

  function openProfileDialog() {
    setProfileForm(ownProfile);
    ui.profileError.textContent = "";
    ui.profileDialog.showModal();
  }

  function buildProfileCard(profile, index) {
    const card = element("article", "profile-card");
    const portrait = element("div", `portrait portrait-${["one", "two", "three", "four", "five", "six", "seven", "eight"][index % 8]}`);
    portrait.setAttribute("aria-hidden", "true");
    if (profile.avatar_url) {
      const photo = element("img", "avatar-art avatar-photo");
      photo.src = profile.avatar_url;
      photo.alt = "";
      portrait.append(photo);
    } else {
      portrait.append(element("span", "avatar-art", profile.first_name.trim().slice(0, 1).toUpperCase()));
    }
    card.append(portrait);

    const content = element("div", "profile-content");
    const title = element("div", "profile-title");
    title.append(element("h3", "", profile.first_name), element("span", "", String(profile.age)));
    content.append(title);
    content.append(element("p", "profile-username", `@${profile.username}`));
    content.append(element("p", "profile-location", `${profile.city} · ${intentLabel(profile.intent)}`));
    content.append(element("p", "profile-bio", profile.bio));

    const tags = element("div", "tags");
    (profile.interests || []).slice(0, 8).forEach((interest) => tags.append(element("span", "tag", interest)));
    if (!tags.childElementCount) tags.append(element("span", "tag", "Getting to know people"));
    content.append(tags);

    const actions = element("div", "profile-actions");
    const like = element("button", "like-button", "Like");
    like.type = "button";
    like.addEventListener("click", async () => {
      like.disabled = true;
      try {
        const { data, error } = await supabase.rpc("like_profile", { p_target_id: profile.user_id });
        if (error) throw error;
        if (data) showToast("It’s a mutual match! You can say hello now.");
        await refreshMemberData();
      } catch (error) {
        setError(ui.profileError, error);
        showToast(error.message || "Could not like this profile.");
      } finally {
        like.disabled = false;
      }
    });
    const pass = element("button", "pass-button", "Pass");
    pass.type = "button";
    pass.addEventListener("click", async () => {
      pass.disabled = true;
      try {
        const { error } = await supabase.rpc("pass_profile", { p_target_id: profile.user_id });
        if (error) throw error;
        await loadProfiles();
      } catch (error) {
        showToast(error.message || "Could not pass this profile.");
      } finally {
        pass.disabled = false;
      }
    });
    const report = element("button", "pass-button", "Report");
    report.type = "button";
    report.addEventListener("click", () => openReport(profile.user_id));
    const block = element("button", "pass-button danger-button", "Block");
    block.type = "button";
    block.addEventListener("click", () => blockProfile(profile.user_id, profile.first_name));
    actions.append(like, pass, report, block);
    content.append(actions);
    card.append(content);
    return card;
  }

  async function loadProfiles() {
    const intent = ui.intentFilter.value === "any" ? null : ui.intentFilter.value;
    const { data, error } = await supabase.rpc("discover_profiles", {
      p_intent: intent,
      p_search: ui.profileSearch.value.trim() || null,
      p_include_passed: includePassed
    });
    if (error) throw error;
    const profiles = await attachAvatarUrls(data);
    ui.profiles.replaceChildren();
    profiles.forEach((profile, index) => ui.profiles.append(buildProfileCard(profile, index)));
    if (!profiles.length) ui.profiles.append(element("p", "empty", "No members match these filters right now. Try another search or intention."));
    ui.resultsCount.textContent = `${profiles.length} ${profiles.length === 1 ? "member" : "members"}`;
  }

  function renderMatches() {
    ui.connectionsList.replaceChildren();
    if (!matches.length) {
      ui.connectionsList.append(element("p", "panel-copy", ui.connectionsEmpty.textContent));
      return;
    }
    matches.forEach((match) => {
      const row = element("div", "match-row");
      const person = element("div", "match-person");
      const avatar = element("span", "mini-avatar", match.first_name.slice(0, 1).toUpperCase());
      if (match.avatar_url) {
        const photo = element("img");
        photo.src = match.avatar_url;
        photo.alt = "";
        avatar.replaceChildren(photo);
      }
      person.append(avatar);
      const details = element("div");
      details.append(element("strong", "", `${match.first_name}, ${match.age}`));
      details.append(element("small", "", `${match.city} · ${intentLabel(match.intent)}`));
      person.append(details);

      const actions = element("div", "match-row-actions");
      const chat = element("button", "primary-button", "Message");
      chat.type = "button";
      chat.addEventListener("click", () => openChat(match));
      const unmatch = element("button", "soft-button", "Unmatch");
      unmatch.type = "button";
      unmatch.addEventListener("click", async () => {
        if (!window.confirm(`Remove your match with ${match.first_name}?`)) return;
        try {
          const { error } = await supabase.rpc("remove_my_like", { p_target_id: match.user_id });
          if (error) throw error;
          await refreshMemberData();
          showToast("Match removed.");
        } catch (error) {
          showToast(error.message || "Could not remove the match.");
        }
      });
      const report = element("button", "soft-button", "Report");
      report.type = "button";
      report.addEventListener("click", () => openReport(match.user_id));
      const block = element("button", "soft-button danger-button", "Block");
      block.type = "button";
      block.addEventListener("click", () => blockProfile(match.user_id, match.first_name));
      actions.append(chat, unmatch, report, block);
      row.append(person, actions);
      ui.connectionsList.append(row);
    });
  }

  async function loadMatches() {
    const { data, error } = await supabase.rpc("get_my_matches");
    if (error) throw error;
    matches = await attachAvatarUrls(data);
    renderMatches();
  }

  async function refreshMemberData() {
    await Promise.all([loadProfiles(), loadMatches()]);
  }

  function openReport(targetId) {
    activeReportTarget = targetId;
    ui.reportForm.reset();
    ui.reportError.textContent = "";
    ui.reportDialog.showModal();
  }

  async function blockProfile(targetId, name) {
    if (!window.confirm(`Block ${name}? They will no longer see you or contact you, and any match will be removed.`)) return;
    try {
      const { error } = await supabase.rpc("block_profile", { p_target_id: targetId });
      if (error) throw error;
      await refreshMemberData();
      showToast("Profile blocked.");
    } catch (error) {
      showToast(error.message || "Could not block this profile.");
    }
  }

  function renderMessages(rows) {
    ui.chatMessages.replaceChildren();
    rows.forEach((message) => {
      const item = element("li", `chat-message${message.sender_id === session.user.id ? " mine" : ""}`);
      item.append(document.createTextNode(message.body));
      item.append(element("time", "", new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.created_at))));
      ui.chatMessages.append(item);
    });
    ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
  }

  async function loadMessages(matchId) {
    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    renderMessages(data);
  }

  async function openChat(match) {
    activeMatch = match;
    byId("chat-title").textContent = `Messages with ${match.first_name}`;
    ui.chatForm.reset();
    ui.chatStatus.textContent = "";
    ui.chatMessages.replaceChildren();
    ui.chatDialog.showModal();
    if (messageChannel) await supabase.removeChannel(messageChannel);
    try {
      await loadMessages(match.match_id);
      messageChannel = supabase.channel(`meetday-messages-${match.match_id}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${match.match_id}`
        }, () => loadMessages(match.match_id).catch((error) => { ui.chatStatus.textContent = error.message; }))
        .subscribe();
    } catch (error) {
      ui.chatStatus.textContent = error.message;
    }
  }

  async function handleSession(nextSession) {
    const nextSessionKey = nextSession
      ? `${nextSession.user.id}:${nextSession.user.email_confirmed_at || "unverified"}`
      : null;
    if (nextSessionKey === lastSessionKey) return;
    lastSessionKey = nextSessionKey;
    session = nextSession;
    ownProfile = null;
    matches = [];
    if (matchChannel) {
      await supabase.removeChannel(matchChannel);
      matchChannel = null;
    }
    if (!session) {
      setLiveView(false);
      ui.liveAuthMessage.textContent = "Sign in or create an account to see real member profiles.";
      ui.liveAuthCta.textContent = "Sign in or join →";
      renderMatches();
      return;
    }
    if (!session.user.email_confirmed_at) {
      setLiveView(false);
      ui.liveAuthMessage.textContent = "Verify your email address before entering Meetday. After confirming it, log in to continue.";
      ui.liveAuthCta.textContent = "Log in after verifying";
      ui.authStatus.textContent = "Verify your email";
      return;
    }

    const { data: profile, error } = await supabase.rpc("get_my_profile");
    if (error) {
      setLiveView(false);
      ui.liveAuthMessage.textContent = authErrorMessage(error);
      ui.liveAuthCta.textContent = "Retry";
      showToast(authErrorMessage(error));
      return;
    }
    ownProfile = profile ? (await attachAvatarUrls([profile]))[0] : null;
    setLiveView(Boolean(ownProfile));
    matchChannel = supabase.channel(`meetday-matches-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        loadMatches().catch((loadError) => showToast(loadError.message));
      })
      .subscribe();
    if (!ownProfile) {
      ui.liveAuthMessage.textContent = "Create your profile to join the member directory. Your age and details are protected by database access rules.";
      ui.liveAuthCta.textContent = "Create my profile";
      openProfileDialog();
      return;
    }
    try {
      await refreshMemberData();
    } catch (loadError) {
      showToast(authErrorMessage(loadError));
    }
  }

  ui.authButton.addEventListener("click", () => {
    setAuthMode("sign-in");
    ui.authDialog.showModal();
  });
  ui.signupButton.addEventListener("click", () => {
    setAuthMode("sign-up");
    ui.authDialog.showModal();
  });
  document.querySelectorAll("[data-open-signup]").forEach((button) => button.addEventListener("click", () => {
    setAuthMode("sign-up");
    ui.authDialog.showModal();
  }));
  ui.liveAuthCta.addEventListener("click", () => {
    if (session && !session.user.email_confirmed_at) {
      supabase.auth.signOut().then(({ error }) => {
        if (error) {
          showToast(`Could not sign out: ${error.message}`);
          return;
        }
        setAuthMode("sign-in");
        ui.authDialog.showModal();
      });
      return;
    }
    if (session && !ownProfile) {
      openProfileDialog();
      return;
    }
    setAuthMode("sign-in");
    ui.authDialog.showModal();
  });
  ui.authModeToggle.addEventListener("click", () => setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in"));
  ui.passwordResetButton.addEventListener("click", async () => {
    const email = String(ui.authForm.elements.email.value || "").trim();
    if (!email) {
      ui.authError.textContent = "Enter your account email first, then choose Forgot password.";
      ui.authForm.elements.email.focus();
      return;
    }
    ui.passwordResetButton.disabled = true;
    ui.authError.textContent = "";
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href.split("#")[0]
      });
      if (error) throw error;
      ui.authError.textContent = "If an account exists for that email, a password reset link is on its way.";
    } catch (error) {
      setError(ui.authError, authErrorMessage(error));
    } finally {
      ui.passwordResetButton.disabled = false;
    }
  });
  ui.password.addEventListener("input", updatePasswordStrength);
  ui.passwordToggle.addEventListener("click", () => {
    const reveal = ui.password.type === "password";
    ui.password.type = reveal ? "text" : "password";
    ui.passwordToggle.textContent = reveal ? "Hide" : "Show";
    ui.passwordToggle.setAttribute("aria-pressed", String(reveal));
  });
  ui.authDialog.querySelector("[data-close-auth]").addEventListener("click", () => ui.authDialog.close());
  ui.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    ui.authError.textContent = "";
    ui.authSubmit.disabled = true;
    const form = new FormData(ui.authForm);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    if (authMode === "sign-up" && (password.length < 10 || Number(ui.passwordStrength.dataset.strength) < 3)) {
      ui.authError.textContent = "Choose a stronger password: at least 10 characters with 3 character types.";
      ui.authSubmit.disabled = false;
      return;
    }
    try {
      const result = authMode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href.split("#")[0] } });
      if (result.error) throw result.error;
      if (authMode === "sign-up" && !result.data.session) {
        ui.authError.textContent = "Check your inbox and verify your email, then sign in to continue.";
      } else {
        ui.authDialog.close();
        await handleSession(result.data.session);
      }
    } catch (error) {
      setError(ui.authError, authErrorMessage(error));
    } finally {
      ui.authSubmit.disabled = false;
    }
  });
  ui.signOutButton.addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast(`Could not sign out: ${error.message}`);
      return;
    }
    if (ui.chatDialog.open) ui.chatDialog.close();
    await handleSession(null);
    showToast("You’ve signed out.");
  });

  document.querySelectorAll("[data-open-profile]").forEach((button) => button.addEventListener("click", () => {
    if (!session) {
      setAuthMode("sign-in");
      ui.authDialog.showModal();
      return;
    }
    openProfileDialog();
  }));
  ui.editAccountButton.addEventListener("click", openProfileDialog);
  ui.accountLink.addEventListener("click", () => {
    document.querySelectorAll(".nav a").forEach((link) => link.classList.toggle("active", link === ui.accountLink));
  });
  document.querySelectorAll('.nav a[href="#discover"]').forEach((link) => link.addEventListener("click", () => {
    document.querySelectorAll(".nav a").forEach((item) => item.classList.toggle("active", item === link));
  }));
  document.querySelectorAll('.nav a[href="#connections"]').forEach((link) => link.addEventListener("click", () => {
    document.querySelectorAll(".nav a").forEach((item) => item.classList.toggle("active", item === link));
  }));
  document.querySelectorAll('.nav a[href="#safety"]').forEach((link) => link.addEventListener("click", () => {
    document.querySelectorAll(".nav a").forEach((item) => item.classList.toggle("active", item === link));
  }));
  ui.profileDialog.querySelector("[data-close-profile]").addEventListener("click", () => ui.profileDialog.close());
  ui.profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    ui.profileError.textContent = "";
    if (!session) {
      ui.profileError.textContent = "Sign in before creating your member profile.";
      return;
    }
    ui.profileSubmit.disabled = true;
    const form = new FormData(ui.profileForm);
    const interests = [...new Set(String(form.get("interests") || "")
      .split(",").map((value) => value.trim()).filter(Boolean).map((value) => value.slice(0, 32)))].slice(0, 8);
    try {
      const photo = form.get("avatar");
      const previousAvatarPath = ownProfile?.avatar_path || null;
      let avatarPath = ownProfile?.avatar_path || null;
      if (photo instanceof File && photo.size > 0) {
        const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
        if (!extensions[photo.type]) throw new Error("Choose a JPG, PNG, or WebP profile photo.");
        if (photo.size > 3 * 1024 * 1024) throw new Error("Profile photos must be 3 MB or smaller.");
        avatarPath = `${session.user.id}/profile.${extensions[photo.type]}`;
        const { error: uploadError } = await supabase.storage.from("meetday-avatars").upload(avatarPath, photo, {
          cacheControl: "3600",
          contentType: photo.type,
          upsert: true
        });
        if (uploadError) throw uploadError;
      }
      const { data, error } = await supabase.rpc("save_my_profile", {
        p_first_name: String(form.get("name")).trim(),
        p_username: String(form.get("username")).trim().toLowerCase(),
        p_age: Number(form.get("age")),
        p_city: String(form.get("city")).trim(),
        p_intent: String(form.get("intent")),
        p_bio: String(form.get("bio")).trim(),
        p_interests: interests,
        p_avatar_path: avatarPath,
        p_adult_confirmed: Boolean(form.get("adult"))
      });
      if (error) throw error;
      ownProfile = (await attachAvatarUrls([data]))[0];
      let photoCleanupWarning = "";
      if (previousAvatarPath && previousAvatarPath !== ownProfile.avatar_path) {
        const { error: removeError } = await supabase.storage.from("meetday-avatars").remove([previousAvatarPath]);
        if (removeError) photoCleanupWarning = ` Profile saved, but the previous photo could not be removed: ${removeError.message}`;
      }
      ui.profileDialog.close();
      setLiveView(true);
      await refreshMemberData();
      showToast(`Your profile is saved and discoverable.${photoCleanupWarning}`);
    } catch (error) {
      setError(ui.profileError, error);
    } finally {
      ui.profileSubmit.disabled = false;
    }
  });

  ui.profileSearch.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => loadProfiles().catch((error) => showToast(error.message)), 280);
  });
  ui.intentFilter.addEventListener("change", () => loadProfiles().catch((error) => showToast(error.message)));
  byId("show-passed-button").addEventListener("click", async (event) => {
    includePassed = !includePassed;
    event.currentTarget.setAttribute("aria-pressed", String(includePassed));
    event.currentTarget.textContent = includePassed ? "Hide passed" : "Show passed";
    try {
      await loadProfiles();
    } catch (error) {
      showToast(error.message);
    }
  });

  ui.reportDialog.querySelector("#close-report").addEventListener("click", () => ui.reportDialog.close());
  ui.reportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeReportTarget || !session) return;
    ui.reportError.textContent = "";
    const form = new FormData(ui.reportForm);
    try {
      const { error } = await supabase.from("reports").insert({
        reporter_id: session.user.id,
        reported_id: activeReportTarget,
        reason: String(form.get("reason")),
        details: String(form.get("details") || "").trim()
      });
      if (error) throw error;
      ui.reportDialog.close();
      showToast("Report submitted privately. Thank you for helping keep Meetday safer.");
    } catch (error) {
      setError(ui.reportError, error);
    }
  });

  byId("close-chat").addEventListener("click", () => ui.chatDialog.close());
  ui.chatDialog.addEventListener("close", async () => {
    if (messageChannel) {
      await supabase.removeChannel(messageChannel);
      messageChannel = null;
    }
    activeMatch = null;
  });
  ui.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeMatch || !session) return;
    const input = byId("chat-message-input");
    const body = input.value.trim();
    if (!body) return;
    ui.chatStatus.textContent = "";
    const submit = ui.chatForm.querySelector("button");
    submit.disabled = true;
    try {
      const { error } = await supabase.from("messages").insert({
        match_id: activeMatch.match_id,
        sender_id: session.user.id,
        body
      });
      if (error) throw error;
      input.value = "";
      await loadMessages(activeMatch.match_id);
    } catch (error) {
      ui.chatStatus.textContent = error.message;
    } finally {
      submit.disabled = false;
      input.focus();
    }
  });

  byId("show-passed-button").hidden = false;
  ui.liveSetupNote.hidden = true;
  setLiveView(false);
  supabase.auth.onAuthStateChange((_event, nextSession) => {
    window.setTimeout(() => {
      handleSession(nextSession).catch((error) => showToast(`Could not load your account: ${error.message}`));
    }, 0);
  });
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    return handleSession(data.session);
  }).catch((error) => {
    ui.liveAuthMessage.textContent = `Could not connect to Meetday: ${error.message}`;
    showToast(`Authentication error: ${error.message}`);
  });
}
