// Map Supabase / Postgres errors to user-readable strings.
//
// Supabase passes through Postgres errors verbatim — fine for server
// logs, awful for end users (e.g. "new row violates check constraint
// profiles_grad_year_role_consistency"). This translator catches the
// common ones and falls back to the raw message on misses (so we don't
// hide unknown errors behind a generic "Something went wrong").
//
// Detection is by Postgres SQLSTATE code, message-content sniffing, or
// the PGRST* codes PostgREST raises. Add cases as they show up in
// production.

type AnyError =
  | string
  | Error
  | { message?: string; code?: string; details?: string | null; hint?: string | null }
  | null
  | undefined;

export function describeSupabaseError(err: AnyError): string {
  if (err == null) return "Something went wrong.";
  if (typeof err === "string") return err;

  const message = ("message" in err && err.message) ? String(err.message) : "";
  const code = ("code" in err && err.code) ? String(err.code) : "";

  // Auth / session expiry — JWT errors come through with code "PGRST301"
  // or messages like "JWT expired" / "invalid claim".
  if (code === "PGRST301" || /jwt|jwk|invalid claim|invalid signature/i.test(message)) {
    return "Your session has expired. Please sign in again.";
  }

  // Row-level security blocked the call (insufficient_privilege).
  //
  // Two very different things arrive here. Postgres's own denials ("new row
  // violates row-level security policy for table …") mean nothing to an end
  // user. But our SECURITY DEFINER RPCs deliberately raise 42501 with a
  // message written *for* the user — "Only pending listings can be edited",
  // "Forbidden: not an admin" — and flattening those loses the one thing
  // that told them what to do about it. So: generic for Postgres's wording,
  // passthrough for ours.
  if (code === "42501") {
    if (!message || /row-level security|permission denied for/i.test(message)) {
      return "You don't have permission to do that.";
    }
    return message;
  }

  // Unique constraint violations — show a humanised version when we can
  // identify the column.
  if (code === "23505") {
    if (/_email_/.test(message)) return "That email is already registered.";
    return "That value is already taken.";
  }

  // Check constraint violations — these almost always indicate the
  // schema rejected something the form's own validation missed.
  if (code === "23514") {
    // Try to extract the constraint name for a more helpful message.
    const m = message.match(/constraint "([^"]+)"/);
    const cname = m?.[1];
    if (cname) {
      const friendly = CHECK_CONSTRAINT_MESSAGES[cname];
      if (friendly) return friendly;
    }
    return "One of the values you entered was rejected by a validation rule.";
  }

  // Foreign key violations — usually mean a stale ID was submitted.
  if (code === "23503") {
    return "That item no longer exists.";
  }

  // Not-found from a single-row query (PGRST116). We surface these as
  // "not found" so the UI can show a 404-style state.
  if (code === "PGRST116" || /no rows/.test(message)) {
    return "Not found.";
  }

  // Network / connection errors don't have a code but bubble up from
  // fetch.
  if (/network|fetch|failed to fetch|load failed/i.test(message)) {
    return "Network error. Check your connection and try again.";
  }

  // Fall back to the raw server message — better than a generic blank.
  return message || "Something went wrong.";
}

// Constraints we want to translate by name. Add as needed.
const CHECK_CONSTRAINT_MESSAGES: Record<string, string> = {
  profiles_grad_year_role_consistency:        "Graduation year is required to complete onboarding.",
  profiles_grad_year_range:                   "Graduation year must be between 1950 and 2099.",
  profiles_linkedin_url_format:               "LinkedIn URL is not in a recognised format.",
  profiles_github_url_format:                 "GitHub URL is not in a recognised format.",
  profiles_portfolio_url_format:              "Portfolio URL must start with http:// or https://.",
  profiles_linkedin_url_len:                  "LinkedIn URL must be 512 characters or fewer.",
  profiles_github_url_len:                    "GitHub URL must be 512 characters or fewer.",
  profiles_portfolio_url_len:                 "Portfolio URL must be 512 characters or fewer.",
  profiles_bio_len:                           "Bio must be 1000 characters or fewer.",
  profiles_working_on_len:                    "\"What you're working on\" must be 500 characters or fewer.",
  profiles_course_len:                        "Course must be between 1 and 200 characters.",
  profiles_course_required_post_onboarding:   "Course is required to complete onboarding.",
  profiles_first_name_len:                    "First name must be 100 characters or fewer.",
  profiles_surname_len:                       "Surname must be 100 characters or fewer.",
  opportunities_description_len:              "Description must be between 20 and 5000 characters.",
  opportunities_position_name_len:            "Role title must be between 2 and 200 characters.",
  opportunities_company_len:                  "Company must be between 1 and 200 characters.",
  opportunities_contact_email_format:         "Contact email is not in a recognised format.",
  opportunities_apply_consistency:            "Pick one of \"contact me\" or \"application portal link\" and fill in the matching field.",
  opportunities_apply_url_len:                "Application portal URL must be 512 characters or fewer.",
  events_title_len:                           "Title must be between 2 and 200 characters.",
  events_description_len:                     "Description must be between 20 and 5000 characters.",
  events_luma_link_format:                    "Luma link must be a valid URL.",
  events_luma_link_len:                       "Luma link must be 512 characters or fewer.",
  events_contact_email_format:                "Contact email is not in a recognised format.",
  vcs_grants_name_len:                        "Name must be between 2 and 200 characters.",
  vcs_grants_description_len:                 "Description must be between 20 and 5000 characters.",
  vcs_grants_link_format:                     "Link must be a valid URL.",
  vcs_grants_link_len:                        "Link must be 512 characters or fewer.",
};
